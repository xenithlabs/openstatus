import type { Context } from "hono";

import { formatDate } from "../lib/date";
import { getPrefix } from "../lib/prefix";
import { trpc } from "../lib/trpc";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * GET /:domain/:locale/feed — RSS feed of incidents and maintenances.
 */
export async function feedHandler(c: Context): Promise<Response> {
  const slug = c.get("slug");
  const prefix = getPrefix(c);

  // Derive the full URL from the request
  const url = new URL(c.req.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Fetch page data
  let page;
  try {
    page = await trpc.statusPage.get.query({ slug });
  } catch {
    return c.body("Service unavailable", 503);
  }

  if (!page) {
    return c.notFound();
  }

  const title = escapeXml(page.title);
  const description = escapeXml(page.description ?? `Status page for ${page.title}`);
  const buildDate = new Date().toUTCString();

  // Collect all feed items
  const items: Array<{
    title: string;
    link: string;
    pubDate: string;
    description: string;
  }> = [];

  // Status reports
  for (const report of page.statusReports ?? []) {
    const updates = (report.statusReportUpdates as Array<Record<string, unknown>>) ?? [];
    const latestUpdate = updates
      .slice()
      .sort(
        (a, b) =>
          new Date(b.date as string).getTime() -
          new Date(a.date as string).getTime(),
      )[0];

    const date = latestUpdate
      ? new Date(latestUpdate.date as string)
      : report.createdAt
        ? new Date(report.createdAt as string)
        : new Date();

    const desc = latestUpdate
      ? (latestUpdate.message as string) ?? (report.title as string)
      : (report.title as string);

    items.push({
      title: escapeXml(report.title as string),
      link: `${baseUrl}${prefix}/events/report/${report.id}`,
      pubDate: date.toUTCString(),
      description: escapeXml(desc),
    });
  }

  // Maintenances
  for (const m of page.maintenances ?? []) {
    items.push({
      title: escapeXml(m.title as string),
      link: `${baseUrl}${prefix}/events/maintenance/${m.id}`,
      pubDate: new Date(m.from as string).toUTCString(),
      description: escapeXml((m.message as string) ?? (m.title as string)),
    });
  }

  // Sort by date descending
  items.sort(
    (a, b) =>
      new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime(),
  );

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <link>${escapeXml(baseUrl + prefix)}</link>
    <description>${description}</description>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <atom:link href="${escapeXml(baseUrl + prefix + "/feed")}" rel="self" type="application/rss+xml"/>
    ${items
      .map(
        (item) => `
    <item>
      <title>${item.title}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description>${item.description}</description>
    </item>`,
      )
      .join("")}
  </channel>
</rss>`;

  return c.body(rss, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
}
