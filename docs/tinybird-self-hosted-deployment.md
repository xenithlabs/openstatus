# Tinybird Deployment HOWTO — OpenStatus Self-Hosted

## What You're Deploying

Tinybird is the analytics engine that powers every chart, graph, uptime percentage, latency percentile, and regional performance map in OpenStatus. Without it, your self-hosted instance will run monitors and fire alerts, but **all dashboards and status pages will show empty analytics**.

The Tinybird project lives in `packages/tinybird/` and contains:

| Artifact | Count | What it does |
|----------|-------|--------------|
| **Datasources** (`datasources/*.datasource`) | 54 | Table schemas for raw check data + materialized views |
| **Pipes** (`pipes/*.pipe`) | 46 | SQL queries that aggregate raw data into materialized views |
| **Endpoints** (`endpoints/*.pipe`) | 106 | HTTP APIs consumed by dashboard, status page, and server |

These must be deployed into the `tinybird-local` container in a specific order: **datasources → pipes → endpoints**.

---

## Quick Start (Recommended)

**No local software needed — only Docker.** The init script runs everything inside ephemeral Docker containers on the `openstatus` network.

### Option A: One-Shot Init Script

From the repository root:

```sh
chmod +x scripts/tinybird-self-hosted-init.sh
./scripts/tinybird-self-hosted-init.sh
```

The script (all inside Docker):
1. Waits for `tinybird-local` to be healthy (using `curlimages/curl`)
2. Extracts the admin token from the container (API → logs → auth file)
3. Runs `tb push datasources/ pipes/ endpoints/` inside a `python:3.12-slim` container (pinned to avoid Python 3.13+ incompatibility with `tinybird-cli>=5,<6`)
4. Prints the admin token — **save this** as your `TINY_BIRD_API_KEY`

After the script completes, add the token to your `.env.docker`:

```sh
# .env.docker
TINY_BIRD_API_KEY=p.eyJ1...  # ← the token printed by the init script
TINYBIRD_URL=http://tinybird-local:7181
# Or for Coolify (service named 'tinybird'):
# TINYBIRD_URL=http://tinybird:7181
```

Then restart the dependent services:

```sh
docker compose restart server dashboard status-page private-location
```

> **Re-running:** The script is idempotent — it drops existing resources before pushing so schema changes are applied cleanly. To skip token extraction on re-run:
> ```sh
> TB_TOKEN="p.eyJ1..." ./scripts/tinybird-self-hosted-init.sh
> ```

---

## Option B: Docker Compose Init Service

For fully automated startup, add a `tinybird-init` service that runs once at compose-up time. No manual script needed.

Create `docker-compose.tinybird-init.yaml`:

```yaml
services:
    tinybird-init:
        container_name: openstatus-tinybird-init
        image: python:3.12-slim
        # Pinned to 3.12 — tinybird-cli>=5,<6 requires Python <3.13
        networks:
            - openstatus
        volumes:
            - ./packages/tinybird:/project
        working_dir: /project
        entrypoint:
            - sh
            - -c
            - |
                set -e
                echo "==> Waiting for Tinybird to be ready..."
                for i in $$(seq 1 30); do
                    if curl -sf http://tinybird-local:7181/ > /dev/null 2>&1; then
                        echo "Tinybird is ready."
                        break
                    fi
                    echo "Waiting... ($$i/30)"
                    sleep 2
                done

                echo "==> Installing Tinybird CLI..."
                pip install --root-user-action=ignore --quiet "tinybird-cli>=5,<6"

                echo "==> Extracting admin token..."
                ADMIN_TOKEN=""

                # Strategy 1: /tokens endpoint (unauthenticated on tinybird-local).
                # Returns {"admin_token":"p.eyJ...","workspace_admin_token":"p.eyJ..."}
                ADMIN_TOKEN=$$(curl -sf http://tinybird-local:7181/tokens 2>/dev/null | \
                    python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    token = data.get('admin_token', '') or data.get('workspace_admin_token', '')
    if token:
        print(token); sys.exit(0)
    token = data.get('user_token', '')
    if token:
        print(token)
except: pass
" 2>/dev/null || echo "")

                # Strategy 2: .tinyb file (shared volume mount from tinybird-local).
                # The container stores its token at /app/.tinyb in JSON.
                if [ -z "$$ADMIN_TOKEN" ]; then
                    echo "/tokens returned empty. Trying .tinyb file..."
                    ADMIN_TOKEN=$$(cat /tinybird-auth/.tinyb 2>/dev/null | \
                        python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    token = data.get('token', '')
    if token:
        print(token)
except: pass
" 2>/dev/null | head -1 | tr -d '\n\r ' || echo "")
                fi

                # Strategy 3: shared auth file volume with raw token (if mounted).
                if [ -z "$$ADMIN_TOKEN" ]; then
                    echo "Checking raw auth file..."
                    ADMIN_TOKEN=$$(cat /tinybird-auth/token 2>/dev/null | head -1 | tr -d '\n\r ' || echo "")
                fi

                if [ -z "$$ADMIN_TOKEN" ]; then
                    echo ""
                    echo "ERROR: Could not extract admin token."
                    echo ""
                    echo "Run the init script instead:"
                    echo "  ./scripts/tinybird-self-hosted-init.sh"
                    echo ""
                    exit 1
                fi

                echo "==> Configuring tb CLI..."
                tb auth --host http://tinybird-local:7181 --token "$$ADMIN_TOKEN"

                echo "==> Pushing datasources (54 files)..."
                tb push datasources/ --force --yes

                echo "==> Pushing pipes (46 files)..."
                tb push pipes/ --force --yes

                echo "==> Waiting for materialized views..."
                sleep 5

                echo "==> Pushing endpoints (106 files)..."
                tb push endpoints/ --force --yes

                echo ""
                echo "============================================"
                echo " Tinybird deployment complete!"
                echo ""
                echo " Add this to your .env.docker:"
                echo "   TINY_BIRD_API_KEY=$$ADMIN_TOKEN"
                echo "   TINYBIRD_URL=http://tinybird-local:7181"
                echo ""
                echo " Then restart:"
                echo "   docker compose restart server dashboard status-page"
                echo "============================================"
        depends_on:
            tinybird-local:
                condition: service_healthy
        restart: "no"
```

Run it:

```sh
docker compose -f docker-compose.yaml -f docker-compose.tinybird-init.yaml up tinybird-init
```

> **Note:** The Docker Compose init service approach has one limitation — the init container cannot easily read logs from the `tinybird-local` container. If the token API strategy fails (unlikely once the container is healthy), use the standalone init script which has full access to `docker logs` and `docker exec`.

---

## Token Management in Production

### What tokens does OpenStatus need?

The app runtime needs a token with `PIPES:READ` scope to query endpoints. The admin token works but is overly permissive. For production:

```sh
# Create a read-only pipe token
tb token create jwt app_read_token \
    --ttl 8760h \
    --scope PIPES:READ \
    --resource endpoint__http_list_1d__v1 \
    --resource endpoint__http_list_7d__v1 \
    --resource endpoint__http_list_30d__v1 \
    --resource endpoint__http_uptime_30d__v1 \
    --resource endpoint__http_uptime_90d__v1 \
    # ... add all endpoint pipes as --resource entries
```

However, for simplicity in self-hosted setups, using the admin token is acceptable since it's all within the same Docker network.

### Token locations

| File | Purpose |
|------|---------|
| `.env.docker` → `TINY_BIRD_API_KEY` | Runtime token for server, dashboard, status-page |
| `.env.docker` → `TINYBIRD_TOKEN` | Token for the checker (Go service) |
| `.env.docker` → `TINYBIRD_URL` | URL for all services to reach Tinybird |

---

## Troubleshooting

### "tinybird-local not healthy" or script hangs

The script waits up to 60 seconds for Tinybird to be ready. If it times out:

```sh
docker compose ps tinybird-local
docker compose logs tinybird-local --tail 50
```

### "Authentication failed" when pushing

The admin token may have changed. Re-extract and re-run with the token:

```sh
TB_TOKEN="p.eyJ1..." ./scripts/tinybird-self-hosted-init.sh
```

### "The pipe 'endpoint__...' does not exist" at runtime

This typically means a `.pipe` file has a redundant `VERSION` header that causes a double version suffix. Tinybird appends `__v{N}` from the `VERSION N` header to the pipe name at deploy time. If the filename already includes `__v0`, the deployed pipe gets named `...__v0__v0` instead of `...__v0`.

**Fix:** remove the `VERSION N` line from the `.pipe` file when the filename already encodes the version. Then re-push:
```sh
tb push endpoints/<file>.pipe --force --yes
```

### "Datasource not found" during pipe push

This means the script ran pipes before datasources. The init script handles ordering correctly; if you're running manually, always push in order: datasources → pipes → endpoints.

### Schema migration conflicts on re-run

The init script cleans up existing resources before pushing to avoid migration conflicts. If you encounter errors like "the migration can't be executed to match the new definition", a `.datasource` file and its `__v0` snapshot have mismatched schemas (notably `tcp_response.datasource` must match `tcp_response__v0.datasource` — both 13 columns). This is fixed in the repo; if upgrading from an older checkout, verify the two files match.

### Empty analytics after deployment

1. Verify the token is set in `.env.docker`: `grep TINY_BIRD .env.docker`
2. Verify the URL matches your service name:
   - Standard docker-compose: `TINYBIRD_URL=http://tinybird-local:7181`
   - Coolify: `TINYBIRD_URL=http://tinybird:7181`
3. Check the server can reach Tinybird:
   ```sh
   docker compose exec server curl -sf http://tinybird-local:7181/
   ```
4. Test an endpoint from inside the Docker network:
   ```sh
   docker run --rm --network openstatus curlimages/curl:latest \
       curl -s -H "Authorization: Bearer $TOKEN" \
       "http://tinybird-local:7181/v0/pipes/endpoint__http_list_1d__v1.json?monitorId=1"
   ```
   If it returns `[]`, there's simply no monitoring data yet. Wait for a check cycle to complete.

### Lost admin token

If you lose the admin token and the container is still running with persisted data:

1. Access the Tinybird UI at `http://localhost:7181`
2. Log in with the default credentials (shown in container startup logs)
3. Navigate to Admin → Tokens → create a new admin token

If you can't access the UI either, you'll need to recreate:

```sh
docker compose down -v tinybird-local   # WARNING: destroys all Tinybird data
docker compose up -d tinybird-local
# Now capture the new admin token and re-run the init script
./scripts/tinybird-self-hosted-init.sh
```

---

## Verification Checklist

After deployment, verify each layer (all commands use Docker — no local tools needed):

```sh
TOKEN="p.eyJ1..."  # your admin token
NETWORK="openstatus"
TB_URL="http://tinybird-local:7181"   # or http://tinybird:7181 for Coolify

# 1. Tinybird is reachable from the Docker network
docker run --rm --network $NETWORK curlimages/curl:latest \
    curl -sf $TB_URL/ && echo "✅ Tinybird running"

# 2. Datasources exist
docker run --rm --network $NETWORK curlimages/curl:latest \
    curl -s -H "Authorization: Bearer $TOKEN" $TB_URL/v0/datasources | \
    docker run --rm -i python:3.12-slim python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(f'✅ {len(d.get(\"datasources\",[]))} datasources')"

# 3. Endpoints exist
docker run --rm --network $NETWORK curlimages/curl:latest \
    curl -s -H "Authorization: Bearer $TOKEN" $TB_URL/v0/pipes | \
    docker run --rm -i python:3.12-slim python3 -c \
    "import sys,json; d=json.load(sys.stdin); endpoints=[p['name'] for p in d.get('pipes',[]) if p['name'].startswith('endpoint__')]; print(f'✅ {len(endpoints)} endpoints')"

# 4. A sample endpoint responds
docker run --rm --network $NETWORK curlimages/curl:latest \
    curl -s -H "Authorization: Bearer $TOKEN" \
    "$TB_URL/v0/pipes/endpoint__http_list_1d__v1.json?monitorId=1" | \
    docker run --rm -i python:3.12-slim python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(f'✅ endpoint responds (rows: {len(d.get(\"data\",[]))})')"

# 5. OpenStatus services can reach Tinybird
docker compose exec server curl -sf http://tinybird-local:7181/ && echo "✅ Server → Tinybird OK"
```
