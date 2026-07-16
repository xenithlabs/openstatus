import type { FC } from "hono/jsx";

import { Markdown } from "./markdown";
import { StatusDot } from "./icons";

export interface BannerEvent {
  id: number;
  type: "incident" | "report" | "maintenance";
  name: string;
  status: string;
  /** Latest update message (reports/maintenances), markdown */
  message?: string | null;
  /** Affected component names */
  affected?: string[];
  /** Link to detail page (reports/maintenances only; incidents have no detail page) */
  href?: string;
}

export interface StatusBannerProps {
  status: "success" | "degraded" | "error" | "info";
  events: BannerEvent[];
  prefix: string;
}

function statusText(status: StatusBannerProps["status"]): {
  heading: string;
  description: string;
} {
  switch (status) {
    case "success":
      return {
        heading: "We're fully operational",
        description: "We're not aware of any issues affecting our systems.",
      };
    case "degraded":
      return {
        heading: "We're experiencing degraded performance",
        description: "",
      };
    case "error":
      return {
        heading: "We're experiencing an outage",
        description: "",
      };
    case "info":
      return {
        heading: "Maintenance in progress",
        description: "",
      };
  }
}

const borderColor: Record<string, string> = {
  success: "bg-success/20",
  degraded: "bg-warning/20",
  error: "bg-destructive/20",
  info: "bg-info/20",
};

/**
 * StatusBanner — shows either:
 * - Tabbed banner with open events (when events.length > 0), or
 * - Simple status message (when no open events)
 *
 * Uses Alpine.js for tab switching. All data is server-rendered.
 */
export const StatusBanner: FC<StatusBannerProps> = ({
  status,
  events,
  prefix: _prefix,
}) => {
  const { heading, description } = statusText(status);

  // No open events: simple banner
  if (events.length === 0) {
    return (
      <div class={`rounded-lg p-px shadow-sm dark:shadow-none ${borderColor[status]}`}>
        <div class="relative rounded-[7px] bg-card">
          <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
            <div class="flex items-center text-foreground py-0.5 gap-2">
              <StatusDot status={status === "info" ? "info" : status === "error" ? "error" : status === "degraded" ? "degraded" : "success"} className="h-4 w-4" />
              {heading}
            </div>
          </div>
          {description ? (
            <div class="text-sm px-4 pb-4 text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Open events: tabbed banner
  return (
    <div
      class={`rounded-lg p-px shadow-sm dark:shadow-none ${borderColor[status]}`}
      x-data={`{ activeTab: 'event-0' }`}
    >
      <div class="relative rounded-[7px] bg-card">
        {/* Tab triggers */}
        <div class="flex border-b border-border/50">
          {events.map((event, i) => (
            <button
              type="button"
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px] truncate"
              x-on:click={`activeTab = 'event-${i}'`}
              x-bind:class={`activeTab === 'event-${i}'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'`}
            >
              <span class="flex items-center gap-2">
                <StatusDot
                  status={event.status === "error" ? "error" : event.status === "degraded" ? "degraded" : event.status === "info" ? "info" : "success"}
                  className="h-2 w-2 shrink-0"
                />
                <span class="truncate">{event.name}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Tab panes */}
        {events.map((event, i) => (
          <div x-show={`activeTab === 'event-${i}'`} class="px-4 py-3.5">
            {event.href ? (
              <a
                href={event.href}
                class="block hover:bg-muted/30 rounded-md -mx-2 px-2 py-1 transition-colors"
              >
                <BannerEventContent event={event} />
              </a>
            ) : (
              <BannerEventContent event={event} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/** Shared rendering for the event content inside a tab pane. */
const BannerEventContent: FC<{ event: BannerEvent }> = ({ event }) => {
  return (
    <div class="flex flex-col gap-2">
      {/* Message */}
      {event.message ? (
        <div class="text-sm text-muted-foreground">
          <Markdown content={event.message} />
        </div>
      ) : null}

      {/* Affected components */}
      {event.affected && event.affected.length > 0 ? (
        <div class="flex flex-wrap gap-1">
          {event.affected.map((name) => (
            <span class="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Arrow indicator for linked events */}
      {event.href ? (
        <div class="text-muted-foreground mt-1">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
      ) : null}
    </div>
  );
};
