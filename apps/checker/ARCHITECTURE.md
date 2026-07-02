# Checker Architecture

The `apps/checker` Go module is the **private-location probe** — a standalone binary that polls the private-location API for monitor configurations, executes HTTP/TCP/DNS health checks on a schedule, and ingests results back.

## Package Map

```
apps/checker/
├── cmd/private/main.go          # Entry point: config, scheduler init, API client
├── pkg/
│   ├── scheduler/scheduler.go   # Monitor config polling + task lifecycle
│   └── job/
│       ├── http_job.go          # HTTP check orchestration (retry, assertions)
│       ├── tcp_job.go           # TCP check orchestration (retry)
│       └── dns_job.go           # DNS check orchestration (retry, record formatting)
├── checker/
│   ├── http.go                  # Low-level HTTP request + timing via httptrace
│   ├── tcp.go                   # Low-level TCP dial + timing
│   └── dns.go                   # DNS record lookups (A, AAAA, CNAME, MX, NS, TXT)
├── proto/                       # ConnectRPC/gRPC protocol definitions
└── request/                     # Shared request types (HttpCheckerRequest)
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

## Layers

### 1. Scheduler (`pkg/scheduler/`)

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

### 2. Job Runner (`pkg/job/`)

Each job type (`HTTPJob`, `TCPJob`, `DNSJob`) wraps a checker call with:

- **Retry logic** via `backoff.Retry()` with exponential backoff (default 3 attempts).
- **Result formatting** into the Ingest RPC shape (UUID generation, timing serialization, status classification: success / degraded / error).
- **Assertion evaluation** (HTTP only): header, status code, and body assertions are evaluated against the response and fold into the final status.

### 3. Checker (`checker/`)

Low-level probes that perform the actual network check:

| Function | What it does |
|---|---|
| `Http(ctx, client, req)` | Builds and executes an HTTP request with `httptrace` instrumentation for DNS, connect, TLS, first-byte, and transfer timing. Handles POST body decoding (base64 octet-stream). Returns `Response` with headers, body, latency, and timing breakdown. |
| `PingTCP(timeout, url)` | Opens a TCP connection via `net.DialTimeout`. Returns start/stop timestamps for latency calculation. |
| `Dns(ctx, host)` | Resolves A, AAAA, CNAME, MX, NS, and TXT records. Skips NS lookup for subdomains. Returns a structured `DnsResponse`. |

## Logging Convention

All layers use `zerolog` with consistent structured fields:

| Field | Meaning | Layers |
|---|---|---|
| `host` | Target hostname | checker |
| `url` | Target URL | checker, job |
| `uri` | Target URI | job |
| `monitor_id` | Monitor identifier | job |
| `latency_ms` | Check latency in milliseconds | checker, job |
| `status` | HTTP status code or request status | checker, job |
| `attempt` / `max_attempts` | Retry progress | job |
| `a_count`, `cname`, etc. | DNS record counts/values | checker (DNS) |

Log levels:
- `info` — normal lifecycle events (start, step completion, final result)
- `warn` — expected failure modes (timeout, connection refused)
- `error` — unexpected failures (dial errors, lookup failures)

## Context Discipline

- The scheduler passes `context.Background()` into job functions. Do not pass `tasks.TaskContext.Context` — it is nil.
- Context flows through `backoff.Retry()` into checker functions.
- `checker.Http` uses context for `http.NewRequestWithContext` so the request respects cancellation.
- `checker.Dns` uses context only for logger attachment (via `log.Ctx`); it does not cancel DNS lookups mid-flight.
- `checker.PingTCP` does not accept context (pure `net.DialTimeout` with its own deadline).

## Key Invariants

- **One task per monitor id.** The scheduler deduplicates by monitor id.
- **Tasks survive config refreshes.** Existing tasks are not replaced; only missing ones are added and stale ones removed.
- **Ingest is best-effort.** If the ingest RPC fails, the error is logged but the task does not retry the ingest (the check already completed).
- **Retry is at the job layer, not the checker layer.** The checker functions make a single attempt; the job runner handles retry policy.
