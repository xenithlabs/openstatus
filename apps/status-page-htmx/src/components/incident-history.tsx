import type { FC } from "hono/jsx";

import { formatDate } from "../lib/date";

export interface HistoryReport {
  id: number;
  title: string;
  status: string;
  affected: string[];
  createdAt: Date | string;
}

export interface HistoryMaintenance {
  id: number;
  title: string;
  status: string;
  affected: string[];
  from: Date | string;
}

export type HistoryItem =
  | { kind: "report"; data: HistoryReport }
  | { kind: "maintenance"; data: HistoryMaintenance };

function itemDate(item: HistoryItem): Date {
  if (item.kind === "report") return new Date(item.data.createdAt);
  return new Date(item.data.from);
}

function sortedItems(items: HistoryItem[]): HistoryItem[] {
  return [...items].sort(
    (a, b) => itemDate(b).getTime() - itemDate(a).getTime(),
  );
}

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

export interface IncidentHistoryProps {
  reports: HistoryReport[];
  maintenances: HistoryMaintenance[];
  prefix: string;
}

/**
 * "Incident History" card with a list of past incidents/maintenances.
 * Each entry links to the detail page.
 */
export const IncidentHistory: FC<IncidentHistoryProps> = ({
  reports,
  maintenances,
  prefix,
}) => {
  const items: HistoryItem[] = [
    ...reports.map((r) => ({ kind: "report" as const, data: r })),
    ...maintenances.map((m) => ({ kind: "maintenance" as const, data: m })),
  ];

  const ordered = sortedItems(items);

  if (ordered.length === 0) return null;

  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <h2 class="text-foreground">Incident History</h2>
        </div>
        <div class="px-4 pb-4">
          <div class="divide-y divide-border/50">
            {ordered.map((item) => {
              const href =
                item.kind === "report"
                  ? `${prefix}/events/report/${item.data.id}`
                  : `${prefix}/events/maintenance/${item.data.id}`;
              const date = itemDate(item);
              const title = item.data.title;

              return (
                <a
                  href={href}
                  class="flex items-start gap-3 py-3 rounded-lg hover:bg-muted/50 transition-colors -mx-2 px-2 group"
                >
                  {/* Date */}
                  <div class="text-xs text-muted-foreground whitespace-nowrap min-w-[80px] pt-0.5">
                    {formatDate(date)}
                  </div>

                  {/* Content */}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium truncate group-hover:text-foreground">
                        {title}
                      </span>
                      <span
                        class={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${statusBadgeClass(item.kind === "report" ? (item.data as HistoryReport).status : (item.data as HistoryMaintenance).status)}`}
                      >
                        {statusLabel(
                          item.kind === "report"
                            ? (item.data as HistoryReport).status
                            : (item.data as HistoryMaintenance).status,
                        )}
                      </span>
                    </div>

                    {/* Affected components */}
                    {item.data.affected.length > 0 ? (
                      <div class="flex flex-wrap gap-1 mt-1">
                        {item.data.affected.map((name) => (
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
        </div>
      </div>
    </div>
  );
};
