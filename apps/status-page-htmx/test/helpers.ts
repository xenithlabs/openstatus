/**
 * Shared test utilities for status-page-htmx tests.
 */

import type { app as AppType } from "../src/index";

// Re-export the app for use in integration tests
// The app is exported from src/index.tsx
let _app: typeof AppType | null = null;

export async function getApp(): Promise<typeof AppType> {
  if (!_app) {
    const mod = await import("../src/index");
    _app = mod.app;
  }
  return _app!;
}

/**
 * Fetch a route from the app and return the response.
 * Uses Hono's `app.request()` method for in-process testing.
 */
export async function requestApp(
  path: string,
  options?: RequestInit & { host?: string },
): Promise<Response> {
  const app = await getApp();
  const headers = new Headers(options?.headers);
  if (options?.host) {
    headers.set("host", options.host);
  }
  return app.request(path, {
    ...options,
    headers,
  });
}

/**
 * Extract semantic data from an HTML response for comparison testing.
 */
export interface PageSemantics {
  title: string | null;
  status: "success" | "degraded" | "error" | "info" | "unknown";
  componentNames: string[];
  incidentTitles: string[];
  subscribeFormExists: boolean;
  barChartExists: boolean;
}

export function extractSemantics(html: string): PageSemantics {
  // Title: extract from <title> tag
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : null;

  // Status: check for status indicator text
  let status: PageSemantics["status"] = "unknown";
  if (html.includes("fully operational")) status = "success";
  else if (html.includes("degraded performance")) status = "degraded";
  else if (html.includes("experiencing an outage")) status = "error";
  else if (html.includes("Maintenance in progress")) status = "info";

  // Components: look for known component names
  const knownComponents = ["API", "Dashboard", "CDN", "Auth", "Webhook"];
  const componentNames = knownComponents.filter((name) => html.includes(name));

  // Incident titles
  const incidentTitles: string[] = [];
  const incidentPatterns = [
    "Elevated API latency",
    "Database upgrade",
  ];
  for (const pattern of incidentPatterns) {
    if (html.includes(pattern)) incidentTitles.push(pattern);
  }

  const subscribeFormExists = html.includes("Subscribe to updates");
  const barChartExists = html.includes("<svg");

  return {
    title,
    status,
    componentNames,
    incidentTitles,
    subscribeFormExists,
    barChartExists,
  };
}
