# Agent.md

This file provides a comprehensive overview of the OpenStatus project, its architecture, and development conventions to be used as instructional context for future interactions.

## Project Overview

OpenStatus is an open-source synthetic monitoring platform. It allows users to monitor their websites and APIs from multiple locations and receive notifications when they are down or slow.

The project is a monorepo managed with pnpm workspaces and Turborepo. It consists of several applications and packages that work together to provide a complete monitoring solution.

### Core Technologies

-   **Backend:**
    -   Hono (Node.js framework)
    -   Go
-   **Database:**
    -   Turso (libSQL)
    -   Drizzle ORM
-   **Data Analytics:**
    -   Tinybird
-   **Authentication:**
    -   NextAuth.js
-   **Build System:**
    -   Turborepo

### UI Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (with Turbopack) | 16.2.6 |
| UI Library | React | 19.2.6 |
| Styling | Tailwind CSS v4 | 4.3.0 |
| Component Primitives | Radix UI (headless, 20+ packages) | — |
| Component System | shadcn/ui (code-distributed via `@openstatus/ui`) | 3.8.5 |
| Icons | Lucide React | 0.525.0 |
| Animations | `tailwindcss-animate` + `tw-animate-css` | — |
| Theming | `next-themes` | 0.4.6 |

**Key utilities:** `clsx` + `tailwind-merge` via `class-variance-authority` (class composition), `react-hook-form` + Zod (forms), `@dnd-kit` (drag & drop), `recharts` (charts), `sonner` (toasts), `@tanstack/react-table` (tables), `@tanstack/react-query` via `@trpc/tanstack-react-query` (server state), `cmdk` (command palette), `date-fns` + `react-day-picker` (dates), `unified`/`remark`/`rehype` (markdown), `vaul` (drawer), `shiki` (code highlighting).

**Architecture:** All frontend apps (`dashboard`, `web`, `status-page`) depend on `@openstatus/ui` — the shared shadcn/ui component package. Components are distributed as source (not an npm package) via a custom `registry:build` step. Tailwind v4 uses the PostCSS plugin (`@tailwindcss/postcss`) rather than a legacy config file. Radix UI provides all accessible headless primitives (dialog, dropdown, select, tooltip, tabs, toggle, accordion, collapsible, etc.).

**Key UI blocks in `@openstatus/ui`:** `status-events` (incident cards with timeline), `status-event-collapsible` (foldable incident entries for history lists, built on Radix `Collapsible`), `status-feed` (recent-events feed), `status-banner` (active-incident banner), `status-bar` / `status-calendar` (uptime visualization).

### Status Page Incident History

The public status page (`apps/status-page`) renders incident history in an Adyen-style layout:

- **Route:** `/events` → year tabs (2026, 2025…) with incidents grouped by month.
- **Per-month detail:** `/events/july-2026` → all incidents for that month.
- **3-per-month preview:** each month shows up to 3 incidents, collapsed by default (`StatusEventCollapsible` with chevron toggle). A "View all N incidents in Month Year →" link leads to the per-month page.
- **Components:** `EventsYearList` (year-tab container) → `EventsMonthSection` (month group with preview cutoff) → `StatusEventCollapsible` (foldable incident card, from `@openstatus/ui`).
- **Data:** the `statusPage.get` tRPC endpoint returns all `statusReports` and `maintenances`; month/year filtering and grouping is client-side.

### Architecture

The OpenStatus platform is composed of three main applications:

-   **`apps/dashboard`**: A Next.js application that provides the main user interface for managing monitors, viewing status pages, and configuring notifications.
-   **`apps/server`**: A Hono-based backend server that provides the API for the dashboard application.
-   **`apps/checker`**: A Go application responsible for performing the actual monitoring checks from different locations.

These applications are supported by a collection of shared packages in the `packages/` directory, which provide common functionality such as database access, UI components, and utility functions.

## Building and Running

The project can be run using Docker (recommended) or a manual setup.

### With Docker

1.  Copy the example environment file:
    ```sh
    cp .env.docker.example .env.docker
    ```
2.  Start all services:
    ```sh
    docker compose up -d
    ```
3.  Access the applications:
    -   Dashboard: `http://localhost:3002`
    -   Status Pages: `http://localhost:3003`

### Manual Setup

1.  Install dependencies:
    ```sh
    pnpm install
    ```
2.  Initialize the development environment:
    ```sh
    pnpm dx
    ```
3.  Run a specific application:
    ```sh
    pnpm dev:dashboard
    pnpm dev:status-page
    pnpm dev:web
    ```

### Running Tests

To run the test suite, use the following command:

Before running the test you should launch turso dev in a separate terminal:
```sh
turso dev
```

Then, seed the database with test data:

```sh
cd packages/db
pnpm migrate 
pnpm seed
```

Then run the tests with:

```sh
pnpm test
```

## Development Conventions

-   **Monorepo:** The project is organized as a monorepo using pnpm workspaces. All applications and packages are located in the `apps/` and `packages/` directories, respectively.
-   **Build System:** Turborepo is used to manage the build process. The `turbo.json` file defines the build pipeline and dependencies between tasks.
-   **Linting and Formatting:** The project uses Biome for linting and formatting. The configuration can be found in the `biome.jsonc` file.
-   **Code Generation:** The project uses `drizzle-kit` for database schema migrations.
-   **API:** The backend API is built using Hono and tRPC. The API is documented using OpenAPI.

## Comment Discipline

Default to writing no comments. The code and identifiers should explain *what* — the reader can see that. Only write a comment when the *why* would not be obvious from reading the code: a non-obvious invariant, a workaround for a specific bug, a runtime guarantee that justifies a cast, a constraint imposed from outside this file.

-   **Keep them to 1 short line where possible**, 3 lines max. Never write multi-paragraph JSDoc blocks.
-   **Strip these every time:** restating what the code does, naming the caller / surface that uses the helper, history ("added for X", "used by the Y flow"), and PR/task context. That belongs in commit messages, not source.
-   **Keep these:** the WHY behind a non-obvious choice, an invariant that callers must uphold, a `// safe because …` line above an unavoidable cast, a `// workaround: <bug>` for a known issue.
-   **JSDoc:** allowed on exported symbols when the type signature alone is ambiguous — but one sentence, not a tutorial. Don't enumerate every branch of a function in prose.

If you find yourself writing a comment that explains *what just changed* or *what you did*, delete it.

## Type Cast Discipline

`as unknown as X`, `as never`, and `as any` are sometimes unavoidable — usually at boundaries with external SDKs (AI SDK, third-party libs) or at registry-style dispatch where TypeScript can't link a runtime string to a literal-keyed map. When you need one:

-   **Centralize the cast in a named helper.** Don't scatter the same cast across call sites. Wrap it in a small function whose name describes the intent (`asUIMessages`, `findRenderer`, `renderToolDraft`).
-   **Comment the runtime guarantee.** Above the helper, write one or two lines explaining *why the cast is safe at runtime* (e.g. "the persisted shape is validated on write by `storedMessageSchema`, so reads return SDK-conforming rows"). Future readers can verify the invariant or notice when it breaks.
-   **Examples:** `apps/dashboard/src/components/chat/use-chat-session.ts` (`asUIMessages`); `apps/dashboard/src/components/chat/tool-renderers/index.tsx` (`renderToolDraft` / `renderToolResult` / `summarizeToolOutput`). Both eliminate scattered casts in the consuming components.

A scattered `as never` is usually a missing helper.

## Services & Audit Log Pattern

All workspace-scoped business logic lives in `packages/services` — **not** in tRPC routers. Routers stay thin: validate input, call a service verb, map errors. This keeps logic reusable across tRPC, Hono, and background jobs, and keeps it Edge-safe (the dashboard runs tRPC on Next.js Edge, so service code must avoid `node:*` imports).

Conventions for any new mutation:

-   **One file per verb** under `packages/services/src/<entity>/` (e.g. `create.ts`, `update.ts`, `remove.ts`), re-exported from the entity's `index.ts`. Routers import from `@openstatus/services/<entity>`.
-   **Standard signature:** `async function verbEntity(args: { ctx: ServiceContext; input: VerbInput }): Promise<...>`. `ctx` carries `workspace`, `actor`, and an optional `db`/transaction. Parse input with the schema at the top of the function.
-   **Wrap mutations in `withTransaction(ctx, async (tx) => { ... })`** — it reuses an outer tx if present, otherwise opens one. Always pass `tx` (not `defaultDb`) to writes inside the block.
-   **Workspace scoping is mandatory.** Every read/write filters by `ctx.workspace.id`. Use the `getXInWorkspace` helpers in `internal.ts` for fetch-or-throw.
-   **Throw `ServiceError` subclasses** (`NotFoundError`, `ForbiddenError`, etc. from `./errors`). Routers convert them via `toTRPCError`.
-   **Emit an audit row for every mutation** via `emitAudit(tx, ctx, entry)` inside the same transaction. Fail-closed: a failed audit insert rolls back the mutation. See `packages/services/src/audit/emit.ts`.
    -   For updates, pass both `before` (pre-mutation snapshot) and `after` (post-`.returning()` row). `changed_fields` is auto-diffed; no-op updates are skipped.
    -   For creates/deletes, pass only `after` or only `before`.
    -   **Strip secrets** from snapshots before emitting (e.g. `credential`, bot tokens, raw API keys) — see `integration/remove.ts` for the pattern.
    -   Action names follow `{entity}.{verb}` (`monitor.update`, `integration.delete`). Add new variants to the discriminated union in `@openstatus/db/src/schema/audit_logs/validation.ts`.
-   **Tests live in `packages/services/src/<entity>/__tests__/`** and use `expectAuditRow({ workspaceId, action, entityId, ... })` from `packages/services/test/helpers.ts` to assert the audit side-effect. Each suite scopes to its own workspace and clears `audit_log` between cases.

When adding a router endpoint, the default answer is "write the service verb first, then call it from the router." Inline DB access in routers is a smell — it bypasses the audit log and the Edge-safety guarantee.

## Scope Enforcement (API key RBAC)

API keys carry **scopes** (`'read'` / `'write'`) that gate write access. See `packages/services/src/auth/`.

-   **Call `requireScope(ctx, "write")` as the first line** of every write verb — before `Input.parse(...)` and `withTransaction`. Import from `../auth`.
-   **"Write"** = any DB mutation **or** side-effecting external call (probes, webhooks, notifications). Everything else is read.
-   No-op for `user` / `system` / `slack` / `webhook` / `subscriber` actors; active for `apiKey` and `mcp`. Throws `ForbiddenError` on denial.
-   **Tests:** every entity's `__tests__/` includes a `'rejects read-only actor'` case via `makeApiKeyCtx(workspace, { keyId: "k", userId: 1, scopes: ["read"] })`. `requireScope` fires before DB lookup, so fake ids work for delete/update verbs.
-   **MCP tools** declare `scope: 'read' | 'write'` and register via `registerScopedTool` — read-only keys never see write tools.

Treat a missing `requireScope` the same as a missing `emitAudit` — mandatory for every mutation.

## Incident Creation

All incident lifecycle logic lives in `apps/workflows/src/checker/index.ts` (`processStatusUpdate`).

- **`error` status** → always creates an incident (one open incident per monitor at a time).
- **`degraded` status** → only creates an incident when the monitor column `degraded_triggers_incident` is `true` (default `false`).
- **`active` status** → resolves any open incident (error or degraded) via `resolveIncident` (sets `autoResolved = true`).

Incidents are resolved automatically when the monitor recovers. The `incidentTable` has a `unique(monitorId, startedAt)` constraint, so duplicate incident creation is prevented at the DB level. The `case "degraded"` with `degradedTriggersIncident` mirrors the `case "error"` pattern: check for existing open incident, insert, emit audit `incident.created`, and pass `incidentId` to notifications.
