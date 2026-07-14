# Tinybird Overview

## Project Structure

```
packages/tinybird/
├── .tinyb                    # Tinybird CLI auth config (host, tokens per host)
├── .tinyenv                  # Environment variables (VERSION, optional flags)
├── DEPLOY.md                 # Deployment instructions and fix notes
├── README.md                 # Migration guide (versioned datasource upgrade)
├── datasources/              # Raw data ingestion targets + MV datasources
│   ├── ping_response__v8.datasource       # HTTP monitor checks (primary)
│   ├── tcp_response__v0.datasource        # TCP monitor checks
│   ├── dns_response__v0.datasource        # DNS monitor checks
│   ├── check_response_http.datasource     # On-demand HTTP checks
│   ├── audit_log__v0.datasource           # Audit log events
│   ├── external_status__v1.datasource     # External service status
│   ├── external_status_component__v0.datasource
│   └── mv__*__v*.datasource              # Materialized view storage (auto-created)
├── pipes/                    # Materialized view + internal query pipes
│   ├── aggregate__http_<window>__v*.pipe  # MV population (e.g. 1d, 7d, 14d, 30d, 90d)
│   ├── aggregate__tcp_<window>__v*.pipe
│   ├── aggregate__dns_status_45d__v*.pipe
│   ├── response_graph.pipe                # Internal: latency quantiles for graph rendering
│   ├── response_details.pipe              # Internal: single check detail
│   ├── response_list.pipe                 # Internal: filtered check list
│   ├── public_status.pipe                 # Internal: latest status for public page
│   └── single_checks_get.pipe             # Internal: on-demand check lookup
├── endpoints/                # Query pipes exposed as HTTP APIs (TYPE ENDPOINT)
│   └── endpoint__<protocol>_<verb>_<period>__v*.pipe
├── src/                      # TypeScript SDK
│   ├── client.ts             # OSTinybird class (175+ typed pipe getters)
│   ├── safe.ts               # safePipeData error wrapper
│   ├── schema.ts             # Shared Zod schemas (timing, headers, job types)
│   ├── index.ts              # Re-exports
│   └── audit-log/            # AuditLog class (publish + query)
├── scripts/                  # Backfill and repopulation scripts
│   └── repopulate-tinybird-mvs.sh   # Classic-mode MV repopulation
└── package.json
```

## File Types

| Type | Extension | Purpose | Deploy Command |
|------|-----------|---------|----------------|
| Datasource | `.datasource` | Defines table schema + engine | `tb push datasources/` |
| Pipe | `.pipe` | SQL transformation (materialized or query) | `tb push pipes/ --populate` |
| Endpoint | `.pipe` with `TYPE ENDPOINT` | HTTP API endpoint | `tb push endpoints/` |

## Deployment Order

Pipes reference datasources, endpoints reference pipes. Always deploy in order:

```sh
# 1. Push datasources (raw + MV storage tables)
tb push datasources/ --force --yes

# 2. Push pipes (MV population — use --populate to backfill)
tb push pipes/ --force --yes --populate

# 3. Push endpoints (HTTP APIs — no populate needed)
tb push endpoints/ --force --yes
```

## Versioning

Datasources and MVs use a `__v<N>` suffix to support schema migrations without downtime:

```
ping_response__v8.datasource    # Current version
ping_response__v7.datasource    # Previous version (can coexist during migration)
```

When upgrading a datasource:
1. Create a new `__v<N+1>` file with the updated schema
2. Push the new datasource
3. Create/push a backfill pipe to migrate data from old to new
4. Update all pipes/endpoints to read from the new version
5. Remove the old datasource after verification

See `packages/tinybird/README.md` for the full migration procedure.

## Local Development

The `.tinyb` config points to `http://tinybird-local:7181` (Docker). The `.tinyenv` sets `VERSION=0.0.0`.

```sh
cd packages/tinybird
tb auth -i                    # Interactive auth
tb push datasources/ --yes    # Deploy to local
tb pipe ls                    # List deployed pipes
tb sql "SELECT * FROM ping_response__v8 LIMIT 5"
```

### Classic Mode vs Forward Mode

The self-hosted `tinybird-local` container runs in **Classic mode** (`COMPATIBILITY_MODE=1`).
This limits available `tb` commands:

| Command | Classic | Forward |
|---------|---------|---------|
| `tb push` | ✅ | ✅ |
| `tb pipe populate` | ❌ | ✅ |
| `tb datasource ls` | ❌ | ✅ |
| `tb pipe ls` | ❌ | ✅ |
| `tb materialization` | ❌ | ✅ |

**Workaround for Classic mode:** Use the Pipe REST API and datasource truncate endpoint.
The `scripts/repopulate-tinybird-mvs.sh` script automates MV repopulation in Classic mode
by fetching pipe SQL from the API, truncating the target datasource, and recreating the
pipe node to reset its append offset.

## Key Concepts

- **MergeTree:** Default engine for raw datasources. Partitioned by month.
- **AggregatingMergeTree:** Used for status MVs (with `countState` / `countMerge`).
- **TTL:** Materialized views auto-expire (e.g. `mv__http_14d__v1` TTL = 14 days). Raw datasources persist indefinitely.
- **Materialized View:** A pipe with `TYPE materialized` that continuously populates a target datasource from a source.
- **Endpoint:** A pipe with `TYPE ENDPOINT` exposed as `GET /v0/pipes/<name>.json`.
- **Force cache:** Used for global stats (`homeStats`) and single-check detail lookups.
