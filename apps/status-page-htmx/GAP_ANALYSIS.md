# Gap Analysis — status-page-htmx vs status-page vs status.openai.com

**Date:** 2026-07-15
**Branch:** `openstatus-self-hosted`
**Status:** Wave 0 preparation complete — all TypeScript errors fixed (0 diagnostics), 104 tests passing.

---

## 0. Current State

- ✅ TypeScript: 0 errors, 0 warnings across `apps/status-page-htmx/src/`
- ✅ Tests: 104 pass, 0 fail, 6 skip
- ✅ `scripts/waves.sh` — per-agent parallel work orchestrator ready
- ✅ `.pi/skills/openstatus-waves/` — reusable skill for wave planning
- 🔲 Wave 0: Foundation files to create

## 1. Comparison Matrix

| Feature | status-page (Next.js) | status-page-htmx | status.openai.com |
|---|---|---|---|
| **Status banner** | Tabs for multiple open events, inline latest update + affected badges | Static text: heading + incident name only | ✓ Banner with colored border, status dot |
| **Banner tabs** | ✓ (Radix Tabs in banner) | ✗ | N/A |
| **System status** | Collapsible groups + status bar | Collapsible groups (Alpine) + bar chart SVG | ✓ (groups + status dots) |
| **Status bar (hover cards)** | ✓ Rich hover cards with event markers (report/maintenance/incident) | ✗ (bar chart only, no hover) | N/A |
| **Status calendar** | ✓ Calendar grid with color-coded day markers | ✗ | N/A |
| **Status feed** | ✓ Feed section with markdown-rendered updates, "View events history" footer | ✗ (IncidentHistory is flat card list, no markdown) | N/A |
| **Collapsible incident cards** | ✓ (StatusEventCollapsible) — inline expand to show timeline | ✗ (flat links to detail page) | ✗ (flat links) |
| **Markdown rendering** | ✓ (ProcessMessage) for report/maint messages | ✗ (plain text only) | N/A |
| **Events — year tabs** | URL-synced (nuqs) | Alpine x-data (no URL sync) | ✗ |
| **Events — month detail** | ✓ | ✓ | ✗ |
| **Events — report detail** | ✓ with timeline, markdown, copy-link | ✓ basic (no markdown, no copy-link) | ✗ |
| **Events — maintenance detail** | ✓ with schedule, markdown, copy-link | ✓ basic (no markdown, no copy-link) | ✗ |
| **Monitors list** | Card grid with area chart preview per monitor | Simple list with status dots + links | N/A |
| **Monitors detail** | 3 tabs: Global Latency (area chart), Region Latency (line chart), Uptime (bar chart) | ✗ (route link exists but not implemented) | ✗ |
| **Subscribe** | Popover with tabs: Email, Slack, RSS, JSON, SSH | Separate page with email form only | Email form |
| **Header — nav** | Desktop nav + mobile hamburger sheet | Desktop nav only (no mobile) | Tab nav |
| **Header — brand** | Icon button with fallback initials | Icon img or text link | Logo |
| **Header — contact** | "Get in touch" icon if contactUrl set | ✗ | ✗ |
| **Header — updates popover** | ✓ Subscribe popover (StatusUpdates) | ✗ (button links to /subscribe page) | Subscribe button |
| **Footer** | Powered-by, locale switcher, theme switcher, timestamp | ✗ (no footer at all) | ✗ |
| **Theme toggle** | In footer (theme switcher) | Floating button (bottom-right) | ✓ (footer) |
| **Dark mode** | ✓ | ✓ (Alpine.js + localStorage) | ✓ |
| **Embed mode** | ✓ (?embed param, hides chrome) | ✗ | ✗ |
| **Password-protected** | ✓ Auth routes (magic link + password) | ✗ | ✗ |
| **Unsubscribe/verify** | ✓ Token-based routes | ✗ | ✗ |
| **WhiteLabel** | ✓ (hides "powered by") | ✗ | ✗ |
| **Locale switcher** | ✓ (multi-locale) | ✗ (English only) | ✗ |
| **Copy link button** | ✓ On detail pages | ✗ | ✗ |
| **Floating config** | ✓ Token-gated settings popover (bar type, theme, etc.) | ✗ | ✗ |
| **JSON/Atom feeds** | ✓ (multiple feed types) | ✗ (RSS only) | ✗ |
| **/llms.txt** | ✓ | ✗ | ✗ |
| **/manage route** | ✓ Token-gated | ✗ | ✗ |
| **RSS feed** | ✓ | ✓ | ✓ |
| **Badge SVG** | ✓ | ✓ | N/A |
| **Response caching** | ✗ | ✗ | ✓ (CDN) |
| **Timezone display** | ✓ (footer, Intl API) | ✗ | ✗ |

---

## 2. Gap Analysis by Component Layer

### L1 — Layout & Chrome (Header / Footer)

**Gaps in HTMX:**

1. **No footer.** The Next.js footer contains:
   - "Powered by openstatus.dev" (unless whiteLabel)
   - Timestamp hover card with timezone
   - Locale switcher
   - Theme switcher

2. **Header is basic.** Missing:
   - Mobile hamburger menu (sheet with nav links)
   - "Get in touch" icon (contactUrl)
   - Subscribe button opens popover with tabs instead of separate page
   - Brand icon button with fallback initials styling

### L2 — Home Page (Status Banner)

**Gaps in HTMX:**

1. **Banner is static.** Shows only the first incident name as text. Should show:
   - Tabs for each open event (incident / report / maintenance)
   - Each tab shows latest update message + affected components
   - Colored border matching status

2. **No status bar hover cards.** The SVG bar chart has no interactivity:
   - Hovering a day pill should show events on that day
   - Reports, maintenances, incidents should appear as color-coded badges

3. **No status calendar.** Missing entirely:
   - Calendar grid showing which days had events
   - Color coding (red=error, yellow=degraded, blue=maintenance)
   - Hover shows event details

4. **No status feed.** The home page has no feed section — only `IncidentHistory`. Missing:
   - Markdown-rendered update messages
   - "View events history" link at bottom

### L3 — Events Pages

**Gaps in HTMX:**

1. **No collapsible incident cards.** Events list shows flat cards linking to detail pages. Should:
   - Expand inline to show timeline (Alpine.js collapse)
   - Keep the chevron toggle

2. **No markdown rendering.** Report update messages are plain text. Should render markdown.

3. **No year tab URL sync.** Year tabs use Alpine x-data but don't update the URL.

4. **No copy-link button.** Detail pages only have "Back".

### L4 — Monitors

**Gaps in HTMX:**

1. **No monitor detail page.** The list page links to `/monitors/:id` but the route doesn't exist. Needs:
   - Global Latency tab (area chart: p75, p95, p99, max over time)
   - Region Latency tab (line chart: per-region p75 comparison)
   - Uptime tab (bar chart: success/degraded/error per interval)
   - Summary stats: total checks, uptime %, slowest region, p75 range

2. **Monitor list is bare.** Next.js shows area chart preview per monitor. HTMX needs chart thumbnails.

### L5 — Subscribe & Notifications

**Gaps in HTMX:**

1. **Subscribe is a separate page, not a popover.** Should:
   - Use a popover triggered from the header's subscribe button
   - Show tabs: Email, Slack, RSS, JSON, SSH
   - Use HTMX for form submission inside the popover

2. **No Slack/RSS/JSON/SSH tabs.** Only email form exists.

### L6 — Polish & Advanced Features

**Gaps in HTMX:**

1. **Embed mode** — no `?embed` param handling
2. **Password-protected pages** — no auth routes
3. **Unsubscribe/verify** — no token routes
4. **WhiteLabel** — no config to hide "powered by"
5. **Multi-locale** — English only
6. **Floating config button** — no admin config popover
7. **JSON/Atom feeds** — RSS only
8. **/llms.txt** — missing
9. **/manage** — missing
10. **Timestamp / timezone** — missing
11. **Response caching** — no Cache-Control headers for static content

---

## 3. JavaScript Effects Inventory

### Already Implemented (HTMX + Alpine.js)

| Effect | Implementation |
|---|---|
| SPA-like navigation | `hx-boost="true"` on `<body>` |
| Form submission (subscribe) | `hx-post`, `hx-target`, `hx-swap` |
| Collapsible component groups | Alpine `x-data`, `x-show`, `x-collapse` |
| Year tabs (events page) | Alpine `x-data="{ activeYear: ... }"` |
| Theme toggle (system/light/dark) | Alpine with localStorage |
| Theme CSS injection | Server-side `injectThemeStyles()` |

### To Be Implemented

| Effect | Stack | Priority |
|---|---|---|
| **Banner tabs** — multiple open events as tabs | Alpine `x-data` with tabs state, HTMX for loading tab content | High |
| **Status bar hover cards** — hover day pill → show events | Alpine `x-data` + `@mouseenter`/`@mouseleave`, pre-loaded events JSON | High |
| **Collapsible incident cards** — expand timeline inline | Alpine `x-collapse` + `x-show` on each card | High |
| **Status updates popover** — subscribe button → popover with tabs | Alpine `x-data` + `x-show` for popover, HTMX for email form | High |
| **Mobile hamburger menu** — sheet overlay | Alpine `x-data` + `x-show` + `x-transition` | Medium |
| **Monitor detail tabs** — Global/Region/Uptime | Alpine `x-data` for tab state, SVG charts | Medium |
| **Year tab URL sync** — pushState on year change | Alpine + `history.pushState` | Medium |
| **Copy link button** — clipboard copy | Alpine `@click` + `navigator.clipboard.writeText` | Low |
| **Calendar view** — month grid with event markers | Alpine `x-data` for current month, generated day grid | Medium |
| **Embed mode detection** — parse `?embed` param | Alpine init reading `URLSearchParams` | Low |
| **Floating config button** — settings popover | Alpine `x-data` + `x-show` for popover, token from localStorage | Low |
| **Footer timestamp** — relative time display | Alpine `x-data` + `setInterval` for live update | Medium |
| **Markdown rendering** — format report messages | Server-side markdown-to-HTML (e.g., `marked` library) | High |

---

## 4. Design Plan

### Architecture Principles

1. **Server-rendered HTML with progressive enhancement.** Every page must work without JavaScript (full HTML from server). Alpine.js adds interactivity on top.

2. **No client-side data fetching.** All data is server-rendered into the HTML. Alpine.js state is initialized from embedded data (JSON in `<script>` tags or data attributes).

3. **HTMX for navigation and forms.** `hx-boost` for SPA feel. `hx-post`/`hx-get` for form submissions and lazy-loaded sections.

4. **Alpine.js for UI state.** Tabs, toggles, popovers, collapsible sections, theme. No React-level state management needed.

5. **Reuse tRPC for all data access.** Same `@openstatus/api` as Next.js — no direct DB access.

6. **CSS via Tailwind v4 standalone.** Already in place. Extend utilities as needed.

### Component Architecture

```
apps/status-page-htmx/src/
├── components/
│   ├── layout.tsx              # Full HTML shell (head, body, scripts)
│   ├── header.tsx              # Header: brand, nav, mobile menu, updates popover
│   ├── footer.tsx              # NEW: powered-by, timestamp, theme, locale
│   ├── system-status.tsx       # Collapsible groups + bar charts
│   ├── status-banner.tsx       # Banner + tabs for open events
│   ├── status-bar.tsx          # NEW: interactive bar chart with hover cards
│   ├── status-calendar.tsx     # NEW: month calendar grid with event markers
│   ├── status-feed.tsx         # NEW: feed section for home page
│   ├── incident-card.tsx       # NEW: collapsible incident card (replaces flat card)
│   ├── incident-detail.tsx     # Report/maintenance detail pages
│   ├── incident-history.tsx    # Home page incident history section
│   ├── bar-chart.tsx           # SVG bar chart (existing, enhance)
│   ├── component-row.tsx       # Single component row
│   ├── subscribe-form.tsx      # Email form (existing, enhance for popover)
│   ├── updates-popover.tsx     # NEW: popover with RSS/JSON/SSH/Slack tabs
│   ├── theme-toggle.tsx        # Floating theme button (existing)
│   ├── icons.tsx               # StatusDot, ChevronDown, etc.
│   ├── mobile-menu.tsx         # NEW: hamburger menu sheet
│   ├── copy-link.tsx           # NEW: copy-to-clipboard button
│   └── markdown.tsx            # NEW: server-side markdown renderer
├── lib/
│   ├── trpc.ts                 # tRPC client
│   ├── domain.ts               # Domain resolution
│   ├── prefix.ts               # URL prefix helper
│   ├── theme.ts                # Theme CSS injection
│   ├── date.ts                 # Date formatting
│   ├── logger.ts               # Logging
│   ├── markdown.ts             # NEW: markdown-to-HTML helper
│   └── cache.ts                # NEW: Cache-Control header builder
├── routes/
│   ├── status-page.tsx         # Home page handler
│   ├── events.tsx              # Events list + month + detail handlers
│   ├── monitors.tsx            # Monitor list + detail handlers (detail NEW)
│   ├── subscribe.tsx           # Subscribe page + popover endpoint
│   ├── badge.tsx               # SVG badge
│   ├── feed.tsx                # RSS feed
│   └── zone.tsx                # Locale sub-app
└── styles/
    └── input.css               # Tailwind entry
```

### Data Flow for Interactive Components

#### Status Bar Hover Cards

```
1. Server renders bar chart SVG + hidden JSON blob of events per day
2. Alpine x-data initializes from JSON blob
3. @mouseenter on rect → Alpine sets active day → shows hover card with events
4. Events render as color-coded badges (report/maintenance/incident)
5. Click pins the card open; click elsewhere or Esc closes it
```

#### Banner Tabs

```
1. Server renders all open events as tabs
2. Alpine x-data manages active tab state
3. Each tab pane contains: latest update message + affected components
4. Clicking a report/maintenance tab links to detail page
5. Incident tab shows static message + affected components
```

#### Collapsible Incident Cards

```
1. Server renders incident card with date, title, affected badges
2. Alpine x-data on each card: { open: false }
3. @click toggles x-show on the timeline content
4. Chevron icon rotates via Alpine :class binding
5. Timeline HTML is fully server-rendered (no API call needed)
```

#### Updates Popover

```
1. Subscribe button triggers Alpine x-show popover
2. Popover contains tabs: Email, Slack, RSS, JSON, SSH
3. Email tab: HTMX form (hx-post to /subscribe endpoint)
4. RSS/JSON tabs: display URLs with copy buttons
5. SSH tab: display ssh command with copy button
6. Slack tab: instructions + RSS URL
```

### Route Changes

| Route | Status | Change |
|---|---|---|
| `GET /` | Exists | Add StatusFeed section, enhance banner with tabs |
| `GET /events` | Exists | Replace flat cards with collapsible cards |
| `GET /events/:yearMonth` | Exists | Add copy-link button |
| `GET /events/report/:id` | Exists | Add markdown rendering, copy-link button |
| `GET /events/maintenance/:id` | Exists | Add markdown rendering, copy-link button |
| `GET /monitors` | Exists | Add area chart preview per monitor |
| `GET /monitors/:id` | **NEW** | Full monitor detail with 3 chart tabs |
| `GET /subscribe` | Exists | Keep as standalone page, plus popover endpoint |
| `POST /subscribe` | Exists | Works for both page and popover |
| `GET /badge` | Exists | Add Cache-Control header |
| `GET /feed` | Exists | Add JSON/Atom variants, Cache-Control |
| `GET /calendar` | **NEW** | Calendar view (optional, could be on home page) |

---

## 5. Task Plan — Phased

### Phase 1: Home Page Completeness (P0 — ~3 days)

These items bring the home page to parity with the Next.js version.

| # | Task | Effort | Notes |
|---|---|---|---|
| 1.1 | **Banner tabs** — render multiple open events as tabs using Alpine.js | S | Replace static text banner with tabbed banner. Each tab shows event name, latest update message, affected components. |
| 1.2 | **Status bar hover cards** — interactive bar chart with event markers | M | Embed events JSON in page. Alpine.js hover/pin interaction. Show color-coded event badges (report/maintenance/incident). |
| 1.3 | **Markdown rendering** — add server-side markdown-to-HTML utility | S | Use `marked` or similar in `lib/markdown.ts`. Apply to report update messages. |
| 1.4 | **Status feed section** — add feed to home page (or enhance IncidentHistory) | S | Render timeline events with markdown messages. Add "View events history" link. |
| 1.5 | **Footer** — create footer with powered-by, timestamp, theme toggle | S | Move theme toggle from floating button into footer. Add `StatusPageFooter` pattern. |

### Phase 2: Events Experience (P1 — ~2 days)

These items make the events/incident history polished.

| # | Task | Effort | Notes |
|---|---|---|---|
| 2.1 | **Collapsible incident cards** — expand timeline inline via Alpine.js | M | Replace flat card links with Alpine collapsible cards. Chevron toggle. Timeline renders on expand. |
| 2.2 | **Year tab URL sync** — pushState on year change | S | Add `history.pushState` to Alpine year tab click handler. Read from URL on init. |
| 2.3 | **Copy link button** — on detail pages | S | Alpine component using `navigator.clipboard.writeText`. |
| 2.4 | **Detail page markdown** — render report/maintenance messages with markdown | S | Apply server-side markdown to detail page views. |

### Phase 3: Monitors (P1 — ~2 days)

| # | Task | Effort | Notes |
|---|---|---|---|
| 3.1 | **Monitor detail page** — `/monitors/:id` route with 3 tabs | L | Global Latency (SVG area chart), Region Latency (SVG line chart), Uptime (SVG bar chart). Summary stats above charts. Alpine.js tabs. |
| 3.2 | **Monitor list enhancement** — area chart preview per monitor | M | Add small SVG chart preview for each monitor in the list. |

### Phase 4: Subscribe & Notifications (P2 — ~1.5 days)

| # | Task | Effort | Notes |
|---|---|---|---|
| 4.1 | **Updates popover** — replace separate subscribe page with popover | M | Popover triggered from header button. Tabs: Email (HTMX form), Slack, RSS, JSON, SSH. |
| 4.2 | **JSON/Atom feeds** — add feed variants | S | Add `GET /feed/json` and `GET /feed/atom` endpoints. Reuse data from RSS handler. |

### Phase 5: Layout & Chrome (P2 — ~1.5 days)

| # | Task | Effort | Notes |
|---|---|---|---|
| 5.1 | **Mobile hamburger menu** — Alpine.js sheet for mobile nav | S | Sheet overlay with nav links. Alpine x-data for open/close state. |
| 5.2 | **Header brand polish** — icon button with fallback initials | S | Match Next.js `StatusPageHeaderBrandButton` + `StatusPageHeaderBrandFallback` styling. |
| 5.3 | **Contact/Get in touch** — optional icon in header | S | Show `MessageCircleMore` icon if page has `contactUrl`. |
| 5.4 | **Response caching** — add Cache-Control headers | S | Add to badge, feed, static pages. Configurable TTL. |

### Phase 6: Advanced Features (P3 — ~2 days)

| # | Task | Effort | Notes |
|---|---|---|---|
| 6.1 | **Status calendar** — month grid with event markers | M | Calendar grid component using Alpine.js for month navigation. Color-coded day markers. Hover shows event details. |
| 6.2 | **Embed mode** — `?embed` param support | S | Parse embed param in Alpine init. Conditionally hide header/footer based on sections. |
| 6.3 | **Footer timestamp** — live relative time | S | Alpine.js x-data with `setInterval` updating relative time display. |
| 6.4 | **Floating config button** — token-gated settings popover | M | Gear icon in corner. Token from localStorage or query param. Settings: bar type, card type, show uptime, history days, theme selector. |
| 6.5 | **Password-protected pages** — auth routes (stretch) | L | Login page, restricted page, cookie-based auth. |
| 6.6 | **Unsubscribe/verify routes** (stretch) | M | Token-based unsubscribe and email verification pages. |
| 6.7 | **/llms.txt endpoint** (stretch) | S | Serve llms.txt for AI consumption. |

---

## 6. Effort Summary

| Phase | Tasks | Est. Effort |
|---|---|---|
| Phase 1: Home Page | 5 | ~3 days |
| Phase 2: Events | 4 | ~2 days |
| Phase 3: Monitors | 2 | ~2 days |
| Phase 4: Subscribe | 2 | ~1.5 days |
| Phase 5: Layout | 4 | ~1.5 days |
| Phase 6: Advanced | 7 | ~2 days |
| **Total** | **24** | **~12 days** |

**Priority key:** P0 = MVP parity, P1 = Core completeness, P2 = Polish, P3 = Advanced/stretch

---

## 7. Multi-Agent Parallel Work Plan

### Dependency Graph

```
Wave 0: Foundation (BLOCKER for all)
  └─ lib/markdown.ts, lib/cache.ts, components/markdown.tsx
       │
       ├── Wave 1A: Home Page Components
       │     ├─ status-banner.tsx (rewrite with tabs)
       │     ├─ status-bar.tsx (hover cards)
       │     ├─ status-feed.tsx (feed section)
       │     └─ footer.tsx
       │
       ├── Wave 1B: Events & Incidents
       │     ├─ incident-card.tsx (collapsible)
       │     ├─ copy-link.tsx
       │     └─ (modify events.tsx)
       │
       └── Wave 1C: Monitors
             ├─ chart-area.tsx, chart-line.tsx, chart-bar.tsx
             └─ (modify monitors.tsx + index.tsx)
                    │
       ┌────────────┼────────────┐
       │            │            │
  Wave 2A:      Wave 2B:     Wave 2C:
  Home          Subscribe    Layout
  Integration   & Feeds      Chrome
       │            │            │
       └────────────┼────────────┘
                    │
              Wave 3: Advanced
```

### File Conflict Analysis

**New files (14) — zero conflicts across agents:**
`lib/markdown.ts`, `lib/cache.ts`, `components/markdown.tsx`,
`components/status-bar.tsx`, `components/status-feed.tsx`, `components/footer.tsx`,
`components/incident-card.tsx`, `components/copy-link.tsx`,
`components/updates-popover.tsx`, `components/mobile-menu.tsx`,
`components/chart-area.tsx`, `components/chart-line.tsx`, `components/chart-bar.tsx`,
`components/status-calendar.tsx`

**Modified files — only 3 have multi-agent risk:**

| File | Agents touching it | Conflict risk |
|---|---|---|
| `components/status-banner.tsx` | Agent A only | None |
| `components/header.tsx` | Agent D + Agent E | **Medium** — adjacent sections |
| `components/layout.tsx` | Agent A + Agent E | **Medium** — different regions |
| `routes/status-page.tsx` | Agent A only | None |
| `routes/events.tsx` | Agent B only | None |
| `routes/monitors.tsx` | Agent C only | None |
| `routes/subscribe.tsx` | Agent D only | None |
| `routes/feed.tsx` | Agent D only | None |
| `index.tsx` | Agent C + Agent D + Agent E | **High** — route registration |

**Mitigation strategy for conflicts:**
- `header.tsx`: Agent D adds popover trigger (edits subscribe button area). Agent E adds mobile menu + brand polish (edits brand + actions areas). Non-overlapping regions.
- `layout.tsx`: Agent A adds footer include. Agent E adds embed support (body class toggle). Different template regions.
- `index.tsx`: **Designate a single agent (Agent E) as integrator.** Agents C and D provide their route handler functions; Agent E wires them into `index.tsx` in Wave 2.

---

### Wave 0: Foundation (Sequential — 1 agent, ~2 hours)

> **BLOCKER for all other waves.** Must complete first.

| # | Task | File(s) | Notes |
|---|---|---|---|
| 0.1 | **Markdown utility** | `src/lib/markdown.ts` | Uses `marked` (zero-dependency). `renderMarkdown(md: string): string` returning HTML. |
| 0.2 | **Markdown component** | `src/components/markdown.tsx` | JSX wrapper: `<Markdown content={message} />` renders via `dangerouslySetInnerHTML`. |
| 0.3 | **Cache utility** | `src/lib/cache.ts` | `cacheHeaders(ttlSeconds: number): Record<string,string>`. Used by badge, feed, static pages. |

**Artifacts shipped to all agents:** Markdown renderer ready to use in any component.

---

### Wave 1: Independent Components (3 agents, parallel, ~8 hours)

> Each agent works on **disjoint files** — zero merge conflicts.

---

#### Agent A — Home Page Components

**Scope:** New components for the home page. Does NOT modify shared files yet.

| # | Task | File(s) | Effort |
|---|---|---|---|
| A1 | **Banner tabs** — rewrite banner with Alpine.js tabs for multiple open events | `src/components/status-banner.tsx` | M |
| A2 | **Status bar hover cards** — interactive bar chart with day-hover → event badges | `src/components/status-bar.tsx` | M |
| A3 | **Status feed section** — home page feed with markdown messages + footer link | `src/components/status-feed.tsx` | S |
| A4 | **Footer** — powered-by, theme toggle (move from floating), timestamp | `src/components/footer.tsx` | S |

**Outputs:** 4 new component files. Ready for integration in Wave 2A.

**Data flow for A2 (Status bar):**
1. Server embeds events JSON as `<script type="application/json" id="events-data">` in page
2. Alpine `x-data` reads from JSON element on init
3. `@mouseenter` on `<rect>` → lookup events for that day → show hover card
4. Click to pin; Esc / outside-click to dismiss
5. Keyboard: Left/Right arrows to navigate days, Enter to pin

---

#### Agent B — Events & Incidents

**Scope:** Improves events/incident pages. Modifies `routes/events.tsx`.

| # | Task | File(s) | Effort |
|---|---|---|---|
| B1 | **Collapsible incident cards** — Alpine.js expand/collapse on events list items | `src/components/incident-card.tsx` | M |
| B2 | **Copy link button** — Alpine.js clipboard copy component | `src/components/copy-link.tsx` | S |
| B3 | **Year tab URL sync** — `history.pushState` on tab click, read from URL on init | modify `src/routes/events.tsx` | S |
| B4 | **Detail page markdown** — render report/maintenance messages via `<Markdown>` | modify `src/routes/events.tsx` | S |
| B5 | **Detail page polish** — add `<CopyLink>` button next to back button | modify `src/routes/events.tsx` | S |

**Outputs:** 2 new components + modified `events.tsx`. All contained within the events feature.

**Data flow for B1 (Collapsible cards):**
1. Server renders full timeline HTML inside each card (pre-rendered, hidden)
2. Alpine `x-data="{ open: false }"` on each card
3. `@click` toggles `x-show` + `x-collapse` on the timeline content
4. Chevron icon rotates via `:class="{ 'rotate-180': open }"`
5. No API call needed — all data is already in the HTML

---

#### Agent C — Monitors

**Scope:** New monitor detail route + list enhancement. Modifies `routes/monitors.tsx`.

| # | Task | File(s) | Effort |
|---|---|---|---|
| C1 | **SVG chart components** — area chart, line chart, bar chart for monitor detail | `src/components/chart-area.tsx`, `chart-line.tsx`, `chart-bar.tsx` | L |
| C2 | **Monitor detail page** — `/monitors/:id` with 3 Alpine.js tabs (Global/Region/Uptime) + summary stats | modify `src/routes/monitors.tsx` | L |
| C3 | **Monitor list enhancement** — area chart thumbnail per monitor | modify `src/routes/monitors.tsx` | M |

**Outputs:** 3 new chart components + modified `monitors.tsx`.

**Data flow for C2 (Monitor detail):**
1. Server fetches monitor data via tRPC (`statusPage.getMonitor`)
2. Data pre-processed into chart-friendly arrays
3. SVG charts rendered server-side with pre-computed coordinates
4. Alpine `x-data` for tab switching (no data fetching needed)
5. Tab labels show summary stats (p75 range, region count, uptime %)

**Route registration note:** Agent C adds the handler function but does NOT edit `index.tsx`. The handler is exported from `monitors.tsx`; Agent E wires it in during Wave 2.

---

### Wave 2: Integration & Shared Files (3 agents, parallel, ~6 hours)

> Agents now integrate their Wave 1 outputs into shared files. Each agent owns specific shared files to avoid conflicts.

---

#### Wave 2A — Home Page Integration (Agent A continued)

**Scope:** Wires Wave 1A components into the home page. Modifies `status-page.tsx` and `layout.tsx`.

| # | Task | File(s) | Effort |
|---|---|---|---|
| A5 | **Integrate banner tabs into home** — use new `<StatusBanner>` with tabs | modify `src/routes/status-page.tsx` | M |
| A6 | **Integrate status bar into SystemStatus** — use new `<StatusBar>` component | modify `src/routes/status-page.tsx` + `src/components/system-status.tsx` | M |
| A7 | **Integrate status feed into home** — add `<StatusFeed>` section below components | modify `src/routes/status-page.tsx` | S |
| A8 | **Integrate footer into layout** — add `<Footer>` to `<Layout>` | modify `src/components/layout.tsx` | S |

---

#### Wave 2B — Subscribe & Feeds (Agent D)

**Scope:** Updates popover + feed variants. New component + modifies `subscribe.tsx`, `feed.tsx`, `header.tsx`.

| # | Task | File(s) | Effort |
|---|---|---|---|
| D1 | **Updates popover component** — Alpine.js popover with tabs: Email, Slack, RSS, JSON, SSH | `src/components/updates-popover.tsx` | M |
| D2 | **Popover endpoint** — email form submission endpoint for popover (HTMX partial) | modify `src/routes/subscribe.tsx` | S |
| D3 | **JSON/Atom feed variants** — add `GET /feed/json` and `GET /feed/atom` | modify `src/routes/feed.tsx` | S |
| D4 | **Header: popover trigger** — replace subscribe button link with popover trigger | modify `src/components/header.tsx` | S |

---

#### Wave 2C — Layout Chrome & Integration (Agent E)

**Scope:** Mobile menu, header polish, route registration. Modifies `header.tsx`, `index.tsx`. **Designated integrator for `index.tsx`.**

| # | Task | File(s) | Effort |
|---|---|---|---|
| E1 | **Mobile hamburger menu** — Alpine.js sheet overlay with nav links | `src/components/mobile-menu.tsx` | S |
| E2 | **Header brand polish** — icon button with fallback initials styling | modify `src/components/header.tsx` | S |
| E3 | **Contact/Get in touch** — icon in header if `contactUrl` set | modify `src/components/header.tsx` | S |
| E4 | **Embed mode detection** — parse `?embed` param, conditionally hide chrome | modify `src/components/layout.tsx` | S |
| E5 | **Route registration** — wire Agent C's monitor detail route into `index.tsx` | modify `src/index.tsx` | S |
| E6 | **Route registration** — wire Agent D's JSON/Atom feed routes into `index.tsx` | modify `src/index.tsx` | S |
| E7 | **Response caching** — add Cache-Control headers to badge, feed, static routes | modify `src/index.tsx` | S |

---

### Wave 3: Advanced Features (1–2 agents, ~4 hours)

> Lower priority. Can run in parallel with Wave 2 if capacity allows, or after.

| # | Task | File(s) | Agent | Effort |
|---|---|---|---|---|
| F1 | **Status calendar** — month grid with event markers, Alpine.js navigation | `src/components/status-calendar.tsx` | Any | M |
| F2 | **Footer timestamp** — live relative time via Alpine.js `setInterval` | modify `src/components/footer.tsx` | Any | S |
| F3 | **Floating config button** — token-gated settings popover | `src/components/floating-config.tsx` | Any | M |
| F4 | **/llms.txt endpoint** | new route in `index.tsx` | Any | S |
| F5 | **Password-protected pages** (stretch) | new routes + auth logic | Any | L |
| F6 | **Unsubscribe/verify routes** (stretch) | new routes | Any | M |

---

### Parallel Execution Summary

```
Timeline: ───────────────────────────────────────────────────►
          
          Wave 0 (2h, 1 agent)
          ├─ markdown.ts, cache.ts, markdown.tsx
          │
          ├─ Wave 1 (8h, 3 agents parallel)
          │  ├─ Agent A: banner, bar, feed, footer components
          │  ├─ Agent B: collapsible cards, copy-link, events polish
          │  └─ Agent C: SVG charts, monitor detail, monitor list
          │
          ├─ Wave 2 (6h, 3 agents parallel)
          │  ├─ Agent A: home page integration (status-page.tsx, layout.tsx)
          │  ├─ Agent D: popover, JSON/Atom feeds, header trigger
          │  └─ Agent E: mobile menu, header polish, index.tsx wiring
          │
          └─ Wave 3 (4h, 1-2 agents)
             └─ calendar, config button, llms.txt, auth (stretch)

Total elapsed: ~20 hours (2.5 days) with 3 agents
Total effort:   ~12 person-days (same as sequential)
```

### Agent Assignment Matrix

| Agent | Wave 0 | Wave 1 | Wave 2 | Wave 3 | Total Tasks |
|---|---|---|---|---|---|
| Agent A | — | Banner + Bar + Feed + Footer (4 files) | Home integration (4 files) | — | 8 |
| Agent B | — | Collapsible cards + Copy-link + Events polish (2 new + 1 modified) | — | — | 5 |
| Agent C | — | SVG charts + Monitor detail + List (3 new + 1 modified) | — | — | 4 |
| Agent D | — | — | Popover + Feeds + Header trigger (1 new + 3 modified) | — | 4 |
| Agent E | — | — | Mobile menu + Header + Embed + index.tsx wiring (1 new + 3 modified) | Optional | 7 |
| Foundation | ✓ | — | — | — | 3 |

### Risk Mitigation

1. **`index.tsx` merge conflicts** → Agent E is sole integrator. Agents C/D export handler functions; Agent E wires them.
2. **`header.tsx` conflicts** → Non-overlapping regions: Agent D edits the subscribe button area (line ~60-66), Agent E edits the brand area (line ~40-55) and adds mobile menu in actions area (line ~60-70). Can be merged mechanically.
3. **`layout.tsx` conflicts** → Agent A adds footer include near end of body. Agent E adds embed class logic near `<body>` tag. Non-overlapping.
4. **API type mismatches** → All agents use the same tRPC client (`@openstatus/api`). Types are shared. Each agent should run `tsc --noEmit` before merging.
5. **Test consistency** → Each agent runs existing 110 tests after their changes. New tests for new components added in their respective directories.

### Communication Contract Between Agents

**Agents C/D → Agent E (for index.tsx wiring):**

Agent C provides (in `src/routes/monitors.tsx`):
```ts
export async function monitorDetailHandler(c: Context): Promise<Response>;
// Route: GET /monitors/:id
```

Agent D provides (in `src/routes/feed.tsx`):
```ts
export async function jsonFeedHandler(c: Context): Promise<Response>;
export async function atomFeedHandler(c: Context): Promise<Response>;
// Routes: GET /feed/json, GET /feed/atom
```

Agent E adds to `index.tsx` routes array:
```ts
{ method: "GET", subPath: "/monitors/:id", handler: monitorDetailHandler },
{ method: "GET", subPath: "/feed/json",    handler: jsonFeedHandler },
{ method: "GET", subPath: "/feed/atom",    handler: atomFeedHandler },
```
