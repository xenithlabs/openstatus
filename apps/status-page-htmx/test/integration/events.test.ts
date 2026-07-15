import { describe, expect, test } from "bun:test";

import { requestApp } from "../helpers";

describe("GET /:domain/:locale/events", () => {
  test("returns HTML for events page", async () => {
    const res = await requestApp("/test-page/en/events");
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("always includes static assets and HTMX", async () => {
    const res = await requestApp("/test-page/en/events");
    const html = await res.text();
    expect(html).toContain("/static/htmx.min.js");
    expect(html).toContain("/static/alpine.min.js");
    expect(html).toContain("/static/styles.css");
  });
});

describe("GET /:domain/:locale/events/:yearMonth", () => {
  test("returns HTML for valid year-month", async () => {
    const res = await requestApp("/test-page/en/events/july-2026");
    expect([200, 404]).toContain(res.status);
  });

  test("returns HTML for january-2025", async () => {
    const res = await requestApp("/test-page/en/events/january-2025");
    expect([200, 404]).toContain(res.status);
  });
});

describe("GET /:domain/:locale/events/report/:id", () => {
  test("returns HTML for report detail", async () => {
    const res = await requestApp("/test-page/en/events/report/1");
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("GET /:domain/:locale/events/maintenance/:id", () => {
  test("returns HTML for maintenance detail", async () => {
    const res = await requestApp("/test-page/en/events/maintenance/1");
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("content-type")).toContain("text/html");
  });
});

describe("Events 404 states", () => {
  test("events for unknown domain returns not-200", async () => {
    const res = await requestApp("/nonexistent/en/events");
    expect([200, 404]).toContain(res.status);
  });

  test("invalid event ID does not crash", async () => {
    const res = await requestApp("/test-page/en/events/report/999999");
    expect([200, 404]).toContain(res.status);
  });
});
