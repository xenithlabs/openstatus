/**
 * End-to-end rendering verification.
 *
 * Tests that all components render correctly with realistic mock data
 * matching the shapes returned by tRPC (statusPage.get, statusPage.getUptime).
 * No live tRPC server needed — validates the HTML output pipeline.
 */

import { describe, expect, test } from "bun:test";
import { jsx } from "hono/jsx";
import { renderToString } from "hono/jsx/dom/server";

import { BarChart } from "../../src/components/bar-chart";
import { ComponentRow } from "../../src/components/component-row";
import { Header } from "../../src/components/header";
import { StatusDot } from "../../src/components/icons";
import { IncidentHistory } from "../../src/components/incident-history";
import {
  MaintenanceDetailView,
  ReportDetailView,
} from "../../src/components/incident-detail";
import { Layout } from "../../src/components/layout";
import { StatusBanner } from "../../src/components/status-banner";
import { SubscribeForm, SubscribeSuccess } from "../../src/components/subscribe-form";
import { SystemStatus } from "../../src/components/system-status";
import { ThemeToggle } from "../../src/components/theme-toggle";

// ── Mock data matching tRPC response shapes ────────────────────────────────

const mockPage = {
  title: "Test Status Page",
  description: "A test status page for verification",
  icon: null,
  status: "degraded" as const,
  configuration: { theme: "openai", uptime: true },
  trackers: [
    {
      type: "component" as const,
      component: {
        id: 1,
        name: "API",
        description: "Core API service",
        status: "success" as const,
        order: 0,
      },
    },
    {
      type: "group" as const,
      groupId: 1,
      groupName: "Core Services",
      status: "degraded" as const,
      defaultOpen: false,
      components: [
        {
          id: 2,
          name: "Dashboard",
          description: null,
          status: "degraded" as const,
        },
        {
          id: 3,
          name: "Auth",
          description: "Authentication service",
          status: "success" as const,
        },
      ],
    },
    {
      type: "component" as const,
      component: {
        id: 4,
        name: "CDN",
        description: null,
        status: "success" as const,
        order: 1,
      },
    },
  ],
  openEvents: [
    { type: "incident" as const, name: "Elevated API latency", id: 1 },
  ],
  statusReports: [
    {
      id: 1,
      title: "Database connection issues",
      status: "resolved",
      createdAt: new Date("2026-07-14"),
      statusReportUpdates: [
        {
          id: 1,
          status: "resolved",
          date: new Date("2026-07-15"),
          message: "Database connections have been restored.",
        },
      ],
      statusReportsToPageComponents: [
        { pageComponent: { id: 1, name: "API" } },
      ],
    },
  ],
  maintenances: [
    {
      id: 1,
      title: "Scheduled database upgrade",
      status: "completed",
      from: new Date("2026-07-13"),
      to: new Date("2026-07-13"),
      message: "Upgrading database to v2.0",
      maintenancesToPageComponents: [
        { pageComponent: { id: 1, name: "API" } },
      ],
    },
  ],
  lastEvents: [
    { type: "report", id: 1, status: "resolved", name: "Database connection issues" },
    { type: "maintenance", id: 1, status: "completed", name: "Scheduled database upgrade" },
  ],
};

const mockUptime = [
  {
    pageComponentId: 1,
    data: Array.from({ length: 90 }, (_, i) => ({
      bar: [
        {
          status: i === 45 ? "degraded" as const : "success" as const,
          weight: 1,
        },
      ],
    })),
    uptime: "98.89",
  },
  {
    pageComponentId: 2,
    data: Array.from({ length: 90 }, () => ({
      bar: [{ status: "success" as const, weight: 1 }],
    })),
    uptime: "100.00",
  },
  {
    pageComponentId: 3,
    data: Array.from({ length: 90 }, () => ({
      bar: [{ status: "success" as const, weight: 1 }],
    })),
    uptime: "100.00",
  },
  {
    pageComponentId: 4,
    data: Array.from({ length: 90 }, () => ({
      bar: [{ status: "success" as const, weight: 1 }],
    })),
    uptime: "99.99",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderToHtml(element: JSX.Element): string {
  // Hono JSX dom/server renderToString
  const html = renderToString(element);
  // Collapse whitespace for assertions
  return html.replace(/\s+/g, " ").trim();
}

function containsAll(html: string, ...texts: string[]): boolean {
  return texts.every((t) => html.includes(t));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Layout component", () => {
  test("renders full HTML document with theme CSS", () => {
    const html = renderToHtml(
      <Layout page={{ title: "Test", description: "A test page" }}>
        <p>Hello</p>
      </Layout>,
    );
    expect(html).toContain("<html lang");
    expect(html).toContain("<title>Test</title>");
    expect(html).toContain('hx-boost="true"');
    expect(html).toContain("/static/htmx.min.js");
    expect(html).toContain("/static/alpine.min.js");
    expect(html).toContain("Hello");
  });

  test("renders with icon when provided", () => {
    const html = renderToHtml(
      <Layout page={{ title: "Test", icon: "https://example.com/icon.svg" }}>
        <p>Content</p>
      </Layout>,
    );
    expect(html).toContain('href="https://example.com/icon.svg"');
  });

  test("includes theme toggle", () => {
    const html = renderToHtml(
      <Layout page={{ title: "Test" }}>
        <p>Content</p>
      </Layout>,
    );
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain("Toggle theme");
  });
});

describe("Header component", () => {
  test("renders title as link", () => {
    const html = renderToHtml(
      <Header title="My Status" icon={null} prefix="/myslug/en" />,
    );
    expect(html).toContain("My Status");
    expect(html).toContain('href="/myslug/en"');
  });

  test("renders icon when provided", () => {
    const html = renderToHtml(
      <Header title="My Status" icon="https://example.com/logo.png" prefix="/myslug/en" />,
    );
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).toContain('alt="My Status"');
  });

  test("includes subscribe button", () => {
    const html = renderToHtml(
      <Header title="Test" icon={null} prefix="/test/en" />,
    );
    expect(html).toContain("Subscribe to updates");
    expect(html).toContain('href="/test/en/subscribe"');
  });
});

describe("StatusBanner component", () => {
  test("renders success banner", () => {
    const html = renderToHtml(<StatusBanner status="success" />);
    expect(html).toContain("fully operational");
  });

  test("renders degraded banner with incident name", () => {
    const html = renderToHtml(
      <StatusBanner status="degraded" activeIncidentName="Slow API" />,
    );
    expect(html).toContain("degraded performance");
    expect(html).toContain("Slow API");
  });

  test("renders error banner", () => {
    const html = renderToHtml(<StatusBanner status="error" />);
    expect(html).toContain("experiencing an outage");
  });

  test("renders maintenance banner", () => {
    const html = renderToHtml(<StatusBanner status="info" />);
    expect(html).toContain("Maintenance in progress");
  });
});

describe("BarChart component", () => {
  const barData = Array.from({ length: 90 }, (_, i) => ({
    bar: [{ status: "success" as const, weight: 1 }],
  }));

  test("renders SVG with 90 rect elements", () => {
    const html = renderToHtml(<BarChart data={barData} />);
    expect(html).toContain("<svg");
    expect(html).toContain("</svg>");
    // Each day gets a <rect>
    const rectCount = (html.match(/<rect/g) || []).length;
    expect(rectCount).toBe(90);
  });

  test("empty data returns nothing", () => {
    // renderToString produces empty string for null-returning components
    const html = renderToHtml(<BarChart data={[]} />);
    expect(html).toBe("");
  });
});

describe("ComponentRow", () => {
  test("renders component name and status", () => {
    const html = renderToHtml(
      <ComponentRow name="API" status="success" showUptime={true} uptime="99.9" />,
    );
    expect(html).toContain("API");
    expect(html).toContain("99.9%");
  });

  test("renders description when provided", () => {
    const html = renderToHtml(
      <ComponentRow
        name="API"
        description="Core service"
        status="success"
      />,
    );
    expect(html).toContain("Core service");
  });

  test("compact mode hides bar chart area", () => {
    const html = renderToHtml(
      <ComponentRow
        name="API"
        status="success"
        compact
        showUptime={true}
        uptime="100"
      />,
    );
    expect(html).toContain("100%");
    // Compact mode shouldn't have the "uptime" label
    expect(html).not.toContain("uptime");
  });
});

describe("SystemStatus component", () => {
  test("renders component list with system status heading", () => {
    const html = renderToHtml(
      <SystemStatus
        trackers={mockPage.trackers}
        componentUptime={mockUptime}
        groupUptime={[
          { groupId: "1", uptime: "99.00", data: mockUptime[0].data },
        ]}
        isLoading={false}
        showUptime={true}
      />,
    );
    expect(html).toContain("System status");
    expect(html).toContain("API");
    expect(html).toContain("Core Services");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Auth");
    expect(html).toContain("CDN");
    expect(html).toContain("x-data");
    expect(html).toContain("x-show");
    expect(html).toContain("x-collapse");
  });

  test("hides component list when empty", () => {
    const html = renderToHtml(
      <SystemStatus
        trackers={[]}
        componentUptime={[]}
        groupUptime={[]}
        isLoading={false}
        showUptime={true}
      />,
    );
    expect(html).toBe("");
  });
});

describe("IncidentHistory component", () => {
  test("renders incident list with dates and statuses", () => {
    const html = renderToHtml(
      <IncidentHistory
        reports={mockPage.statusReports.map((r) => ({
          ...r,
          affected: r.statusReportsToPageComponents.map((c) => c.pageComponent.name),
        }))}
        maintenances={mockPage.maintenances.map((m) => ({
          ...m,
          affected: m.maintenancesToPageComponents.map((c) => c.pageComponent.name),
          status: "completed",
        }))}
        prefix="/test/en"
      />,
    );
    expect(html).toContain("Incident History");
    expect(html).toContain("Database connection issues");
    expect(html).toContain("Scheduled database upgrade");
    expect(html).toContain("Resolved");
    expect(html).toContain("API");
    // Links to detail pages
    expect(html).toContain('/test/en/events/report/1');
    expect(html).toContain('/test/en/events/maintenance/1');
  });

  test("returns nothing when no events", () => {
    const html = renderToHtml(
      <IncidentHistory
        reports={[]}
        maintenances={[]}
        prefix="/test/en"
      />,
    );
    expect(html).toBe("");
  });
});

describe("IncidentDetail components", () => {
  test("ReportDetailView renders timeline", () => {
    const html = renderToHtml(
      <ReportDetailView
        report={{
          id: 1,
          title: "API Outage",
          status: "resolved",
          createdAt: new Date("2026-07-14"),
          statusReportUpdates: [
            {
              id: 1,
              status: "investigating",
              date: new Date("2026-07-14T10:00:00Z"),
              message: "We are investigating elevated error rates.",
            },
            {
              id: 2,
              status: "monitoring",
              date: new Date("2026-07-14T11:00:00Z"),
              message: "Error rates have returned to normal.",
            },
            {
              id: 3,
              status: "resolved",
              date: new Date("2026-07-14T12:00:00Z"),
              message: "This incident has been resolved.",
            },
          ],
          statusReportsToPageComponents: [
            { pageComponent: { id: 1, name: "API" } },
          ],
        }}
        prefix="/test/en"
      />,
    );

    expect(html).toContain("API Outage");
    expect(html).toContain("Investigating");
    expect(html).toContain("Monitoring");
    expect(html).toContain("Resolved");
    expect(html).toContain("elevated error rates");
    expect(html).toContain("API");
    // Back link
    expect(html).toContain('/test/en/events"');
    expect(html).toContain("Back");
  });

  test("MaintenanceDetailView renders schedule", () => {
    const html = renderToHtml(
      <MaintenanceDetailView
        maintenance={{
          id: 1,
          title: "DB Migration",
          message: "Migrating to new database cluster.",
          from: new Date("2026-07-13"),
          to: new Date("2026-07-13"),
          maintenancesToPageComponents: [
            { pageComponent: { id: 1, name: "Database" } },
          ],
        }}
        prefix="/test/en"
      />,
    );

    expect(html).toContain("DB Migration");
    expect(html).toContain("Migrating to new database cluster");
    expect(html).toContain("Database");
    expect(html).toContain("Jul 13");
  });
});

describe("SubscribeForm component", () => {
  test("renders email form with HTMX attributes", () => {
    const html = renderToHtml(<SubscribeForm prefix="/test/en" />);
    expect(html).toContain("Subscribe to updates");
    expect(html).toContain('type="email"');
    expect(html).toContain("hx-post");
    expect(html).toContain("/test/en/subscribe");
  });
});

describe("SubscribeSuccess component", () => {
  test("renders confirmation message with email", () => {
    const html = renderToHtml(<SubscribeSuccess email="user@example.com" />);
    expect(html).toContain("Check your email");
    expect(html).toContain("user@example.com");
  });
});

describe("ThemeToggle component", () => {
  test("renders with Alpine x-data for theme management", () => {
    const html = renderToHtml(<ThemeToggle />);
    expect(html).toContain("x-data");
    // localStorage.getItem is HTML-encoded in the output
    expect(html).toContain("localStorage.getItem");
    expect(html).toContain("system");
    expect(html).toContain("dark");
    expect(html).toContain('aria-label="Toggle theme"');
  });
});

describe("Full page integration", () => {
  test("status dot renders with correct color", () => {
    const success = renderToHtml(<StatusDot status="success" />);
    expect(success).toContain("#22c55e");

    const error = renderToHtml(<StatusDot status="error" />);
    expect(error).toContain("#ef4444");

    const degraded = renderToHtml(<StatusDot status="degraded" />);
    expect(degraded).toContain("#eab308");
  });

  test("full page assembles without errors", () => {
    // This tests that all components can coexist in the same tree
    const html = renderToHtml(
      <Layout page={{ title: mockPage.title, description: mockPage.description }}>
        <Header title={mockPage.title} icon={mockPage.icon} prefix="/test/en" />
        <StatusBanner
          status={mockPage.status}
          activeIncidentName={mockPage.openEvents[0]?.name}
        />
        <SystemStatus
          trackers={mockPage.trackers}
          componentUptime={mockUptime}
          groupUptime={[{ groupId: "1", uptime: "99.00", data: mockUptime[0].data }]}
          isLoading={false}
          showUptime={true}
        />
        <IncidentHistory
          reports={mockPage.statusReports.map((r) => ({
            ...r,
            affected: r.statusReportsToPageComponents.map((c) => c.pageComponent.name),
          }))}
          maintenances={mockPage.maintenances.map((m) => ({
            ...m,
            affected: m.maintenancesToPageComponents.map((c) => c.pageComponent.name),
            status: "completed",
          }))}
          prefix="/test/en"
        />
      </Layout>,
    );

    // Key page elements should all be present
    expect(containsAll(
      html,
      mockPage.title,
      "Subscribe to updates",
      "System status",
      "API",
      "Dashboard",
      "Incident History",
      "Database connection issues",
      "Scheduled database upgrade",
      'hx-boost="true"',
      "/static/htmx.min.js",
      "/static/alpine.min.js",
    )).toBe(true);

    // Should be well-formed HTML (renderToString doesn't emit DOCTYPE)
    expect(html.startsWith("<html")).toBe(true);
  });
});
