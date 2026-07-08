"use client";

import { useMemo } from "react";

import { Link } from "@/components/common/link";
import { StatusEventCollapsible } from "@openstatus/ui/components/blocks/status-event-collapsible";
import {
  StatusEventTimelineMaintenance,
  StatusEventTimelineReport,
} from "@/components/status-page/status-events";
import { updatesWithImpactChanges } from "@/lib/report-impacts";
import { usePathnamePrefix } from "@/hooks/use-pathname-prefix";

const MONTH_NAMES: Record<number, string> = {
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

type MergedItem =
  | { kind: "report"; item: Record<string, unknown>; date: Date }
  | { kind: "maintenance"; item: Record<string, unknown>; date: Date };

interface EventsMonthSectionProps {
  year: number;
  month: number;
  items: MergedItem[];
  maxPreview?: number;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function EventsMonthSection({
  year,
  month,
  items,
  maxPreview = 3,
}: EventsMonthSectionProps) {
  const prefix = usePathnamePrefix();
  const monthSlug = `${MONTH_NAMES[month]}-${year}`;

  const visible = useMemo(() => items.slice(0, maxPreview), [items, maxPreview]);
  const eventsHref = `${prefix ? `/${prefix}` : ""}/events/${monthSlug}`;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-foreground text-lg font-semibold">
        {capitalize(MONTH_NAMES[month])} {year}
      </h3>
      <div className="flex flex-col gap-4">
        {visible.map((mergedItem) =>
          mergedItem.kind === "report"
            ? renderReport(mergedItem.item, mergedItem.date)
            : renderMaintenance(mergedItem.item, mergedItem.date),
        )}
      </div>
      {items.length > maxPreview ? (
        <Link
          href={eventsHref}
          variant="unstyled"
          className="text-muted-foreground hover:text-foreground self-start text-sm transition-colors"
        >
          View all {items.length} incidents in {capitalize(MONTH_NAMES[month])} {year} →
        </Link>
      ) : null}
    </div>
  );

  function renderReport(report: Record<string, unknown>, date: Date) {
    const r = report;
    const affectedComponents = r.statusReportsToPageComponents as
      | Array<{ pageComponent: { id: number; name: string } }>
      | undefined;

    return (
      <StatusEventCollapsible
        key={`report-${r.id as number}`}
        date={date}
        title={r.title as string}
        affected={
          affectedComponents?.map((a) => a.pageComponent.name) ?? []
        }
      >
        <StatusEventTimelineReport
          updates={
            updatesWithImpactChanges(
              r as unknown as Parameters<typeof updatesWithImpactChanges>[0],
            ) as unknown as React.ComponentProps<
              typeof StatusEventTimelineReport
            >["updates"]
          }
        />
      </StatusEventCollapsible>
    );
  }

  function renderMaintenance(
    maintenance: Record<string, unknown>,
    date: Date,
  ) {
    const m = maintenance;
    const affectedComponents = m.maintenancesToPageComponents as
      | Array<{ pageComponent: { id: number; name: string } }>
      | undefined;

    return (
      <StatusEventCollapsible
        key={`maintenance-${m.id as number}`}
        date={date}
        title={m.title as string}
        affected={
          affectedComponents?.map((a) => a.pageComponent.name) ?? []
        }
      >
        <StatusEventTimelineMaintenance
          maintenance={
            m as unknown as {
              title: string;
              message: string;
              from: Date;
              to: Date;
            }
          }
        />
      </StatusEventCollapsible>
    );
  }
}
