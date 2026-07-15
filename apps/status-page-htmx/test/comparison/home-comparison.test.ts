/**
 * Head-to-head comparison tests for the Next.js status-page vs HTMX status-page.
 *
 * These tests require BOTH apps running:
 *   - Next.js status-page on http://localhost:3003
 *   - HTMX status-page on http://localhost:3004
 *
 * Run with: NEXTJS_BASE=http://localhost:3003 HTMX_BASE=http://localhost:3004 bun test
 *
 * The Docker compose comparison profile handles this automatically.
 */

import { describe, expect, test } from "bun:test";

const NEXTJS_BASE = process.env.NEXTJS_BASE ?? "http://localhost:3003";
const HTMX_BASE = process.env.HTMX_BASE ?? "http://localhost:3004";
const SLUG = process.env.TEST_SLUG ?? "test-page";

async function fetchHtml(url: string) {
  const res = await fetch(url);
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    html: await res.text(),
  };
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title>(.*?)<\/title>/);
  return match ? match[1] : null;
}

describe.skip("Head-to-head: Home page", () => {
  test("same HTTP status code", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en`);
    expect(htmx.status).toBe(nextjs.status);
  });

  test("both return text/html", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en`);
    expect(nextjs.contentType).toContain("text/html");
    expect(htmx.contentType).toContain("text/html");
  });

  test("both have page titles", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en`);
    expect(extractTitle(nextjs.html)).toBeTruthy();
    expect(extractTitle(htmx.html)).toBeTruthy();
  });
});

describe.skip("Head-to-head: Events page", () => {
  test("same HTTP status for events list", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en/events`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en/events`);
    expect(htmx.status).toBe(nextjs.status);
  });

  test("same HTTP status for report detail", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en/events/report/1`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en/events/report/1`);
    expect(htmx.status).toBe(nextjs.status);
  });
});

describe.skip("Head-to-head: Badge", () => {
  test("both return SVG badge", async () => {
    const nextjs = await fetchHtml(`${NEXTJS_BASE}/${SLUG}/en/badge`);
    const htmx = await fetchHtml(`${HTMX_BASE}/${SLUG}/en/badge`);
    expect(nextjs.status).toBe(200);
    expect(htmx.status).toBe(200);
    expect(nextjs.html).toContain("<svg");
    expect(htmx.html).toContain("<svg");
  });
});
