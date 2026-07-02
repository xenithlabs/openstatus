import type { Action, ComposeInput } from "./types";

type Input = Pick<
  ComposeInput,
  "route" | "host" | "pathname" | "search" | "requestUrl" | "origin"
>;

/**
 * Fallback rewrite: target is the route's internal `rewritePath`. Fires when
 * either:
 *   - the request is on an openstatus.dev host (preserved from original —
 *     unclear if this no-op rewrite is load-bearing when rewritePath ===
 *     pathname; kept as-is), OR
 *   - the resolved rewritePath differs from the incoming pathname.
 */
export function resolveDefaultRewrite({
  route,
  host,
  pathname,
  search,
  requestUrl,
  origin,
}: Input): Action | null {
  const isOpenstatusDevHost = !!host?.includes("openstatus.dev");
  const pathDiffers = route.rewritePath !== pathname;

  console.log("[proxy] resolveDefaultRewrite", {
    rewritePath: route.rewritePath,
    pathname,
    pathDiffers,
    requestUrl,
    origin,
    isSelfHosted: process.env.SELF_HOST === "true",
  });

  // Self-hosted mode: always rewrite when the resolved path differs from the URL.
  // There is no openstatus.dev host to gate on, so we rely solely on pathDiffers.
  if (process.env.SELF_HOST === "true" && pathDiffers) {
    // Use origin (req.nextUrl.origin) instead of requestUrl (req.url) so the
    // rewrite stays same-origin. requestUrl can carry a different port in
    // Docker standalone mode, which forces NextResponse.rewrite into an
    // external proxy that fails inside the container.
    const url = new URL(route.rewritePath, origin);
    url.search = search;
    return {
      type: "rewrite",
      url,
      reason: "default-rewrite-self-host",
    };
  }

  if (!isOpenstatusDevHost && !pathDiffers) return null;

  const url = new URL(route.rewritePath, requestUrl);
  url.search = search;
  return {
    type: "rewrite",
    url,
    reason: "default-rewrite",
  };
}
