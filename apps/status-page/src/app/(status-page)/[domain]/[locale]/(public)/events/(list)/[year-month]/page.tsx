"use client";

import { useQuery } from "@tanstack/react-query";
import { useExtracted } from "next-intl";
import { useParams } from "next/navigation";
import { useMemo } from "react";

import { ButtonBack } from "@/components/button/button-back";
import { StatusBlankEvents } from "@/components/status-page/status-blank";
import { EventsMonthSection } from "@/components/status-page/events-month-section";
import { useTRPC } from "@/lib/trpc/client";

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

function parseYearMonth(raw: string): { year: number; month: number } | null {
  // Expected format: "july-2026"
  const match = raw.match(/^([a-z]+)-(\d{4})$/i);
  if (!match) return null;
  const monthName = match[1].toLowerCase();
  const year = Number(match[2]);
  if (Number.isNaN(year)) return null;
  const month = MONTH_NAME_TO_INDEX[monthName];
  if (month === undefined) return null;
  return { year, month };
}

type MergedItem =
  | { kind: "report"; item: Record<string, unknown>; date: Date }
  | { kind: "maintenance"; item: Record<string, unknown>; date: Date };

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

export default function YearMonthPage() {
  const t = useExtracted();
  const { domain, "year-month": yearMonth } = useParams<{
    domain: string;
    "year-month": string;
  }>();
  const trpc = useTRPC();
  const { data: page } = useQuery(
    trpc.statusPage.get.queryOptions({ slug: domain }),
  );

  const parsed = parseYearMonth(yearMonth);

  const items = useMemo(() => {
    if (!page || !parsed) return [] as MergedItem[];
    const { year, month } = parsed;

    const reports: MergedItem[] = page.statusReports
      .map((r) => {
        const report = r as Record<string, unknown>;
        const date = getReportDate(report);
        return { kind: "report" as const, item: report, date };
      })
      .filter(
        (m) => m.date.getFullYear() === year && m.date.getMonth() === month,
      );

    const maintenances: MergedItem[] = page.maintenances
      .map((m) => {
        const maintenance = m as Record<string, unknown>;
        const date = new Date(maintenance.from as string);
        return { kind: "maintenance" as const, item: maintenance, date };
      })
      .filter(
        (m) => m.date.getFullYear() === year && m.date.getMonth() === month,
      );

    return [...reports, ...maintenances].sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  }, [page, parsed]);

  if (!page) return null;

  if (!parsed) {
    return (
      <StatusBlankEvents
        title={t("Invalid month")}
        description={t("The month you are looking for does not exist.")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-full flex-row items-center justify-between gap-2 py-0.5">
        <ButtonBack href="../" />
      </div>
      {items.length > 0 ? (
        <EventsMonthSection
          year={parsed.year}
          month={parsed.month}
          items={items}
          maxPreview={Infinity}
        />
      ) : (
        <StatusBlankEvents
          title={t("No incidents")}
          description={t("There are no incidents for this month.")}
        />
      )}
    </div>
  );
}
