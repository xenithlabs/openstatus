import { Hono } from "hono";
import { serveStatic } from "hono/bun";

import { Layout } from "./components/layout";
import { env } from "./env";
import { domainMiddleware, getValidSubdomain, stripHostPort } from "./lib/domain";
import { logger } from "./lib/logger";
import { homePageHandler } from "./routes/status-page";
import { badgeHandler } from "./routes/badge";
import {
  eventsListHandler,
  eventsMonthHandler,
  maintenanceDetailHandler,
  reportDetailHandler,
} from "./routes/events";
import { feedHandler } from "./routes/feed";
import { monitorsHandler } from "./routes/monitors";
import {
  subscribePageHandler,
  subscribePostHandler,
} from "./routes/subscribe";
import type { App } from "./types";

const app: App = new Hono({ strict: false });

// ── Request logging middleware ──────────────────────────────────────────────

app.use("*", async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  logger.debug("http", `→ ${method} ${path}`);

  await next();

  const duration = Date.now() - start;
  logger.request(method, path, c.res.status, duration);
});

// ── Domain resolution middleware (all routes) ───────────────────────────────

app.use("*", domainMiddleware);

// ── Static assets ───────────────────────────────────────────────────────────

app.use("/static/*", serveStatic({ root: "./" }));

// ── Health check ────────────────────────────────────────────────────────────

app.get("/ping", (c) => {
  return c.json({ ping: "pong", service: "status-page-htmx" });
});

// ── Locale-aware context helper ────────────────────────────────────────────

/**
 * Sets up locale-aware context for a route handler.
 * When the URL has `/:domain/:locale`, uses those params.
 * When accessed via custom domain (root path or no locale), defaults to the
 * resolved slug + "en" locale — no browser redirect needed.
 */
function withContext(
  c: import("hono").Context,
): { slug: string; locale: string; prefix: string } | { error: Response } {
  const domain = c.req.param("domain");
  const locale = c.req.param("locale");

  // Priority 1: PAGE_SLUG env var (overrides everything)
  const slug = c.get("slug");

  if (!slug) {
    return {
      error: c.html(
        <Layout page={{ title: "OpenStatus" }}>
          <div class="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <h1 class="text-2xl font-bold">Status Page</h1>
            <p class="text-muted-foreground max-w-md">
              Visit a specific status page URL or configure a custom domain.
            </p>
          </div>
        </Layout>,
      ),
    };
  }

  // Locale: from URL param, or default "en"
  const resolvedLocale = (locale && locale === "en") ? "en" : "en";

  // If an explicit locale was provided and it's not "en", reject it
  if (locale && locale !== "en") {
    return {
      error: c.notFound(),
    };
  }

  // Build prefix for links. For custom-domain access (no domain in path),
  // link prefix is empty so URLs stay relative to the current domain.
  const prefix = domain ? `/${domain}/${resolvedLocale}` : `/${slug}/${resolvedLocale}`;

  return { slug, locale: resolvedLocale, prefix };
}

// ── Route mapping table ────────────────────────────────────────────────────

type Handler = (c: import("hono").Context) => Promise<Response>;

const routes: Array<{
  method: "GET" | "POST";
  subPath: string;
  handler: Handler;
}> = [
  { method: "GET",  subPath: "/",                           handler: homePageHandler },
  { method: "GET",  subPath: "/events",                     handler: eventsListHandler },
  { method: "GET",  subPath: "/events/:yearMonth",          handler: eventsMonthHandler },
  { method: "GET",  subPath: "/events/report/:id",          handler: reportDetailHandler },
  { method: "GET",  subPath: "/events/maintenance/:id",     handler: maintenanceDetailHandler },
  { method: "GET",  subPath: "/subscribe",                  handler: subscribePageHandler },
  { method: "POST", subPath: "/subscribe",                  handler: subscribePostHandler },
  { method: "GET",  subPath: "/monitors",                   handler: monitorsHandler },
  { method: "GET",  subPath: "/badge",                      handler: badgeHandler },
  { method: "GET",  subPath: "/feed",                       handler: feedHandler },
];

// ── Path-based routes: /:domain/:locale/... ─────────────────────────────────

for (const route of routes) {
  const fullPath = `/:domain/:locale${route.subPath === "/" ? "" : route.subPath}`;
  if (route.method === "GET") {
    app.get(fullPath, (c) => route.handler(c));
  } else {
    app.post(fullPath, (c) => route.handler(c));
  }
}

// ── Custom-domain routes: serve directly at /... (no domain/locale in path) ─

// When accessed via custom domain (e.g. https://status.openstat.us/),
// the slug comes from the host header (or PAGE_SLUG). Serve the page
// directly without redirecting — the browser URL stays clean.
for (const route of routes) {
  const path = route.subPath === "/" ? "/" : route.subPath;
  if (route.method === "GET") {
    app.get(path, (c) => {
      if (c.req.param("domain")) return route.handler(c); // handled by path route above
      return route.handler(c);
    });
  } else {
    app.post(path, (c) => {
      if (c.req.param("domain")) return route.handler(c);
      return route.handler(c);
    });
  }
}

// ── 404 ─────────────────────────────────────────────────────────────────────

app.notFound((c) => {
  logger.debug("http", `404 not found: ${c.req.method} ${c.req.path}`);
  return c.html(
    <Layout page={{ title: "404 — Page Not Found" }}>
      <div class="mx-auto flex w-full max-w-[718px] flex-col items-center justify-center gap-4 px-4 py-24">
        <h1 class="text-4xl font-bold">404</h1>
        <p class="text-muted-foreground">This page could not be found.</p>
        <a href="/" class="text-primary underline">Go home</a>
      </div>
    </Layout>,
    404,
  );
});

// ── 500 ─────────────────────────────────────────────────────────────────────

app.onError((err, c) => {
  logger.error("server", "Unhandled error", err);
  return c.html(
    <Layout page={{ title: "500 — Server Error" }}>
      <div class="mx-auto flex w-full max-w-[718px] flex-col items-center justify-center gap-4 px-4 py-24">
        <h1 class="text-4xl font-bold">500</h1>
        <p class="text-muted-foreground">Something went wrong. Please try again later.</p>
      </div>
    </Layout>,
    500,
  );
});

// ── Start ───────────────────────────────────────────────────────────────────

logger.info("server", `Starting`, {
  port: env.PORT,
  logLevel: env.LOG_LEVEL,
  trpcUrl: env.TRPC_URL,
  nodeEnv: env.NODE_ENV,
  pageSlug: env.PAGE_SLUG ?? "(from host header)",
});

if (env.LOG_LEVEL === "debug") {
  logger.debug("server", "Debug logging enabled — all requests will be logged");
  logger.debug("server", "Routes mounted (dual: path-based + custom-domain)", {
    routes: routes.map((r) => `${r.method} ${r.subPath}`),
  });
}

const server = {
  port: env.PORT,
  fetch: app.fetch,
};

export default server;
export { app };
