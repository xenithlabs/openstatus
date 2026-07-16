import type { FC } from "hono/jsx";

import { formatDate } from "../lib/date";
import { Markdown } from "./markdown";

export interface IncidentCardItem {
  kind: "report" | "maintenance";
  item: Record<string, unknown>;
  date: Date;
  id: number;
  title: string;
  affected: string[];
}

function statusDotColor(status: string): string {
  switch (status) {
    case "resolved":
    case "completed":
      return "bg-success";
    case "monitoring":
    case "in_progress":
      return "bg-info";
    case "investigating":
    case "identified":
      return "bg-warning";
    default:
      return "bg-muted-foreground";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "resolved":
      return "Resolved";
    case "completed":
      return "Completed";
    case "monitoring":
      return "Monitoring";
    case "investigating":
      return "Investigating";
    case "identified":
      return "Identified";
    case "in_progress":
      return "In progress";
    case "scheduled":
      return "Scheduled";
    default:
      return status;
  }
}

/**
 * Collapsible incident card for the events list.
 *
 * Renders a header (date, title, affected components) that links to the
 * detail page. Clicking the chevron toggle expands a server-rendered
 * timeline inside — no API call needed.
 */
export const CollapsibleIncidentCard: FC<{
  item: IncidentCardItem;
  prefix: string;
}> = ({ item, prefix }) => {
  const href =
    item.kind === "report"
      ? `${prefix}/events/report/${item.id}`
      : `${prefix}/events/maintenance/${item.id}`;

  return (
    <div
      class="rounded-lg hover:bg-muted/50 transition-colors -mx-2 px-2"
      x-data="{ open: false }"
    >
      {/* Header row */}
      <div class="flex items-start gap-3 py-3">
        {/* Date + title link */}
        <a href={href} class="flex items-start gap-3 flex-1 min-w-0 group">
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

        {/* Chevron toggle (always rendered — even if no timeline content) */}
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground pt-0.5 shrink-0"
          x-on:click="open = !open"
          aria-label="Toggle details"
        >
          <svg
            class="w-4 h-4 transition-transform"
            x-bind:class="open ? 'rotate-180' : ''"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Collapsible timeline */}
      <div
        x-show="open"
        class="pl-6 border-l-2 border-border/50 ml-[80px] pb-3 space-y-3"
        style="display: none"
      >
        {item.kind === "report" ? (
          <ReportTimeline report={item.item} />
        ) : (
          <MaintenanceTimeline maintenance={item.item} />
        )}
      </div>
    </div>
  );
};

/** Server-rendered timeline for a status report. */
const ReportTimeline: FC<{ report: Record<string, unknown> }> = ({
  report,
}) => {
  const updates = (
    (report.statusReportUpdates as Array<Record<string, unknown>>) ?? []
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.date as string).getTime() -
        new Date(a.date as string).getTime(),
    );

  if (updates.length === 0) {
    return <p class="text-xs text-muted-foreground">No updates available.</p>;
  }

  return (
    <>
      {updates.map((update) => (
        <div class="relative">
          <div
            class={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full ${statusDotColor(update.status as string)}`}
          />
          <div class="flex items-center gap-2 text-xs mb-1">
            <span class="font-medium">
              {statusLabel(update.status as string)}
            </span>
            <span class="text-muted-foreground">
              {formatDate(update.date as string)}
            </span>
          </div>
          {update.message ? (
            <div class="text-xs text-muted-foreground">
              <Markdown content={update.message as string} />
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
};

/** Server-rendered timeline for a maintenance. */
const MaintenanceTimeline: FC<{ maintenance: Record<string, unknown> }> = ({
  maintenance,
}) => {
  return (
    <>
      {maintenance.message ? (
        <div class="relative">
          <div class="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-info" />
          <div class="text-xs text-muted-foreground">
            <Markdown content={maintenance.message as string} />
          </div>
        </div>
      ) : null}
      <div class="relative">
        <div class="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-muted-foreground" />
        <div class="text-xs text-muted-foreground">
          {formatDate(maintenance.from as string)} →{" "}
          {formatDate(maintenance.to as string)}
        </div>
      </div>
    </>
  );
};
