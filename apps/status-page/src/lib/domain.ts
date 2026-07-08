import type { NextRequest } from "next/server";

// Custom-domain lookups exact-match page.customDomain. Standard production
// domains are stored without a port, so strip it. Localhost-family hosts include
// the port in the stored customDomain (e.g. "localhost:3003"), so preserve it.
export const stripHostPort = (host?: string | null) => {
  if (!host) return null;
  // Preserve port for localhost-family hosts — the stored customDomain includes it.
  if (/(^|\.)localhost(:\d+)?$/i.test(host)) return host;
  return host.replace(/:\d+$/, "");
};

export const getValidSubdomain = (host?: string | null) => {
  let subdomain: string | null = null;
  if (!host && typeof window !== "undefined") {
    // On client side, get the host from window
    host = window.location.host;
  }

  // Exclude localhost and IP addresses from being treated as subdomains
  if (
    host?.match(/^(localhost|127\\.0\\.0\\.1|::1|\\d+\\.\\d+\\.\\d+\\.\\d+)/)
  ) {
    return null;
  }

  // Handle subdomains of localhost (e.g., hello.localhost:3000)
  if (host?.match(/^([^.]+)\.localhost(:\d+)?$/)) {
    const match = host.match(/^([^.]+)\.localhost(:\d+)?$/);
    return match?.[1] || null;
  }

  // we should improve here for custom vercel deploy page
  if (host?.includes(".") && !host.includes(".vercel.app")) {
    const candidate = host.split(".")[0];
    if (candidate && !candidate.includes("www")) {
      // Valid candidate
      subdomain = candidate;
    }
  }

  // Custom domain explicitly configured for self-hosted deployments
  const customDomain = process.env.STATUS_PAGE_CUSTOM_DOMAIN;
  if (host && customDomain && host === customDomain) {
    subdomain = host;
  }

  // In case the host is a custom domain
  if (
    host &&
    !(
      host?.includes("stpg.dev") ||
      host?.includes("openstatus.dev") ||
      host?.endsWith(".vercel.app")
    )
  ) {
    subdomain = host;
  }
  return subdomain;
};

export const getValidCustomDomain = (req: NextRequest | Request) => {
  const url = "nextUrl" in req ? req.nextUrl.clone() : new URL(req.url);
  const headers = req.headers;
  const host = headers.get("x-forwarded-host");

  let prefix = "";
  let type: "hostname" | "pathname";

  const hostnames = host?.split(/[.:]/) ?? url.host.split(/[.:]/);
  const pathnames = url.pathname.split("/");

  const subdomain = getValidSubdomain(url.host);
  console.log({
    hostnames,
    pathnames,
    host,
    urlHost: url.host,
    subdomain,
  });

  if (
    hostnames.length > 2 &&
    hostnames[0] !== "www" &&
    !url.host.endsWith(".vercel.app")
  ) {
    prefix = hostnames[0].toLowerCase();
    type = "hostname";
  } else {
    prefix = pathnames[1].toLowerCase();
    type = "pathname";
  }

  if (subdomain !== null) {
    prefix = subdomain.toLowerCase();
  }

  console.log({ type, prefix });

  return { type, prefix };
};

/**
 * Returns true only when the request is hitting a SaaS subdomain
 * ({slug}.stpg.dev or {slug}.openstatus.dev) AND we are not in self-hosted mode.
 * In self-hosted mode, always returns false — there is no SaaS subdomain infrastructure.
 */
export const isSaasSubdomain = (
  host: string | null,
  slug: string,
): boolean => {
  if (process.env.SELF_HOST === "true") return false;
  if (!host) return false;
  return host === `${slug}.stpg.dev` || host === `${slug}.openstatus.dev`;
};
