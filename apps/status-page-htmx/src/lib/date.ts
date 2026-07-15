import { format, formatDistanceToNow, isSameYear } from "date-fns";

/**
 * Format a date for display. Examples:
 *   - "Jul 15, 2026"
 *   - "Jul 15" (current year)
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  if (isSameYear(d, now)) {
    return format(d, "MMM d");
  }
  return format(d, "MMM d, yyyy");
}

/**
 * Relative time string. Examples:
 *   - "2 hours ago"
 *   - "3 days ago"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format year-month for URL slugs. Example: "july-2026"
 */
export function toYearMonthSlug(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return `${format(date, "MMMM").toLowerCase()}-${year}`;
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

/** Index-to-name mapping for month display. */
export const MONTH_NAMES: Record<number, string> = {
  0: "january",
  1: "february",
  2: "march",
  3: "april",
  4: "may",
  5: "june",
  6: "july",
  7: "august",
  8: "september",
  9: "october",
  10: "november",
  11: "december",
};

/** Capitalize the first character of a string. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Parse a year-month slug like "july-2026" into { year, month } or null.
 */
export function parseYearMonthSlug(
  raw: string,
): { year: number; month: number } | null {
  const match = raw.match(/^([a-z]+)-(\d{4})$/i);
  if (!match) return null;
  const monthName = match[1].toLowerCase();
  const year = Number(match[2]);
  if (Number.isNaN(year)) return null;
  const month = MONTH_NAME_TO_INDEX[monthName];
  if (month === undefined) return null;
  return { year, month };
}

/**
 * Group a list of items by year and month.
 */
export function groupByYearMonth<T>(
  items: T[],
  getDate: (item: T) => Date,
): Map<string, Map<number, T[]>> {
  const byYear = new Map<string, Map<number, T[]>>();

  for (const item of items) {
    const date = getDate(item);
    const year = date.getFullYear().toString();
    const month = date.getMonth();

    if (!byYear.has(year)) {
      byYear.set(year, new Map());
    }
    const yearMap = byYear.get(year)!;
    if (!yearMap.has(month)) {
      yearMap.set(month, []);
    }
    yearMap.get(month)!.push(item);
  }

  return byYear;
}
