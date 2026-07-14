# Tinybird Data Pipeline

## End-to-End Flow

```
Checker (Go) ──POST /v0/events──→ Raw Datasource ──MV Pipe──→ MV Datasource ──Endpoint──→ HTTP API ──OSTinybird (TS)──→ tRPC Router ──→ Dashboard / Status Page
```

## 1. Ingestion (Writers)

### `apps/checker` (Go)

Runs scheduled monitor checks and sends results to Tinybird via `POST /v0/events?name=<datasource>`.

| Handler | Datasource | Data |
|---------|------------|------|
| `handlers/checker.go` | `ping_response__v8` | HTTP check results |
| `handlers/tcp.go` | `tcp_response__v0` | TCP check results |
| `handlers/dns.go` | `dns_response__v0` | DNS check results |
| `handlers/ping.go` | `check_response_http` | On-demand HTTP checks |

Tinybird client: `apps/checker/pkg/tinybird/client.go`

### `apps/private-location` (Go)

Self-hosted private location checker. Same pattern as checker.

Datasource constants: `DatasourceHTTP = "ping_response__v8"`, `DatasourceTCP = "tcp_response__v0"`, `DatasourceDNS = "dns_response__v0"`

Tinybird client: `apps/private-location/internal/tinybird/client.go`

### `apps/workflows` (TypeScript)

Cron jobs that publish metadata:

| Module | Method | Datasource |
|--------|--------|------------|
| `src/cron/external-status.ts` | `tb.publishExternalStatus()` | `external_status__v1` |
| `src/cron/external-status.ts` | `tb.publishExternalStatusComponent()` | `external_status_component__v0` |
| `src/utils/audit-log.ts` | `AuditLog.publishAuditLog()` | `audit_log__v0` |

## 2. Materialization (Pipes → MVs)

MV pipes continuously populate windowed datasources from raw data:

```
ping_response__v8
  └── aggregate__http_1d__v1.pipe → mv__http_1d__v1 (TTL 1d)
  └── aggregate__http_7d__v1.pipe → mv__http_7d__v1 (TTL 7d)
  └── aggregate__http_14d__v1.pipe → mv__http_14d__v1 (TTL 14d)
  └── aggregate__http_30d__v1.pipe → mv__http_30d__v1 (TTL 30d)
  └── aggregate__http_90d__v1.pipe → mv__http_90d__v1 (TTL 90d)
  └── aggregate__http_status_45d__v1.pipe → mv__http_status_45d__v1 (TTL 46d)
  └── aggregate__http_uptime_7d__v1.pipe → mv__http_uptime_7d__v1 (TTL 7d)
  └── ...
```

Each MV has a TTL matching its window (+1 day padding for status MVs). Data older than the TTL is auto-deleted.

### Repopulating MVs (Classic Mode / Self-Hosted)

In Tinybird-local `COMPATIBILITY_MODE=1` (Classic), the `tb pipe populate` command
is not available. Repopulate MVs from existing raw data with:

```sh
./scripts/repopulate-tinybird-mvs.sh
```

This script:
1. Fetches each pipe's current SQL and target datasource from the Pipe API
2. Truncates the target MV datasource via `POST /v0/datasources/{name}/truncate`
3. Deletes the pipe node and recreates it with the original SQL

Deleting/recreating the node **resets the materialized pipe's append offset**,
so the pipe processes all historical data from the raw datasource from scratch.
Do this after fixing auth token mismatches or after backfilling raw datasources.

**In Forward-mode Tinybird** (cloud or newer local), use the built-in command instead:
```sh
tb pipe populate --truncate --yes
```

## 3. Query (Endpoints → HTTP API)

Endpoints expose MVs as HTTP APIs:

```
GET /v0/pipes/endpoint__http_list_14d__v1.json?monitorId=1&fromDate=...
```

Parameters are passed as query string. Response is JSON.

## 4. TypeScript Client (OSTinybird)

The `OSTinybird` class wraps each endpoint as a typed function:

```ts
const tb = new OSTinybird(token);
const { data } = await tb.httpListBiweekly({ monitorId: "1" });
```

Internally `@chronark/zod-bird` handles:
- Building the URL with parameters
- Making the HTTP request
- Validating response with Zod
- Caching

## 5. tRPC Router (API Layer)

`packages/api/src/router/tinybird/index.ts` dispatches periods to endpoints:

```ts
// Client asks for "metrics" with period="14d" and type="http"
// → tb.httpMetricsBiweekly({ monitorId, ... })
```

The router handles:
- Period → endpoint mapping (e.g. `7d` → `tb.httpMetricsWeekly`)
- Plan gating (free plan blocks `30d`/`90d`)
- Region filter stripping (free plan forces all-region aggregate)
- Interval clamping (long periods have minimum bucket sizes)
- `safePipeCall` wrapper (converts "Unauthorized" to actionable TRPCError)

### Period-to-Window Mapping

| Period | MV Used | Plan Required |
|--------|---------|---------------|
| `1d` | `mv__http_1d__v1` | Free |
| `7d` | `mv__http_7d__v1` | Free |
| `14d` | `mv__http_14d__v1` + backfill from 30d MV | Free |
| `30d` | `mv__http_30d__v1` | Paid |
| `90d` | `mv__http_90d__v1` | Paid |

### Interval Clamping

Long periods enforce minimum bucket sizes to prevent excessive data points:

| Period | Min Interval |
|--------|-------------|
| `1d` | 5 min |
| `7d` | 5 min |
| `14d` | 5 min |
| `30d` | 240 min |
| `90d` | 1440 min |

## 6. Consumption (UI)

Both `apps/dashboard` and `apps/status-page` consume Tinybird data exclusively through the tRPC API:

```tsx
// apps/dashboard/src/components/chart/...
const { data } = useQuery(trpc.tinybird.metrics.queryOptions({
  monitorId: id,
  period: "14d",
  type: "http",
}));
```

No direct imports of `@openstatus/tinybird` in UI code — all through tRPC.

## Adding a New Monitor Type

When adding a new monitor type (e.g., `ssl`, `icmp`):

1. **Raw datasource:** Create `newtype_response__v0.datasource`
2. **MVs:** Create pipes + datasources for each window (1d/7d/14d/30d/90d)
3. **Endpoints:** Create endpoints for list, metrics, uptime, status
4. **TS client:** Add getters to `OSTinybird`
5. **tRPC router:** Add the type to the `types` array and dispatch functions
6. **Checker:** Wire the checker to POST results to the new datasource

## Adding a New Metric/Query

When adding a new query (not a new monitor type):

1. **Endpoint:** Create the endpoint pipe in `endpoints/`
2. **TS client:** Add getter to `OSTinybird`
3. **tRPC router:** Add the procedure to `packages/api/src/router/tinybird/index.ts`
4. **Push:** `tb push endpoints/ --yes`
