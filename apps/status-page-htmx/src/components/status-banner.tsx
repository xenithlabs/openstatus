import type { FC } from "hono/jsx";

import { StatusDot } from "./icons";

export interface StatusBannerProps {
  status: "success" | "degraded" | "error" | "info";
  activeIncidentName?: string | null;
}

function statusText(status: StatusBannerProps["status"]): {
  heading: string;
  description: string;
} {
  switch (status) {
    case "success":
      return {
        heading: "We're fully operational",
        description: "We're not aware of any issues affecting our systems.",
      };
    case "degraded":
      return {
        heading: "We're experiencing degraded performance",
        description: "",
      };
    case "error":
      return {
        heading: "We're experiencing an outage",
        description: "",
      };
    case "info":
      return {
        heading: "Maintenance in progress",
        description: "",
      };
  }
}

export const StatusBanner: FC<StatusBannerProps> = ({
  status,
  activeIncidentName,
}) => {
  const { heading, description } = statusText(status);
  const borderColor: Record<string, string> = {
    success: "bg-success/20",
    degraded: "bg-warning/20",
    error: "bg-destructive/20",
    info: "bg-info/20",
  };

  const showDescription =
    description || (activeIncidentName && status !== "success");

  return (
    <div class={`rounded-lg p-px shadow-sm dark:shadow-none ${borderColor[status]}`}>
      <div class="relative rounded-[7px] bg-card">
        <div class="rounded-t-[7px] text-base font-medium px-4 py-3.5">
          <div class="flex items-center text-foreground py-0.5 gap-2">
            <StatusDot
              status={status === "info" ? "info" : status === "error" ? "error" : status === "degraded" ? "degraded" : "success"}
              className="h-4 w-4"
            />
            {heading}
          </div>
        </div>
        {showDescription ? (
          <div class="text-foreground">
            <div class="text-sm px-4 pb-4 text-muted-foreground">
              {activeIncidentName && status !== "success"
                ? activeIncidentName
                : description}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
