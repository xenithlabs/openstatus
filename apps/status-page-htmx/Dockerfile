# syntax=docker/dockerfile:1.7-labs
# ── status-page-htmx Dockerfile ──────────────────────────────────────────
# Multi-stage with a deps-base layer that installs all workspace
# dependencies via pnpm. The build stage uses --target bun to produce a
# binary that resolves workspace packages at runtime.
#
# Layer strategy (expensive → cheap):
#   deps-base   — pnpm install (rebuilds when deps change)
#   build       — Tailwind + bun --compile --target bun (app code changes)
#   runtime     — minimal debian + compiled binary

# ── deps-base: install all workspace dependencies via pnpm ───────────────
FROM node:24-slim AS deps-base
ARG PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

COPY \
  --link \
  "pnpm-lock.yaml" "pnpm-workspace.yaml" "package.json" "/app/"

# Copy workspace package manifests for pnpm workspace resolution
COPY --link --parents \
  "apps/status-page-htmx/package.json" \
  "packages/api/package.json" \
  "packages/db/package.json" \
  "packages/theme-store/package.json" \
  "packages/tsconfig/package.json" \
  "packages/locales/package.json" \
  "packages/utils/package.json" \
  "packages/error/package.json" \
  "packages/tinybird/package.json" \
  "packages/tracker/package.json" \
  "packages/proto/package.json" \
  "packages/services/package.json" \
  "packages/notifications/base/package.json" \
  "packages/notifications/discord/package.json" \
  "packages/notifications/email/package.json" \
  "packages/notifications/grafana-oncall/package.json" \
  "packages/notifications/google-chat/package.json" \
  "packages/notifications/ms-teams/package.json" \
  "packages/notifications/ntfy/package.json" \
  "packages/notifications/opsgenie/package.json" \
  "packages/notifications/pagerduty/package.json" \
  "packages/notifications/slack/package.json" \
  "packages/notifications/telegram/package.json" \
  "packages/notifications/bird-whatsapp/package.json" \
  "packages/notifications/twillio-sms/package.json" \
  "packages/notifications/webhook/package.json" \
  "packages/analytics/package.json" \
  "packages/assertions/package.json" \
  "packages/emails/package.json" \
  "packages/subscriptions/package.json" \
  "packages/upstash/package.json" \
  "packages/regions/package.json" \
  "packages/importers/package.json" \
  "/app/"

RUN corepack enable && pnpm install --frozen-lockfile

# Copy workspace package source files (needed by bun build to resolve
# workspace:* package sources at compile time).
COPY --link --parents \
  "apps/status-page-htmx/tsconfig.json" \
  "apps/status-page-htmx/src" \
  "packages/api" \
  "packages/db" \
  "packages/theme-store" \
  "packages/locales" \
  "packages/utils" \
  "packages/error" \
  "packages/tinybird" \
  "packages/tracker" \
  "packages/proto" \
  "packages/services" \
  "packages/notifications" \
  "packages/analytics" \
  "packages/assertions" \
  "packages/emails" \
  "packages/subscriptions" \
  "packages/upstash" \
  "packages/regions" \
  "packages/importers" \
  "/app/"

# ── build: Tailwind + Bun compile ────────────────────────────────────────
FROM oven/bun:1.3.11 AS build
ENV NODE_ENV=production
WORKDIR /app/apps/status-page-htmx

# Copy only the htmx app source (not the full monorepo — avoids bun
# scanning unrelated workspace packages during resolution)
COPY --link \
  "apps/status-page-htmx/package.json" \
  "apps/status-page-htmx/tsconfig.json" \
  "/app/apps/status-page-htmx/"
COPY --link "apps/status-page-htmx/src" "/app/apps/status-page-htmx/src"
COPY --link "apps/status-page-htmx/static" "/app/apps/status-page-htmx/static"
COPY --from=deps-base --link "/app/node_modules" "/app/node_modules"
COPY --from=deps-base --link "/app/apps/status-page-htmx/node_modules" "/app/apps/status-page-htmx/node_modules"
COPY --from=deps-base --link "/app/packages" "/app/packages"

# Build Tailwind CSS
RUN bun x @tailwindcss/cli -i src/styles/input.css -o static/styles.css --minify

# Compile to standalone binary. Clear bun's module cache so workspace
# package changes are re-bundled.
RUN rm -rf /root/.bun /tmp/bun-* /tmp/cli* && bun build --compile --target bun --sourcemap src/index.tsx --outfile=app

# ── runtime: minimal Debian ──────────────────────────────────────────────
FROM debian:bullseye-slim AS runtime
LABEL \
  org.opencontainers.image.authors="OpenStatus Team" \
  org.opencontainers.image.description="HTMX status page server for OpenStatus" \
  org.opencontainers.image.source="https://github.com/openstatusHQ/openstatus" \
  org.opencontainers.image.title="OpenStatus Status Page (HTMX)"

COPY \
  --from=build \
  --chown=1000:1000 \
  --chmod=555 \
  --link \
  "/app/apps/status-page-htmx/app" "/bin/"
COPY \
  --from=build \
  --chown=1000:1000 \
  --link \
  "/app/apps/status-page-htmx/static" "/static"

USER 0:0
RUN <<EOF
apt-get update
apt-get install -y --no-install-recommends curl
rm -rf /var/lib/apt/lists/*
EOF
USER 1000:1000
EXPOSE 3000
HEALTHCHECK \
  --interval=30s \
  --timeout=10s \
  --start-period=15s \
  --retries=3 \
  CMD curl -f http://localhost:3000/ping || exit 1
ENTRYPOINT ["/bin/app"]

# ── test: run unit + integration + rendering tests ───────────────────────
FROM oven/bun:1.3.11 AS test
WORKDIR /app/apps/status-page-htmx
COPY --link "." "/app/"
COPY --from=build --link "/app/node_modules" "/app/node_modules"
COPY --from=build --link "/app/apps/status-page-htmx/node_modules" "/app/apps/status-page-htmx/node_modules"
COPY --from=build --link "/app/packages" "/app/packages"
ENV NODE_ENV=test
CMD ["bun", "test"]
