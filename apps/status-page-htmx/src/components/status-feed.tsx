import type { FC } from "hono/jsx";

import { formatDate } from "../lib/date";
import { Markdown } from "./markdown";

// ── Types ───────────────────────────────────────────────────────────────────

export interface FeedReport {
  id: number;
  title: string;
  status: string;
  /** Affected component names */
  affected: string[];
  createdAt: Date | string;
  /** Latest update message (markdown) */
  message?: string | null;
  /** Updates with status changes for timeline rendering */
  updates?: Array<{
    id: number;
    status: string;
    date: Date | string;
    message: string;
  }>;
}

export interface FeedMaintenance {
  id: number;
  title: string;
  status: string;
  /** Affected component names */
  affected: string[];
  from: Date | string;
  message?: string | null;
}

export interface StatusFeedProps {
  reports: FeedReport[];
  maintenances: FeedMaintenance[];
  prefix: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeClass(status: string): string {
  switch (status) {
    case "resolved":
    case "completed":
      return "bg-success/10 text-success";
    case "monitoring":
      return "bg-info/10 text-info";
    case "investigating":
    case "identified":
      return "bg-warning/10 text-warning";
    default:
      return "bg-muted text-muted-foreground";
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

function statusTimelineColor(status: string): string {
  switch (status) {
    case "resolved":
    case "completed":
      return "bg-success";
    case "monitoring":
      return "bg-info";
    case "investigating":
    case "identified":
    case "in_progress":
      return "bg-warning";
    case "scheduled":
      return "bg-info";
    default:
      return "bg-muted-foreground";
  }
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Status feed section for the home page.
 *
 * Shows recent status reports and maintenances with markdown-rendered
 * update messages and a "View events history" link at the bottom.
 */
export const StatusFeed: FC<StatusFeedProps> = ({
  reports,
  maintenances,
  prefix,
}) => {
  if (reports.length === 0 && maintenances.length === 0) return null;

  // Merge and sort by date, newest first
  const items: Array<
    | { kind: "report"; data: FeedReport; date: Date }
    | { kind: "maintenance"; data: FeedMaintenance; date: Date }
  > = [
    ...reports.map((r) => ({
      kind: "report" as const,
      data: r,
      date: new Date(r.createdAt),
    })),
    ...maintenances.map((m) => ({
      kind: "maintenance" as const,
      data: m,
      date: new Date(m.from),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <h2 class="text-foreground">Recent Events</h2>
        </div>
        <div class="px-4 pb-4">
          <div class="divide-y divide-border/50">
            {items.map((item) => {
              const href =
                item.kind === "report"
                  ? `${prefix}/events/report/${item.data.id}`
                  : `${prefix}/events/maintenance/${item.data.id}`;
              const data = item.data;
              const status = data.status;

              return (
                <a
                  href={href}
                  class="flex items-start gap-3 py-3 rounded-lg hover:bg-muted/50 transition-colors -mx-2 px-2 group"
                >
                  {/* Date */}
                  <div class="text-xs text-muted-foreground whitespace-nowrap min-w-[80px] pt-0.5">
                    {formatDate(item.date)}
                  </div>

                  {/* Content */}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium truncate group-hover:text-foreground">
                        {data.title}
                      </span>
                      <span
                        class={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${statusBadgeClass(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                    </div>

                    {/* Message (markdown) */}
                    {data.message ? (
                      <div class="mt-1 text-xs text-muted-foreground line-clamp-2">
                        <Markdown content={data.message} />
                      </div>
                    ) : null}

                    {/* Report timeline updates */}
                    {item.kind === "report" &&
                    (data as FeedReport).updates &&
                    (data as FeedReport).updates!.length > 1 ? (
                      <div class="mt-2 pl-4 border-l-2 border-border space-y-1.5">
                        {(data as FeedReport).updates!
                          .slice(0, 3)
                          .map((update) => (
                            <div class="relative">
                              <div
                                class={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full ${statusTimelineColor(update.status)}`}
                              />
                              <div class="flex items-center gap-1.5 text-xs">
                                <span class="font-medium">
                                  {statusLabel(update.status)}
                                </span>
                                <span class="text-muted-foreground">
                                  {formatDate(update.date)}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : null}

                    {/* Affected components */}
                    {data.affected.length > 0 ? (
                      <div class="flex flex-wrap gap-1 mt-1.5">
                        {data.affected.map((name) => (
                          <span class="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Arrow */}
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
            })}
          </div>

          {/* Footer link */}
          <div class="flex justify-center pt-4">
            <a
              href={`${prefix}/events`}
              class="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              View events history
              <svg
                class="w-3.5 h-3.5"
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
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
