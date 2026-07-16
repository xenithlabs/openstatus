import type { FC } from "hono/jsx";

import { statusColors } from "./icons";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BarSegment {
  status: "success" | "degraded" | "error" | "info" | "empty";
  /** Percentage height of this segment (0-100). Backend sends `height`, not
   * `weight` — both field names are accepted for backward compat. */
  height?: number;
  weight?: number;
}

export interface StatusBarData {
  bar: BarSegment[];
}

export interface DayEvent {
  id: number;
  type: "report" | "maintenance" | "incident";
  name: string;
  status: "success" | "degraded" | "error" | "info";
  href?: string;
  /** ISO date string for the event start */
  startAt?: string;
  /** ISO date string for the event end */
  endAt?: string;
  /** Human-readable duration like "4 hours" or "1 day" */
  duration?: string;
}

export interface StatusBarProps {
  data: StatusBarData[];
  events?: Record<number, DayEvent[]>;
  /** Map of incident ID → external permalink (like incident.io) */
  incidentPermalinks?: Record<string, string>;
  prefix?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function dominantStatus(day: StatusBarData): string {
  if (day.bar.length === 0) return "empty";
  // Backend sends `height` (percentage); old code used `weight`.
  // Accept either field to determine the dominant segment.
  let max = day.bar[0];
  for (const segment of day.bar) {
    const a = segment.height ?? segment.weight ?? 0;
    const b = max.height ?? max.weight ?? 0;
    if (a > b) max = segment;
  }
  return max.status;
}

/**
 * Build OpenAI-style tooltip card HTML for a day.
 *
 * OpenAI's tooltip is minimalist: just a date header and a list of
 * incident names as links. No status summary, no time ranges, no
 * color dots, no pin footer.
 */
function buildOpenAICardHtml(
  dayEvents: DayEvent[],
  dateLabel: string,
  permalinks: Record<string, string>,
): string {
  // Deduplicate by href — OpenAI groups impacts by incident_id
  const seen = new Set<string>();
  const uniqueEvents = dayEvents.filter((evt) => {
    const key = evt.href || String(evt.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Show at most 5 most recent incidents in the tooltip
  const eventsHtml = uniqueEvents
    .slice(0, 5)
    .map((evt) => {
      const name = evt.name.replace(/"/g, "&quot;");
      // OpenAI links to external incident pages (incident.io)
      const permalink = evt.href
        ? permalinks[evt.href] || evt.href
        : null;
      if (permalink) {
        return `<a href="${permalink}" class="block py-0.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">${name}</a>`;
      }
      return `<div class="block py-0.5 text-sm text-foreground">${name}</div>`;
    })
    .join("");

  const remaining = uniqueEvents.length - 5;
  const moreHtml =
    remaining > 0
      ? `<div class="px-2.5 pb-1.5 text-xs text-muted-foreground">+${remaining} more</div>`
      : "";

  return [
    '<div data-slot="tooltip-content" class="min-w-40">',
    `<div class="px-2.5 py-1.5 text-xs text-muted-foreground">${dateLabel}</div>`,
    eventsHtml ? `<div class="px-2.5 pb-2 space-y-0">${eventsHtml}${moreHtml}</div>` : "",
    "</div>",
  ].join("");
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Status bar chart with OpenAI-style hover tooltip.
 *
 * Minimalist SVG bar of colored pills. Hovering over a pill with incidents
 * shows a simple tooltip: date header followed by incident name links.
 *
 * Behavior matches status.openai.com:
 * - Tooltip appears on mouseenter above the pill
 * - Tooltip disappears on mouseleave of the entire container
 * - No click-to-pin, no animation, no status summary row
 * - Incident names link to external detail pages
 */
export const StatusBar: FC<StatusBarProps> = ({
  data,
  events = {},
  incidentPermalinks = {},
  prefix: _prefix,
}) => {
  if (data.length === 0) return null;

  const barWidth = Math.min(data.length, 90);
  const pillWidth = 5;
  const pillHeight = 16;
  const gap = 2.34;
  const step = pillWidth + gap;
  const totalWidth = barWidth * step;

  // Compute date labels: first bar = ~90 days ago, last bar = today
  const now = Date.now();
  const dayDateLabels: string[] = [];
  for (let i = 0; i < barWidth; i++) {
    const d = new Date(now - (barWidth - 1 - i) * 86400000);
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    dayDateLabels.push(
      `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
    );
  }

  // Pre-render card HTML for EVERY day (OpenAI shows tooltip on all days)
  const dayCards: Record<string, string> = {};
  for (let i = 0; i < barWidth; i++) {
    const dayEvents = events[i] || [];
    const dateLabel = dayDateLabels[i] || `Day ${i + 1}`;
    dayCards[String(i)] = buildOpenAICardHtml(
      dayEvents,
      dateLabel,
      incidentPermalinks,
    );
  }

  // Build Alpine x-data as a plain string
  const alpineData = `{ activeDay: null, cards: ${JSON.stringify(dayCards)} }`;

  return (
    <div
      x-data={alpineData}
      x-on:mouseleave="activeDay = null"
    >
      {/* SVG bar chart */}
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
              class="transition cursor-pointer hover:opacity-80"
              x-on:mouseenter={`activeDay = ${i}`}
            />
          );
        })}
      </svg>

      {/* Day markers: "N days ago" on the left, "Today" on the right */}
      <div class="flex justify-between text-muted-foreground text-[10px] font-mono leading-none mt-0.5">
        <span>{barWidth} days ago</span>
        <span>Today</span>
      </div>

      {/*
        OpenAI-style tooltip: sibling div, positioned via x-init on activation.
        No animation, no pin, no status row — just date + incident links.
      */}
      <div
        x-show="activeDay !== null"
        x-init={`
          $el.style.position = 'fixed';
          function pos() {
            var v = activeDay;
            if (v === null) { $el.style.display = 'none'; return; }
            var svg = $el.previousElementSibling;
            if (!svg) return;
            var rects = svg.querySelectorAll('rect');
            var rect = rects[v];
            if (!rect) return;
            var b = rect.getBoundingClientRect();
            $el.style.display = '';
            var w = $el.offsetWidth;
            var h = $el.offsetHeight;
            var l = b.left + b.width / 2 - w / 2;
            var p = b.bottom + 8;
            var svgLeft = svg.getBoundingClientRect().left;
            var svgRight = svg.getBoundingClientRect().right;
            if (l < svgLeft) l = svgLeft;
            if (l + w > svgRight) l = svgRight - w;
            $el.style.left = l + 'px';
            $el.style.top = p + 'px';
          }
          $watch('activeDay', pos);
          window.addEventListener('scroll', pos, { passive: true });
          window.addEventListener('resize', pos, { passive: true });
        `}
        class="z-50 rounded-md border bg-card text-card-foreground shadow-lg"
        style="display: none;"
        x-html="activeDay !== null ? cards[activeDay] : ''"
      />
    </div>
  );
};
