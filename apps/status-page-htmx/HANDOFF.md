# Session Handoff — status-page-htmx

**Date:** 2026-07-15  
**Branch:** `openstatus-self-hosted`  
**Commits:** `2c245c79e` (app) + `b43dc4d87` (fix)

---

## What was built

A new status page app at `apps/status-page-htmx` that replaces Next.js + React
with **Hono + HTMX + Alpine.js + Tailwind CSS v4**, while reusing the existing
tRPC API (`@openstatus/api`) for data.

```
Stack: Hono (Bun) → tRPC → @openstatus/api
       HTMX (navigation/forms) + Alpine.js (toggles/tabs/theme)
       Tailwind CSS v4 (standalone CLI)
```

### Routes (11 total)

```
GET  /ping                                    → Health check
GET  /                                        → Custom-domain home (no redirect)
GET  /events                                  → Incident history (Alpine year tabs)
GET  /events/:yearMonth                       → Month detail
GET  /events/report/:id                       → Report detail
GET  /events/maintenance/:id                  → Maintenance detail
GET  /monitors                                → Monitor list
GET  /subscribe                               → Subscribe form (GET)
POST /subscribe                               → Subscribe action (HTMX POST)
GET  /badge                                   → SVG status badge
GET  /feed                                    → RSS feed
```

All routes work both via path (`/:domain/:locale/...`) and custom domain (`/`).

### Tests: 110 tests, 0 failures

```
test/unit/          domain.test.ts (14), date.test.ts (17), theme.test.ts (5)
test/integration/   home.test.ts, events.test.ts, badge.test.ts,
                    errors.test.ts (34 total)
test/comparison/    rendering-verify.test.tsx (26), home-comparison.test.ts (6 skipped)
```

---

## Key design decisions

1. **tRPC, not direct DB** — Reuses `@openstatus/api` AppRouter. No duplicate business logic.
2. **Custom domain support** — `domainMiddleware` resolves slug from `Host` header. Full host returned for custom domains (not just first segment). SaaS subdomains (*.stpg.dev, *.openstatus.dev) extract first segment.
3. **PAGE_SLUG env var** — Optional override to force a specific page slug, ignoring host header.
4. **Clean URLs on custom domains** — `getPrefix()` returns `""` for custom-domain access and `/<domain>/<locale>` for path-based. Links are relative (`/events`, `/subscribe`).
5. **Dual-route architecture** — Each route registered twice: once under `/:domain/:locale/...` and once directly at `/...` for custom-domain access.
6. **Debug logging** — `LOG_LEVEL=debug` enables per-request traffic logging and tRPC procedure tracing via `src/lib/logger.ts`.
7. **OpenAI/incident.io design** — Card-based layout, status dots, SVG bar charts, Alpine collapsible groups.

---

## Files (27 source, 9 test, 5 infra)

```
apps/status-page-htmx/
├── Dockerfile
├── package.json, tsconfig.json
├── src/
│   ├── index.tsx              # Entrypoint + dual-route registration
│   ├── env.ts, types.ts
│   ├── components/            # 11 components
│   │   ├── layout.tsx, header.tsx, icons.tsx
│   │   ├── status-banner.tsx, bar-chart.tsx
│   │   ├── component-row.tsx, system-status.tsx
│   │   ├── incident-history.tsx, incident-detail.tsx
│   │   ├── subscribe-form.tsx, theme-toggle.tsx
│   ├── lib/                   # 6 utilities
│   │   ├── trpc.ts, domain.ts, prefix.ts
│   │   ├── theme.ts, date.ts, logger.ts
│   └── routes/                # 7 route files
│       ├── status-page.tsx, events.tsx, monitors.tsx
│       ├── subscribe.tsx, badge.tsx, feed.tsx, zone.tsx
├── static/                    # htmx.min.js, alpine.min.js, styles.css
└── test/                      # 9 test files (110 tests)
scripts/
├── Dockerfile.compare         # Comparison test runner
└── compare-status-pages.sh    # Orchestration script
```

Modified existing files:
- `docker-compose.yaml` — Added `status-page-htmx`, `status-page-compare`, `status-page-htmx-test` services under `comparison`/`test` profiles + Traefik labels
- `turbo.json` — Added `@openstatus/status-page-htmx#dev` and `#build` tasks
- `package.json` — Added `dev:status-page-htmx` script
- `apps/status-page/src/lib/trpc/shared.ts` — Fixed Bun `typeof fetch` type mismatch
- `apps/dashboard/src/lib/trpc/shared.ts` — Same fix

---

## Docker

```sh
# Start the HTMX status page (with comparison profile)
docker compose --profile comparison up -d status-page-htmx

# Run tests inside Docker
docker compose --profile test up --build --abort-on-container-exit

# Head-to-head comparison
./scripts/compare-status-pages.sh
```

Live: `https://status-htmx.openstat.us/` (serves "HTMX Status" page, matched by `customDomain`)

---

## What's left / next steps

### Feature gaps vs Next.js status-page

| Feature | Priority | Notes |
|---|---|---|
| `/monitors/:id` detail page | Medium | List page exists, detail not implemented |
| Unsubscribe / verify routes | Low | Planned skip from original plan (task #34) |
| `/llms.txt` endpoint | Low | Next.js has it, HTMX doesn't |
| Password-protected pages | Low | Auth routes in Next.js `(auth)/` group |
| Embed mode support | Low | Next.js detects `?embed` param |
| Floating manage button | Low | Token-gated owner button |

### Infrastructure

| Task | Priority | Notes |
|---|---|---|
| Comparison test seed data | Medium | Seed script for known test workspace not written |
| End-to-end Docker compose comparison | Medium | Profiles work but full pipeline not tested |
| `plugins` directory | Low | Currently unused, can be removed |
| TypeScript diagnostics | ✅ Done | 11 pre-existing errors fixed (2026-07-15) |

### Potential improvements

| Idea | Notes |
|---|---|
| Multi-locale support | Currently English-only; `src/routes/zone.tsx` validates locale but only "en" accepted |
| Static asset hashing | `static/styles.css` could use content-hash for cache busting |
| Response caching | Add `Cache-Control` headers for static pages |
| Error page consistency | 404/500 pages are functional but could be polished |
| Alpine.js CDN → local | Currently using CDN in dev (`unpkg.com`); Docker uses local copies |

---

## Gap Analysis & Implementation Plan

A comprehensive gap analysis comparing status-page-htmx against the Next.js
status-page and status.openai.com was completed on 2026-07-15.

### Key Artifacts

| File | Purpose |
|---|---|
| `GAP_ANALYSIS.md` | Full comparison matrix, gap analysis by component layer, JS effects inventory, design plan, 24-task phased plan |
| `scripts/waves.sh` | Validation orchestrator — `check`, `status`, `conflicts`, `files` |
| `scripts/agents/` | Per-agent session scripts (8 agents) — cats brief + audits files + runs tests |
| `scripts/briefs/` | Self-contained .md task descriptions — full context for each pi agent session |
| `scripts/lib/` | Shared shell functions — `colors.sh`, `audit.sh` with `agent_main()` |
| `scripts/README.md` | Script reference, progress tracker, merge conflict documentation |
| `.pi/skills/openstatus-waves/` | Reusable skill for gap analysis → wave planning → brief writing → execution |

### Current State (2026-07-15)

- ✅ **TypeScript:** 0 errors across all status-page-htmx source files (11 fixed)
- ✅ **Tests:** 104 pass, 0 fail, 6 skip
- ✅ **Wave 0:** Foundation complete (`lib/markdown.ts`, `lib/cache.ts`, `components/markdown.tsx`)
- ✅ **Wave 1A:** Complete — StatusBanner (tabs), StatusBar (hover), StatusFeed, Footer
- 🔲 **Wave 1B:** Pending — Collapsible incident cards, Copy-link, Events polish
- 🔲 **Wave 1C:** Pending — SVG charts, Monitor detail page, Monitor list enhancement
- 🔲 **Waves 2-3:** 9 tasks across 4 agents remaining
- 📊 **Progress:** 7/16 files (43%)

### Running Agent Sessions

```sh
cd apps/status-page-htmx

# Each agent runs in their own terminal:
./scripts/agents/wave1-b.sh     # Agent B: Events & Incidents
./scripts/agents/wave1-c.sh     # Agent C: Monitors
./scripts/agents/wave2-a.sh     # Agent A (wave 2): Home Integration (partial)
./scripts/agents/wave2-d.sh     # Agent D: Subscribe & Feeds
./scripts/agents/wave2-e.sh     # Agent E: Layout Chrome (integrator)
./scripts/agents/wave3.sh       # Advanced Features

# Full validation:
./scripts/waves.sh check         # TS + tests + file audit
./scripts/waves.sh status        # Progress overview
```
