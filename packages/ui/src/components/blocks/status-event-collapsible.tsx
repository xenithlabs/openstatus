"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@openstatus/ui/components/ui/collapsible";
import {
  StatusEvent,
  StatusEventAffected,
  StatusEventAffectedBadge,
  StatusEventAside,
  StatusEventContent,
  StatusEventDate,
  StatusEventTitle,
} from "@openstatus/ui/components/blocks/status-events";
import { cn } from "@openstatus/ui/lib/utils";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * StatusEventCollapsible — foldable incident entry for incident-history lists.
 *
 * Wraps a StatusEvent so the timeline details are collapsed by default.
 * The summary line shows the date, title, and affected-component badges.
 * Clicking anywhere on the row toggles the full details.
 */
export function StatusEventCollapsible({
  date,
  title,
  children,
  defaultOpen = false,
  onOpenChange,
  affected = [],
  className,
}: {
  date: Date;
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  affected?: string[];
  className?: string;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      className={cn("w-full", className)}
    >
      <StatusEvent>
        <StatusEventAside>
          <StatusEventDate date={date} />
        </StatusEventAside>
        <CollapsibleTrigger asChild>
          <StatusEventContent className="flex flex-row items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <StatusEventTitle className="min-w-0 truncate">
                  {title}
                </StatusEventTitle>
              </div>
              {affected.length > 0 ? (
                <StatusEventAffected>
                  {affected.map((name) => (
                    <StatusEventAffectedBadge key={name}>
                      {name}
                    </StatusEventAffectedBadge>
                  ))}
                </StatusEventAffected>
              ) : null}
            </div>
            <ChevronDown className="text-muted-foreground mt-0.5 size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </StatusEventContent>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="pt-2">{children}</div>
        </CollapsibleContent>
      </StatusEvent>
    </Collapsible>
  );
}
