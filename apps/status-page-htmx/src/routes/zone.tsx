import { Hono } from "hono";

import { Header } from "../components/header";
import { Layout } from "../components/layout";
import type { Variables } from "../types";
import { badgeHandler } from "./badge";
import {
  eventsListHandler,
  eventsMonthHandler,
  maintenanceDetailHandler,
  reportDetailHandler,
} from "./events";
import { feedHandler } from "./feed";
import { homePageHandler } from "./status-page";
import {
  subscribePageHandler,
  subscribePostHandler,
} from "./subscribe";

/**
 * Locale sub-app mounted at /:domain/:locale/*
 *
 * - Validates locale (only "en" for v1)
 * - Exposes `slug` and `prefix` to downstream routes via context
 * - Mounts status page routes for each feature
 */
const zone = new Hono<{ Variables: Variables & { prefix: string } }>();

// ── Locale validation middleware ─────────────────────────────────────────────

zone.use("*", async (c, next) => {
  const locale = c.req.param("locale");

  // Only "en" is supported for v1
  if (locale !== "en") {
    return c.notFound();
  }

  // Build prefix for link generation (e.g. "/test-page/en")
  const domain = c.req.param("domain");
  c.set("prefix", `/${domain}/${locale}`);

  await next();
});

// ── Routes ──────────────────────────────────────────────────────────────────

// GET / — Home page
zone.get("/", (c) => homePageHandler(c));

// GET /events — Incident history (year tabs → month preview)
zone.get("/events", (c) => eventsListHandler(c));

// GET /events/:yearMonth — Month detail (all incidents for a month)
zone.get("/events/:yearMonth{[a-z]+-\\d{4}}", (c) => eventsMonthHandler(c));

// GET /events/report/:id — Status report detail
zone.get("/events/report/:id", (c) => reportDetailHandler(c));

// GET /events/maintenance/:id — Maintenance detail
zone.get("/events/maintenance/:id", (c) => maintenanceDetailHandler(c));

// GET /subscribe — Subscribe form
zone.get("/subscribe", (c) => subscribePageHandler(c));

// POST /subscribe — Subscribe action
zone.post("/subscribe", (c) => subscribePostHandler(c));

// GET /badge — Status badge SVG
zone.get("/badge", (c) => badgeHandler(c));

// GET /feed — RSS feed
zone.get("/feed", (c) => feedHandler(c));

export { zone };
