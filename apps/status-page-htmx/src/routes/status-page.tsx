import type { Context } from "hono";

import { Header } from "../components/header";
import { Layout } from "../components/layout";
import { StatusBanner, type BannerEvent } from "../components/status-banner";
import type { DayEvent } from "../components/status-bar";
import {
  StatusFeed,
  type FeedReport,
  type FeedMaintenance,
} from "../components/status-feed";
import {
  SystemStatus,
  type ComponentUptime,
  type GroupUptime,
} from "../components/system-status";
import { logger } from "../lib/logger";
import { trpc } from "../lib/trpc";

/**
 * GET /:domain/:locale — Home page
 *
 * Fetches page config + uptime data via tRPC and renders the full
 * OpenAI-style status page.
 */
export async function homePageHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  // When accessed via custom domain (no :domain param), use clean relative
  // URLs without a slug/locale prefix. When accessed via path, include prefix.
  const domain = c.req.param("domain");
  const locale = c.req.param("locale") ?? "en";
  const prefix = domain ? `/${domain}/${locale}` : "";
  c.set("prefix", prefix);

  // ── Fetch page data ──────────────────────────────────────────────────
  let page;
  try {
    page = await trpc.statusPage.get.query({ slug });
  } catch (err) {
    logger.error("home", `Failed to fetch page for slug="${slug}"`, err);
    // Return 404 with proper HTML shell
    return c.html(
      <Layout page={{ title: "404 — Page Not Found" }}>
        <div class="mx-auto flex w-full max-w-[718px] flex-col items-center justify-center gap-4 px-4 py-24">
          <h1 class="text-4xl font-bold">404</h1>
          <p class="text-muted-foreground">This page could not be found.</p>
        </div>
      </Layout>,
      404,
    );
  }

  if (!page) return c.notFound();

  // ── Fetch uptime data ─────────────────────────────────────────────────
  const componentIds = page.pageComponents.map((c) => c.id.toString());
  let uptimeResult: Awaited<ReturnType<typeof trpc.statusPage.getUptime.query>> | null = null;
  let uptimeLoading = true;

  // Match Next.js defaults: cardType=requests, barType=dominant
  // Page configuration can override via configuration.type / configuration.value
  // History days: respects the dashboard's "History" setting (defaults to 90).
  const cardType = (page.configuration?.value as string) ?? "requests";
  const barType = (page.configuration?.type as string) ?? "dominant";
  const historyDays = (page.configuration?.days as number) ?? 90;

  if (componentIds.length > 0) {
    try {
      uptimeResult = await trpc.statusPage.getUptime.query({
        slug,
        pageComponentIds: componentIds,
        cardType: cardType as "requests" | "duration" | "dominant" | "manual",
        barType: barType as "absolute" | "dominant" | "manual",
        days: historyDays as 30 | 45 | 90 | undefined,
      });
      uptimeLoading = false;
    } catch (err) {
      logger.error("home", `Failed to fetch uptime for slug="${slug}"`, err);
      uptimeLoading = false;
    }
  } else {
    uptimeLoading = false;
  }

  // ── Prepare component uptime lookups ─────────────────────────────────
  const componentUptime: ComponentUptime[] = (uptimeResult ?? []).map((u) => ({
    pageComponentId: u.pageComponentId,
    data: u.data as unknown as ComponentUptime["data"],
    uptime: u.uptime,
  }));

  // Compute group-level uptime from component data
  const groupUptime: GroupUptime[] = page.trackers
    .filter((t) => t.type === "group")
    .map((group) => {
      const memberIds = group.components.map((c) => c.id);
      const members = (uptimeResult ?? []).filter((u) =>
        memberIds.includes(u.pageComponentId),
      );
      // Aggregate: average of member uptimes for the group header
      const uptimes = members
        .map((m) => parseFloat(m.uptime ?? ""))
        .filter((n) => !isNaN(n));
      const avgUptime =
        uptimes.length > 0
          ? (uptimes.reduce((a, b) => a + b, 0) / uptimes.length).toFixed(2)
          : null;
      return {
        groupId: group.groupId.toString(),
        data: members[0]?.data as unknown as GroupUptime["data"],
        uptime: avgUptime,
      };
    });

  // ── Build banner events from open events ────────────────────────────
  // Build a monitor lookup for degraded classification
  const monitorByIncidentId = new Map<number, Record<string, unknown>>();
  for (const pc of page.pageComponents) {
    for (const inc of (pc.monitor?.incidents as Array<Record<string, unknown>> | undefined) ?? []) {
      if (!monitorByIncidentId.has(inc.id as number)) {
        monitorByIncidentId.set(inc.id as number, pc.monitor as Record<string, unknown>);
      }
    }
  }

  const bannerEvents: BannerEvent[] = [];
  for (const evt of page.openEvents) {
    if (evt.type === "incident") {
      // API hardcodes incident name as "Downtime". Derive the label from
      // the monitor config instead, matching the bar chart tooltip logic.
      const mon = monitorByIncidentId.get(evt.id);
      const monStatus = (mon?.status as string) ?? "";
      const degradedTriggers = (mon?.degradedTriggersIncident as boolean) ?? false;
      const hasDegradedThreshold = (mon?.degradedAfter as number) != null;
      const isDegraded = monStatus === "degraded" || degradedTriggers || hasDegradedThreshold;
      bannerEvents.push({
        id: evt.id,
        type: "incident",
        name: isDegraded ? "Degraded" : "Downtime",
        status: (isDegraded ? "degraded" : "error") as BannerEvent["status"],
      });
    } else if (evt.type === "report") {
      const report = page.statusReports.find((r: Record<string, unknown>) => r.id === evt.id);
      if (!report) continue;
      const updates = ((report.statusReportUpdates as Array<Record<string, unknown>>) ?? [])
        .slice()
        .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
          new Date(b.date as string).getTime() - new Date(a.date as string).getTime(),
        );
      const latest = updates[0];
      bannerEvents.push({
        id: evt.id,
        type: "report",
        name: evt.name,
        status: evt.status as BannerEvent["status"],
        message: (latest?.message as string) ?? null,
        affected:
          (report.statusReportsToPageComponents as Array<{ pageComponent: { name: string } }> | undefined)?.map(
            (a) => a.pageComponent.name,
          ) ?? [],
        href: `${prefix}/events/report/${evt.id}`,
      });
    } else if (evt.type === "maintenance") {
      const maint = page.maintenances.find((m: Record<string, unknown>) => m.id === evt.id);
      if (!maint) continue;
      bannerEvents.push({
        id: evt.id,
        type: "maintenance",
        name: evt.name,
        status: evt.status as BannerEvent["status"],
        message: (maint.message as string) ?? null,
        affected:
          (maint.maintenancesToPageComponents as Array<{ pageComponent: { name: string } }> | undefined)?.map(
            (a) => a.pageComponent.name,
          ) ?? [],
        href: `${prefix}/events/maintenance/${evt.id}`,
      });
    }
  }

  // Determine banner status color
  const bannerStatus = page.status as "success" | "degraded" | "error" | "info";
  const actualBannerStatus: typeof bannerStatus =
    page.status === "error" || page.status === "degraded"
      ? page.status
      : page.status === "info"
        ? "info"
        : "success";

  // ── Helper: human-readable duration ─────────────────────────────────
  function formatDuration(from: Date, to: Date): string {
    const ms = to.getTime() - from.getTime();
    if (ms < 60000) return `${Math.round(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.round(ms / 60000)} minutes`;
    if (ms < 86400000) return `${Math.round(ms / 3600000)} hours`;
    return `${Math.round(ms / 86400000)} days`;
  }

  // ── Build bar events for StatusBar hover tooltips ───────────────────
  const now = Date.now();
  const barEvents: Record<number, DayEvent[]> = {};
  const getDayIndex = (date: Date): number =>
    Math.floor((now - date.getTime()) / 86400000);

  for (const report of page.statusReports) {
    if (!report.createdAt) continue;
    const dayIdx = getDayIndex(new Date(report.createdAt));
    if (dayIdx >= 0 && dayIdx < 90) {
      const updates = (report.statusReportUpdates as Array<Record<string, unknown>> | undefined) ?? [];
      const sortedUpdates = updates
        .slice()
        .sort((a, b) => new Date(b.date as string).getTime() - new Date(a.date as string).getTime());
      const lastUpdate = sortedUpdates[0];
      const endAt = lastUpdate?.date as string | undefined;
      const startAtDate = new Date(report.createdAt);
      const endAtDate = endAt ? new Date(endAt) : undefined;
      (barEvents[dayIdx] ??= []).push({
        id: report.id,
        type: "report",
        name: report.title,
        status: (report.status as DayEvent["status"]) ?? "info",
        href: `${prefix}/events/report/${report.id}`,
        startAt: (report.createdAt as unknown as string) ?? report.createdAt.toString(),
        endAt: endAt,
        duration: endAtDate ? formatDuration(startAtDate, endAtDate) : undefined,
      });
    }
  }
  for (const maint of page.maintenances) {
    const dayIdx = getDayIndex(new Date(maint.from));
    if (dayIdx >= 0 && dayIdx < 90) {
      const maintFrom = (maint.from as unknown as string) ?? String(maint.from);
      const maintTo = (maint as Record<string, unknown>).to as string | undefined;
      (barEvents[dayIdx] ??= []).push({
        id: maint.id,
        type: "maintenance",
        name: maint.title,
        status: ("status" in maint ? (maint as Record<string, unknown>).status : "info") as DayEvent["status"],
        href: `${prefix}/events/maintenance/${maint.id}`,
        startAt: maintFrom,
        endAt: maintTo,
        duration: maintTo ? formatDuration(new Date(maintFrom), new Date(maintTo)) : undefined,
      });
    }
  }

  // Map component monitor incidents to bar events
  const seenIncidentIds = new Set<number>();
  for (const pc of page.pageComponents) {
    const incidents = (pc.monitor?.incidents as Array<Record<string, unknown>> | undefined) ?? [];
    for (const inc of incidents) {
      const incId = inc.id as number;
      if (seenIncidentIds.has(incId)) continue;
      seenIncidentIds.add(incId);
      if (!inc.startedAt) continue;
      const incStartedAt = inc.startedAt as string;
      const incEndedAt = inc.endedAt as string | undefined;
      const dayIdx = getDayIndex(new Date(incStartedAt));
      if (dayIdx >= 0 && dayIdx < 90) {
        // Auto-created incidents (empty title, status "triage") come from
        // the checker's degraded/error detection. Use the component's
        // displayed status (from the page tracker) to determine the label.
        // The tracker status is already computed as "error", "degraded",
        // or "success" based on the page's own status logic.
        const isAutoCreated = !(inc.title as string)?.trim();
        const monitor = pc.monitor as Record<string, unknown> | undefined;
        const monitorStatus = (monitor?.status as string) ?? "";
        const degradedTriggers = (monitor?.degradedTriggersIncident as boolean) ?? false;
        // An incident is "degraded" when the monitor status is degraded,
        // degradedTriggersIncident is enabled, or the monitor has a
        // degradedAfter threshold (meaning degraded detection is configured).
        const hasDegradedThreshold = (monitor?.degradedAfter as number) != null;
        const isDegraded = monitorStatus === "degraded" || degradedTriggers || hasDegradedThreshold;
        (barEvents[dayIdx] ??= []).push({
          id: incId,
          type: "incident",
          name: isAutoCreated
            ? (isDegraded ? "Degraded" : "Downtime")
            : ((inc.title as string)?.trim() || "Downtime"),
          status: isAutoCreated
            ? (isDegraded ? "degraded" as const : "error" as const)
            : (((inc.status as string) === "resolved")
               ? "success" as const
               : "degraded" as const),
          startAt: incStartedAt,
          endAt: incEndedAt,
          duration: incEndedAt ? formatDuration(new Date(incStartedAt), new Date(incEndedAt)) : undefined,
        });
      }
    }
  }

  // ── Build StatusFeed data ────────────────────────────────────────────
  const feedReports: FeedReport[] = page.statusReports
    .filter((r) =>
      page.lastEvents.some(
        (e) => e.id === r.id && e.type === "report",
      ),
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      affected:
        r.statusReportsToPageComponents?.map(
          (c) => c.pageComponent.name,
        ) ?? [],
      createdAt: r.createdAt ?? new Date(),
      message:
        (r.statusReportUpdates
          .slice()
          .sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
              new Date(b.date as string).getTime() -
              new Date(a.date as string).getTime(),
          )[0]?.message as string) ?? null,
      updates: r.statusReportUpdates.map((u) => ({
        id: u.id,
        status: u.status,
        date: u.date,
        message: u.message,
      })),
    }));

  const feedMaintenances: FeedMaintenance[] = page.maintenances
    .filter((m) =>
      page.lastEvents.some(
        (e) => e.id === m.id && e.type === "maintenance",
      ),
    )
    .map((m) => ({
      id: m.id,
      title: m.title,
      status: ((m as Record<string, unknown>).status as string) ?? "info",
      affected:
        m.maintenancesToPageComponents?.map(
          (c) => c.pageComponent.name,
        ) ?? [],
      from: m.from,
      message: (m.message as string) ?? null,
    }));

  // ── Render ────────────────────────────────────────────────────────────
  return c.html(
    <Layout
      page={{
        title: page.title,
        description: page.description,
        icon: page.icon,
        themeKey: page.configuration?.theme,
        forceTheme: page.forceTheme ?? null,
        slug,
        updatedAt: new Date(),
      }}
    >
      <Header
        title={page.title}
        icon={page.icon}
        prefix={prefix}
        slug={slug}
      />

      {/* Status Banner */}
      <StatusBanner
        status={actualBannerStatus}
        events={bannerEvents}
        prefix={prefix}
      />

      {/* System Status */}
      <SystemStatus
        trackers={page.trackers as import("../components/system-status").Tracker[]}
        componentUptime={componentUptime}
        groupUptime={groupUptime}
        isLoading={uptimeLoading}
        showUptime={page.configuration?.uptime !== false}
        barEvents={barEvents}
        prefix={prefix}
      />

      {/* Status Feed */}
      <StatusFeed
        reports={feedReports}
        maintenances={feedMaintenances}
        prefix={prefix}
      />

      {/* Bottom Subscribe CTA */}
      <div class="flex justify-center pb-6">
        <a
          href={`${prefix}/subscribe`}
          class="transition text-sm focus:outline-none px-2.5 py-1.5 rounded-md border text-muted-foreground hover:text-foreground flex gap-1 items-center"
        >
          Subscribe to updates
        </a>
      </div>
    </Layout>,
  );
}
