import type { FC } from "hono/jsx";

import type { StatusBarData, DayEvent } from "./status-bar";
import { StatusBar } from "./status-bar";
import { StatusDot } from "./icons";

/** Format uptime string to 3 decimal places (e.g. "99.66%" → "99.660") */
function formatUptime(raw: string): string {
  const num = parseFloat(raw.replace("%", ""));
  if (isNaN(num)) return raw;
  return num.toFixed(3);
}

export interface ComponentRowProps {
  name: string;
  description?: string | null;
  status: "success" | "degraded" | "error" | "info";
  data?: StatusBarData[];
  uptime?: string | null;
  isLoading?: boolean;
  showUptime?: boolean;
  /** Render as a simple text row (no bar chart, no uptime pill) */
  compact?: boolean;
  barEvents?: Record<number, DayEvent[]>;
  prefix?: string;
}

/**
 * Single component row: status dot, name, optional bar chart, uptime %.
 * Used both for top-level components and inside groups.
 */
export const ComponentRow: FC<ComponentRowProps> = ({
  name,
  description,
  status,
  data,
  uptime,
  isLoading,
  showUptime,
  compact,
  barEvents,
  prefix,
}) => {
  return (
    <div>
      <div class="flex items-center justify-between py-1.5">
        <div class="flex items-center gap-2">
          <StatusDot status={status} />
          <span class="text-sm">{name}</span>
          {description ? (
            <span class="text-xs text-muted-foreground hidden sm:inline">
              {description}
            </span>
          ) : null}
        </div>
        {showUptime ? (
          isLoading ? (
            <div class="h-3 w-12 animate-pulse rounded bg-muted" />
          ) : (
            <span class="text-muted-foreground font-mono text-xs whitespace-nowrap">
              {uptime != null ? `${formatUptime(uptime)}% uptime` : null}
            </span>
          )
        ) : null}
      </div>
      {/* Status bar for this component */}
      {!compact && !isLoading && data && data.length > 0 ? (
        <div class="hidden md:flex mt-0.5 mb-1">
          <StatusBar data={data} events={barEvents} prefix={prefix} />
        </div>
      ) : null}
    </div>
  );
};
