import { db, sql } from "@openstatus/db";
import { page, selectPageSchema } from "@openstatus/db/src/schema";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resolveClientIp } from "@/lib/http/client-ip";

import { createProtectedCookieKey } from "./lib/protected";
import { applyPageLocaleOverride } from "./lib/proxy/apply-page-locale-override";
import { composePageAction } from "./lib/proxy/compose-page-action";
import { detectMarkdown } from "./lib/proxy/detect-markdown";
import { sanitizeRedirectParam } from "./lib/proxy/sanitize-redirect-param";
import { resolveRoute } from "./lib/resolve-route";

const isSelfHosted = process.env.SELF_HOST === "true";

export default auth(async (req) => {
  const url = req.nextUrl.clone();
  const passthroughResponse = NextResponse.next();
  // HTML and markdown share the same URL (negotiated by Accept) — tell shared
  // caches to key on it so a markdown variant is never served to a browser.
  passthroughResponse.headers.set("Vary", "Accept");
  const host = req.headers.get("x-forwarded-host");

  // In Docker standalone mode, Next.js may construct req.nextUrl with a wrong
  // port (picked up from NEXT_PUBLIC_URL / NEXTAUTH_URL env vars). Derive the
  // real origin from the x-forwarded-host header which carries the actual
  // external host:port the browser used.
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const origin = host ? `${proto}://${host}` : req.nextUrl.origin;

  // Strip a `.md` suffix before route resolution so path-based markdown
  // (`/foo/en/monitors/123.md`) parses slug/locale correctly.
  const { wantsMarkdown, source, pathname } = detectMarkdown({
    pathname: url.pathname,
    accept: req.headers.get("accept"),
  });

  const initialRoute = resolveRoute({
    host,
    urlHost: url.host,
    pathname,
  });

  if (!initialRoute) {
    console.log("[proxy] no route resolved — passthrough", { host, pathname });
    return passthroughResponse;
  }

  // Markdown requests bypass the proxy's DB lookup and gate chain: the route is
  // reachable directly via `/api` anyway, so it re-validates every gate itself.
  // Short-circuiting before the gates avoids 307-redirecting a gated `.md` to
  // /login (it would never reach the route).
  if (wantsMarkdown) {
    const rewriteUrl = url.clone();
    rewriteUrl.pathname = `/api/markdown${initialRoute.rewritePath}`;
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-md-source", source ?? "header");
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  const query = await db
    .select()
    .from(page)
    .where(
      sql`lower(${page.slug}) = ${initialRoute.prefix} OR lower(${page.customDomain}) = ${initialRoute.prefix}`,
    )
    .get();

  const validation = selectPageSchema.safeParse(query);

  if (!validation.success) {
    console.log("[proxy] page not found in DB — passthrough", {
      prefix: initialRoute.prefix,
      pathname,
      queryResult: query ? "row exists, schema mismatch" : "no rows",
    });
    return passthroughResponse;
  }

  const _page = validation.data;
  const route = applyPageLocaleOverride(initialRoute, _page);

  const clientIp = resolveClientIp(req.headers);

  console.log("[proxy] request", {
    host,
    pathname: url.pathname,
    slug: _page.slug,
    customDomain: _page.customDomain || null,
    accessType: _page.accessType,
    route,
    authEmailPresent: !!req.auth?.user?.email,
    clientIp: clientIp ?? null,
    isSelfHosted,
  });

  console.log("[proxy] url-resolution", {
    "req.url": req.url,
    "req.nextUrl.origin": req.nextUrl.origin,
    "req.nextUrl.host": req.nextUrl.host,
    "req.nextUrl.port": req.nextUrl.port,
    "url.host": url.host,
    "url.pathname": url.pathname,
    origin,
  });

  const action = composePageAction({
    route,
    page: _page,
    host,
    urlHost: url.host,
    pathname: url.pathname,
    search: url.search,
    isSelfHosted,
    requestUrl: req.url,
    origin,
    cookiePassword: req.cookies.get(createProtectedCookieKey(_page.slug))
      ?.value,
    queryPassword: url.searchParams.get("pw"),
    redirectParam: sanitizeRedirectParam(url.searchParams.get("redirect")),
    authEmail: req.auth?.user?.email,
    clientIp,
  });

  console.log("[proxy] action", {
    type: action.type,
    reason: action.reason,
    url: action.url?.toString() ?? null,
  });

  switch (action.type) {
    case "redirect":
      return NextResponse.redirect(action.url);
    case "rewrite": {
      // HTML served via internal rewrite shares its URL with the markdown
      // variant — carry the same Vary so caches don't cross them.
      // Self-hosted: rewrite must target the container's internal port
      // (process.env.PORT or 3000) so Next.js treats it as same-origin.
      // Any other origin triggers an external HTTP proxy which fails when
      // the port is host-mapped (e.g. Docker :3003→:3000).
      const rewriteTarget = isSelfHosted
        ? (() => {
            const u = req.nextUrl.clone();
            u.pathname = action.url.pathname;
            u.port = process.env.PORT || "3000";
            u.host = `localhost:${u.port}`;
            return u;
          })()
        : action.url;
      const rewriteResponse = NextResponse.rewrite(rewriteTarget);
      rewriteResponse.headers.set("Vary", "Accept");
      return rewriteResponse;
    }
    case "passthrough":
      return passthroughResponse;
  }
});

export const config = {
  matcher: [
    "/((?!api|assets|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
