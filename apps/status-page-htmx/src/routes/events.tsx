import type { Context } from "hono";
import type { FC } from "hono/jsx";

import { Header } from "../components/header";
import {
  MaintenanceDetailView,
  ReportDetailView,
} from "../components/incident-detail";
import { Layout } from "../components/layout";
import {
  capitalize,
  formatDate,
  MONTH_NAMES,
  parseYearMonthSlug,
  toYearMonthSlug,
} from "../lib/date";
import { logger } from "../lib/logger";
import { getPrefix } from "../lib/prefix";
import { trpc } from "../lib/trpc";

// ── Types ───────────────────────────────────────────────────────────────────

type MergedItem =
  | { kind: "report"; item: Record<string, unknown>; date: Date; id: number; title: string; affected: string[] }
  | { kind: "maintenance"; item: Record<string, unknown>; date: Date; id: number; title: string; affected: string[] };

function getReportDate(report: Record<string, unknown>): Date {
  const updates = (
    (report.statusReportUpdates as Array<Record<string, unknown>>) ?? []
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.date as string).getTime() -
        new Date(a.date as string).getTime(),
    );
  const firstUpdate = updates[updates.length - 1];
  return firstUpdate
    ? new Date(firstUpdate.date as string)
    : report.createdAt
      ? new Date(report.createdAt as string)
      : new Date();
}

// ── Shared page fetch ───────────────────────────────────────────────────────

async function fetchPage(c: Context, slug: string) {
  let page;
  try {
    page = await trpc.statusPage.get.query({ slug });
    logger.debug("events", `Fetched page for slug="${slug}"`, { found: !!page });
  } catch (err) {
    logger.error("events", `Failed to fetch page for slug="${slug}"`, err);
    return null;
  }
  return page ?? null;
}

function pageShell(page: Record<string, unknown>, prefix: string, children: JSX.Element): JSX.Element {
  return (
    <Layout
      page={{
        title: `${page.title as string} — Events`,
        icon: page.icon as string | null,
        themeKey: (page.configuration as Record<string, unknown>)?.theme as string | undefined,
      }}
    >
      <Header
        title={page.title as string}
        icon={page.icon as string | null}
        prefix={prefix}
      />
      {children}
    </Layout>
  );
}

// ── Handler: GET /events ────────────────────────────────────────────────────

export async function eventsListHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);

  const page = await fetchPage(c, slug);
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

  const statusReports = (page.statusReports as Array<Record<string, unknown>>) ?? [];
  const maintenances = (page.maintenances as Array<Record<string, unknown>>) ?? [];

  // Build merged items list
  const merged: MergedItem[] = [
    ...statusReports.map((r) => ({
      kind: "report" as const,
      item: r,
      date: getReportDate(r),
      id: r.id as number,
      title: r.title as string,
      affected:
        (
          r.statusReportsToPageComponents as
            | Array<{ pageComponent: { name: string } }>
            | undefined
        )?.map((a) => a.pageComponent.name) ?? [],
    })),
    ...maintenances.map((m) => ({
      kind: "maintenance" as const,
      item: m,
      date: new Date(m.from as string),
      id: m.id as number,
      title: m.title as string,
      affected:
        (
          m.maintenancesToPageComponents as
            | Array<{ pageComponent: { name: string } }>
            | undefined
        )?.map((a) => a.pageComponent.name) ?? [],
    })),
  ];

  // Group by year
  const byYear = new Map<number, MergedItem[]>();
  for (const m of merged) {
    const y = m.date.getFullYear();
    const bucket = byYear.get(y);
    if (bucket) bucket.push(m);
    else byYear.set(y, [m]);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  const currentYear = new Date().getFullYear();
  const defaultYear = years.includes(currentYear)
    ? currentYear
    : years[0] ?? currentYear;

  // Group items within each year by month
  function byMonth(items: MergedItem[]): Map<number, MergedItem[]> {
    const map = new Map<number, MergedItem[]>();
    for (const item of items) {
      const m = item.date.getMonth();
      const bucket = map.get(m);
      if (bucket) bucket.push(item);
      else map.set(m, [item]);
    }
    for (const [, bucket] of map) {
      bucket.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
    return map;
  }

  return c.html(
    pageShell(page as Record<string, unknown>, prefix,
      <div
        class="flex flex-col gap-6"
        x-data={`{ activeYear: '${defaultYear}' }`}
      >
        {/* Year tabs */}
        <div class="flex flex-wrap gap-1">
          {years.map((y) => (
            <button
              type="button"
              class={`px-3 py-1.5 text-sm rounded-md transition-colors`}
              x-on:click={`activeYear = '${y}'`}
              x-bind:class={`activeYear === '${y}' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Year content */}
        {years.map((y) => {
          const items = byYear.get(y) ?? [];
          const months = byMonth(items);
          const sortedMonths = Array.from(months.keys()).sort(
            (a, b) => b - a,
          );

          return (
            <div x-show={`activeYear === '${y}'`}>
              {items.length === 0 ? (
                <div class="flex flex-col items-center justify-center py-12 text-center">
                  <p class="text-muted-foreground">No incidents reported for {y}</p>
                </div>
              ) : (
                <div class="flex flex-col gap-6">
                  {sortedMonths.map((month) => {
                    const monthItems = months.get(month) ?? [];
                    const monthSlug = toYearMonthSlug(y, month);
                    const visible = monthItems.slice(0, 3);
                    const remaining = monthItems.length - 3;

                    return (
                      <div class="flex flex-col gap-2">
                        <h3 class="text-foreground text-lg font-semibold">
                          {capitalize(MONTH_NAMES[month])} {y}
                        </h3>
                        <div class="flex flex-col gap-3">
                          {visible.map((item) => (
                            <IncidentCard
                              item={item}
                              prefix={prefix}
                            />
                          ))}
                        </div>
                        {remaining > 0 ? (
                          <a
                            href={`${prefix}/events/${monthSlug}`}
                            class="text-muted-foreground hover:text-foreground self-start text-sm transition-colors"
                          >
                            View all {remaining + 3} incidents in{" "}
                            {capitalize(MONTH_NAMES[month])} {y} →
                          </a>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>,
    ),
  );
}

// ── Handler: GET /events/:yearMonth ─────────────────────────────────────────

export async function eventsMonthHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);
  const { "year-month": yearMonth } = c.req.param();

  const page = await fetchPage(c, slug);
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

  const parsed = parseYearMonthSlug(yearMonth);
  if (!parsed) {
    return c.html(
      pageShell(page as Record<string, unknown>, prefix,
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <h2 class="text-lg font-semibold">Invalid month</h2>
          <p class="text-muted-foreground">
            The month you are looking for does not exist.
          </p>
        </div>,
      ),
    );
  }

  const statusReports = (page.statusReports as Array<Record<string, unknown>>) ?? [];
  const maintenances = (page.maintenances as Array<Record<string, unknown>>) ?? [];

  const items: MergedItem[] = [
    ...statusReports
      .map((r) => ({
        kind: "report" as const,
        item: r,
        date: getReportDate(r),
        id: r.id as number,
        title: r.title as string,
        affected:
          (
            r.statusReportsToPageComponents as
              | Array<{ pageComponent: { name: string } }>
              | undefined
          )?.map((a) => a.pageComponent.name) ?? [],
      }))
      .filter(
        (m) =>
          m.date.getFullYear() === parsed.year &&
          m.date.getMonth() === parsed.month,
      ),
    ...maintenances
      .map((m) => ({
        kind: "maintenance" as const,
        item: m,
        date: new Date(m.from as string),
        id: m.id as number,
        title: m.title as string,
        affected:
          (
            m.maintenancesToPageComponents as
              | Array<{ pageComponent: { name: string } }>
              | undefined
          )?.map((a) => a.pageComponent.name) ?? [],
      }))
      .filter(
        (m) =>
          m.date.getFullYear() === parsed.year &&
          m.date.getMonth() === parsed.month,
      ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return c.html(
    pageShell(page as Record<string, unknown>, prefix,
      <div class="flex flex-col gap-6">
        <div class="flex w-full flex-row items-center justify-between gap-2 py-0.5">
          <a
            href={`${prefix}/events`}
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
            Back
          </a>
        </div>
        <h2 class="text-foreground text-lg font-semibold">
          {capitalize(MONTH_NAMES[parsed.month])} {parsed.year}
        </h2>
        {items.length > 0 ? (
          <div class="flex flex-col gap-3">
            {items.map((item) => (
              <IncidentCard item={item} prefix={prefix} />
            ))}
          </div>
        ) : (
          <div class="flex flex-col items-center justify-center py-12 text-center">
            <p class="text-muted-foreground">
              No incidents for this month.
            </p>
          </div>
        )}
      </div>,
    ),
  );
}

// ── Handler: GET /events/report/:id ─────────────────────────────────────────

export async function reportDetailHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);
  const { id } = c.req.param();

  const page = await fetchPage(c, slug);
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

  let report;
  try {
    report = await trpc.statusPage.getReport.query({
      slug,
      id: Number(id),
    });
  } catch {
    report = null;
  }

  if (!report) {
    return c.html(
      pageShell(page as Record<string, unknown>, prefix,
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <h2 class="text-lg font-semibold">Report not found</h2>
          <p class="text-muted-foreground">
            The report you are looking for does not exist.
          </p>
        </div>,
      ),
    );
  }

  return c.html(
    pageShell(page as Record<string, unknown>, prefix,
      <ReportDetailView
        report={report as unknown as import("../components/incident-detail").ReportDetail}
        prefix={prefix}
      />,
    ),
  );
}

// ── Handler: GET /events/maintenance/:id ────────────────────────────────────

export async function maintenanceDetailHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);
  const { id } = c.req.param();

  const page = await fetchPage(c, slug);
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

  let maintenance;
  try {
    maintenance = await trpc.statusPage.getMaintenance.query({
      slug,
      id: Number(id),
    });
  } catch {
    maintenance = null;
  }

  if (!maintenance) {
    return c.html(
      pageShell(page as Record<string, unknown>, prefix,
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <h2 class="text-lg font-semibold">Maintenance not found</h2>
          <p class="text-muted-foreground">
            The maintenance you are looking for does not exist.
          </p>
        </div>,
      ),
    );
  }

  return c.html(
    pageShell(page as Record<string, unknown>, prefix,
      <MaintenanceDetailView
        maintenance={maintenance as unknown as import("../components/incident-detail").MaintenanceDetail}
        prefix={prefix}
      />,
    ),
  );
}

// ── Shared: Incident card for list views ────────────────────────────────────

const IncidentCard: FC<{
  item: MergedItem;
  prefix: string;
}> = ({ item, prefix }) => {
  const href =
    item.kind === "report"
      ? `${prefix}/events/report/${item.id}`
      : `${prefix}/events/maintenance/${item.id}`;

  return (
    <a
      href={href}
      class="flex items-start gap-3 py-3 rounded-lg hover:bg-muted/50 transition-colors -mx-2 px-2 group"
    >
      <div class="text-xs text-muted-foreground whitespace-nowrap min-w-[80px] pt-0.5">
        {formatDate(item.date)}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium truncate group-hover:text-foreground">
            {item.title}
          </span>
        </div>
        {item.affected.length > 0 ? (
          <div class="flex flex-wrap gap-1 mt-1">
            {item.affected.map((name) => (
              <span class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div class="text-muted-foreground group-hover:text-foreground pt-0.5">
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
  );
};

export { fetchPage, pageShell };
