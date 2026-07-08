"use client";

import { useEffect, useMemo } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@openstatus/ui/components/ui/tabs";

import { StatusBlankEvents } from "@/components/status-page/status-blank";
import { EventsMonthSection } from "@/components/status-page/events-month-section";

type MergedItem =
  | { kind: "report"; item: Record<string, unknown>; date: Date }
  | { kind: "maintenance"; item: Record<string, unknown>; date: Date };

interface EventsYearListProps {
  statusReports: unknown[];
  maintenances: unknown[];
  year: string;
  onYearChange: (year: string) => void;
}

function getReportDate(report: Record<string, unknown>): Date {
  const updates = (
    (report.statusReportUpdates as Array<Record<string, unknown>>) ?? []
  )
    .slice()
    .sort(
      (a, b) =>
        new Date(b.date as string).getTime() -
        new Date(a.date as string).getTime(),
    );
  const firstUpdate = updates[updates.length - 1];
  return firstUpdate
    ? new Date(firstUpdate.date as string)
    : report.createdAt
      ? new Date(report.createdAt as string)
      : new Date();
}

/**
 * Groups items by month (0-11) within each year, descending.
 */
function groupByMonth(
  items: MergedItem[],
): Map<number, MergedItem[]> {
  const map = new Map<number, MergedItem[]>();
  for (const item of items) {
    const m = item.date.getMonth();
    const bucket = map.get(m);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(m, [item]);
    }
  }
  // Sort each month's items newest-first
  for (const [, bucket] of map) {
    bucket.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
  return map;
}

export function EventsYearList({
  statusReports,
  maintenances,
  year,
  onYearChange,
}: EventsYearListProps) {
  const { years, byYear, defaultYear } = useMemo(() => {
    const merged: MergedItem[] = [
      ...statusReports.map((r) => ({
        kind: "report" as const,
        item: r as Record<string, unknown>,
        date: getReportDate(r as Record<string, unknown>),
      })),
      ...maintenances.map((m) => ({
        kind: "maintenance" as const,
        item: m as Record<string, unknown>,
        date: new Date((m as Record<string, unknown>).from as string),
      })),
    ];

    const map = new Map<number, MergedItem[]>();
    for (const m of merged) {
      const y = m.date.getFullYear();
      const bucket = map.get(y);
      if (bucket) {
        bucket.push(m);
      } else {
        map.set(y, [m]);
      }
    }

    const sortedYears = Array.from(map.keys()).sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    const defYear = sortedYears.includes(currentYear)
      ? String(currentYear)
      : String(sortedYears[0] ?? currentYear);

    return { years: sortedYears, byYear: map, defaultYear: defYear };
  }, [statusReports, maintenances]);

  // Sync URL param to a valid year on first render
  const yearKeys = useMemo(() => years.map(String), [years]);
  const activeYear = yearKeys.includes(year) ? year : defaultYear;
  useEffect(() => {
    if (activeYear !== year) {
      onYearChange(activeYear);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Tabs value={activeYear} onValueChange={onYearChange} className="gap-4">
      <TabsList>
        {years.map((y) => (
          <TabsTrigger key={y} value={String(y)}>
            {y}
          </TabsTrigger>
        ))}
      </TabsList>
      {years.map((y) => {
        const items = byYear.get(y) ?? [];
        if (items.length === 0) {
          return (
            <TabsContent key={y} value={String(y)}>
              <StatusBlankEvents />
            </TabsContent>
          );
        }
        const months = groupByMonth(items);
        const sortedMonths = Array.from(months.keys()).sort((a, b) => b - a);
        return (
          <TabsContent key={y} value={String(y)}>
            <div className="flex flex-col gap-6">
              {sortedMonths.map((month) => (
                <EventsMonthSection
                  key={`${y}-${month}`}
                  year={y}
                  month={month}
                  items={months.get(month) ?? []}
                  maxPreview={3}
                />
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
