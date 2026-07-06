# Checker Architecture

The `apps/checker` Go module serves dual roles:

1. **Public checker** (`cmd/server/main.go`) — HTTP server that receives check requests from the
   cron dispatcher (Cloud Tasks or direct HTTP), executes checks, and sends results to Tinybird
   and status updates to the workflows server.

2. **Private-location probe** (`cmd/private/main.go`) — standalone binary that polls the
   private-location API for monitor configurations, executes HTTP/TCP/DNS health checks on a
   schedule, and ingests results back via ConnectRPC.

## Package Map

```
apps/checker/
├── cmd/
│   ├── server/main.go           # Public checker entry point (Gin HTTP server)
│   └── private/main.go          # Private probe entry point (scheduler + gRPC client)
├── handlers/
│   ├── checker.go               # HTTP check handler (assertions, retry, status transitions)
│   ├── tcp.go                   # TCP check handler
│   ├── dns.go                   # DNS check handler
│   └── handler.go               # Handler struct (TbClient, Secret, Region)
├── pkg/
│   ├── scheduler/scheduler.go   # Monitor config polling + task lifecycle
│   ├── job/
│   │   ├── http_job.go          # HTTP check orchestration (private probe path)
│   │   ├── tcp_job.go           # TCP check orchestration (private probe path)
│   │   └── dns_job.go           # DNS check orchestration (private probe path)
│   ├── otel/otel.go             # OpenTelemetry metrics recording
│   └── tinybird/client.go       # Tinybird event ingestion client
├── checker/
│   ├── http.go                  # HTTP request + httptrace timing (shared Timing struct)
│   ├── tcp.go                   # TCP dial with DNS resolution + Timing struct
│   ├── dns.go                   # Parallel DNS lookups with resolver detection
│   └── update.go                # Status update POST to workflows server
├── proto/                       # ConnectRPC/gRPC protocol definitions
└── request/                     # Shared request types (HttpCheckerRequest, etc.)
```

## Data Flow

```
┌─────────────┐     Monitors() RPC     ┌──────────────────┐
│ private-     │ ◄──────────────────── │  Scheduler        │
│ location API │                       │  (UpdateMonitors) │
└─────────────┘                       └──────┬───────────┘
       ▲                                     │ tasks.Scheduler
       │ IngestHTTP/TCP/DNS RPC     ┌────────┴───────────┐
       │                            │  Task closures      │
       │                            │  (1 per monitor id) │
       │                            └────────┬───────────┘
       │                                     │ context.Background()
       │                            ┌────────┴───────────┐
       │                            │  job.JobRunner      │
       │                            │  HTTPJob/TCPJob/    │
       │                            │  DNSJob             │
       │                            └────────┬───────────┘
       │                                     │ backoff.Retry()
       │                            ┌────────┴───────────┐
       │                            │  checker.Http/      │
       │                            │  PingTCP/Dns        │
       │                            └────────────────────┘
       │
       └─────────────────────────────────────────────────┘
```

### Status update flow

```
Public checker path:
  handlers/*.go  ──POST──►  {OPENSTATUS_WORKFLOWS_URL}/updateStatus

Private probe path:
  job/*.go  ──IngestRPC──►  private-location  ──POST──►  {OPENSTATUS_WORKFLOWS_URL}/updateStatus/private
```

Both paths are gated by the monitor's `updatesStatus` flag. When disabled, only metrics
are written to Tinybird — no status changes, incidents, or notifications.

## Layers

### 1. Handlers (`handlers/`)

Public checker HTTP handlers. Each handler:

- Validates `Authorization: Basic <CRON_SECRET>`.
- Decodes the request body into the appropriate checker request type.
- Runs the check with retry via `backoff.Retry()`.
- Evaluates assertions (HTTP status, headers, body; DNS records).
- Determines status (success/degraded/error) based on assertions and `degradedAfter` threshold.
- Calls `checker.UpdateStatus()` to notify the workflows server of status transitions.
- Sends the result to Tinybird via `TbClient.SendEvent()`.

Status transitions are gated by `req.UpdatesStatus` — when false, the handler skips
`UpdateStatus` calls entirely (see `updatesStatus` flag in monitor schema).

### 2. Scheduler (`pkg/scheduler/`)

`MonitorManager.UpdateMonitors()` is invoked periodically (default: 10m). It:

1. Fetches the full monitor list via `Client.Monitors()` gRPC call.
2. Diffs against the in-memory `tasks.Scheduler` task set.
3. **Adds** new tasks (one per monitor id) with the configured interval.
4. **Removes** stale tasks whose ids no longer appear in the response.

Each task closure:
- Captures the monitor config by value (`monitor := m`).
- Creates a fresh `context.Background()` for the check (not `tasks.TaskContext.Context`, which is nil).
- Calls the appropriate `JobRunner` method.
- Calls the corresponding `Client.Ingest*()` RPC to ship results back.

### 3. Job Runner (`pkg/job/`)

Each job type (`HTTPJob`, `TCPJob`, `DNSJob`) wraps a checker call with:

- **Retry logic** via `backoff.Retry()` with exponential backoff (default 3 attempts).
- **Result formatting** into the Ingest RPC shape (UUID generation, timing serialization as JSON
  `Timing` struct, status classification: success / degraded / error). The `requestStatus` field
  must use one of `"success"`, `"degraded"`, or `"error"` to match the dashboard SDK's Zod enum
  validation.
- **Assertion evaluation** (HTTP and DNS): HTTP evaluates header, status code, and body assertions.
  DNS evaluates record assertions (A, CNAME, MX, etc.) against the resolved records. Both fold
  into the final status.

### 4. Checker (`checker/`)

Low-level probes that perform the actual network check:

| Function | What it does |
|---|---|
| `Http(ctx, client, req)` | Builds and executes an HTTP request with `httptrace` instrumentation for DNS, connect, TLS, first-byte, and transfer timing. Handles POST body decoding (base64 octet-stream). Returns `Response` with headers, body, latency, and timing breakdown. |
| `PingTCP(timeout, target)` | Parses host:port, resolves hostname via `net.LookupHost` (recording DNS timing), opens a TCP connection via `net.DialTimeout` (recording connect timing). Returns `TCPResponse` with `Timing` struct, resolved IP, and latency. Uses the shared `Timing` struct from HTTP for consistent timing fields. |
| `Dns(ctx, host)` | Resolves A, AAAA, CNAME, MX, NS, and TXT records **in parallel** via goroutines. Uses a custom `net.Resolver` with a `Dial` callback that captures the actual DNS server address. Each record-type lookup records its own start/done timing. Returns `DnsResponse` with `Timing` struct, resolver address, and all record values. |

### Timing Struct

All checker functions use the shared `Timing` struct (defined in `http.go`):

```go
type Timing struct {
    DnsStart          int64  // DNS resolution start (epoch ms)
    DnsDone           int64  // DNS resolution done
    ConnectStart      int64  // TCP connect start
    ConnectDone       int64  // TCP connect done
    TlsHandshakeStart int64  // TLS handshake start (HTTP only)
    TlsHandshakeDone  int64  // TLS handshake done (HTTP only)
    FirstByteStart    int64  // TTFB start (HTTP only)
    FirstByteDone     int64  // TTFB done (HTTP only)
    TransferStart     int64  // Body transfer start (HTTP only)
    TransferDone      int64  // Body transfer done (HTTP only)
}
```

For TCP checks: `DnsStart`/`DnsDone` and `ConnectStart`/`ConnectDone` are populated.
For DNS checks: `DnsStart`/`DnsDone` spans the entire parallel lookup window.
Unused fields are zero-valued.

The dashboard converts these timestamp deltas into duration phases (dns, connect, tls, ttfb,
transfer) via `timingPhasesSchema` and renders them as a stacked timing bar in the response
logs page.

## Logging Convention

All layers use `zerolog` with consistent structured fields:

| Field | Meaning | Layers |
|---|---|---|
| `host` | Target hostname | checker |
| `url` | Target URL | checker, job |
| `uri` | Target URI | job |
| `monitor_id` | Monitor identifier | job |
| `latency_ms` | Check latency in milliseconds | checker, job |
| `dns_latency_ms` | DNS resolution time | checker (TCP) |
| `connect_latency_ms` | TCP connect time | checker (TCP) |
| `total_latency_ms` | End-to-end check time | checker (TCP, DNS) |
| `status` | HTTP status code or request status | checker, job |
| `attempt` / `max_attempts` | Retry progress | job |
| `resolved_ips` | IPs resolved for hostname | checker (TCP) |
| `connected_ip` | Actual remote IP connected to | checker (TCP) |
| `ip` | Resolved/connected IP | checker, job (TCP) |
| `resolver` | DNS server address | checker (DNS) |
| `dns_server` | DNS server dialed per lookup | checker (DNS) |
| `configured_nameservers` | Nameservers from resolv.conf | checker (DNS) |
| `a_count`, `cname`, etc. | DNS record counts/values | checker (DNS) |
| `timing` | Full JSON timing struct | job (TCP, DNS) |

Log levels:
- `info` — normal lifecycle events (start, step completion, final result)
- `warn` — expected failure modes (timeout, connection refused)
- `error` — unexpected failures (dial errors, lookup failures)

## Context Discipline

- The scheduler passes `context.Background()` into job functions. Do not pass `tasks.TaskContext.Context` — it is nil.
- Context flows through `backoff.Retry()` into checker functions.
- `checker.Http` uses context for `http.NewRequestWithContext` so the request respects cancellation.
- `checker.Dns` uses context for `resolver.Lookup*` calls to pass the resolver configuration.
- `checker.PingTCP` does not accept context (pure `net.DialTimeout` with its own deadline).

## Key Invariants

- **One task per monitor id.** The scheduler deduplicates by monitor id.
- **Tasks survive config refreshes.** Existing tasks are not replaced; only missing ones are added and stale ones removed.
- **Ingest is best-effort.** If the ingest RPC fails, the error is logged but the task does not retry the ingest (the check already completed).
- **Retry is at the job layer, not the checker layer.** The checker functions make a single attempt; the job runner handles retry policy.
- **updatesStatus flag.** Both the public checker handlers and private-location server honor the
  `updatesStatus` flag on the monitor. When `false`, they skip `UpdateStatus` calls entirely —
  only metrics are written to Tinybird. This is configured via the "Update Status" toggle on the
  monitor edit page.
