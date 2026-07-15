import type { Context } from "hono";

/**
 * Compute the URL prefix for links.
 * When accessed via custom domain (no :domain param), use clean relative
 * URLs (empty prefix). When accessed via path, include /:domain/:locale.
 */
export function getPrefix(c: Context): string {
  const domain = c.req.param("domain");
  if (!domain) return ""; // custom domain — clean URLs
  const locale = c.req.param("locale") ?? "en";
  return `/${domain}/${locale}`;
}
