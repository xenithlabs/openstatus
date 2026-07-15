import type { Context } from "hono";

import { Header } from "../components/header";
import {
  IncidentHistory,
  type HistoryMaintenance,
  type HistoryReport,
} from "../components/incident-history";
import { Layout } from "../components/layout";
import { StatusBanner } from "../components/status-banner";
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

  if (componentIds.length > 0) {
    try {
      uptimeResult = await trpc.statusPage.getUptime.query({
        slug,
        pageComponentIds: componentIds,
        days: 90,
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
    data: u.data as ComponentUptime["data"],
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
        data: members[0]?.data as GroupUptime["data"],
        uptime: avgUptime,
      };
    });

  // ── Determine active incident name for banner ─────────────────────────
  const activeIncident = page.openEvents.find((e) => e.type === "incident");
  const activeIncidentName = activeIncident?.name ?? null;
  const bannerStatus = page.status as "success" | "degraded" | "error" | "info";

  // Determine if "fully operational" banner should show
  const actualBannerStatus: typeof bannerStatus =
    page.status === "error" || page.status === "degraded"
      ? page.status
      : page.status === "info"
        ? "info"
        : "success";

  // ── Render ────────────────────────────────────────────────────────────
  return c.html(
    <Layout
      page={{
        title: page.title,
        description: page.description,
        icon: page.icon,
        themeKey: page.configuration?.theme,
        forceTheme: page.forceTheme ?? null,
      }}
    >
      <Header
        title={page.title}
        icon={page.icon}
        prefix={prefix}
      />

      {/* Status Banner */}
      <StatusBanner
        status={actualBannerStatus}
        activeIncidentName={activeIncidentName}
      />

      {/* System Status */}
      <SystemStatus
        trackers={page.trackers as import("../components/system-status").Tracker[]}
        componentUptime={componentUptime}
        groupUptime={groupUptime}
        isLoading={uptimeLoading}
        showUptime={page.configuration?.uptime !== false}
      />

      {/* Incident History */}
      <IncidentHistory
        reports={page.statusReports
          .filter(
            (report) =>
              report.statusReportUpdates.length > 0 &&
              page.lastEvents.some(
                (event) =>
                  event.id === report.id && event.type === "report",
              ),
          )
          .map((report) => ({
            ...report,
            affected:
              report.statusReportsToPageComponents?.map(
                (c) => c.pageComponent.name,
              ) ?? [],
          })) as unknown as HistoryReport[]}
        maintenances={page.maintenances
          .filter((maintenance) =>
            page.lastEvents.some(
              (event) =>
                event.id === maintenance.id &&
                event.type === "maintenance",
            ),
          )
          .map((maintenance) => ({
            ...maintenance,
            affected:
              maintenance.maintenancesToPageComponents?.map(
                (c) => c.pageComponent.name,
              ) ?? [],
          })) as unknown as HistoryMaintenance[]}
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
