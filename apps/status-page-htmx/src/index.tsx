import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { edgeRouter } from "@openstatus/api/src/edge";
import { createInnerTRPCContext } from "@openstatus/api/src/trpc";

import { Layout } from "./components/layout";
import { env } from "./env";
import { CacheTTL, cacheHeader } from "./lib/cache";
import { domainMiddleware } from "./lib/domain";
import { logger } from "./lib/logger";
import { homePageHandler } from "./routes/status-page";
import { badgeHandler } from "./routes/badge";
import {
  eventsListHandler,
  eventsMonthHandler,
  maintenanceDetailHandler,
  reportDetailHandler,
} from "./routes/events";
import { feedHandler, jsonFeedHandler, atomFeedHandler } from "./routes/feed";
import { monitorsHandler, monitorDetailHandler } from "./routes/monitors";
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

// ── Cache-Control middleware ────────────────────────────────────────────────

app.use("/badge/*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", cacheHeader(CacheTTL.BADGE));
});
app.use("/feed/*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", cacheHeader(CacheTTL.FEED));
});

// ── Static assets ───────────────────────────────────────────────────────────

app.use("/static/*", serveStatic({ root: "./" }));

// ── tRPC API endpoint (self-hosted) ───────────────────────────────────────

// When TRPC_URL is "self", serve the tRPC edge router in-process so the
// status page fetches its own data without depending on an external API.
if (env.TRPC_URL === "self") {
  app.all("/api/trpc/edge/*", async (c) => {
    const res = await fetchRequestHandler({
      endpoint: "/api/trpc/edge",
      req: c.req.raw,
      router: edgeRouter,
      createContext: () =>
        createInnerTRPCContext({
          session: null,
          workspace: null,
          user: null,
        }),
    });
    return res;
  });
  logger.info("server", "tRPC router mounted in-process at /api/trpc/edge");
}

// ── Health check ────────────────────────────────────────────────────────────

app.get("/ping", (c) => {
  return c.json({ ping: "pong", service: "status-page-htmx" });
});

// ── llms.txt ──────────────────────────────────────────────────────────────

app.get("/llms.txt", (c) => {
  const slug = c.get("slug") ?? "status";
  return c.text(
    `# ${slug} Status Page\n\n` +
    `This is the status page for ${slug}.\n` +
    `Visit the home page for current system status, incident history, and monitor uptime.\n`,
    200,
    { "Content-Type": "text/plain; charset=utf-8" },
  );
});

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
  { method: "GET",  subPath: "/monitors/:id",               handler: monitorDetailHandler },
  { method: "GET",  subPath: "/badge",                      handler: badgeHandler },
  { method: "GET",  subPath: "/feed",                       handler: feedHandler },
  { method: "GET",  subPath: "/feed/json",                  handler: jsonFeedHandler },
  { method: "GET",  subPath: "/feed/atom",                  handler: atomFeedHandler },
];

// ── Path-based routes: /:domain/:locale/... ─────────────────────────────────

for (const route of routes) {
  const fullPath = `/:domain/:locale${route.subPath === "/" ? "" : route.subPath}`;
  if (route.method === "GET") {
    app.get(fullPath, async (c) => route.handler(c));
  } else {
    app.post(fullPath, async (c) => route.handler(c));
  }
}

// ── Custom-domain routes: serve directly at /... (no domain/locale in path) ─

// When accessed via custom domain (e.g. https://status.openstat.us/),
// the slug comes from the host header (or PAGE_SLUG). Serve the page
// directly without redirecting — the browser URL stays clean.
for (const route of routes) {
  const path = route.subPath === "/" ? "/" : route.subPath;
  if (route.method === "GET") {
    app.get(path, async (c) => {
      if (c.req.param("domain")) return route.handler(c);
      return route.handler(c);
    });
  } else {
    app.post(path, async (c) => {
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
