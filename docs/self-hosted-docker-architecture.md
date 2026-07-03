# Self-Hosted Docker Architecture

> **Status:** Applied to `main` branch as of 2026-06-30.
> Incorporates changes from PR [#2083](https://github.com/openstatusHQ/openstatus/pull/2083).

## Service Topology

```
                          ┌──────────────────────────────────────────────┐
                          │           Docker Network: openstatus          │
                          │                                              │
    ┌─────────────────┐   │  ┌─────────────────┐  ┌──────────────────┐   │
    │     redis        │   │  │   tinybird-local │  │     libsql       │   │
    │  stack-server    │   │  │   :7181 :8123    │  │   :8080 :5001    │   │
    │     :6379        │   │  └────────┬────────┘  └────────┬─────────┘   │
    └────────┬─────────┘   │           │                    │             │
             │             │           │                    │             │
    ┌────────┴─────────┐   │           │                    │             │
    │   redis-http     │   │           │                    │             │
    │  (REST shim)     │   │           │                    │             │
    │   :8079→:80      │   │           │                    │             │
    └──┬──────┬──────┬─┘   │           │                    │             │
       │      │      │     │           │                    │             │
       ▼      ▼      ▼     │           ▼                    ▼             │
  ┌────────┐┌──────┐┌──────┤  ┌─────────────────┐  ┌──────────────────┐   │
  │workflows││server││dash- │  │    checker      │  │ private-location │   │
  │ :3000  ││:3001 ││board │  │    :8082→:8080  │  │    :8081→:8080   │   │
  │        ││      ││:3002 │  │  (public probe) │  │ (ConnectRPC srv) │   │
  └───┬────┘└──┬───┘│      │  └────────┬────────┘  └────────┬─────────┘   │
      │        │    │:3003 │           │                    │             │
      │        │    │status│           │                    │             │
      │        │    │-page │           │              ┌─────┴─────────┐   │
      │        │    └──────┘           │              │private-probe  │   │
      │        │                       │              │(no port)      │   │
      │        │  POST /checker/*      │              │scheduler loop │   │
      │        └───────────────────────┘              └───────────────┘   │
      │                                                                   │
      └───────────── POST /checker/updateStatus ──────────────────────────┘
```

### Port Map

| Service | Internal | External | Protocol |
|---------|----------|----------|----------|
| libsql | 8080, 5001 | 8080, 5001 | SQL |
| tinybird-local | 7181, 8123 | 7181, 8123 | HTTP |
| redis | 6379 | 6379 | Redis |
| redis-http | 80 | 8079 | HTTP (Upstash REST) |
| workflows | 3000 | 3000 | HTTP |
| server | 3000 | 3001 | HTTP |
| checker | 8080 | 8082 | HTTP (Gin) |
| private-location | 8080 | 8081 | HTTP (ConnectRPC) |
| private-probe | — | — | — |
| dashboard | 3000 | 3002 | HTTP |
| status-page | 3000 | 3003 | HTTP |

## Startup Dependency Order

```
                    ┌─────────────┐
                    │   libsql    │
                    └──────┬──────┘
                           │ healthy
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  redis   │ │ tinybird │ │ db-migrate   │
        └────┬─────┘ └────┬─────┘ │(runs once)   │
             │ healthy    │       └──────┬───────┘
             ▼            │              │ completed
       ┌───────────┐      │              ├──────────────────┐
       │ redis-http│      │              │                  │
       └─────┬─────┘      │              │           ┌──────┴──────┐
             │ started    │ healthy      │           │  db-seed    │            │  unlock-    │
             ▼            ▼              ▼           │ (profile:   │            │  self-hosted│
       ┌───────────┐              ┌──────────────┐   │  seed, runs │            │ (profile:   │
       │ workflows │              │ private-loc  │   │  once)      │            │  unlock,    │
       └─────┬─────┘              └──────┬───────┘   └──────┬──────┘            │  runs once) │
             │ healthy                  │ healthy          │                  └──────┬───────┘
    ┌────────┼────────┐        ┌───────┴───────┐
    ▼        ▼        ▼        ▼               ▼
┌───────┐ ┌───────┐ ┌─────────┐         ┌──────────────┐
│server │ │checker│ │dashboard│         │ private-probe│
└───┬───┘ └───────┘ │status-pg│         └──────────────┘
    │                └─────────┘
    │ healthy
    ▼
(all user-facing services ready)
```

## Self-Host Routing (PR #2083 Applied)

In cloud mode, the checker fleet is a set of ~21 Fly.io regions with GCP Cloud Tasks dispatching work. In self-host mode, these are replaced with direct HTTP calls between Docker containers.

### Decision Logic

The system determines self-host mode via `packages/utils/src/self-host.ts`:

```ts
export function isSelfHost(): boolean {
  if (process.env.SELF_HOST === "true") return true;
  // Fallback: treat missing GCP creds as self-host
  return !hasGCPConfig({ ... });
}

export function getCheckerUrl(env: { CHECKER_URL?: string }): string {
  return env.CHECKER_URL || "http://localhost:8080";
}

/** The checker region for self-hosted mode. Returns the input region in cloud mode. */
export function getCheckerRegion(region: string): string {
  if (!isSelfHost()) return region;
  return process.env.CHECKER_REGION || "ams";
}
```

### Affected Files

| File | Behavior in Self-Host |
|------|----------------------|
| `apps/server/src/libs/checker/utils.ts` | `getCheckerUrl()` → `http://checker:8080` instead of `openstatus-checker.fly.dev` |
| `apps/server/src/routes/v1/check/http/post.ts` | Ping endpoints → `http://checker:8080`, drops `fly-prefer-region` header |
| `packages/api/src/router/checker.ts` | `testHttp` / `testTcp` / `testDns` / `triggerChecker` / `generateUrl` all route to local checker |
| `apps/workflows/src/cron/checker.ts` | `sendCheckerTasks()` → `sendCheckerTasksDirect()` when no GCP creds |
| `apps/workflows/src/cron/monitor.ts` | `LaunchMonitorWorkflow()` skips if no GCP creds (lazy `CloudTasksClient` init) |
| `apps/checker/checker/update.go` | `UpdateStatus()` → direct HTTP POST to workflows when no GCP creds |

## Redis Infrastructure

Self-hosted deployments need Redis for rate limiting, caching, and session management.

### Why Two Containers

The codebase uses `@openstatus/upstash` which speaks the **Upstash REST API** (HTTP-based), not raw Redis protocol. A REST-to-Redis shim (`serverless-redis-http`) is required.

```
┌─────────────────────┐
│  Node.js services   │
│  (workflows, server,│
│   dashboard,        │
│   status-page)      │
└──────────┬──────────┘
           │ HTTP (Upstash REST API)
           ▼
┌─────────────────────┐
│    redis-http       │  hiett/serverless-redis-http:latest
│    :8079→:80         │  SRH_MODE=env
│                     │  SRH_CONNECTION_STRING=redis://redis:6379
└──────────┬──────────┘
           │ Redis protocol
           ▼
┌─────────────────────┐
│      redis          │  redis/redis-stack-server:6.2.6-v6
│      :6379          │
└─────────────────────┘
```

### Wired Services

All four Node.js services get runtime overrides via `docker-compose.yaml`:

```yaml
environment:
  - UPSTASH_REDIS_REST_URL=http://redis-http:80
  - UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN:-replace-with-a-long-random-secret}
```

## Checker vs Private-Probe vs Private-Location

These three Go services serve different roles:

| | checker | private-probe | private-location |
|---|---|---|---|
| **Entrypoint** | `cmd/server/main.go` | `cmd/private/main.go` | `cmd/server/main.go` |
| **Module** | `apps/checker` | `apps/checker` | `apps/private-location` |
| **Protocol** | REST (Gin) | ConnectRPC (client) | ConnectRPC (server) |
| **Lifecycle** | HTTP listener | Scheduler loop | HTTP listener |
| **Auth** | `CRON_SECRET` (Basic) | `OPENSTATUS_KEY` (token header) | Validates `openstatus-token` against DB |
| **Receives from** | workflows (POST /checker/*) | private-location (Monitors RPC) | private-probe (Monitors/Ingest RPCs) |
| **Reports to** | workflows (/checker/updateStatus) | private-location (Ingest RPCs) | Tinybird |
| **DB access** | Indirect (via workflows) | None | Direct libsql |
| **Docker image** | `openstatus/checker` | `openstatus/private-probe` | `openstatus/private-location` |
| **Dockerfile** | `apps/checker/Dockerfile` | `apps/checker/Dockerfile.probe` | `apps/private-location/Dockerfile` |

### Checker Data Flow

```
workflows ──POST /checker/http──► checker ──POST /checker/updateStatus──► workflows
                                       │
                                       └──► Tinybird (raw results)
```

### Private Location Data Flow

```
private-probe ──ConnectRPC──► private-location
  (scheduler)     Monitors()    (server)
                  IngestHTTP()
                  IngestTCP()
                  IngestDNS()
                                    │
                                    ├──► libsql (validates token, reads monitors)
                                    └──► Tinybird (analytics)
```

### Bootstrap: Private Location Token

The `OPENSTATUS_KEY` token is generated when a user creates a private location in the dashboard. Steps:

1. `docker compose up -d` — starts all services
2. Open `http://localhost:3002` → create a private location → copy token
3. Set `PRIVATE_LOCATION_TOKEN=<token>` in `.env.docker`
4. `docker compose up -d private-probe` — restarts probe with token
5. Probe fetches monitor configs every 10 minutes from `private-location:8080/Monitors`
6. Probe runs checks locally, reports results to `private-location:8080/Ingest*`

Until step 3, the probe logs: `Failed to fetch monitors: unauthenticated: missing token` — this is expected.

## Environment Variables

### docker-compose.yaml Interpolation

Docker Compose resolves `${VAR}` from shell env or `.env` file. A `.env → .env.docker` symlink is created so compose reads the same file for both interpolation (compose-time) and container env (runtime via `env_file`).

### Self-Host Specific Vars

| Variable | Default | Used By | Purpose |
|----------|---------|---------|---------|
| `SELF_HOST` | `"true"` | dashboard, status-page, workflows | Enables magic-link auth, self-host routing |
| `CHECKER_URL` | `http://checker:8080` | workflows, server, dashboard, status-page | Where to dispatch checker tasks |
| `CHECKER_REGION` | `"self-hosted"` | workflows, server | Region identifier for self-hosted checker (defaults to `"ams"` if unset) |
| `OPENSTATUS_WORKFLOWS_URL` | `http://workflows:3000` | checker, server, private-location | Workflows callback URL |
| `OPENSTATUS_INGEST_URL` | (cloud default) | private-probe | Private-location service URL |
| `PRIVATE_LOCATION_TOKEN` | (empty) | private-probe | Auth token for private-location |
| `UPSTASH_REDIS_REST_URL` | `http://redis-http:80` | workflows, server, dashboard, status-page | Redis REST shim |
| `UPSTASH_REDIS_REST_TOKEN` | `replace-with-a-long-random-secret` | workflows, server, dashboard, status-page | Redis auth token |
| `TINYBIRD_TOKEN` | (from init script) | checker, private-location | Tinybird admin token for event ingestion |
| `TINYBIRD_URL` | `http://tinybird-local:7181` | checker, private-location, server, dashboard, status-page | Tinybird API base URL |
| `TINY_BIRD_API_KEY` | (same as TINYBIRD_TOKEN) | server, dashboard, status-page | Tinybird token for pipe endpoint queries |

### Volume Persistence

| Volume | Mount | Service |
|--------|-------|---------|
| `libsql-data` | `/var/lib/sqld` | libsql |
| `redis-data` | `/data` | redis |
| `workflows-data` | `/app/data` | workflows |
| `tinybird-data` | `/var/lib/clickhouse` | tinybird-local |

## Custom Domains in Self-Hosted Mode

In cloud deployments, custom domains are registered with Vercel's domain API, which
requires DNS verification (TXT records, A/CNAME configuration). In self-hosted mode,
Vercel is not involved — domain registration and verification are skipped entirely.

### Creation-time hosting mode

Status pages can now be created in one of two modes:

- **Subdomain** (default): `{slug}.openstatus.dev` — requires a unique slug.
- **Custom Domain**: User enters e.g. `status.company.com`. An editable
  "Identifier" field lets the user override the internal slug; if left empty it
  is auto-derived from the domain (e.g. `status-company-com`). The `selfHosted`
  column on the `page` table is set to `true`, and `customDomain` is set
  immediately.

The dashboard creation form and onboarding both include a radio toggle to select
the hosting mode. This removes the previous requirement to create a page with
a subdomain first and then switch to a custom domain afterward.

#### Identifier field (custom domain mode)

When creating a page in custom-domain mode, a second editable field appears
below the domain input:

```
Custom Domain: [status.example.com      ]
Identifier:    [status-example-com       ]  ← pre-filled placeholder, editable
```

The **Identifier** is the internal slug used for database lookups and routing.
It defaults to the domain with dots, colons, and special characters replaced by
hyphens (`status.example.com` → `status-example-com`).

The user may:
- Leave it empty — the service auto-derives from the domain.
- Customize it — e.g. set `my-status` for a cleaner internal name.

On the backend, `newPage()` resolves the final slug with this priority:
1. User-provided slug (if non-empty).
2. Auto-derived from `customDomain` via `slugFromDomain()`.
3. Random `page-xxxx` suffix as a last resort.

If the resolved slug collides with an existing page, a random 4-character suffix
is appended (`status-example-com-a3x9`) to prevent insertion failures.

### How it works

1. **Dashboard:** The "Custom Domain" form accepts any valid domain (including
   `localhost:3003`, `subdomain.localhost`, and standard domains). The hardcoded
   `https://` prefix was removed; a plain placeholder (`status.example.com`) is shown.
   The "Refresh Configuration" button and 30-second verification polling are hidden.

2. **API layer (`packages/api/src/router/page.ts`):** `addDomainToVercel` and
   `removeDomainFromVercel` are gated behind `!isSelfHost()` — no Vercel API calls
   are made. The domain is written directly to the database via `updatePageCustomDomain`.

3. **Domain router (`packages/api/src/router/domain.ts`):** All three Vercel
   verification queries (`getDomainResponse`, `getConfigResponse`, `verifyDomain`)
   return synthetic responses when `isSelfHost()` is true:
   - `getDomainResponse` → `{ verified: true }`
   - `getConfigResponse` → `{ misconfigured: false }`
   - `verifyDomain` → `{ verified: true }`

4. **UI (`domain-configuration.tsx`):** When status is `"Verification Skipped"`,
   the DNS A/CNAME/TXT record configuration steps are replaced with a simple
   confirmation card explaining that domain verification is not required in
   self-hosted mode.

### Reverse Proxy Configuration

Custom domains are resolved by the status-page app via the `Host` header
(`apps/status-page/src/lib/domain.ts`). You must configure your reverse proxy to
route traffic for the custom domain to the `status-page` container (port 3003).

Example nginx configuration:

```nginx
server {
    listen 80;
    server_name status.yourdomain.com;
    location / {
        proxy_pass http://localhost:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### Affected source files

| File | Change |
|------|--------|
| `packages/db/src/schema/pages/page.ts` | Added `self_hosted` boolean column (default `false`). Set to `true` when page is created with custom domain mode. |
| `packages/db/src/schema/pages/validation.ts` | `customDomainSchema` regex relaxed to accept `localhost`-family domains with optional ports. Added `selfHosted` to insert/select schemas. |
| `packages/services/src/page/create.ts` | `newPage()` auto-generates slug from domain when `selfHosted`, sets `customDomain` and `selfHosted` immediately. |
| `packages/services/src/page/schemas.ts` | `NewPageInput` accepts optional `selfHosted` and `customDomain` fields. |
| `packages/api/src/router/page.ts` | Vercel `addDomainToVercel` / `removeDomainFromVercel` gated behind `!isSelfHost()`. `page.new` accepts `selfHosted` + `customDomain`. |
| `packages/api/src/router/domain.ts` | All Vercel verification queries return synthetic `verified: true` in self-hosted mode |
| `apps/dashboard/src/components/domains/domain-configuration.tsx` | Shows "Verification skipped" card instead of DNS steps |
| `apps/dashboard/src/components/domains/use-domain-status.ts` | Detects synthetic self-hosted response → `"Verification Skipped"` status |
| `apps/dashboard/src/components/domains/domain-status-icon.tsx` | Added chevron-right icon for skipped status |
| `apps/dashboard/src/components/forms/status-page/form-custom-domain.tsx` | Hides refresh button + polling when verification is skipped |
| `apps/dashboard/src/components/forms/status-page/form-general.tsx` | Added radio toggle (Subdomain / Custom Domain) at page creation |
| `apps/dashboard/src/components/forms/onboarding/create-page.tsx` | Same toggle in onboarding flow |
| `apps/dashboard/src/app/onboarding/_steps/step-2.tsx` | Updated locked summary for custom-domain pages |
| `apps/dashboard/src/app/onboarding/client.tsx` | Passes `selfHosted` + `customDomain` through mutation |
| `apps/dashboard/src/app/(dashboard)/status-pages/create/client.tsx` | Passes `selfHosted` + `customDomain` through mutation |

### Migration troubleshooting

The `db-migrate` service uses `drizzle-kit migrate` which tracks applied migrations
in a `__drizzle_migrations` table. If a migration is recorded as applied but its SQL
wasn't executed (e.g. the libsql container was recreated with a fresh volume while
the `__drizzle_migrations` table was restored from a dump), the migrator silently
skips it.

**Symptom:** `SQLite error: table page has no column named self_hosted` when using
new features, despite `db-migrate` logs showing "Migrated successfully".

**Fix:** Apply the migration SQL directly via the libsql HTTP API:

```sh
curl -s -X POST "http://localhost:8080/v2/pipeline" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"ALTER TABLE page ADD self_hosted integer DEFAULT false NOT NULL"}}]}'
```

To reset migration tracking entirely (fresh start):

```sh
docker compose down -v   # removes volumes including libsql-data
docker compose up -d     # recreates everything from scratch, migration reruns cleanly
```

## Docker Build Matrix

| Image | Context | Dockerfile | Runtime |
|-------|---------|------------|---------|
| `openstatus/checker` | `apps/checker` | `Dockerfile` | `alpine:3.21` |
| `openstatus/private-probe` | `apps/checker` | `Dockerfile.probe` | `alpine:3.21` |
| `openstatus/workflows` | `.` | `apps/workflows/Dockerfile` | `debian:bullseye-slim` |
| `openstatus/server` | `.` | `apps/server/Dockerfile` | `debian:bullseye-slim` |
| `openstatus/dashboard` | `.` | `apps/dashboard/Dockerfile` | `debian:bullseye-slim` |
| `openstatus/status-page` | `.` | `apps/status-page/Dockerfile` | `debian:bullseye-slim` |
| `openstatus/private-location` | `apps/private-location` | `Dockerfile` | `alpine:3.21` |

## PR #2083 Application Summary

The original PR was **not merged**, but equivalent or adapted changes were applied:

| PR Change | Status | Adaptation |
|-----------|--------|------------|
| `isSelfHost()`, `getCheckerUrl()`, `getCheckerRegion()` in `packages/utils` | ✅ Applied | Added to `packages/utils/src/self-host.ts` |
| Self-host routing in `apps/server/src/libs/checker/utils.ts` | ✅ Applied | Uses `isSelfHost()` + `getCheckerUrl({ CHECKER_URL: process.env.CHECKER_URL })` |
| Self-host routing in `apps/server/src/routes/v1/check/http/post.ts` | ✅ Applied | Conditional URL + drops `fly-prefer-region` header |
| Self-host routing in `packages/api/src/router/checker.ts` | ✅ Applied | All 5 functions (testHttp, testTcp, testDns, triggerChecker, generateUrl) |
| Lazy GCP client + self-host guard in `apps/workflows/src/cron/monitor.ts` | ✅ Applied | `hasGCPConfig()` guard, lazy `CloudTasksClient` init |
| Self-host dispatch in `apps/workflows/src/cron/checker.ts` | ⚠️ Pre-existing | Already had `sendCheckerTasksDirect()` with Effect-based retry |
| Go direct HTTP in `apps/checker/checker/update.go` | ⚠️ Pre-existing | Already had `hasGCPConfig()` + direct HTTP path |
| `SELF_HOST` in `apps/workflows/src/env.ts` | ✅ Applied | Added |
| Redis + redis-http in `docker-compose.yaml` | ✅ Applied | Added both services + wired env vars |
| Checker + private-probe in `docker-compose.yaml` | ✅ Applied | Added both services |
| `PRIVATE_LOCATION_TOKEN` in `.env.docker.example` + `.env.docker` | ✅ Applied | Added placeholder |
| `.env` symlink to `.env.docker` | ✅ Applied | Eliminates compose interpolation warnings |

## Self-Hosted Feature Limits

By default, seeded workspaces use plan-level limits (e.g., the seed sets workspace 1 to the
"team" plan). In self-hosted deployments there is no paid tier — all features should be
available with generous limits.

The `unlock-self-hosted` profile updates every workspace to the "scale" plan and sets permissive
limits (9999 monitors, all regions, all notification providers, all add-on features enabled).

```bash
# After seeding, unlock all features:
docker compose --profile unlock run unlock-self-hosted
```

| Service | Profile | Purpose |
|---------|---------|---------|
| `db-seed` | `seed` | Populate initial workspace, monitors, status pages, notifications |
| `unlock-self-hosted` | `unlock` | Set plan=scale and max limits on all workspaces |

## Verification

```bash
# Start all 15 containers (11 runtime services + 3 one-shot + 1 seed profile)
docker compose up -d

# Check status — all should be healthy
docker compose ps

# Verify migration applied (self_hosted column exists)
curl -s -X POST "http://localhost:8080/v2/pipeline" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"PRAGMA table_info(page)"}}]}' \
  | python3 -c "import json,sys; r=json.load(sys.stdin); cols=[row[1] for row in r['results'][0]['response']['result']['rows']]; print('OK' if 'self_hosted' in cols else 'MIGRATION MISSING: run docker compose up db-migrate')"

# Seed the database
# (Without profiles, docker compose up -d only starts runtime services)
docker compose --profile seed run db-seed

# Unlock all features for self-hosted
docker compose --profile unlock run unlock-self-hosted

# Access services
open http://localhost:3002   # Dashboard
open http://localhost:3003   # Status Page

# Check probe logs (expected to show "unauthenticated" until token set)
docker logs openstatus-private-probe
```
