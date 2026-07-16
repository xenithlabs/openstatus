import type { Context } from "hono";
import type { FC } from "hono/jsx";

import { ChartArea, type AreaChartPoint } from "../components/chart-area";
import { ChartBar, type BarChartUptimeData } from "../components/chart-bar";
import { ChartLine } from "../components/chart-line";
import { Header } from "../components/header";
import { StatusDot } from "../components/icons";
import { Layout } from "../components/layout";
import { formatDate } from "../lib/date";
import { logger } from "../lib/logger";
import { getPrefix } from "../lib/prefix";
import { trpc } from "../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────────────

interface MonitorInfo {
  id: number;
  name: string;
  status: "success" | "degraded" | "error" | "info";
  url?: string;
  jobType?: string;
  latencyData?: Array<Record<string, unknown>>;
}

type LatencyPoint = {
  timestamp: number;
  p50Latency: number;
  p75Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
};

type RegionPoint = {
  region: string;
  timestamp: number;
  p50Latency: number;
  p75Latency: number;
  p90Latency: number;
  p95Latency: number;
  p99Latency: number;
};

type UptimePoint = {
  interval: Date | string;
  success: number;
  degraded: number;
  error: number;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtTimestamp(ts: number): string {
  const d = new Date(ts);
  return formatDate(d);
}

function fmtInterval(d: Date): string {
  return formatDate(d);
}

function latencyToAreaPoints(data: LatencyPoint[]): AreaChartPoint[] {
  return data
    .map((p) => ({
      timestamp: fmtTimestamp(p.timestamp),
      p75Latency: p.p75Latency,
      p95Latency: p.p95Latency,
      p99Latency: p.p99Latency,
      maxLatency: Math.max(p.p75Latency, p.p95Latency, p.p99Latency),
    }));
}

// ── Components ──────────────────────────────────────────────────────────────

const MonitorList: FC<{ monitors: MonitorInfo[]; prefix: string }> = ({
  monitors,
  prefix,
}) => {
  if (monitors.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <p class="text-muted-foreground">
          No monitors configured for this status page.
        </p>
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
              {/* Latency sparkline thumbnail */}
              {monitor.latencyData && monitor.latencyData.length > 0 ? (
                <div class="hidden sm:block w-[80px] shrink-0 opacity-60">
                  <ChartArea
                    data={latencyToAreaPoints(
                      (monitor.latencyData as unknown as LatencyPoint[]).sort(
                        (a, b) => a.timestamp - b.timestamp,
                      ),
                    )}
                    width={80}
                    height={24}
                  />
                </div>
              ) : null}
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

// ── Handler: GET /monitors ──────────────────────────────────────────────────

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

  // Fetch monitors with latency data for sparkline thumbnails
  let monitorsWithData: MonitorInfo[] = [];
  try {
    const result = await trpc.statusPage.getMonitors.query({ slug });
    if (result) {
      monitorsWithData = result.map(
        (m: Record<string, unknown>) => ({
          id: m.id as number,
          name: m.name as string,
          status: (m.status as MonitorInfo["status"]) ?? "success",
          url: m.url as string | undefined,
          jobType: m.jobType as string | undefined,
          latencyData: (m.data as Array<Record<string, unknown>>) ?? [],
        }),
      );
    }
  } catch (err) {
    logger.error("monitors", "Failed to fetch monitors data", err);
    // Fallback to page.monitors without latency data
    monitorsWithData =
      (page.monitors as Array<Record<string, unknown>> | undefined)?.map(
        (m) => ({
          id: m.id as number,
          name: m.name as string,
          status: (m.status as MonitorInfo["status"]) ?? "success",
          url: m.url as string | undefined,
          jobType: m.jobType as string | undefined,
        }),
      ) ?? [];
  }

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
        slug={slug}
      />
      <div class="flex flex-col gap-6 mt-4">
        <MonitorList monitors={monitorsWithData} prefix={prefix} />
      </div>
    </Layout>,
  );
}

// ── Handler: GET /monitors/:id ──────────────────────────────────────────────

export async function monitorDetailHandler(
  c: Context,
): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);
  const idParam = c.req.param("id");
  const id = Number(idParam);

  if (!id || Number.isNaN(id)) {
    return c.html(
      <Layout page={{ title: "404 — Monitor Not Found" }}>
        <div class="flex flex-col items-center justify-center gap-4 py-24">
          <h1 class="text-4xl font-bold">404</h1>
          <p class="text-muted-foreground">Monitor not found.</p>
          <a href={`${prefix}/monitors`} class="text-primary underline text-sm">
            Back to monitors
          </a>
        </div>
      </Layout>,
      404,
    );
  }

  // Fetch page for header context
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

  // Fetch monitor detail
  let monitor;
  try {
    monitor = await trpc.statusPage.getMonitor.query({ slug, id });
  } catch (err) {
    logger.error("monitors", `Failed to fetch monitor id=${id}`, err);
    monitor = null;
  }

  if (!monitor) {
    return c.html(
      <Layout
        page={{
          title: `${page.title} — Monitor Not Found`,
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
          slug={slug}
        />
        <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <h2 class="text-lg font-semibold">Monitor not found</h2>
          <p class="text-muted-foreground">
            The monitor you are looking for does not exist or is not public.
          </p>
          <a
            href={`${prefix}/monitors`}
            class="text-primary underline text-sm"
          >
            Back to monitors
          </a>
        </div>
      </Layout>,
    );
  }

  const m = monitor as Record<string, unknown>;
  const monitorData = m.data as
    | {
        latency?: LatencyPoint[];
        regions?: RegionPoint[];
        uptime?: UptimePoint[];
      }
    | undefined;

  // ── Process global latency data ─────────────────────────────────────
  const latencyRaw = (monitorData?.latency ?? []) as LatencyPoint[];
  const latencySorted = [...latencyRaw].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  const globalLatencyData = latencyToAreaPoints(latencySorted);

  // ── Process region latency data ─────────────────────────────────────
  const regionsRaw = (monitorData?.regions ?? []) as RegionPoint[];
  const regionMap = new Map<number, Record<string, number>>();
  const regionSet = new Set<string>();
  for (const r of regionsRaw) {
    regionSet.add(r.region);
    const entry = regionMap.get(r.timestamp);
    if (entry) {
      entry[r.region] = r.p75Latency;
    } else {
      regionMap.set(r.timestamp, { [r.region]: r.p75Latency });
    }
  }
  const regionTimestamps = [...regionMap.keys()].sort((a, b) => a - b);
  const regionList = [...regionSet];
  const regionLatencyData = regionTimestamps.map((ts) => ({
    timestamp: fmtTimestamp(ts),
    ...regionMap.get(ts)!,
  })) as Array<{ timestamp: string; [region: string]: number | string }>;

  // ── Process uptime data ────────────────────────────────────────────
  const uptimeRaw = (monitorData?.uptime ?? []) as UptimePoint[];
  const uptimeSorted = [...uptimeRaw].sort(
    (a, b) =>
      new Date(a.interval).getTime() - new Date(b.interval).getTime(),
  );
  const uptimeData: BarChartUptimeData[] = uptimeSorted.map((d) => ({
    interval: fmtInterval(new Date(d.interval)),
    success: d.success,
    degraded: d.degraded,
    error: d.error,
  }));

  // ── Summary stats ──────────────────────────────────────────────────
  const totalChecks = uptimeData.reduce(
    (s, d) => s + d.success + d.degraded + d.error,
    0,
  );
  const successDegraded = uptimeData.reduce(
    (s, d) => s + d.success + d.degraded,
    0,
  );
  const uptimePct =
    totalChecks > 0
      ? ((successDegraded / totalChecks) * 100).toFixed(2)
      : "100.00";

  // Slowest region by average p75
  let slowestRegion = "N/A";
  let maxAvgP75 = 0;
  for (const region of regionList) {
    const vals = regionsRaw
      .filter((r) => r.region === region)
      .map((r) => r.p75Latency);
    if (vals.length === 0) continue;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > maxAvgP75) {
      maxAvgP75 = avg;
      slowestRegion = region;
    }
  }

  // p75 range
  const p75Vals = latencySorted.map((d) => d.p75Latency);
  const p75Range =
    p75Vals.length > 0
      ? `${Math.min(...p75Vals)}ms – ${Math.max(...p75Vals)}ms`
      : "N/A";

  // ── Render ─────────────────────────────────────────────────────────
  return c.html(
    <Layout
      page={{
        title: `${page.title} — ${m.name as string}`,
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
        slug={slug}
      />

      {/* Top bar: back + monitor name + copy link */}
      <div class="flex items-center justify-between mt-4 mb-2">
        <a
          href={`${prefix}/monitors`}
          class="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Monitors
        </a>

        <button
          type="button"
          class="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          x-data="{}"
          x-on:click="navigator.clipboard.writeText(window.location.href)"
        >
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          Copy link
        </button>
      </div>

      {/* Monitor name + info */}
      <div class="mb-4">
        <h2 class="text-xl font-semibold">{m.name as string}</h2>
        {m.url ? (
          <p class="text-sm text-muted-foreground mt-1">{m.url as string}</p>
        ) : null}
        <div class="flex items-center gap-2 mt-2">
          <span class="text-xs text-muted-foreground uppercase bg-muted px-2 py-0.5 rounded">
            {m.jobType as string}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div class="rounded-lg p-px shadow-sm dark:shadow-none" x-data="{ activeTab: 'global' }">
        <div class="relative rounded-[7px] bg-card">
          {/* Tab buttons */}
          <div class="flex border-b border-border">
            <button
              type="button"
              class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 rounded-tl-[7px]"
              x-on:click="activeTab = 'global'"
              x-bind:class="activeTab === 'global' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            >
              Global Latency
            </button>
            <button
              type="button"
              class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
              x-on:click="activeTab = 'region'"
              x-bind:class="activeTab === 'region' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            >
              Region Latency
            </button>
            <button
              type="button"
              class="px-4 py-2.5 text-sm font-medium transition-colors border-b-2 rounded-tr-[7px]"
              x-on:click="activeTab = 'uptime'"
              x-bind:class="activeTab === 'uptime' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            >
              Uptime
            </button>
          </div>

          {/* Tab: Global Latency */}
          <div x-show="activeTab === 'global'" class="p-4">
            <ChartArea data={globalLatencyData} />
            <div class="mt-3 flex items-center gap-3">
              <span class="text-xs text-muted-foreground">
                p75 range: <span class="text-foreground font-medium">{p75Range}</span>
              </span>
            </div>
          </div>

          {/* Tab: Region Latency */}
          <div x-show="activeTab === 'region'" class="p-4">
            <ChartLine
              data={regionLatencyData}
              regions={regionList}
            />
            <div class="mt-3 flex items-center gap-3 flex-wrap">
              <span class="text-xs text-muted-foreground">
                Regions:{" "}
                <span class="text-foreground font-medium">
                  {regionList.length}
                </span>
              </span>
              {slowestRegion !== "N/A" ? (
                <span class="text-xs text-muted-foreground">
                  Slowest:{" "}
                  <span class="text-foreground font-medium">
                    {slowestRegion}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          {/* Tab: Uptime */}
          <div x-show="activeTab === 'uptime'" class="p-4">
            <ChartBar data={uptimeData} />
            <div class="mt-3 flex items-center gap-3 flex-wrap">
              <span class="text-xs text-muted-foreground">
                Uptime:{" "}
                <span class="text-foreground font-medium">{uptimePct}%</span>
              </span>
              <span class="text-xs text-muted-foreground">
                Total checks:{" "}
                <span class="text-foreground font-medium">{totalChecks}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>,
  );
}
