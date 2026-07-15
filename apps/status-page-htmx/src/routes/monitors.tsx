import type { Context } from "hono";
import type { FC } from "hono/jsx";

import { Header } from "../components/header";
import { Layout } from "../components/layout";
import { StatusDot } from "../components/icons";
import { getPrefix } from "../lib/prefix";
import { trpc } from "../lib/trpc";

interface MonitorInfo {
  id: number;
  name: string;
  status: "success" | "degraded" | "error" | "info";
  url?: string;
  jobType?: string;
}

const MonitorList: FC<{ monitors: MonitorInfo[]; prefix: string }> = ({
  monitors,
  prefix,
}) => {
  if (monitors.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground">No monitors configured for this status page.</p>
      </div>
    );
  }

  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <h2 class="text-foreground">Monitors</h2>
        </div>
        <div class="divide-y divide-border/50">
          {monitors.map((monitor) => (
            <a
              href={`${prefix}/monitors/${monitor.id}`}
              class="flex items-center gap-3 p-4 md:pt-3 md:pb-3 hover:bg-muted/50 transition-colors group"
            >
              <StatusDot status={monitor.status} />
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium group-hover:text-foreground">
                  {monitor.name}
                </span>
                {monitor.url ? (
                  <span class="text-xs text-muted-foreground ml-2 hidden sm:inline">
                    {monitor.url}
                  </span>
                ) : null}
              </div>
              <div class="text-xs text-muted-foreground uppercase">
                {monitor.jobType ?? "http"}
              </div>
              <div class="text-muted-foreground group-hover:text-foreground">
                <svg
                  class="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

export async function monitorsHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);

  let page;
  try {
    page = await trpc.statusPage.get.query({ slug });
  } catch {
    page = null;
  }

  if (!page) {
    return c.html(
      <Layout page={{ title: "404 — Page Not Found" }}>
        <div class="flex flex-col items-center justify-center gap-4 py-24">
          <h1 class="text-4xl font-bold">404</h1>
          <p class="text-muted-foreground">This page could not be found.</p>
        </div>
      </Layout>,
      404,
    );
  }

  const monitors: MonitorInfo[] = (page.monitors as Array<Record<string, unknown>> | undefined)?.map(
    (m) => ({
      id: m.id as number,
      name: m.name as string,
      status: (m.status as MonitorInfo["status"]) ?? "success",
      url: m.url as string | undefined,
      jobType: m.jobType as string | undefined,
    }),
  ) ?? [];

  return c.html(
    <Layout
      page={{
        title: `${page.title} — Monitors`,
        icon: page.icon as string | null,
        themeKey: (page.configuration as Record<string, unknown>)?.theme as
          | string
          | undefined,
      }}
    >
      <Header
        title={page.title as string}
        icon={page.icon as string | null}
        prefix={prefix}
      />
      <div class="flex flex-col gap-6 mt-4">
        <MonitorList monitors={monitors} prefix={prefix} />
      </div>
    </Layout>,
  );
}
