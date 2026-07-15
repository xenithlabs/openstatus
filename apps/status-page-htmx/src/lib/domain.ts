import type { Context, Next } from "hono";
import type { Variables } from "../types";
import { env } from "../env";

/**
 * Strip port from host, preserving localhost-family ports since the stored
 * customDomain includes them (e.g. "localhost:3003").
 */
function stripHostPort(host?: string | null): string | null {
  if (!host) return null;
  if (/(^|\.)localhost(:\d+)?$/i.test(host)) return host;
  return host.replace(/:\d+$/, "");
}

/**
 * Extract the page slug from a hostname.
 *
 * Returns null for localhost and IP addresses.
 * For SaaS subdomains (*.stpg.dev, *.openstatus.dev): returns the subdomain part.
 * For custom domains (everything else): returns the FULL host.
 */
function getValidSubdomain(host?: string | null): string | null {
  if (!host) return null;

  // Exclude localhost and IP addresses from being treated as subdomains
  if (host.match(/^(localhost|127\.0\.0\.1|::1|\d+\.\d+\.\d+\.\d+)/)) {
    return null;
  }

  // Handle subdomains of localhost (e.g., hello.localhost:3000)
  const localMatch = host.match(/^([^.]+)\.localhost(:\d+)?$/);
  if (localMatch) return localMatch[1] ?? null;

  // Custom domain explicitly configured for self-hosted deployments
  const customDomain = process.env.STATUS_PAGE_CUSTOM_DOMAIN;
  if (host && customDomain && host === customDomain) return host;

  // SaaS subdomains: extract the first segment (slug) from *.stpg.dev or *.openstatus.dev
  const isSaas =
    host.includes("stpg.dev") ||
    host.includes("openstatus.dev");
  if (isSaas) {
    const candidate = host.split(".")[0];
    if (candidate && !candidate.includes("www")) return candidate;
    return null;
  }

  // Vercel preview deployments — don't treat as custom domain
  if (host.endsWith(".vercel.app")) return null;

  // Everything else is a custom domain — return the full host for
  // matching against page.customDomain in the database.
  return host;
}

/**
 * Returns true when the request hits a SaaS subdomain
 * ({slug}.stpg.dev or {slug}.openstatus.dev) AND we are not in self-hosted mode.
 */
function isSaasSubdomain(host: string | null, slug: string): boolean {
  if (process.env.SELF_HOST === "true") return false;
  if (!host) return false;
  return host === `${slug}.stpg.dev` || host === `${slug}.openstatus.dev`;
}

/**
 * Hono middleware that resolves the page slug from:
 * 1. Subdomain: {slug}.stpg.dev, {slug}.openstatus.dev, {slug}.localhost
 * 2. Custom domain: exact match against page.customDomain
 * 3. Self-hosted: STATUS_PAGE_CUSTOM_DOMAIN env var
 * 4. Fallback: the `domain` path parameter
 *
 * Sets `c.get("slug")` for downstream handlers.
 */
export async function domainMiddleware(
  c: Context<{ Variables: Variables }>,
  next: Next,
) {
  // Explicit PAGE_SLUG env var overrides all host-based extraction
  if (env.PAGE_SLUG) {
    c.set("slug", env.PAGE_SLUG);
    await next();
    return;
  }

  const host = stripHostPort(
    c.req.header("x-forwarded-host") ?? c.req.header("host"),
  );

  let slug: string | null = null;

  // Try subdomain extraction first
  const subdomain = getValidSubdomain(host);
  if (subdomain) {
    slug = subdomain;
  }

  // Fall back to path param for localhost / IP / explicit paths
  if (!slug) {
    slug = c.req.param("domain") ?? null;
  }

  if (slug) {
    c.set("slug", slug);

    // SaaS subdomain check (for potential SaaS-specific behavior)
    const saas = isSaasSubdomain(host, slug);
    c.set("isSaasSubdomain", saas);
  }

  await next();
}

// Re-export for unit testing
export { getValidSubdomain, stripHostPort };
