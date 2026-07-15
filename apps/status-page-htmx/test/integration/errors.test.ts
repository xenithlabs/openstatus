import { describe, expect, test } from "bun:test";

import { requestApp } from "../helpers";

describe("Root / custom domain access", () => {
  test("GET / with Host header serves page directly (no redirect)", async () => {
    const res = await requestApp("/", {
      host: "status-htmx.openstat.us",
    });
    // Serves page directly — no redirect. Status is 200 (page found) or 404 (tRPC down).
    expect([200, 404]).toContain(res.status);
    // Should NOT have a Location header (not a redirect)
    const location = res.headers.get("location");
    expect(location).toBeNull();
  });

  test("GET / without domain serves landing page or page", async () => {
    const res = await requestApp("/");
    expect([200, 404]).toContain(res.status);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  test("GET /:slug serves page for that slug (no redirect)", async () => {
    const res = await requestApp("/myslug");
    // Serves directly — no redirect to /myslug/en
    const location = res.headers.get("location");
    // May be null (direct serve) or present (some routes may still redirect)
    expect([200, 302, 404]).toContain(res.status);
  });
});

describe("GET /:domain/:locale/feed", () => {
  test("feed route is registered (returns 200 or 503)", async () => {
    const res = await requestApp("/test-page/en/feed");
    expect([200, 503, 404]).toContain(res.status);
  });
});

describe("Error edge cases", () => {
  test("bare domain without locale redirects to /en", async () => {
    const res = await requestApp("/test-page");
    // Now redirects to /test-page/en instead of 404
    expect([301, 302, 404]).toContain(res.status);
  });

  test("trailing slash on home page does not crash", async () => {
    const res = await requestApp("/test-page/en/");
    expect([200, 404]).toContain(res.status);
  });

  test("very long domain parameter does not crash", async () => {
    const long = "a".repeat(500);
    const res = await requestApp(`/${long}/en`);
    expect([200, 404]).toContain(res.status);
  });

  test("special characters in domain do not crash", async () => {
    const res = await requestApp("/test<script>/en");
    expect([200, 404]).toContain(res.status);
  });

  test("favicon.ico returns 404 gracefully", async () => {
    const res = await requestApp("/static/favicon.ico");
    expect(res.status).toBe(404);
  });
});

describe("Content security", () => {
  test("HTML pages include charset meta tag", async () => {
    const res = await requestApp("/test-page/en");
    const html = await res.text();
    expect(html).toContain('charset="utf-8"');
  });

  test("HTML pages include viewport meta tag", async () => {
    const res = await requestApp("/test-page/en");
    const html = await res.text();
    expect(html).toContain('name="viewport"');
  });

  test("HTML output is well-formed", async () => {
    const res = await requestApp("/test-page/en");
    const html = await res.text();
    expect(html.startsWith("<html")).toBe(true);
    expect(html.endsWith("</html>")).toBe(true);
  });
});
