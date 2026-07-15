import type { FC } from "hono/jsx";

import { formatDate } from "../lib/date";

export interface ReportUpdate {
  id: number;
  status: string;
  date: Date | string;
  message: string;
}

export interface ReportDetail {
  id: number;
  title: string;
  status: string;
  createdAt: Date | string;
  statusReportUpdates: ReportUpdate[];
  statusReportsToPageComponents: Array<{
    pageComponent: { id: number; name: string };
  }>;
}

export interface MaintenanceDetail {
  id: number;
  title: string;
  message: string;
  from: Date | string;
  to: Date | string;
  maintenancesToPageComponents: Array<{
    pageComponent: { id: number; name: string };
  }>;
}

function statusColor(status: string): string {
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
 * Detailed view for a single status report.
 */
export const ReportDetailView: FC<{
  report: ReportDetail;
  prefix: string;
}> = ({ report, prefix }) => {
  const updates = [...report.statusReportUpdates].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const firstUpdate = updates[updates.length - 1];
  const isReportResolvedOnly =
    report.status === "resolved" &&
    updates.length > 0 &&
    updates[0]?.status !== "resolved";

  return (
    <div class="flex flex-col gap-6">
      {/* Back button */}
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

      {/* Report card */}
      <div class="flex gap-6">
        {/* Date sidebar */}
        <div class="hidden sm:block shrink-0 w-[100px]">
          <div class="text-sm text-muted-foreground pt-1">
            {formatDate(firstUpdate?.date ?? report.createdAt)}
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-3">
            <h1 class="text-lg font-semibold">{report.title}</h1>
            {isReportResolvedOnly ? (
              <svg
                class="w-5 h-5 text-success"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            ) : null}
          </div>

          {/* Affected components */}
          {report.statusReportsToPageComponents.length > 0 ? (
            <div class="flex flex-wrap gap-1 mb-4">
              {report.statusReportsToPageComponents.map((affected) => (
                <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {affected.pageComponent.name}
                </span>
              ))}
            </div>
          ) : null}

          {/* Timeline */}
          <div class="relative pl-6 border-l-2 border-border space-y-4">
            {updates.map((update, i) => (
              <div class="relative">
                {/* Dot */}
                <div
                  class={`absolute -left-[25px] top-1.5 w-2.5 h-2.5 rounded-full ${statusColor(update.status)}`}
                />
                {/* Status + Date */}
                <div class="flex items-center gap-2 text-sm mb-1">
                  <span class="font-medium">{statusLabel(update.status)}</span>
                  <span class="text-muted-foreground">
                    {formatDate(update.date)}
                  </span>
                </div>
                {/* Message */}
                {update.message ? (
                  <p class="text-sm text-muted-foreground whitespace-pre-wrap">
                    {update.message}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Detailed view for a single maintenance.
 */
export const MaintenanceDetailView: FC<{
  maintenance: MaintenanceDetail;
  prefix: string;
}> = ({ maintenance, prefix }) => {
  return (
    <div class="flex flex-col gap-6">
      {/* Back button */}
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

      {/* Maintenance card */}
      <div class="flex gap-6">
        {/* Date sidebar */}
        <div class="hidden sm:block shrink-0 w-[100px]">
          <div class="text-sm text-muted-foreground pt-1">
            {formatDate(maintenance.from)}
          </div>
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          <h1 class="text-lg font-semibold mb-3">{maintenance.title}</h1>

          {/* Status badge */}
          <span class="inline-flex text-xs px-2 py-0.5 rounded-full font-medium bg-info/10 text-info mb-3">
            {statusLabel("completed")}
          </span>

          {/* Affected components */}
          {maintenance.maintenancesToPageComponents.length > 0 ? (
            <div class="flex flex-wrap gap-1 mt-3 mb-4">
              {maintenance.maintenancesToPageComponents.map((affected) => (
                <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {affected.pageComponent.name}
                </span>
              ))}
            </div>
          ) : null}

          {/* Message */}
          {maintenance.message ? (
            <div class="text-sm text-muted-foreground whitespace-pre-wrap mt-4 border-t border-border pt-4">
              {maintenance.message}
            </div>
          ) : null}

          {/* Schedule */}
          <div class="text-sm text-muted-foreground mt-3">
            {formatDate(maintenance.from)} → {formatDate(maintenance.to)}
          </div>
        </div>
      </div>
    </div>
  );
};
