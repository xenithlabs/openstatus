import { describe, expect, test } from "bun:test";

import { getValidSubdomain, stripHostPort } from "../../src/lib/domain";

describe("stripHostPort", () => {
  test("removes port from standard hostname", () => {
    expect(stripHostPort("example.com:3000")).toBe("example.com");
  });

  test("keeps hostname without port unchanged", () => {
    expect(stripHostPort("example.com")).toBe("example.com");
  });

  test("preserves localhost port (stored customDomain includes port)", () => {
    expect(stripHostPort("localhost:3003")).toBe("localhost:3003");
    expect(stripHostPort("myslug.localhost:3000")).toBe("myslug.localhost:3000");
  });

  test("returns null for null/undefined input", () => {
    expect(stripHostPort(null)).toBeNull();
    expect(stripHostPort(undefined)).toBeNull();
  });
});

describe("getValidSubdomain", () => {
  test("returns null for localhost", () => {
    expect(getValidSubdomain("localhost")).toBeNull();
    expect(getValidSubdomain("localhost:3000")).toBeNull();
    expect(getValidSubdomain("127.0.0.1")).toBeNull();
    expect(getValidSubdomain("::1")).toBeNull();
  });

  test("returns null for IP addresses", () => {
    expect(getValidSubdomain("192.168.1.1")).toBeNull();
    expect(getValidSubdomain("10.0.0.1:8080")).toBeNull();
  });

  test("extracts subdomain from localhost subdomain", () => {
    expect(getValidSubdomain("myslug.localhost:3003")).toBe("myslug");
    expect(getValidSubdomain("hello.localhost")).toBe("hello");
  });

  test("extracts subdomain from SaaS domains", () => {
    // SaaS: returns first segment
    expect(getValidSubdomain("myslug.stpg.dev")).toBe("myslug");
    expect(getValidSubdomain("myslug.openstatus.dev")).toBe("myslug");
  });

  test("returns full host for custom domains", () => {
    // Custom domains return the FULL host for matching against page.customDomain
    expect(getValidSubdomain("status.example.com")).toBe("status.example.com");
    expect(getValidSubdomain("status.mycompany.com")).toBe("status.mycompany.com");
    expect(getValidSubdomain("status-htmx.openstat.us")).toBe("status-htmx.openstat.us");
  });

  test("excludes www from SaaS subdomains, returns full host for custom", () => {
    // www.stpg.dev → www excluded → null
    expect(getValidSubdomain("www.stpg.dev")).toBeNull();
    // www.example.com → custom domain → full host
    expect(getValidSubdomain("www.example.com")).toBe("www.example.com");
  });

  test("returns null for vercel.app domains", () => {
    expect(getValidSubdomain("myapp.vercel.app")).toBeNull();
  });

  test("returns null for null/undefined input", () => {
    expect(getValidSubdomain(null)).toBeNull();
    expect(getValidSubdomain(undefined)).toBeNull();
  });

  test("STATUS_PAGE_CUSTOM_DOMAIN exact match returns full host", () => {
    const prev = process.env.STATUS_PAGE_CUSTOM_DOMAIN;
    process.env.STATUS_PAGE_CUSTOM_DOMAIN = "status.myorg.com";
    // Exact match with STATUS_PAGE_CUSTOM_DOMAIN returns full host
    expect(getValidSubdomain("status.myorg.com")).toBe("status.myorg.com");
    process.env.STATUS_PAGE_CUSTOM_DOMAIN = prev;
  });

  test("custom domain without env var match also returns full host", () => {
    // Even without STATUS_PAGE_CUSTOM_DOMAIN, custom domains return full host
    expect(getValidSubdomain("other.custom.domain")).toBe("other.custom.domain");
  });
});
