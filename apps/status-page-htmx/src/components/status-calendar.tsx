import type { FC } from "hono/jsx";

import { statusColors } from "./icons";

// ── Types ───────────────────────────────────────────────────────────────────

export interface CalendarMarker {
  date: Date;
  status: "success" | "degraded" | "error" | "info";
  name: string;
  href?: string;
}

export interface StatusCalendarProps {
  markers: CalendarMarker[];
  year: number;
  month: number; // 0-indexed (0 = January)
  prefix: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function prevMonth(year: number, month: number): { year: number; month: number } {
  if (month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 11) return { year: year + 1, month: 0 };
  return { year, month: month + 1 };
}

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Month calendar grid with color-coded event markers.
 *
 * Server-rendered for the specified month. Navigation uses prev/next
 * query-param links — no Alpine.js needed.
 */
export const StatusCalendar: FC<StatusCalendarProps> = ({
  markers,
  year,
  month,
  prefix,
}) => {
  // Build lookup: "YYYY-MM-DD" → markers[]
  const markerMap = new Map<string, CalendarMarker[]>();
  for (const m of markers) {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const bucket = markerMap.get(key);
    if (bucket) bucket.push(m);
    else markerMap.set(key, [m]);
  }

  const days = daysInMonth(year, month);
  const startDay = firstDayOfWeek(year, month);
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  // Build grid cells: null for padding, { day, dateKey } for actual days
  const cells: Array<{ day: number; dateKey: string } | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= days; d++) {
    cells.push({
      day: d,
      dateKey: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    });
  }

  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        {/* Header: month + nav */}
        <div class="flex items-center justify-between px-4 py-3.5">
          <h2 class="text-foreground text-base font-medium">
            {MONTH_NAMES[month]} {year}
          </h2>
          <div class="flex items-center gap-1">
            <a
              href={`${prefix}?calendar_month=${prev.year}-${String(prev.month + 1).padStart(2, "0")}`}
              class="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Previous month"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </a>
            <a
              href={`${prefix}?calendar_month=${next.year}-${String(next.month + 1).padStart(2, "0")}`}
              class="flex items-center justify-center w-7 h-7 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Next month"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          </div>
        </div>

        {/* Day-of-week header */}
        <div class="grid grid-cols-7 border-t border-border/50">
          {DAY_NAMES.map((name) => (
            <div class="text-center text-xs text-muted-foreground py-2 font-medium">
              {name}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div class="grid grid-cols-7 border-t border-border/50">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} class="aspect-square" />;
            }

            const dayMarkers = markerMap.get(cell.dateKey) ?? [];
            const hasEvents = dayMarkers.length > 0;
            const today = new Date();
            const isToday =
              today.getFullYear() === year &&
              today.getMonth() === month &&
              today.getDate() === cell.day;

            // Find a marker with href for linking
            const linkMarker = dayMarkers.find((m) => m.href);

            const cellContent = (
              <div class="flex flex-col items-center justify-center h-full gap-0.5">
                <span
                  class={`text-xs ${isToday ? "bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center" : ""}`}
                >
                  {cell.day}
                </span>
                {hasEvents ? (
                  <div class="flex gap-0.5">
                    {/* Show up to 3 colored dots */}
                    {dayMarkers.slice(0, 3).map((m, j) => (
                      <span
                        key={j}
                        class="w-1.5 h-1.5 rounded-full shrink-0"
                        style={`background-color: ${statusColors[m.status]}`}
                      />
                    ))}
                    {dayMarkers.length > 3 ? (
                      <span class="text-[8px] text-muted-foreground leading-none">
                        +{dayMarkers.length - 3}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

            if (linkMarker && linkMarker.href) {
              return (
                <a
                  key={cell.dateKey}
                  href={linkMarker.href}
                  class={`aspect-square flex items-center justify-center hover:bg-muted/50 transition-colors rounded ${isToday ? "bg-muted/30" : ""}`}
                  title={dayMarkers.map((m) => m.name).join(", ")}
                >
                  {cellContent}
                </a>
              );
            }

            return (
              <div
                key={cell.dateKey}
                class={`aspect-square flex items-center justify-center ${isToday ? "bg-muted/30 rounded" : ""}`}
                title={dayMarkers.map((m) => m.name).join(", ")}
              >
                {cellContent}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
