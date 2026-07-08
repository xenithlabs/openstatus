# Status Page

Public-facing status page app. Renders monitor status, uptime charts, and incident history for end users.

## Routes

| Route | Description |
|---|---|
| `/[domain]/[locale]` | Main status page — component cards, banner, recent feed |
| `/[domain]/[locale]/events` | Incident history — year tabs with monthly grouping |
| `/[domain]/[locale]/events/[year-month]` | Per-month incidents (e.g. `/events/july-2026`) |
| `/[domain]/[locale]/events/report/[id]` | Single incident report detail |
| `/[domain]/[locale]/events/maintenance/[id]` | Single maintenance detail |
| `/[domain]/[locale]/monitors/[id]` | Single monitor charts (latency, regions, uptime) |

## Incident History UX

The events page mirrors the Adyen status page pattern:

- **Year tabs** — navigate between years (2026, 2025, 2024…).
- **Monthly grouping** — within each year, incidents are grouped by month with headings ("July 2026").
- **3-per-month preview** — each month shows up to 3 incidents, collapsed by default with a chevron toggle.
- **"View all" link** — when a month has more than 3 incidents, a link to the per-month page appears.
- **Foldable incidents** — `StatusEventCollapsible` (from `@openstatus/ui`) wraps each incident; click to expand and see the full timeline.

## Key Components

| Component | Location | Role |
|---|---|---|
| `EventsYearList` | `src/components/status-page/events-year-list.tsx` | Year-tab container, merges reports + maintenances, delegates to `EventsMonthSection` |
| `EventsMonthSection` | `src/components/status-page/events-month-section.tsx` | Renders a single month's incidents with preview cutoff and "View all" link |
| `StatusEventCollapsible` | `@openstatus/ui/components/blocks/status-event-collapsible.tsx` | Foldable incident card (Radix Collapsible, default closed) |
| `StatusFeed` | `src/components/status-page/status-feed.tsx` | Recent 7-day feed on the main page |
| `StatusBanner` | `src/components/status-page/status-banner.tsx` | Active-incident banner on the main page |

## Development

```sh
pnpm install
pnpm run env
pnpm dev
```
