import { CloudTasksClient } from "@google-cloud/tasks";
import type { google } from "@google-cloud/tasks/build/protos/protos";
import { getLogger } from "@logtape/logtape";
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
  notInArray,
} from "@openstatus/db";
import {
  type MonitorStatus,
  maintenance,
  monitor,
  monitorStatusTable,
  selectMonitorSchema,
  selectMonitorStatusSchema,
} from "@openstatus/db/src/schema";
import type { Region } from "@openstatus/db/src/schema/constants";
import type { monitorPeriodicitySchema } from "@openstatus/db/src/schema/constants";
import {
  maintenancesToPageComponents,
  pageComponent,
} from "@openstatus/db/src/schema/page_components";
import { regionDict } from "@openstatus/regions";

import { Effect, Either, Schedule } from "effect";
import { z } from "zod";

import { env } from "../env";
import { hasGCPConfig, getCheckerUrl, buildCheckerPayload } from "@openstatus/utils";
import { db } from "../lib/db";

type TaskInput = {
  row: z.infer<typeof selectMonitorSchema>;
  timestamp: number;
  status: MonitorStatus;
  region: Region;
};

export const isAuthorizedDomain = (url: string) => {
  return url.includes(env().SITE_URL);
};

const logger = getLogger("workflow");

const client = new CloudTasksClient({
  fallback: "rest",
  projectId: env().GCP_PROJECT_ID,
  credentials: {
    client_email: env().GCP_CLIENT_EMAIL,
    private_key: env().GCP_PRIVATE_KEY.replaceAll("\\n", "\n"),
  },
});

export async function sendCheckerTasks(
  periodicity: z.infer<typeof monitorPeriodicitySchema>,
): Promise<{ success: number; failed: number }> {
  const parent = client.queuePath(
    env().GCP_PROJECT_ID,
    env().GCP_LOCATION,
    periodicity,
  );

  const timestamp = Date.now();

  const currentMaintenance = db
    .select({ id: maintenance.id })
    .from(maintenance)
    .where(
      and(lte(maintenance.from, new Date()), gte(maintenance.to, new Date())),
    )
    .as("currentMaintenance");

  const currentMaintenanceMonitors = db
    .select({ id: pageComponent.monitorId })
    .from(maintenancesToPageComponents)
    .innerJoin(
      currentMaintenance,
      eq(maintenancesToPageComponents.maintenanceId, currentMaintenance.id),
    )
    .innerJoin(
      pageComponent,
      eq(maintenancesToPageComponents.pageComponentId, pageComponent.id),
    )
    .where(isNotNull(pageComponent.monitorId));

  const result = await db
    .select()
    .from(monitor)
    .where(
      and(
        eq(monitor.periodicity, periodicity),
        eq(monitor.active, true),
        notInArray(monitor.id, currentMaintenanceMonitors),
      ),
    )
    .all();

  logger.info("Starting cron job", {
    periodicity,
    monitor_count: result.length,
  });

  const monitors = z.array(selectMonitorSchema).safeParse(result);
  const taskInputs: TaskInput[] = [];
  if (!monitors.success) {
    logger.error(`Error while fetching the monitors ${monitors.error}`);
    throw new Error("Error while fetching the monitors");
  }

  if (monitors.data.length === 0) {
    logger.info("No monitors to check", { periodicity });
    return { success: 0, failed: 0 };
  }

  // Batch fetch all monitor statuses in a single query (N+1 fix)
  const monitorIds = monitors.data.map((m) => m.id);
  const rawStatuses = await db
    .select()
    .from(monitorStatusTable)
    .where(inArray(monitorStatusTable.monitorId, monitorIds))
    .all();

  const statusMap = new Map<
    number,
    z.infer<typeof selectMonitorStatusSchema>[]
  >();
  for (const raw of rawStatuses) {
    const parsed = selectMonitorStatusSchema.safeParse(raw);
    if (!parsed.success) {
      logger.error("Failed to parse monitor status row", {
        monitor_id: raw.monitorId,
        error_message: parsed.error.message,
      });
      continue;
    }
    const list = statusMap.get(raw.monitorId) ?? [];
    list.push(parsed.data);
    statusMap.set(raw.monitorId, list);
  }

  for (const row of monitors.data) {
    const monitorStatuses = statusMap.get(row.id) ?? [];

    for (const region of row.regions) {
      const status =
        monitorStatuses.find((m) => region === m.region)?.status || "active";

      const r = regionDict[region as keyof typeof regionDict];

      if (!r) {
        logger.error(`Invalid region ${region}`);
        continue;
      }
      if (r.deprecated) {
        // Let's uncomment this when we are ready to remove deprecated regions
        // We should not use deprecated regions anymore
        logger.error(`Deprecated region ${region}`);
        continue;
      }
      taskInputs.push({ row, timestamp, status, region });
      if (periodicity === "30s") {
        const scheduledAt = timestamp + 30 * 1000;
        taskInputs.push({
          row,
          timestamp: scheduledAt,
          status,
          region,
        });
      }
    }
  }

  // Self-hosted path: dispatch directly to checker via HTTP
  if (!hasGCPConfig(env())) {
    return sendCheckerTasksDirect(taskInputs, periodicity);
  }

  const results = await Effect.runPromise(
    Effect.forEach(
      taskInputs,
      (input) =>
        Effect.tryPromise({
          try: () => createCronTask(input, parent),
          catch: (err) => {
            if (err instanceof Error && "code" in err && err.code === 6) {
              return "ALREADY_EXISTS" as const;
            }
            return new Error(
              `Failed creating task for monitor ${input.row.id} in region ${input.region}`,
            );
          },
        }).pipe(
          Effect.catchIf(
            (err): err is "ALREADY_EXISTS" => err === "ALREADY_EXISTS",
            () => Effect.void,
          ),
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential("1000 millis"),
          }),
          Effect.either,
        ),
      { concurrency: 100 },
    ),
  );

  for (const result of results) {
    if (Either.isLeft(result)) {
      logger.error("Task creation failed after retries", {
        error_message: result.left.message,
      });
    }
  }

  const success = results.filter(Either.isRight).length;
  const failed = results.filter(Either.isLeft).length;

  logger.info("Completed cron job", {
    periodicity,
    total_tasks: taskInputs.length,
    success_count: success,
    failed_count: failed,
    duration_ms: Date.now() - timestamp,
  });
  if (failed > 0) {
    logger.error("Cron job had failures", {
      periodicity,
      failed_count: failed,
      success_count: success,
    });
  }

  return { success, failed };
}
async function sendCheckerTasksDirect(
  taskInputs: TaskInput[],
  periodicity: string,
): Promise<{ success: number; failed: number }> {
  const checkerUrl = getCheckerUrl(env());
  const results = await Effect.runPromise(
    Effect.forEach(
      taskInputs,
      (input) =>
        Effect.tryPromise({
          try: async () => {
            const payload = buildCheckerPayload(input);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            try {
              const res = await fetch(
                `${checkerUrl}/checker/${input.row.jobType}`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${env().CRON_SECRET}`,
                  },
                  body: JSON.stringify(payload),
                  signal: controller.signal,
                },
              );
              if (!res.ok) {
                throw new Error(
                  `Checker returned ${res.status} for monitor ${input.row.id}`,
                );
              }
            } finally {
              clearTimeout(timeout);
            }
          },
          catch: (err) =>
            new Error(
              `Failed dispatching monitor ${input.row.id} in region ${input.region}: ${err instanceof Error ? err.message : String(err)}`,
            ),
        }).pipe(
          Effect.retry({
            times: 3,
            schedule: Schedule.exponential("1000 millis"),
          }),
          Effect.either,
        ),
      { concurrency: 50 },
    ),
  );

  const success = results.filter(Either.isRight).length;
  const failed = results.filter(Either.isLeft).length;

  logger.info("Completed direct cron job", {
    periodicity,
    total_tasks: taskInputs.length,
    success_count: success,
    failed_count: failed,
  });

  return { success, failed };
}
// timestamp needs to be in ms
const createCronTask = async (
  { row, timestamp, status, region }: TaskInput,
  parent: string,
) => {
  const payload = buildCheckerPayload({ row, timestamp, status, region });
  const regionInfo = regionDict[region];
  let regionHeader = {};
  if (regionInfo.provider === "fly") {
    regionHeader = { "fly-prefer-region": region };
  }
  if (regionInfo.provider === "koyeb") {
    regionHeader = { "X-KOYEB-REGION-OVERRIDE": region.replace("koyeb_", "") };
  }
  if (regionInfo.provider === "railway") {
    regionHeader = { "railway-region": region.replace("railway_", "") };
  }
  const taskName = `${parent}/tasks/monitor-${row.id}-${region}-${timestamp}`;
  const newTask: google.cloud.tasks.v2beta3.ITask = {
    name: taskName,
    httpRequest: {
      headers: {
        "Content-Type": "application/json", // Set content type to ensure compatibility your application's request parsing
        ...regionHeader,
        Authorization: `Basic ${env().CRON_SECRET}`,
      },
      httpMethod: "POST",
      url: generateUrl({ row, region }),
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
    scheduleTime: {
      seconds: timestamp / 1000,
    },
  };

  const request = { parent: parent, task: newTask };
  return client.createTask(request);
};

function generateUrl({
  row,
  region,
}: {
  row: z.infer<typeof selectMonitorSchema>;
  region: Region;
}) {
  const regionInfo = regionDict[region];

  switch (regionInfo.provider) {
    case "fly":
      return `https://openstatus-checker.fly.dev/checker/${row.jobType}?monitor_id=${row.id}`;
    case "koyeb":
      return `https://openstatus-checker.koyeb.app/checker/${row.jobType}?monitor_id=${row.id}`;
    case "railway":
      return `https://railway-proxy-production-9cb1.up.railway.app/checker/${row.jobType}?monitor_id=${row.id}`;

    default:
      throw new Error("Invalid jobType");
  }
}
