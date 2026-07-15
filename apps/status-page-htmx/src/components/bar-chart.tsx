import type { FC } from "hono/jsx";

import { statusColors } from "./icons";

export interface StatusBarData {
  bar: Array<{
    status: "success" | "degraded" | "error";
    weight: number;
  }>;
}

/**
 * Dominant status for a day (the bar segment with the highest weight).
 */
function dominantStatus(
  day: StatusBarData,
): "success" | "degraded" | "error" {
  if (day.bar.length === 0) return "success";
  let max = day.bar[0];
  for (const segment of day.bar) {
    if (segment.weight > max.weight) max = segment;
  }
  return max.status;
}

/**
 * Inline SVG bar chart showing colored pill segments (one per day).
 * Mirrors the OpenAI-style horizontal bar chart from the Next.js status page.
 */
export const BarChart: FC<{
  data: StatusBarData[];
}> = ({ data }) => {
  if (data.length === 0) return null;

  const barWidth = 90; // max 90 days shown
  const pillWidth = 5;
  const pillHeight = 16;
  const gap = 2.34065934065934;
  const step = pillWidth + gap;
  const totalWidth = barWidth * step;

  return (
    <svg
      width="100%"
      height={pillHeight}
      viewBox={`0 0 ${totalWidth} ${pillHeight}`}
      class="mb-1"
    >
      {data.slice(0, barWidth).map((day, i) => {
        const status = dominantStatus(day);
        return (
          <rect
            key={i}
            x={i * step}
            y="0"
            width={pillWidth}
            height={pillHeight}
            rx="1"
            ry="1"
            fill={statusColors[status]}
            class="transition"
          />
        );
      })}
    </svg>
  );
};
