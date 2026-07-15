import { describe, expect, test } from "bun:test";

import {
  capitalize,
  formatDate,
  formatRelativeTime,
  groupByYearMonth,
  MONTH_NAMES,
  parseYearMonthSlug,
  toYearMonthSlug,
} from "../../src/lib/date";

describe("formatDate", () => {
  test("formats date in current year without year", () => {
    const now = new Date();
    const thisYear = new Date(now.getFullYear(), 6, 15); // July 15
    const result = formatDate(thisYear);
    expect(result).toBe("Jul 15");
    expect(result).not.toContain(String(now.getFullYear()));
  });

  test("formats date in past year with year", () => {
    const past = new Date(2023, 0, 5); // Jan 5, 2023
    expect(formatDate(past)).toBe("Jan 5, 2023");
  });

  test("accepts string date", () => {
    const result = formatDate("2024-03-20T12:00:00Z");
    expect(result).toContain("Mar 20");
  });
});

describe("formatRelativeTime", () => {
  test("returns relative time string", () => {
    const result = formatRelativeTime(new Date());
    expect(result).toContain("less than a minute ago");
  });

  test("returns '... ago' for past dates", () => {
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const result = formatRelativeTime(past);
    expect(result).toContain("ago");
    expect(result).toContain("hour");
  });
});

describe("toYearMonthSlug", () => {
  test("formats year-month slug correctly", () => {
    expect(toYearMonthSlug(2026, 6)).toBe("july-2026"); // July
    expect(toYearMonthSlug(2025, 0)).toBe("january-2025");
    expect(toYearMonthSlug(2024, 11)).toBe("december-2024");
  });
});

describe("parseYearMonthSlug", () => {
  test("parses valid slug", () => {
    expect(parseYearMonthSlug("july-2026")).toEqual({ year: 2026, month: 6 });
    expect(parseYearMonthSlug("january-2025")).toEqual({ year: 2025, month: 0 });
    expect(parseYearMonthSlug("december-2024")).toEqual({ year: 2024, month: 11 });
  });

  test("case insensitive", () => {
    expect(parseYearMonthSlug("JULY-2026")).toEqual({ year: 2026, month: 6 });
    expect(parseYearMonthSlug("July-2026")).toEqual({ year: 2026, month: 6 });
  });

  test("returns null for invalid format", () => {
    expect(parseYearMonthSlug("not-a-slug")).toBeNull();
    expect(parseYearMonthSlug("july")).toBeNull();
    expect(parseYearMonthSlug("13-2026")).toBeNull();
    expect(parseYearMonthSlug("")).toBeNull();
  });

  test("returns null for invalid month name", () => {
    expect(parseYearMonthSlug("febtober-2026")).toBeNull();
    expect(parseYearMonthSlug("xyz-2026")).toBeNull();
  });

  test("returns null for invalid year", () => {
    expect(parseYearMonthSlug("july-abc")).toBeNull();
    expect(parseYearMonthSlug("july-")).toBeNull();
  });
});

describe("MONTH_NAMES", () => {
  test("maps indices to lowercase month names", () => {
    expect(MONTH_NAMES[0]).toBe("january");
    expect(MONTH_NAMES[6]).toBe("july");
    expect(MONTH_NAMES[11]).toBe("december");
  });
});

describe("capitalize", () => {
  test("capitalizes first letter", () => {
    expect(capitalize("january")).toBe("January");
    expect(capitalize("hello")).toBe("Hello");
  });

  test("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  test("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});

describe("groupByYearMonth", () => {
  test("groups items by year and month", () => {
    const items = [
      { name: "a", date: new Date(2026, 6, 15) },
      { name: "b", date: new Date(2026, 6, 20) },
      { name: "c", date: new Date(2026, 5, 10) },
      { name: "d", date: new Date(2025, 0, 1) },
    ];

    const groups = groupByYearMonth(items, (item) => item.date);

    expect(groups.size).toBe(2); // 2 years
    expect(groups.get("2026")?.size).toBe(2); // June and July
    expect(groups.get("2026")?.get(6)?.length).toBe(2); // 2 items in July
    expect(groups.get("2026")?.get(5)?.length).toBe(1); // 1 item in June
    expect(groups.get("2025")?.get(0)?.length).toBe(1); // 1 item in January
  });

  test("returns empty map for empty input", () => {
    const groups = groupByYearMonth([], (item) => new Date());
    expect(groups.size).toBe(0);
  });
});
