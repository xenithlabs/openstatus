import type { AppRouter } from "@openstatus/api";
import { createTRPCClient, httpLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import { env } from "@/env";
import { logger } from "./logger";

/** fetch with a configurable timeout via AbortController. */
function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    // tRPC's built-in logger link — only enabled when LOG_LEVEL=debug
    loggerLink({
      enabled: () => env.LOG_LEVEL === "debug",
      logger: (opts) => {
        const direction = opts.direction === "up" ? "→" : "←";
        if (opts.direction === "up") {
          logger.debug(
            "trpc",
            `${direction} ${opts.path}`,
            { input: opts.input as Record<string, unknown> },
          );
        } else {
          const duration = opts.result.context?.durationMs;
          const status = opts.result instanceof Error ? "✗" : "✓";
          logger.debug(
            "trpc",
            `${direction} ${opts.path} ${status}`,
            duration != null
              ? { durationMs: duration }
              : undefined,
          );
          if (opts.result instanceof Error) {
            logger.error("trpc", opts.path, opts.result);
          }
        }
      },
    }),
    httpLink({
      url: `${env.TRPC_URL}/edge`,
      transformer: superjson,
      headers: {
        "x-trpc-source": "server",
      },
      fetch: fetchWithTimeout as typeof fetch,
    }),
  ],
});
