import { getLogger } from "@logtape/logtape";
import { and, db, eq, inArray, isNull, schema } from "@openstatus/db";
import { incidentTable } from "@openstatus/db/src/schema";
import { monitorRegions } from "@openstatus/db/src/schema/constants";
import {
  monitorStatusSchema,
  selectMonitorSchema,
} from "@openstatus/db/src/schema/monitors/validation";
import type { MonitorStatus } from "@openstatus/db/src/schema";
import { Hono } from "hono";
import { z } from "zod";

import { env } from "../env";
import type { Env } from "../index";
import { checkerAudit } from "../utils/audit-log";
import { triggerNotifications, upsertMonitorStatus } from "./alerting";

export const checkerRoute = new Hono<Env>();

const payloadSchema = z.object({
  monitorId: z.string(),
  message: z.string().optional(),
  statusCode: z.number().optional(),
  region: z.enum(monitorRegions),
  cronTimestamp: z.number(),
  status: monitorStatusSchema,
  latency: z.number().optional(),
});

const privatePayloadSchema = z.object({
  monitorId: z.string(),
  message: z.string().optional(),
  statusCode: z.number().optional(),
  region: z.string(),
  cronTimestamp: z.number(),
  status: monitorStatusSchema,
  latency: z.number().optional(),
});

const logger = getLogger(["workflow"]);

/**
 * Finds an open incident (not resolved and not acknowledged) for the given monitor.
 */
async function findOpenIncident(monitorId: number) {
  return db
    .select()
    .from(incidentTable)
    .where(
      and(
        eq(incidentTable.monitorId, monitorId),
        isNull(incidentTable.resolvedAt),
      ),
    )
    .get();
}

/**
 * Resolves an open incident by setting resolvedAt and autoResolved flag.
 */
async function resolveIncident(params: {
  monitorId: string;
  cronTimestamp: number;
}) {
  const { monitorId, cronTimestamp } = params;
  const incident = await findOpenIncident(Number(monitorId));

  if (!incident || incident.resolvedAt) {
    return null;
  }

  logger.info("Recovering incident", {
    incident_id: incident.id,
    monitor_id: monitorId,
  });

  await db
    .update(incidentTable)
    .set({
      resolvedAt: new Date(cronTimestamp),
      autoResolved: true,
    })
    .where(eq(incidentTable.id, incident.id))
    .run();

  await checkerAudit.publishAuditLog({
    id: `monitor:${monitorId}`,
    action: "incident.resolved",
    targets: [{ id: monitorId, type: "monitor" }],
    metadata: { cronTimestamp, incidentId: incident.id },
  });

  return incident;
}

/**
 * Shared status update logic used by both public checker and private-location
 * endpoints. Handles majority check, global status change, incident
 * management, and notifications.
 */
async function processStatusUpdate(params: {
  label: string;
  monitorId: string;
  region: string;
  status: MonitorStatus;
  statusCode?: number;
  cronTimestamp: number;
  latency?: number;
  message?: string;
  event: Record<string, unknown>;
  affectedRegionFilter: string[];
  totalRegionCount: number;
}) {
  const {
    label,
    monitorId,
    region,
    status,
    statusCode,
    cronTimestamp,
    latency,
    message,
    event,
    affectedRegionFilter,
    totalRegionCount,
  } = params;

  // Upsert the per-region status
  await upsertMonitorStatus({ monitorId, status, region });

  const currentMonitor = await db
    .select()
    .from(schema.monitor)
    .where(eq(schema.monitor.id, Number(monitorId)))
    .get();

  const monitor = selectMonitorSchema.parse(currentMonitor);

  // Count how many regions (or private locations) share the new status
  const affectedRegions = await db
    .select({ region: schema.monitorStatusTable.region })
    .from(schema.monitorStatusTable)
    .where(
      and(
        eq(schema.monitorStatusTable.monitorId, monitor.id),
        eq(schema.monitorStatusTable.status, status),
        inArray(schema.monitorStatusTable.region, affectedRegionFilter),
      ),
    )
    .all();

  const affectedRegionsList = affectedRegions.map((r) => r.region);
  const affectedRegionCount = affectedRegionsList.length;

  event.status_update = {
    status,
    message,
    region,
    status_code: statusCode,
    cron_timestamp: cronTimestamp,
    latency_ms: latency,
    affectedRegionsCount: affectedRegionCount,
    monitorId: monitor.id,
  };

  if (affectedRegionCount === 0) {
    logger.info(`${label}: no affected regions after upsert — nothing to do`, {
      monitor_id: monitorId,
      region,
      status,
    });
    return;
  }

  // Publish audit log
  const auditActions = {
    active: "monitor.recovered",
    degraded: "monitor.degraded",
    error: "monitor.failed",
  } as const;

  // Publish audit log (best-effort — failures are silently ignored)
  await checkerAudit.publishAuditLog({
    id: `monitor:${monitorId}`,
    action: auditActions[status],
    targets: [{ id: monitorId, type: "monitor" }],
    metadata: {
      region,
      statusCode: statusCode ?? -1,
      message,
      cronTimestamp,
      latency,
    },
  });

  let triggeredNotifications: { notificationId: number; provider: string }[] =
    [];

  if (affectedRegionCount >= totalRegionCount / 2 || totalRegionCount === 1) {
    logger.debug(`${label}: majority threshold met`, {
      monitor_id: monitorId,
      affected_regions: affectedRegionCount,
      total_regions: totalRegionCount,
      new_status: status,
      current_status: monitor.status,
    });

    switch (status) {
      case "active": {
        if (monitor.status === "active") break;

        logger.info("Monitor status changed to active", {
          monitor_id: monitor.id,
          workspace_id: monitor.workspaceId,
        });
        await db
          .update(schema.monitor)
          .set({ status: "active" })
          .where(eq(schema.monitor.id, monitor.id));

        let incident = null;
        if (monitor.status === "error") {
          incident = await resolveIncident({ monitorId, cronTimestamp });
        }

        triggeredNotifications = await triggerNotifications({
          monitorId,
          statusCode,
          message,
          notifType: "recovery",
          cronTimestamp,
          regions: affectedRegionsList,
          latency,
          incidentId: incident?.id,
        });
        break;
      }
      case "degraded": {
        if (monitor.status === "degraded") break;

        logger.info("Monitor status changed to degraded", {
          monitor_id: monitor.id,
          workspace_id: monitor.workspaceId,
        });
        await db
          .update(schema.monitor)
          .set({ status: "degraded" })
          .where(eq(schema.monitor.id, monitor.id));

        let incident = null;
        if (monitor.status === "error") {
          incident = await resolveIncident({ monitorId, cronTimestamp });
        }

        triggeredNotifications = await triggerNotifications({
          monitorId,
          statusCode,
          message,
          notifType: "degraded",
          cronTimestamp,
          latency,
          regions: affectedRegionsList,
          incidentId: incident?.id,
        });
        break;
      }
      case "error": {
        if (monitor.status === "error") break;

        logger.info("Monitor status changed to error", {
          monitor_id: monitor.id,
          workspace_id: monitor.workspaceId,
        });
        await db
          .update(schema.monitor)
          .set({ status: "error" })
          .where(eq(schema.monitor.id, monitor.id));

        try {
          const existingIncident = await findOpenIncident(Number(monitorId));
          if (existingIncident) {
            logger.info("Already in incident", {
              incident_id: existingIncident.id,
            });
            break;
          }

          const [newIncident] = await db
            .insert(incidentTable)
            .values({
              monitorId: Number(monitorId),
              workspaceId: monitor.workspaceId,
              startedAt: new Date(cronTimestamp),
            })
            .returning();

          if (!newIncident?.id) break;

          await checkerAudit.publishAuditLog({
            id: `monitor:${monitorId}`,
            action: "incident.created",
            targets: [{ id: monitorId, type: "monitor" }],
            metadata: { cronTimestamp, incidentId: newIncident.id },
          });

          triggeredNotifications = await triggerNotifications({
            monitorId,
            statusCode,
            message,
            notifType: "alert",
            cronTimestamp,
            latency,
            regions: affectedRegionsList,
            incidentId: newIncident.id,
          });
        } catch (error) {
          logger.warning("Failed to create incident", { error });
        }
        break;
      }
      default:
        logger.error(`${label}: unexpected status`, { status });
        break;
    }
  } else {
    logger.info(`${label}: majority threshold not met — global status unchanged`, {
      monitor_id: monitorId,
      affected_regions: affectedRegionCount,
      total_regions: totalRegionCount,
      current_global_status: monitor.status,
      attempted_status: status,
    });
  }

  (event.status_update as Record<string, unknown>).notificationTriggered =
    triggeredNotifications.length > 0;
  (event.status_update as Record<string, unknown>).notifications =
    triggeredNotifications;
}

// ── Public checker endpoint ────────────────────────────────────────────────

checkerRoute.post("/updateStatus", async (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Basic ${env().CRON_SECRET}`) {
    logger.warn("updateStatus: unauthorized", {
      has_auth: !!auth,
      auth_prefix: auth?.substring(0, 10),
    });
    return c.text("Unauthorized", 401);
  }

  const event = c.get("event");
  const json = await c.req.json();

  logger.debug("updateStatus: received payload", {
    monitorId: json.monitorId,
    status: json.status,
    region: json.region,
    latency: json.latency,
    statusCode: json.statusCode,
  });

  const result = payloadSchema.safeParse(json);
  if (!result.success) {
    logger.warn("updateStatus: invalid payload", {
      errors: result.error.issues.map((i) => i.message),
      received_keys: Object.keys(json),
    });
    return c.text("Unprocessable Entity", 422);
  }

  const { monitorId, message, region, statusCode, cronTimestamp, status, latency } =
    result.data;

  logger.info("Updating monitor status", {
    monitor_id: monitorId,
    region,
    status,
    status_code: statusCode,
    cron_timestamp: cronTimestamp,
    latency_ms: latency,
  });

  // Fetch monitor first to get its region list for the affected-region filter
  const currentMonitor = await db
    .select()
    .from(schema.monitor)
    .where(eq(schema.monitor.id, Number(monitorId)))
    .get();

  if (!currentMonitor) {
    logger.warn("updateStatus: monitor not found", { monitor_id: monitorId });
    return c.text("Not Found", 404);
  }

  const monitor = selectMonitorSchema.parse(currentMonitor);

  await processStatusUpdate({
    label: "updateStatus",
    monitorId,
    region,
    status,
    statusCode,
    cronTimestamp,
    latency,
    message,
    event,
    affectedRegionFilter: monitor.regions,
    totalRegionCount: monitor.regions.length,
  });

  return c.text("Ok", 200);
});

// ── Private-location endpoint ───────────────────────────────────────────────

checkerRoute.post("/updateStatus/private", async (c) => {
  const auth = c.req.header("Authorization");
  if (auth !== `Basic ${env().CRON_SECRET}`) {
    logger.warn("updateStatus/private: unauthorized", {
      has_auth: !!auth,
      auth_prefix: auth?.substring(0, 10),
    });
    return c.text("Unauthorized", 401);
  }

  const event = c.get("event");
  const json = await c.req.json();

  logger.debug("updateStatus/private: received payload", {
    monitorId: json.monitorId,
    status: json.status,
    region: json.region,
    latency: json.latency,
    statusCode: json.statusCode,
  });

  const result = privatePayloadSchema.safeParse(json);
  if (!result.success) {
    logger.warn("updateStatus/private: invalid payload", {
      errors: result.error.issues.map((i) => i.message),
      received_keys: Object.keys(json),
    });
    return c.text("Unprocessable Entity", 422);
  }

  const { monitorId, message, region, statusCode, cronTimestamp, status, latency } =
    result.data;

  logger.info("updateStatus/private: updating monitor status", {
    monitor_id: monitorId,
    region,
    status,
    status_code: statusCode,
    latency_ms: latency,
  });

  // Fetch monitor and count assigned private locations
  const currentMonitor = await db
    .select()
    .from(schema.monitor)
    .where(eq(schema.monitor.id, Number(monitorId)))
    .get();

  if (!currentMonitor) {
    logger.warn("updateStatus/private: monitor not found", { monitor_id: monitorId });
    return c.text("Not Found", 404);
  }

  const monitor = selectMonitorSchema.parse(currentMonitor);

  // Count private locations assigned to this monitor
  const plRows = await db
    .select({ id: schema.privateLocationToMonitors.privateLocationId })
    .from(schema.privateLocationToMonitors)
    .where(eq(schema.privateLocationToMonitors.monitorId, monitor.id))
    .all();

  const privateLocationIds = plRows.map((r) => String(r.id));

  // Build region filter: public regions + private location IDs
  const affectedRegionFilter = [
    ...monitor.regions,
    ...privateLocationIds,
  ];

  await processStatusUpdate({
    label: "updateStatus/private",
    monitorId,
    region,
    status,
    statusCode,
    cronTimestamp,
    latency,
    message,
    event,
    affectedRegionFilter,
    totalRegionCount: monitor.regions.length + privateLocationIds.length,
  });

  return c.text("Ok", 200);
});
