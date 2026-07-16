import type { FC } from "hono/jsx";

export const statusColors: Record<string, string> = {
  success: "#24c19a",
  degraded: "#fbbf24",
  error: "#f87171",
  info: "#3c82f6",
  empty: "#6b7280",
};

export const StatusDot: FC<{
  status: "success" | "degraded" | "error" | "info";
  className?: string;
}> = ({ status, className }) => {
  const size = className ?? "h-2.5 w-2.5";
  return (
    <div
      class={`${size} shrink-0 rounded-full`}
      style={`background-color: ${statusColors[status]}`}
    />
  );
};

export const ChevronDown: FC<{
  open?: boolean;
  className?: string;
}> = ({ open, className }) => {
  return (
    <svg
      class={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""} ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
};

export const ArrowRight: FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      class={`w-4 h-4 ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
};
