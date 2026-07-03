# Docker Setup Guide

Complete guide for running OpenStatus with Docker.

> **Updated 2026-07-02:** The full deployment includes 14 services — 11 runtime
> services plus 3 one-shot profiles (db-migrate, db-seed, unlock-self-hosted).
> See **[docs/self-hosted-docker-architecture.md](docs/self-hosted-docker-architecture.md)**
> for the complete architecture reference.

## Quick Start

```bash
# 1. Copy environment file
cp .env.docker.example .env.docker

# 2. Configure required variables (see Configuration section)
vim .env.docker

# 3. Create .env symlink for docker compose variable interpolation
ln -sf .env.docker .env

# 4. Build and start all services
export DOCKER_BUILDKIT=1
docker compose up -d

# 5. Check service health — all should show "healthy"
docker compose ps

# 6. Deploy Tinybird analytics (required for dashboards and charts)
chmod +x scripts/tinybird-self-hosted-init.sh
./scripts/tinybird-self-hosted-init.sh
# Copy the printed admin token into .env.docker as TINY_BIRD_API_KEY and TINYBIRD_TOKEN
# Then recreate services: docker compose up -d private-location checker server dashboard status-page

# 7. Seed database with test data
docker compose --profile seed run db-seed

# 8. Unlock all features (sets scale plan + max limits on all workspaces)
docker compose --profile unlock run unlock-self-hosted

# 9. Access the application
open http://localhost:3002  # Dashboard
open http://localhost:3003  # Status Page
```

## Cleanup

```bash
# Remove stopped containers
docker compose down

# Remove volumes
docker compose down -v

# Clean build cache
docker builder prune
```

## Services

| Service | Port | Purpose |
|---------|------|---------|
| db-migrate | — | One-shot: runs database migrations at startup |
| db-seed | — | One-shot (profile: seed): seeds test data |
| unlock-self-hosted | — | One-shot (profile: unlock): unlocks all features |
| workflows | 3000 | Background jobs + cron scheduling |
| server | 3001 | API backend (tRPC) |
| dashboard | 3002 | Admin interface |
| status-page | 3003 | Public status pages |
| checker | 8082 | Public probe (runs HTTP/TCP/DNS checks) |
| private-location | 8081 | Private monitor orchestrator (ConnectRPC) |
| private-probe | — | Private probe scheduler (no exposed port) |
| libsql | 8080 | Database (HTTP) |
| libsql | 5001 | Database (gRPC) |
| tinybird-local | 7181 | Analytics (ClickHouse-backed) |
| redis | 6379 | Caching + rate limiting |
| redis-http | 8079 | Upstash REST API shim for Redis |


## Architecture

```
                        ┌─────────────────────────┐
                        │     Tinybird Local       │
                        │  (Analytics / ClickHouse) │
                        │         :7181            │
                        └──────▲──────────▲────────┘
                               │          │
              ┌────────────────┘          └────────────────┐
              │                                            │
┌─────────────┴──┐  ┌─────────────┐  ┌─────────────┐     │
│ private-location│◀─│private-probe│  │   checker   │─────┘
│  (ConnectRPC)  │  │ (scheduler) │  │ (Gin HTTP)  │
│    :8081       │  │  (no port)  │  │   :8082     │
└───────┬────────┘  └─────────────┘  └──────▲──────┘
        │                                    │
        │  libsql                            │ POST /checker/*
        ▼                                    │
┌─────────────┐                     ┌────────┴───────┐
│   LibSQL    │                     │   Workflows    │
│  (Database) │◀────────────────────│    (Bun)       │
│ :8080 :5001 │                     │    :3000       │
└─────────────┘                     └───────┬────────┘
                                            │
                      ┌─────────────────────┼──────────────────┐
                      │                     │                  │
                      ▼                     ▼                  ▼
              ┌──────────────┐    ┌──────────────┐   ┌──────────────┐
              │    Server    │    │  Dashboard   │   │  Status Page │
              │   (Bun/tRPC) │    │  (Next.js)   │   │  (Next.js)   │
              │    :3001     │    │    :3002     │   │    :3003     │
              └──────────────┘    └──────────────┘   └──────────────┘
                      │                     │                  │
                      └─────────────────────┼──────────────────┘
                                            │
                                     ┌──────┴──────┐
                                     │ redis-http  │
                                     │  (REST shim)│
                                     │   :8079     │
                                     └──────┬──────┘
                                            │
                                     ┌──────┴──────┐
                                     │    redis    │
                                     │   :6379     │
                                     └─────────────┘
```

**Data flows:**
- **Public monitoring:** `workflows → checker → Tinybird` (checker also POSTs status updates back to workflows)
- **Private monitoring:** `private-probe → private-location → Tinybird + LibSQL` (probe fetches config from private-location every 10min)
- **Dashboard/Status Page:** `Next.js → server (tRPC) → LibSQL + Tinybird endpoints`

## Which Compose File?

OpenStatus ships three Docker Compose files for different needs:

| File | When to use | Builds? | Includes |
|------|-------------|---------|----------|
| `docker-compose.yaml` | Full deployment (recommended) | ✅ From source | All 14 services (11 runtime + 3 one-shot) |
| `docker-compose-lightweight.yaml` | Quick demo: dashboard + status-page only | ✅ From source | libsql, dashboard, status-page. No analytics, probes, or caching |
| `docker-compose.github-packages.yaml` | Production with pre-built images | ❌ Pulls from ghcr.io | libsql, tinybird, workflows, server, checker, dashboard, status-page |

To use a different file:
```bash
docker compose -f docker-compose-lightweight.yaml up -d
```

## Database Setup

### Automatic Migrations

Migrations run **automatically** when you start the stack via the `db-migrate` one-shot
service. It applies all pending migrations before any runtime service starts.

**Verifying migrations:**
```bash
# Check db-migrate logs for migration output
docker compose logs db-migrate

# Should show:
# openstatus-db-migrate  | Running migrations
# openstatus-db-migrate  | Migrated successfully
```

**Re-running migrations:**
```bash
docker compose run db-migrate
```

### Seeding Test Data (Optional)

**Note:** Migrations run automatically, but seeding does **not**. You must manually seed the database if you want test data.

After migrations complete, seed the database with sample data:

```bash
docker compose --profile seed run db-seed
```

This creates:
- 3 workspaces (`love-openstatus`, `test2`, `test3`)
- 5 sample monitors and 1 status page with slug `status`
- Test user account: `ping@openstatus.dev`
- Sample incidents, status reports, and maintenance windows

**After seeding, unlock all features** (self-hosted only):

Seeded workspaces use plan-level limits (workspace 1 gets the "team" plan).
Unlock sets every workspace to the "scale" plan with generous limits:

```bash
docker compose --profile unlock run unlock-self-hosted
```

This enables custom domains, all notification providers, private locations,
unlimited monitors, and every add-on feature (white-label, IP restriction,
email-domain auth, no-index).

**Verifying seeded data:**
```bash
# Check table counts via libsql HTTP API
curl -s http://localhost:8080/ -H "Content-Type: application/json" \
  -d '{"statements":["SELECT COUNT(*) FROM page"]}' | jq -r '.[0].results.rows[0][0]'

# Should output: 1
```

**Accessing Seeded Data:**

After seeding, you can access the test data:

**Dashboard:**
1. Navigate to http://localhost:3002/login
2. Use magic link authentication with email: `ping@openstatus.dev`
3. Check your console/logs for the magic link (with `SELF_HOST=true` in `.env.docker`)
4. After logging in, you'll see the `love-openstatus` workspace with all seeded monitors and status page

**Status Page:**
- The seeded status page has slug `status`
- Access it via subdomain routing: http://status.localhost:3003
- Or view theme explorer at: http://localhost:3003

**If you use a different email address**, the system will create a new empty workspace for you instead of showing the seeded data. To access seeded data with a different account, you must add your user to the seeded workspace using SQL:

  ```bash
  # First, find your user_id
  curl -X POST http://localhost:8080/ -H "Content-Type: application/json" \
    -d '{"statements":["SELECT id, email FROM user"]}'

  # Then add association (replace USER_ID with your id)
  curl -X POST http://localhost:8080/ -H "Content-Type: application/json" \
    -d '{"statements":["INSERT INTO users_to_workspaces (user_id, workspace_id, role) VALUES (USER_ID, 1, '\''owner'\'')"]}'
  ```


## Tinybird Setup

Tinybird powers all analytics — charts, uptime percentages, latency percentiles, and regional performance maps. Without it, dashboards and status pages show empty analytics.

### Quick Setup (One Command)

```bash
chmod +x scripts/tinybird-self-hosted-init.sh
./scripts/tinybird-self-hosted-init.sh
```

This script (runs entirely inside Docker — no local tools needed):
1. Waits for the `tinybird-local` container to be healthy
2. Extracts the local admin token via the `/tokens` API
3. Pushes all 54 datasources, 45 pipes, and 106 endpoints from `packages/tinybird/`
4. Prints the admin token — **copy this into `.env.docker`**

After the script completes:
```bash
# Update .env.docker with the printed token:
TINY_BIRD_API_KEY=p.eyJ1...   # from script output
TINYBIRD_TOKEN=p.eyJ1...       # same token (used by Go services)
TINYBIRD_URL=http://tinybird-local:7181

# Recreate services to pick up the new token:
docker compose up -d private-location checker server dashboard status-page
```

### Data Persistence

The `tinybird-local` container stores all data at `/var/lib/clickhouse/`, which is backed by the `tinybird-data` Docker volume. This persists:
- All ingested monitoring data (pings, metrics)
- All datasource schemas and materialized views
- Runtime configuration and tokens

Data survives `docker compose down` but is removed by `docker compose down -v`.

### Token Management

The admin token printed by the init script has full Tinybird permissions. For production, you can create a scoped read-only token:

```bash
docker run --rm --network openstatus \
  -v $(pwd)/packages/tinybird:/project -w /project \
  -e TB_HOST=http://tinybird-local:7181 \
  python:3.12-slim sh -c "
    pip install --quiet 'tinybird-cli>=5,<6'
    tb auth --token \"\$ADMIN_TOKEN\"
    tb token create jwt app_read_token --scope PIPES:READ
"
```

However, for self-hosted setups where all services share the same Docker network, using the admin token is acceptable.

For full details, see [docs/tinybird-self-hosted-deployment.md](docs/tinybird-self-hosted-deployment.md).

## Configuration

### Required Environment Variables

Edit `.env.docker` and set:

```bash
# Authentication
AUTH_SECRET=your-secret-here

# Database
DATABASE_URL=http://libsql:8080
DATABASE_AUTH_TOKEN=basic:token

# Email delivery — use Resend (cloud) or SMTP (self-hosted)
RESEND_API_KEY=test
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user
# SMTP_PASS=password
# SMTP_FROM=noreply@example.com
```

### Optional Services

Configure these for full functionality:

```bash
# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Analytics
TINY_BIRD_API_KEY=

# OAuth providers
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
```

See [.env.docker.example](.env.docker.example) for complete list.

## Development Workflow

### Common Commands

```bash
# View logs
docker compose logs -f [service-name]

# Restart service
docker compose restart [service-name]

# Rebuild after code changes
docker compose up -d --build [service-name]

# Stop all services
docker compose down

# Reset database (removes all data)
docker compose down -v
docker compose up -d
# Migrations run automatically on startup
```

### Authentication

**Magic Link**:

Set `SELF_HOST=true` in `.env.docker` to enable email-based magic link authentication. This allows users to sign in without configuring OAuth providers.

**OAuth Providers**:

Configure GitHub/Google OAuth credentials in `.env.docker` and set up callback URLs:
  - GitHub: `http://localhost:3002/api/auth/callback/github`
  - Google: `http://localhost:3002/api/auth/callback/google`

### Creating Status Pages

**Via Dashboard (Recommended)**:
1. Login to http://localhost:3002
2. Create a workspace
3. Create a status page with a slug
4. Access at http://localhost:3003/[slug]

**Via Database (Testing)**:
```bash
# Insert test data
curl -s http://localhost:8080/v2/pipeline \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "requests":[{
      "type":"execute",
      "stmt":{
        "sql":"INSERT INTO workspace (id, slug, name) VALUES (1, '\''test'\'', '\''Test Workspace'\'');"
      }
    }]
  }'
```

### Resource Limits

Add to `docker-compose.yaml`:

```yaml
services:
  dashboard:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Monitoring

### Health Checks

All services have automated health checks:

```bash
# View health status
docker compose ps

# Inspect specific service
docker inspect openstatus-dashboard --format='{{.State.Health.Status}}'
```

## Troubleshooting

### Services Stuck on "starting"

First builds take time. Expected startup durations:
- `checker`, `redis`, `libsql`: ~15s
- `workflows`, `server`, `private-location`: ~30s
- `dashboard`, `status-page`: ~45s (Next.js compilation)

If a service stays unhealthy well past these times:

1. **Check logs:** `docker compose logs <service>`
2. **Missing env vars:** verify `.env.docker` has all required values (no empty strings)
3. **Migration failures:** see [Migration Troubleshooting](docs/self-hosted-docker-architecture.md#troubleshooting-migrations)
4. **Port conflicts:** run `lsof -i :3000` (or any bound port) — services bind to 3000–3003, 8080–8082, 7181, 6379, 8079

### Analytics Charts Are Empty

Verify Tinybird is set up:
```bash
docker compose logs tinybird-local | tail -5
curl -s http://localhost:7181/ | head -1
```
If Tinybird is running but charts are empty, re-run the init script:
```bash
./scripts/tinybird-self-hosted-init.sh
```
Then copy the printed token into `.env.docker` and restart dependent services.

## Production Considerations

### Resource Minimums

| Service | Memory | CPU |
|---------|--------|-----|
| dashboard, status-page | 512MB | 1.0 |
| server | 256MB | 0.5 |
| workflows | 256MB | 0.5 |
| checker, private-probe | 64MB | 0.25 |
| libsql | 256MB | 0.5 |
| tinybird-local | 512MB | 1.0 |
| redis | 128MB | 0.25 |

Add limits in `docker-compose.yaml`:
```yaml
services:
  dashboard:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: "1.0"
```

### Data Safety

`docker compose down` preserves all data. `docker compose down -v` **deletes** the database, analytics history, and session state.

## Getting Help

- **Documentation**: [docs.openstatus.dev](https://www.openstatus.dev/docs)
- **Discord**: [openstatus.dev/discord](https://www.openstatus.dev/discord)
- **GitHub Issues**: [github.com/openstatusHQ/openstatus/issues](https://github.com/openstatusHQ/openstatus/issues)
