# syntax=docker/dockerfile:1.7-labs
# ── status-page-htmx Dockerfile ──────────────────────────────────────────
# Multi-stage: pnpm install → Tailwind build → Bun compile → distroless runtime

# ── deps: install workspace dependencies ─────────────────────────────────
FROM node:24-slim AS deps
ARG PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
COPY \
  --link \
  "pnpm-lock.yaml" "pnpm-workspace.yaml" "package.json" "/app/"
COPY --link --parents "apps/status-page-htmx/package.json" "/app/"
COPY --link --parents "packages/api/package.json" "/app/"
COPY --link --parents "packages/db/package.json" "/app/"
COPY --link --parents "packages/theme-store/package.json" "/app/"
COPY --link --parents "packages/tsconfig/package.json" "/app/"
COPY --link --parents "packages/locales/package.json" "/app/"
COPY --link --parents "packages/utils/package.json" "/app/"
COPY --link --parents "packages/error/package.json" "/app/"
COPY --link --parents "packages/tinybird/package.json" "/app/"
COPY --link --parents "packages/tracker/package.json" "/app/"
COPY --link --parents "packages/proto/package.json" "/app/"
COPY --link --parents "packages/services/package.json" "/app/"
RUN <<EOF
corepack enable
pnpm install --frozen-lockfile
EOF

# ── build: compile Tailwind CSS + Bun binary ─────────────────────────────
FROM oven/bun:1.3.11 AS build
ENV NODE_ENV=production
WORKDIR /app/apps/status-page-htmx
COPY --link "." "/app/"
COPY --from=deps --link "/app/node_modules" "/app/node_modules"
COPY --from=deps --link "/app/apps/status-page-htmx/node_modules" "/app/apps/status-page-htmx/node_modules"
COPY --from=deps --link "/app/packages" "/app/packages"

# Build Tailwind CSS
RUN bun x @tailwindcss/cli -i src/styles/input.css -o static/styles.css --minify

# Compile to standalone binary
RUN bun build --compile --sourcemap src/index.tsx --outfile=app

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
# Copy full monorepo source (build stage already has it)
COPY --link "." "/app/"
COPY --from=build --link "/app/node_modules" "/app/node_modules"
COPY --from=build --link "/app/apps/status-page-htmx/node_modules" "/app/apps/status-page-htmx/node_modules"
COPY --from=build --link "/app/packages" "/app/packages"
# Test entrypoint — override to run specific suites
ENV NODE_ENV=test
CMD ["bun", "test"]
