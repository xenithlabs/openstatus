# Tinybird Self-Hosted Deployment Gap Analysis

## Status: RESOLVED (2026-06-29)

The gaps documented below have been addressed with:
- `scripts/tinybird-self-hosted-init.sh` — a fully Docker-based init script that extracts the admin token, installs `tinybird-cli` (pinned to `python:3.12-slim`), and pushes datasources, pipes, and endpoints in the correct order
- `docs/tinybird-self-hosted-deployment.md` — comprehensive deployment guide with troubleshooting, verification checklist, and both one-shot script and Docker Compose init service approaches
- Schema fix: `tcp_response.datasource` updated to match `tcp_response__v0.datasource` (both 13 columns with `id` and `requestStatus`)

## Original Gap Analysis (retained for context)

The self-hosted Docker Compose files start a `tinybird-local` container, but **nothing deploys the 55 datasources, 46 pipes, and 107 endpoints** into it. The container comes up empty. No script, init container, or documentation tells the self-hoster how to populate it. The result: the Tinybird container runs but produces no analytics — all dashboard charts, status page uptime metrics, and response-time graphs show nothing.

---

## What Exists

### The Tinybird Project (`packages/tinybird/`)

| Artifact | Count | Purpose |
|----------|-------|---------|
| Datasources (`datasources/*.datasource`) | 54 | Schema definitions for raw data + materialized views |
| Pipes (`pipes/*.pipe`) | 46 | Aggregation/transformation SQL (materialized into mv__* datasources) |
| Endpoints (`endpoints/*.pipe`) | 106 | HTTP API endpoints consumed by dashboard/status-page/server |
| Fixtures (`datasources/fixtures/`) | 0 (empty) | Test data — removed from repo |
| `.tinyb` config | 1 file | Local dev config pointing to `http://localhost:7181` |
| `DEPLOY.md` | 1 file | Instructions for local dev: `tb push datasources/`, `tb push pipes/`, `tb push endpoints/` |
| `scripts/append_fixtures.sh` | 1 file | Appends fixture CSVs/NDJSON to local datasources |

### The Runtime Integration (`packages/tinybird/src/client.ts`)

- `OSTinybird` class wraps `@chronark/zod-bird` Tinybird client
- Uses `process.env.TINYBIRD_URL` to connect
- Falls back to `NoopTinybird` when no token is set — **pipes resolve empty rather than throwing errors**
- This means the app won't crash, but analytics will be silently empty

### Docker Compose

- Starts `tinybirdco/tinybird-local:latest` container (portal at `:7181`, ClickHouse native at `:8123`)
- Sets `COMPATIBILITY_MODE=1`
- Health check: `curl -f http://localhost:7181/`
- **No init container, no deploy script, no `tb push` anywhere**

---

## The Gap: 7 Specific Problems

### 1. No Deployment Automation

There is **no `tinybird-init` service** in any docker-compose file. Compare with `db-migrate`:

```yaml
# THIS EXISTS — libsql gets migrations:
db-migrate:
    image: oven/bun:1.3.6
    command: ["sh", "-c", "bun install && bun run migrate"]
    depends_on:
        libsql:
            condition: service_healthy

# THIS IS MISSING — Tinybird stays empty:
# tinybird-init:
#     image: python:3-slim  # or any image with tb CLI
#     command: ["sh", "-c", "pip install tinybird-cli && tb push ..."]
#     depends_on:
#         tinybird-local:
#             condition: service_healthy
```

### 2. Admin Token Discovery Problem

`tinybirdco/tinybird-local:latest` generates a fresh admin token on first start. The `.tinyb` file in the repo has hardcoded tokens for local dev only:

```json
{
    "host": "http://localhost:7181",
    "token": "p.eyJ1...W7AmvRxDRIHcyVJFmH7XbsRqgxdW264aTjg9AO8-SZc",
    "tokens": {
        "http://localhost:7181": "p.eyJ1...",
        "http://openstatus-tinybird:7181": "p.eyJ1..."
    }
}
```

These tokens will NOT work with a fresh container. The self-hoster must:
1. Start the container
2. Extract the admin token (from container logs or API)
3. Create a `.tinyb` config
4. Only then can they run `tb push`

There is no documentation for any of these steps.

### 3. Hostname Inconsistency

The Tinybird service is named differently across compose files, and the `.tinyb` has no matching token entry:

| File | Service Name | Container Name | TINYBIRD_URL | `.tinyb` Has Token For This? |
|------|-------------|----------------|--------------|------------------------------|
| `docker-compose.yaml` | `tinybird-local` | `openstatus-tinybird` | `http://tinybird-local:7181` | **No** |
| `docker-compose.github-packages.yaml` | `tinybird-local` | `openstatus-tinybird` | `http://tinybird-local:7181` | **No** |
| `coolify-deployment.yaml` | `tinybird` | `openstatus-tinybird` | `http://tinybird:7181` | **No** |
| `.tinyb` (local dev) | — | — | `http://localhost:7181` | Yes |
| `.tinyb` (Docker) | — | — | `http://openstatus-tinybird:7181` | Yes |

### 4. Push Order Dependency

Tinybird has a strict dependency chain: **datasources → pipes → endpoints**. Pipes reference datasources; endpoints reference materialized views created by pipes. If the order is wrong, `tb push` fails.

The `DEPLOY.md` documents this:
```sh
tb push datasources/ --force --yes   # must go first
tb push pipes/ --force --yes         # depends on datasources
tb push endpoints/ --force --yes     # depends on pipes
```

Any automation must preserve this order.

### 5. Token Required at Runtime

The app runtime needs a Tinybird token to query pipes. The `TINY_BIRD_API_KEY` env var is referenced in `turbo.json` and `.env.docker.example` but:

- The `tinybird-local` container's admin token is not automatically injected
- No script extracts the token and sets it as an env var
- Without it, `OSTinybird` silently falls back to `NoopTinybird` (empty responses)

The `.tinyb` tokens in the repo work for local development with `tb local start` (which uses a known seed), but a fresh `tinybirdco/tinybird-local:latest` container generates different tokens.

### 6. No Documentation for Self-Hosters

The self-hosting guides mention Tinybird only as optional infrastructure:

- `COOLIFY_SETUP.md`: "TinyBird (Optional)" — shows image name and port, zero deployment steps
- `COOLIFY_DEPLOYMENT.md`: mentions `TINYBIRD_URL` env var, no push instructions
- `COOLIFY_ENVIRONMENT_GUIDE.md`: lists `TINY_BIRD_API_KEY` and `TINYBIRD_URL`, no further guidance
- `.env.docker.example`: "Tinybird (optional - for monitor analytics and charts) / Leave empty to disable analytics features"

A self-hoster who sets `TINY_BIRD_API_KEY` to a value and points `TINYBIRD_URL` to the container will still get empty analytics because no pipes exist.

### 7. Fixtures / Seed Data Gap

The `datasources/fixtures/` directory is empty (no CSV/NDJSON files in the repo). For local dev, `scripts/append_fixtures.sh` would push them but there's nothing to push. There's no seed data to verify the deployment worked.

---

## What a Self-Hoster Must Do Manually Today

To get Tinybird working in self-hosted mode, a user must:

```sh
# 1. Start the stack
docker compose up -d

# 2. Wait for tinybird-local to be healthy
docker compose ps tinybird-local

# 3. Extract the admin token from container logs
docker logs openstatus-tinybird 2>&1 | grep -i "admin token"
# Or use the API:
# curl http://localhost:7181/v0/tokens

# 4. Install Tinybird CLI
pip install tinybird-cli

# 5. Authenticate tb to the container
tb auth --host http://localhost:7181 --token <extracted-token>

# 6. Push the project (must be in packages/tinybird directory)
cd packages/tinybird
tb push datasources/ --force --yes
tb push pipes/ --force --yes
tb push endpoints/ --force --yes

# 7. Set the token as env var and restart dependent services
# TINY_BIRD_API_KEY=<extracted-token>
docker compose up -d server dashboard status-page
```

This 7-step manual process is not documented anywhere.

---

## Recommended Fix

### Option A: Init Container (Recommended)

Add a `tinybird-init` service to all docker-compose files, modeled after `db-migrate`:

```yaml
tinybird-init:
    container_name: openstatus-tinybird-init
    image: ghcr.io/openstatushq/tinybird-init:latest
    # OR: python:3-slim with tb CLI installed at build time
    networks:
        - openstatus
    volumes:
        - ./packages/tinybird:/project
    env_file:
        - .env.docker
    environment:
        - TB_HOST=http://tinybird-local:7181
    command:
        - sh
        - -c
        - |
            # Wait for Tinybird to be healthy and token to be available
            # Extract admin token
            # Run: tb push datasources/ pipes/ endpoints/
    depends_on:
        tinybird-local:
            condition: service_healthy
    restart: "no"
```

### Option B: Build-Time Bake-In

Create a custom Dockerfile that extends `tinybirdco/tinybird-local` and bakes the project files + token into the image at build time.

### Option C: Document the Manual Process

At minimum, add step-by-step instructions to `COOLIFY_SETUP.md`, `COOLIFY_DEPLOYMENT.md`, and a new `SELF_HOSTED_TINYBIRD.md` documenting:
1. How to extract the admin token
2. How to install and configure `tb` CLI
3. The exact `tb push` commands in the correct order
4. How to set `TINY_BIRD_API_KEY` in `.env.docker`
5. How to verify the deployment worked

---

## Impact of Not Fixing

Without Tinybird datasources/pipes/endpoints deployed:

| Feature | Impact |
|---------|--------|
| Dashboard response-time charts | Empty (no data) |
| Status page uptime widgets | Show 0% or empty |
| Latency percentile graphs | Empty |
| Regional performance maps | Empty |
| Response time history | No data |
| Incident timeline analytics | No data |
| DNS/TCP monitoring analytics | No data |
| External status aggregation | No data |

The app itself runs — monitors still execute and incidents still fire — but **all analytics, charts, and historical data are invisible**. The self-hosted deployment is functionally degraded to "alerting only, no dashboards."
