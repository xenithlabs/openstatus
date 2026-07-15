import type { FC } from "hono/jsx";

import type { StatusBarData } from "./bar-chart";
import { BarChart } from "./bar-chart";
import { ComponentRow } from "./component-row";
import { ChevronDown, StatusDot } from "./icons";

export interface TrackerComponent {
  id: number;
  name: string;
  description?: string | null;
  status: "success" | "degraded" | "error" | "info";
}

export interface GroupTracker {
  type: "group";
  groupId: number;
  groupName: string;
  status: "success" | "degraded" | "error" | "info" | "empty";
  components: TrackerComponent[];
  defaultOpen: boolean;
}

export interface SingleTracker {
  type: "component";
  component: TrackerComponent;
}

export type Tracker = GroupTracker | SingleTracker;

export interface ComponentUptime {
  pageComponentId: number;
  data?: StatusBarData[];
  uptime?: string | null;
}

export interface GroupUptime {
  groupId: string;
  data?: StatusBarData[];
  uptime?: string | null;
}

export interface SystemStatusProps {
  trackers: Tracker[];
  componentUptime: ComponentUptime[];
  groupUptime: GroupUptime[];
  isLoading: boolean;
  showUptime: boolean;
}

/**
 * "System status" card with component list and expandable groups.
 * Groups use Alpine.js `x-data` for client-side expand/collapse.
 */
export const SystemStatus: FC<SystemStatusProps> = ({
  trackers,
  componentUptime,
  groupUptime,
  isLoading,
  showUptime,
}) => {
  if (trackers.length === 0) return null;

  return (
    <div class="rounded-lg p-px shadow-sm dark:shadow-none">
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <div class="flex md:items-center justify-between md:flex-row flex-col md:gap-2 gap-4 items-start">
            <div class="flex items-center space-x-4">
              <h2 class="text-foreground">System status</h2>
            </div>
          </div>
        </div>
        <div class="divide-y divide-solid text-sm divide-border/50">
          {trackers.map((tracker) => {
            if (tracker.type === "group") {
              return (
                <SystemStatusGroup
                  key={`group-${tracker.groupId}`}
                  tracker={tracker}
                  componentUptime={componentUptime}
                  groupUptime={groupUptime.find(
                    (g) => g.groupId === tracker.groupId.toString(),
                  )}
                  isLoading={isLoading}
                  showUptime={showUptime}
                />
              );
            }

            const comp = tracker.component;
            const uptime = componentUptime.find(
              (u) => u.pageComponentId === comp.id,
            );

            return (
              <div
                key={`component-${comp.id}`}
                class="p-4 md:pt-3 md:pb-3"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <StatusDot status={comp.status} />
                    <span class="text-sm">{comp.name}</span>
                    {comp.description ? (
                      <span class="text-xs text-muted-foreground hidden sm:inline">
                        {comp.description}
                      </span>
                    ) : null}
                  </div>
                  <div>
                    {showUptime ? (
                      isLoading ? (
                        <div class="h-3 w-12 animate-pulse rounded bg-muted" />
                      ) : (
                        <span class="text-muted-foreground font-mono text-xs">
                          {uptime?.uptime != null
                            ? `${uptime.uptime}%`
                            : null}
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
                <div class="hidden md:flex mt-1">
                  {isLoading ? null : uptime?.data && uptime.data.length > 0 ? (
                    <BarChart data={uptime.data} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * A collapsible group row with Alpine.js toggle.
 */
const SystemStatusGroup: FC<{
  tracker: GroupTracker;
  componentUptime: ComponentUptime[];
  groupUptime?: GroupUptime;
  isLoading: boolean;
  showUptime: boolean;
}> = ({ tracker, componentUptime, groupUptime, isLoading, showUptime }) => {
  const groupId = `group-${tracker.groupId}`;
  const componentCount = tracker.components.length;

  return (
    <div
      class="p-4 md:pt-3 md:pb-3"
      x-data={`{ open: ${tracker.defaultOpen ? "true" : "false"} }`}
    >
      {/* Group header row */}
      <div class="h-7 flex flex-grow items-center">
        <div class="flex items-center">
          <StatusDot status={tracker.status === "empty" ? "success" : tracker.status} />
        </div>

        {/* Desktop header */}
        <div class="hidden md:flex space-x-2 flex-grow items-center ml-2">
          <h3 class="font-medium">{tracker.groupName}</h3>
          <span
            class="flex items-center cursor-pointer group transition text-muted-foreground hover:text-foreground"
            x-on:click={`open = !open`}
          >
            <span class="hidden md:inline">
              {componentCount} {componentCount === 1 ? "component" : "components"}
            </span>
            <span class="flex items-center justify-center w-3 h-6 ml-1">
              <ChevronDown open={false} />
            </span>
          </span>

          <div class="flex-grow" />

          {showUptime ? (
            <div class="ml-2 font-normal flex flex-row items-center gap-1 text-muted-foreground">
              {isLoading ? (
                <span class="whitespace-nowrap text-xs">--% uptime</span>
              ) : groupUptime?.uptime != null ? (
                <span class="whitespace-nowrap text-xs">
                  {groupUptime.uptime}% uptime
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Mobile header */}
        <div class="flex md:hidden items-center ml-2 flex-grow">
          <h3 class="font-medium">{tracker.groupName}</h3>
          <span
            class="flex items-center cursor-pointer group transition text-muted-foreground hover:text-foreground ml-auto"
            x-on:click={`open = !open`}
          >
            <span class="flex items-center justify-center w-3 h-6 ml-1">
              <ChevronDown open={false} />
            </span>
          </span>
        </div>
      </div>

      {/* Bar chart for the group */}
      <div class="hidden md:flex mt-1">
        {isLoading ? null : groupUptime?.data && groupUptime.data.length > 0 ? (
          <BarChart data={groupUptime.data} />
        ) : null}
      </div>

      {/* Expandable sub-components */}
      <div
        x-show="open"
        x-collapse
        class="mt-2 pl-6 border-l border-border/50 space-y-1"
        style="display: none"
      >
        {tracker.components.map((component) => {
          const uptime = componentUptime.find(
            (u) => u.pageComponentId === component.id,
          );
          return (
            <ComponentRow
              key={`sub-${component.id}`}
              name={component.name}
              description={component.description}
              status={component.status}
              uptime={uptime?.uptime}
              isLoading={isLoading}
              showUptime={showUptime}
              compact
            />
          );
        })}
      </div>
    </div>
  );
};
