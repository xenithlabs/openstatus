import type { FC } from "hono/jsx";

import type { StatusBarData } from "./bar-chart";
import { BarChart } from "./bar-chart";
import { StatusDot } from "./icons";

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
}) => {
  return (
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
      {compact ? (
        showUptime && uptime != null ? (
          <span class="text-muted-foreground font-mono text-xs">{uptime}%</span>
        ) : null
      ) : (
        <div class="flex items-center gap-2">
          {showUptime ? (
            isLoading ? (
              <div class="h-3 w-12 animate-pulse rounded bg-muted" />
            ) : (
              <span class="text-muted-foreground font-mono text-xs whitespace-nowrap">
                {uptime != null ? `${uptime}% uptime` : null}
              </span>
            )
          ) : null}
        </div>
      )}
    </div>
  );
};
