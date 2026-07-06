import {
  type DNSPayloadSchema,
  type httpPayloadSchema,
  type tpcPayloadSchema,
  transformHeaders,
} from "./payloads";
import type { Region } from "@openstatus/regions";
import type { z } from "zod";

import type { MonitorStatus } from "./constants";

/** True when GCP_PROJECT_ID, GCP_CLIENT_EMAIL, and GCP_PRIVATE_KEY are all non-empty. */
export function hasGCPConfig(env: {
  GCP_PROJECT_ID: string;
  GCP_CLIENT_EMAIL: string;
  GCP_PRIVATE_KEY: string;
}): boolean {
  return !!(
    env.GCP_PROJECT_ID &&
    env.GCP_CLIENT_EMAIL &&
    env.GCP_PRIVATE_KEY
  );
}

/** The workflows service URL for direct HTTP calls in self-hosted mode. */
export function getWorkflowsUrl(env: { OPENSTATUS_WORKFLOWS_URL: string }): string {
  return env.OPENSTATUS_WORKFLOWS_URL || "http://localhost:3000";
}

/** True when the SELF_HOST env var is set, or GCP Cloud Tasks credentials are absent. */
export function isSelfHost(): boolean {
  if (process.env.SELF_HOST === "true") return true;
  // Fallback: treat missing GCP creds as self-host
  return !hasGCPConfig({
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID ?? "",
    GCP_CLIENT_EMAIL: process.env.GCP_CLIENT_EMAIL ?? "",
    GCP_PRIVATE_KEY: process.env.GCP_PRIVATE_KEY ?? "",
  });
}

/** The checker service URL for direct HTTP dispatch in self-hosted mode. */
export function getCheckerUrl(env: { CHECKER_URL?: string }): string {
  return env.CHECKER_URL || "http://localhost:8080";
}

/** The checker region for self-hosted mode. Returns the input region in cloud mode. */
export function getCheckerRegion(region: string): string {
  if (!isSelfHost()) return region;
  return process.env.CHECKER_REGION || "ams";
}

export interface BuildCheckerPayloadInput {
  row: {
    id: number;
    workspaceId: number | null;
    url: string;
    method: string | null;
    body: string | null;
    headers: { key: string; value: string }[] | null;
    jobType: "http" | "tcp" | "dns" | "icmp" | "udp" | "ssl";
    assertions: string | null;
    degradedAfter: number | null;
    timeout: number;
    otelEndpoint: string | null;
    otelHeaders: { key: string; value: string }[] | null;
    retry: number | null;
    followRedirects: boolean | null;
    updatesStatus: boolean | null;
  };
  timestamp: number;
  status: MonitorStatus;
  region: Region;
}

export type CheckerPayload =
  | z.infer<typeof httpPayloadSchema>
  | z.infer<typeof tpcPayloadSchema>
  | z.infer<typeof DNSPayloadSchema>;

/**
 * Builds a checker payload from a monitor row and dispatch context.
 * Shared by both the Cloud Tasks path and the direct HTTP path.
 */
export function buildCheckerPayload(
  input: BuildCheckerPayloadInput,
): CheckerPayload {
  const { row, timestamp, status } = input;

  if (row.jobType === "http") {
    return {
      workspaceId: String(row.workspaceId ?? ""),
      monitorId: String(row.id),
      url: row.url,
      method: (row.method || "GET") as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
      cronTimestamp: timestamp,
      body: row.body ?? undefined,
      headers: row.headers ?? undefined,
      status,
      assertions: row.assertions ? JSON.parse(row.assertions) : null,
      degradedAfter: row.degradedAfter,
      timeout: row.timeout,
      trigger: "cron",
      otelConfig: row.otelEndpoint
        ? {
            endpoint: row.otelEndpoint,
            headers: transformHeaders(row.otelHeaders ?? []),
          }
        : undefined,
      retry: row.retry || 3,
      followRedirects:
        row.followRedirects === null ? true : row.followRedirects,
      updatesStatus: row.updatesStatus ?? true,
    };
  }

  if (row.jobType === "tcp") {
    return {
      workspaceId: String(row.workspaceId ?? ""),
      monitorId: String(row.id),
      uri: row.url,
      status,
      assertions: row.assertions ? JSON.parse(row.assertions) : null,
      cronTimestamp: timestamp,
      degradedAfter: row.degradedAfter,
      timeout: row.timeout,
      trigger: "cron",
      retry: row.retry || 3,
      updatesStatus: row.updatesStatus ?? true,
      otelConfig: row.otelEndpoint
        ? {
            endpoint: row.otelEndpoint,
            headers: transformHeaders(row.otelHeaders ?? []),
          }
        : undefined,
    };
  }

  // dns
  if (row.jobType === "dns") {
    return {
      workspaceId: String(row.workspaceId ?? ""),
      monitorId: String(row.id),
      uri: row.url,
      cronTimestamp: timestamp,
      status,
      assertions: row.assertions ? JSON.parse(row.assertions) : null,
      degradedAfter: row.degradedAfter,
      timeout: row.timeout,
      trigger: "cron",
      otelConfig: row.otelEndpoint
        ? {
            endpoint: row.otelEndpoint,
            headers: transformHeaders(row.otelHeaders ?? []),
          }
        : undefined,
      retry: row.retry || 3,
      updatesStatus: row.updatesStatus ?? true,
    };
  }

  throw new Error(`Unsupported jobType: ${row.jobType}`);
}
