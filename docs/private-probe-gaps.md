# Private Probe — Deployment & Development Gaps

> Generated 2026-07-09 from full codebase analysis of `apps/private-location/`, `apps/checker/cmd/private/`, `apps/checker/pkg/scheduler/`, `apps/checker/Dockerfile.probe`, and `docker-compose.yaml`.

## Overview

Traced the complete code path from probe startup → config poll → check execution → ingest → Tinybird → workflows/notifications. Categorized gaps into deployment friction, debugging blockers, and development hazards.

---

## 1. Probe: No Health Check or Observability Surface

### Current state

`Dockerfile.probe` has no `HEALTHCHECK`. The probe binary has no HTTP listener — it's a pure scheduler loop. There is:

- ❌ No health endpoint (no port, no HTTP server)
- ❌ No Docker health check (`docker compose ps` shows no health status)
- ❌ No metrics endpoint (Prometheus or otherwise)
- ❌ No way to query "is this probe running? is it checking monitors? when was its last successful ingest?"

### Impact

- `depends_on: condition: service_healthy` on the probe is useless — Docker can't determine health
- You can only verify probe health by reading logs
- No monitoring/alerting integration possible for probe health
- Can't distinguish "probe is running but all checks fail" from "probe is dead"

### Fix

Add a minimal HTTP health server to the probe on a configurable port:

```go
// Sidecar health server
go func() {
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(200)
        w.Write([]byte(`{"status":"ok","uptime_seconds":...,"last_config_refresh":...,"active_monitors":...}`))
    })
    http.ListenAndServe(":9090", nil)
}()
```

Then add `HEALTHCHECK --interval=30s CMD wget --spider -q http://localhost:9090/health || exit 1` to `Dockerfile.probe`.

---

## 2. Probe: Hardcoded `GOARCH=amd64` — No ARM Support

### Current state

`Dockerfile.probe` line 11:
```dockerfile
ENV GOARCH=amd64
```

`private-location/Dockerfile` uses `ARG TARGETARCH` + `GOOS=${TARGETOS} GOARCH=${TARGETARCH}` for proper multi-arch builds.

### Impact

- Probe cannot be built or run on Apple Silicon Macs (M1/M2/M3) without emulation
- Cannot deploy on ARM servers (AWS Graviton, Raspberry Pi, etc.)
- Inconsistent with every other Dockerfile in the project

### Fix

Replace with `ARG TARGETARCH` + `ARG TARGETOS`, same pattern as `private-location/Dockerfile`.

---

## 3. Probe: Config Fetch Has No Backoff — Stale Config Silent

### Current state

`UpdateMonitors()` in `scheduler/scheduler.go`:
```go
res, err := mm.Client.Monitors(rpcCtx, &connect.Request[v1.MonitorsRequest]{})
if err != nil {
    log.Printf("Failed to fetch monitors: %v", err)
    return 10  // hardcoded 10-minute default
}
```

- ❌ Any error → returns exactly 10 minutes, regardless of error type
- ❌ No retry — if `private-location` is down for 30 seconds, probe waits 10 full minutes
- ❌ No exponential backoff
- ❌ No distinction between transient (connection refused) and permanent (invalid token) errors
- ❌ Stale monitors remain active indefinitely — if a monitor is deleted from dashboard, the probe keeps running it until the next successful config fetch

### Impact

- Adding a new monitor can take up to 10 minutes to appear
- If private-location has a brief restart, probe is blind for 10 minutes
- Token revocation doesn't take effect until next successful poll — the probe may keep running with a revoked token for up to 10 minutes

### Fix

```go
func (mm *MonitorManager) UpdateMonitors(ctx context.Context) int32 {
    rpcCtx, cancel := context.WithTimeout(ctx, rpcTimeout)
    defer cancel()
    res, err := mm.Client.Monitors(rpcCtx, &connect.Request[v1.MonitorsRequest]{})
    if err != nil {
        log.Printf("Failed to fetch monitors: %v", err)
        // Exponential backoff: 1m, 2m, 4m, 8m, cap at 10m
        mm.configFailures++
        backoff := min(1 << mm.configFailures, 10)
        return int32(backoff)
    }
    mm.configFailures = 0
    // ... rest
}
```

Also: on config fetch failure, keep existing monitors but log a warning that config is stale.

---

## 4. Probe: `log.Printf` Instead of Structured Logging

### Current state

The probe uses Go stdlib `log.Printf` everywhere:
```go
log.Printf("Failed to fetch monitors: %v", err)
log.Printf("Monitor check succeeded for %s (%s), ingest response: %v", monitor.Id, monitor.Url, resp)
```

`private-location` uses `slog` with OTLP export to Axiom. The probe has a `LOG_LEVEL` env var and `setupLogger` function that configures `slog` — but **the scheduler package doesn't use it**. It imports `log` directly.

### Impact

- Probe logs can't go to Axiom or any structured log aggregator
- No way to filter probe logs by severity
- No correlation between probe errors and dashboard events
- `LOG_LEVEL=debug` has no effect on the scheduler log output

### Fix

Inject a `*slog.Logger` into `MonitorManager` and replace all `log.Printf` with `slog.Info/slog.Error/slog.Debug`.

---

## 5. Private-Location: `updateMonitorStatus` Fails Completely Silently

### Current state

`ingest_common.go` `updateMonitorStatus()`:
```go
resp, err := httpClient.Do(req)
if err != nil {
    return  // ← error silently dropped
}
defer resp.Body.Close()
// ← response status code never checked
```

- ❌ HTTP error (connection refused, timeout) → silently ignored
- ❌ HTTP 401/403/500 from workflows → silently ignored
- ❌ No retry
- ❌ No logging at all — the function has zero log statements
- ❌ The ingest handler returns success to the probe even if status update failed

### Impact

If workflows is unreachable or `CRON_SECRET` is wrong:
- No incidents are created
- No notifications are sent
- No indication anywhere that status updates are failing
- Dashboard shows stale monitor status indefinitely

### Fix

```go
resp, err := httpClient.Do(req)
if err != nil {
    slog.Error("workflows status update failed",
        "monitor_id", monitor.ID,
        "error", err,
    )
    return
}
defer resp.Body.Close()
if resp.StatusCode >= 400 {
    body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
    slog.Error("workflows returned error status",
        "monitor_id", monitor.ID,
        "status", resp.StatusCode,
        "body", string(body),
    )
}
```

---

## 6. Private-Location: Tinybird Ingest Failure Invisible to Probe

### Current state

`ingest_http.go`:
```go
h.sendEventAndUpdateLastSeen(ctx, data, tinybird.DatasourceHTTP, ic.Region.ID)
h.updateMonitorStatus(ctx, ...)
return connect.NewResponse(&private_locationv1.IngestHTTPResponse{}), nil  // always success
```

`sendEventAndUpdateLastSeen` logs the error but doesn't return it. The ingest handler always returns `200 OK` to the probe regardless of whether Tinybird accepted the event.

### Impact

- Probe thinks everything is fine
- No analytics data makes it to the dashboard
- The error is only visible in `private-location` logs (Axiom, if configured)
- No way to alert on "analytics pipeline is broken"

### Fix

Option A: Return a warning in the response (non-fatal, but visible to probe):
```protobuf
message IngestHTTPResponse {
    repeated string warnings = 1;
}
```

Option B: At minimum, emit a counter metric for Tinybird failures so it's queryable.

---

## 7. Probe: DNS Check Failures Logged But Task Continues Silently

### Current state

`scheduler/scheduler.go` DNS task:
```go
data, err := mm.JobRunner.DNSJob(c, monitor)
if err != nil {
    log.Printf("DNS monitor check failed for %s (%s): %v", monitor.Id, monitor.Uri, err)
}
// ... continues to build IngestDNSRequest with data even if err != nil
```

If `DNSJob` returns an error, `data` is used anyway (it's a pointer — could be nil or partial). Contrast with HTTP/TCP tasks which handle the error case differently.

### Impact

- DNS check results may contain garbage data on error
- The `records` map iteration on a nil `data` would panic (though the nil check on line saves it)
- Inconsistent error handling across monitor types

---

## 8. Environment Variable Confusion

### Current state

`docker-compose.yaml` maps two different variable names for the same concept:
```yaml
OPENSTATUS_KEY=${PRIVATE_LOCATION_TOKEN:-${OPENSTATUS_KEY:-}}
```

The documentation uses `OPENSTATUS_KEY` and `PRIVATE_LOCATION_TOKEN` interchangeably. The `.env.docker.example` uses yet another pattern.

Also: probe needs exactly 2 env vars (`OPENSTATUS_KEY`, `OPENSTATUS_INGEST_URL`), but private-location needs 6+. The documentation doesn't clearly separate "probe vars" from "private-location vars".

| Variable | Needed by probe? | Needed by private-location? |
|---|---|---|
| `OPENSTATUS_KEY` | ✅ | ❌ |
| `OPENSTATUS_INGEST_URL` | ✅ | ❌ |
| `DB_URL` | ❌ | ✅ |
| `DB_AUTH_TOKEN` | ❌ | ✅ |
| `TINYBIRD_TOKEN` | ❌ | ✅ |
| `TINYBIRD_URL` | ❌ | ✅ |
| `OPENSTATUS_WORKFLOWS_URL` | ❌ | ✅ |
| `CRON_SECRET` | ❌ | ✅ |

### Impact

- Users deploying a standalone probe get confused by the 8+ env vars in docs when they only need 2
- `OPENSTATUS_KEY` vs `PRIVATE_LOCATION_TOKEN` — which one is "correct"?

### Fix

Split env var documentation into two clear sections: **Probe Only** (2 vars) and **Private-Location Only** (6 vars). Rename `OPENSTATUS_KEY` to `PRIVATE_LOCATION_TOKEN` for consistency with `.env.docker`.

---

## 9. No Startup Validation — Fails at First Request

### Current state

`private-location/cmd/server/main.go`:
```go
server, cleanup := server.NewServer()
// ... immediately starts listening, no pre-flight checks
```

`NewServer()` opens the DB connection (which may succeed even with wrong URL — libsql client is lazy) and creates the HTTP server. No validation that:
- `DB_URL` is set and reachable
- `TINYBIRD_TOKEN` is non-empty
- `CRON_SECRET` is non-empty
- `OPENSTATUS_WORKFLOWS_URL` is set

The first request will fail with an opaque error. The probe's `UpdateMonitors` will just log "Failed to fetch monitors" with no indication of root cause.

### Impact

- Deployment misconfiguration is only discovered at runtime
- Error messages are cryptic (e.g., "sql: database is closed" instead of "DB_URL not set")
- The health endpoint returns `{"status":"ok"}` even when Tinybird is unreachable because it only checks DB ping

### Fix

Add a startup validation step:
```go
func validateConfig() error {
    if os.Getenv("DB_URL") == "" { return errors.New("DB_URL is required") }
    if os.Getenv("TINYBIRD_TOKEN") == "" { return errors.New("TINYBIRD_TOKEN is required") }
    // ...
}
```

Also: health endpoint should check all dependencies, not just DB:
```json
{"status":"ok","db":"ok","tinybird":"error: connection refused","workflows":"ok"}
```

---

## 10. No Version Compatibility Check

### Current state

The probe and private-location use different protobuf definitions from different modules:
- Probe: `apps/checker/proto/private_location/v1/` (generated from checker module)
- Private-location: `apps/private-location/proto/private_location/v1/` (generated from private-location module)

There's no version field in the ConnectRPC requests. No negotiation. If the protobuf definitions diverge (field added, renumbered, type changed), the probe will silently send malformed data.

### Impact

- Version skew between independently deployed probe and private-location causes silent data corruption
- No way to detect incompatible versions
- No way to warn users about version mismatch

### Fix

Add a `probe_version` field to `MonitorsRequest` and return a compatibility matrix or warning in `MonitorsResponse`. Private-location can log/reject probes with known-incompatible versions.

---

## 11. Probe: No `--validate` or Dry-Run Mode

### Current state

The probe has one mode: run forever. To test if configuration is correct, you have to:
1. Start the probe
2. Wait for logs (can take up to 10 minutes if the first poll fails)
3. Read the log output manually

### Impact

- No way to verify "token works" without actually starting the full probe
- CI/CD pipelines can't validate probe configuration
- Troubleshooting takes 10+ minutes per iteration

### Fix

Add CLI flags:
```
probe --validate     # Connect, fetch monitors, print summary, exit 0/1
probe --once         # Run one check cycle, print results, exit
```

---

## 12. Probe Dockerfile: Missing SHA Pin, No HEALTHCHECK

### Current state

```dockerfile
FROM golang:1.25-alpine AS builder       # ← no SHA digest pin
...
# No HEALTHCHECK
CMD ["/opt/bin/probe"]
```

Compare to `private-location/Dockerfile`:
```dockerfile
FROM golang@sha256:d4c4845f5d... AS builder    # ← SHA pinned
...
HEALTHCHECK --interval=15s --timeout=10s ...    # ← has health check
```

### Impact

- Reproducible builds not guaranteed (floating Go version tag)
- `depends_on: condition: service_healthy` won't work for the probe container
- Inconsistent with project standards

### Fix

Pin Go image digest. Add `HEALTHCHECK` once the probe has a `/health` endpoint (see gap #1).

---

## 13. Private-Location: Token Error Lacks Granularity

### Current state

`monitors.go`:
```go
token := req.Header().Get("openstatus-token")
if token == "" {
    return nil, connect.NewError(connect.CodeUnauthenticated, ErrMissingToken)
}
// ... DB query that can fail for multiple reasons
err := h.db.Get(&pl, "SELECT ... FROM private_location WHERE token = ?", token)
if err != nil {
    return nil, connect.NewError(connect.CodeInternal, err)  // ← always Internal
}
```

"Token not found in DB" and "DB connection lost" both return `CodeInternal`. The probe logs `Failed to fetch monitors` with no distinction.

### Impact

- Probe can't distinguish "bad token" (user action needed) from "DB is down" (operator action needed)
- No way to alert differently on auth failures vs infrastructure failures

### Fix

```go
if errors.Is(err, sql.ErrNoRows) {
    return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("invalid token"))
}
return nil, connect.NewError(connect.CodeInternal, err)
```

---

## 14. Probe: DNS Records Could Panic on Nil Data

### Current state

`scheduler/scheduler.go` DNS task:
```go
data, err := mm.JobRunner.DNSJob(c, monitor)
if err != nil {
    log.Printf("DNS monitor check failed ...")
}
// data could be nil here if DNSJob returned (nil, error)

records := make(map[string]*v1.Records)
if data != nil {  // ← nil check saves from panic
    for k, v := range data.Records { ... }
}
```

The nil check exists, but this pattern is fragile — if someone refactors and removes it, it panics. The API contract of `DNSJob` should guarantee `data != nil || err != nil`, or the scheduler should return early on error (like HTTP/TCP tasks do).

---

## Summary Matrix

| # | Gap | Severity | Category | Effort |
|---|---|---|---|---|
| 1 | Probe has no health endpoint / metrics | **High** | Observability | Medium |
| 2 | `GOARCH=amd64` hardcoded — no ARM | **High** | Deployment | Low |
| 3 | No exponential backoff on config fetch | **High** | Reliability | Low |
| 4 | `log.Printf` instead of structured logging | **Medium** | Observability | Medium |
| 5 | `updateMonitorStatus` fails silently | **High** | Reliability | Low |
| 6 | Tinybird ingest failure invisible to probe | **High** | Reliability | Low |
| 7 | DNS check failure handling inconsistent | **Medium** | Correctness | Low |
| 8 | Environment variable naming confusion | **Medium** | DX | Low |
| 9 | No startup validation — fails at first request | **Medium** | DX | Low |
| 10 | No version compatibility check | **Medium** | Correctness | Medium |
| 11 | No `--validate` / dry-run mode | **Medium** | DX | Medium |
| 12 | Probe Dockerfile: missing SHA pin, no HEALTHCHECK | **Low** | Consistency | Low |
| 13 | Token errors lack granularity (always `Internal`) | **Low** | Debugging | Low |
| 14 | DNS task potential nil panic (fragile pattern) | **Low** | Correctness | Low |

### Top 5 deployment blockers (by user impact)

1. **Gap #5** — If workflows is unreachable, incidents don't fire and there's zero indication
2. **Gap #3** — 10-minute blind spot after any private-location restart
3. **Gap #2** — ARM users can't deploy the probe at all
4. **Gap #6** — Dashboard shows no data but everything "looks fine" in probe logs
5. **Gap #1** — No way to automate monitoring of probe health

### Top 5 development/debugging hazards

1. **Gap #5** — Debugging notification failures requires checking 3 different services' logs
2. **Gap #4** — Probe logs are unstructured and don't correlate with anything else
3. **Gap #11** — Every config change requires a full restart + 10-minute test cycle
4. **Gap #9** — Deployment failures surface as cryptic runtime errors, not at startup
5. **Gap #13** — "Is it a bad token or is the DB down?" — can't tell from probe logs
