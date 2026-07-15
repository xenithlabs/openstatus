import type { Context } from "hono";

import { trpc } from "../lib/trpc";

const statusBadge: Record<string, { label: string; color: string }> = {
  success: { label: "Operational", color: "#22c55e" },
  degraded: { label: "Degraded", color: "#eab308" },
  error: { label: "Outage", color: "#ef4444" },
  info: { label: "Maintenance", color: "#3b82f6" },
};

/**
 * GET /:domain/:locale/badge — Status badge SVG
 *
 * Returns an inline SVG badge showing the current status.
 * Query params: ?theme=dark|light (default: light)
 */
export async function badgeHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const theme = c.req.query("theme") ?? "light";

  // Fetch page to get current status
  let status: string = "unknown";
  let label = "Unknown";
  let color = "#6b7280";

  try {
    const page = await trpc.statusPage.get.query({ slug });
    if (page) {
      status = page.status;
      const info = statusBadge[status] ?? statusBadge.error;
      label = info.label;
      color = info.color;
    }
  } catch {
    // Fall through to unknown badge
  }

  const bgColor = theme === "dark" ? "#111827" : "#ffffff";
  const textColor = theme === "dark" ? "#d1d5db" : "#374151";
  const borderColor = theme === "dark" ? "#374151" : "#e5e7eb";
  const padding = 12;
  const fontSize = 12;
  const dotSize = 8;
  const height = 28;
  const textWidth = label.length * 7 + 4;
  const width = padding * 2 + textWidth + dotSize + 8;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="6" fill="${bgColor}" stroke="${borderColor}" stroke-width="1"/>
  <text x="${padding}" y="${height / 2}" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" fill="${textColor}" dominant-baseline="central">${label}</text>
  <circle cx="${padding + textWidth + dotSize}" cy="${height / 2}" r="${dotSize / 2}" fill="${color}"/>
</svg>`;

  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=60",
  });
}
