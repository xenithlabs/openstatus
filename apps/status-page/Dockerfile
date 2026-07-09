# syntax=docker/dockerfile:1.7-labs
# Generated from dofigen.yml (dofigen v2.7.0) with manual --parents overrides.
# See https://github.com/lenra-io/dofigen

# deps-files
FROM node@sha256:0afb7822fac7bf9d7c1bf3b6e6c496dee6b2b64d8dfa365501a3c68e8eba94b2 AS deps-files
ARG PNPM_HOME=/pnpm
LABEL \
    org.opencontainers.image.base.digest="sha256:0afb7822fac7bf9d7c1bf3b6e6c496dee6b2b64d8dfa365501a3c68e8eba94b2" \
    org.opencontainers.image.base.name="docker.io/node:24-slim"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
COPY \
    --link \
    "pnpm-lock.yaml" "pnpm-workspace.yaml" "package.json" "/app/"
COPY \
    --link --parents \
    "apps/*/package.json" "/app/"
COPY \
    --link --parents \
    "packages/*/package.json" "/app/"
COPY \
    --link --parents \
    "packages/*/*/package.json" "/app/"
RUN <<EOF
corepack enable
pnpm install --frozen-lockfile
EOF

# deps
FROM deps-files AS deps
ARG CRON_SECRET=test
ARG DATABASE_AUTH_TOKEN=test
ARG DATABASE_URL=http://libsql:8080
ARG NEXT_PUBLIC_OPENPANEL_CLIENT_ID=test
ARG NEXT_PUBLIC_URL=http://localhost:3002
ARG NODE_ENV=production
ARG OPENPANEL_CLIENT_SECRET=test
ARG PROJECT_ID_VERCEL=test
ARG RESEND_API_KEY=test
ARG SELF_HOST=true
ARG STRIPE_SECRET_KEY=test
ARG TEAM_ID_VERCEL=test
ARG TINY_BIRD_API_KEY=test
ARG UNKEY_API_ID=test
ARG UNKEY_TOKEN=test
ARG UPSTASH_REDIS_REST_TOKEN=test
ARG UPSTASH_REDIS_REST_URL=https://test.upstash.io
ARG VERCEL_AUTH_BEARER_TOKEN=test
ENV PATH="$PNPM_HOME:$PATH"
COPY \
    --link \
    "." "/app/"

# deps-check
FROM deps-files AS deps-check
RUN echo "deps-files cache valid"

# builder
FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN pnpm turbo run build --filter=@openstatus/status-page --concurrency=1

# typecheck
FROM deps AS typecheck
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN pnpm turbo run typecheck --filter=@openstatus/status-page --concurrency=1

# runtime
FROM node@sha256:0afb7822fac7bf9d7c1bf3b6e6c496dee6b2b64d8dfa365501a3c68e8eba94b2 AS runtime
LABEL \
    io.dofigen.version="2.7.0" \
    org.opencontainers.image.base.digest="sha256:0afb7822fac7bf9d7c1bf3b6e6c496dee6b2b64d8dfa365501a3c68e8eba94b2" \
    org.opencontainers.image.base.name="docker.io/node:24-slim"
WORKDIR /app/apps/status-page
COPY \
    --from=builder \
    --chown=1000:1000 \
    --chmod=555 \
    --link \
    "/app/apps/status-page/.next/standalone/apps/status-page/" "./"
COPY \
    --from=builder \
    --chown=1000:1000 \
    --link \
    "/app/node_modules/" "/app/node_modules/"
COPY \
    --from=builder \
    --chown=1000:1000 \
    --link \
    "/app/apps/status-page/.next/static/" "./.next/static/"
COPY \
    --from=builder \
    --chown=1000:1000 \
    --link \
    "/app/apps/status-page/public/" "./public/"
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
    --start-period=45s \
    --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "server.js"]
