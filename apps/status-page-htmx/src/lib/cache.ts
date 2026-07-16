/**
 * Build Cache-Control headers for a given TTL in seconds.
 *
 * Usage:
 *   c.header("Cache-Control", cacheHeader(60))  // 1 minute
 *   c.header("Cache-Control", cacheHeader(300)) // 5 minutes
 *
 * Returns the full header value string so callers can pass it directly
 * to Hono's `c.header()` or spread into a headers record.
 */
export function cacheHeader(ttlSeconds: number): string {
  return `public, max-age=${ttlSeconds}`;
}

/**
 * Convenience: returns a headers record for use with Hono's `c.body()` or
 * `new Response()`.
 *
 *   return c.body(svg, 200, cacheHeaders(60));
 */
export function cacheHeaders(ttlSeconds: number): Record<string, string> {
  return {
    "Cache-Control": cacheHeader(ttlSeconds),
  };
}

/** Pre-built TTLs for common use cases. */
export const CacheTTL = {
  /** 1 minute — badge SVG is cheap but should stay fresh */
  BADGE: 60,
  /** 5 minutes — RSS/Atom feeds */
  FEED: 300,
  /** 1 hour — static pages that rarely change */
  STATIC: 3600,
} as const;
