#!/usr/bin/env bash
# =============================================================================
# Tinybird Self-Hosted Init Script for OpenStatus
# =============================================================================
# Runs entirely inside Docker — no local Python/tb CLI installation needed.
# Only prerequisite: Docker.
#
# Usage:
#   chmod +x scripts/tinybird-self-hosted-init.sh
#   ./scripts/tinybird-self-hosted-init.sh
#
# What it does:
#   1. Waits for Tinybird container to be healthy
#   2. Extracts the admin token from the running container
#   3. Runs tb CLI inside an ephemeral Docker container to push the project
#   4. Prints the admin token for .env.docker
# =============================================================================

set -euo pipefail

# ---- Configuration ----
TB_SERVICE="${TB_SERVICE:-tinybird-local}"
TB_PORT="${TB_PORT:-7181}"
TB_URL="http://${TB_SERVICE}:${TB_PORT}"
NETWORK="${NETWORK:-openstatus}"
PROJECT_DIR="${PROJECT_DIR:-packages/tinybird}"
PROJECT_DIR_ABS="$(cd "$(dirname "$0")/.." && pwd)/packages/tinybird"
RETRY_MAX="${RETRY_MAX:-30}"
RETRY_INTERVAL="${RETRY_INTERVAL:-2}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- Detect Docker Compose command ----
detect_compose_cmd() {
    if docker compose version &>/dev/null 2>&1; then
        echo "docker compose"
    elif command -v docker-compose &>/dev/null 2>&1; then
        echo "docker-compose"
    else
        log_error "Neither 'docker compose' nor 'docker-compose' found."
        exit 1
    fi
}

# ---- Wait for Tinybird to be healthy ----
wait_for_tinybird() {
    log_info "Waiting for Tinybird ($TB_SERVICE) to be healthy..."

    for i in $(seq 1 "$RETRY_MAX"); do
        if docker run --rm --network "$NETWORK" \
            curlimages/curl:latest \
            curl -sf "$TB_URL/" > /dev/null 2>&1; then
            log_ok "Tinybird is healthy (attempt $i/$RETRY_MAX)"
            return 0
        fi
        echo -n "." && sleep "$RETRY_INTERVAL"
    done
    echo ""

    log_error "Tinybird did not become healthy after $RETRY_MAX attempts."
    log_error "Check: docker compose ps $TB_SERVICE"
    log_error "Check: docker compose logs $TB_SERVICE"
    exit 1
}

# ---- Extract admin token from the running container ----
extract_admin_token() {
    log_info "Extracting admin token from $TB_SERVICE..." >&2

    local token container_name
    container_name=$("$COMPOSE_CMD" ps -q "$TB_SERVICE" 2>/dev/null || echo "")

    # Strategy 1: The /tokens endpoint (unauthenticated on tinybird-local).
    # Returns {"admin_token":"p.eyJ...","user_token":"p.eyJ...","workspace_admin_token":"p.eyJ..."}
    log_info "Trying /tokens endpoint..." >&2
    token=$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -sf "$TB_URL/tokens" 2>/dev/null | \
        docker run --rm -i python:3.12-slim python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    # /tokens returns a flat object with admin_token / workspace_admin_token keys
    token = data.get('admin_token', '') or data.get('workspace_admin_token', '')
    if token:
        print(token)
        sys.exit(0)
    # Fallback: try user_token
    token = data.get('user_token', '')
    if token:
        print(token)
except:
    pass
" 2>/dev/null || echo "")

    if [ -n "$token" ]; then
        echo "$token"
        log_ok "Token extracted via /tokens endpoint." >&2
        return 0
    fi

    # Strategy 2: The .tinyb file at /app/.tinyb inside the container.
    # Contains {"token":"p.eyJ..."} in JSON.
    log_info "/tokens returned empty. Trying .tinyb file..." >&2
    if [ -n "$container_name" ]; then
        token=$(docker exec "$container_name" cat /app/.tinyb 2>/dev/null | \
            docker run --rm -i python:3.12-slim python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    token = data.get('token', '')
    if token:
        print(token)
        sys.exit(0)
    # Try tokens map
    tokens_map = data.get('tokens', {})
    if tokens_map:
        print(list(tokens_map.values())[0])
except:
    pass
" 2>/dev/null || echo "")
    fi

    if [ -n "$token" ]; then
        echo "$token"
        log_ok "Token extracted from .tinyb file." >&2
        return 0
    fi

    # Strategy 3: Container logs (fragile — depends on log format).
    log_info ".tinyb not found. Trying container logs..." >&2
    token=$("$COMPOSE_CMD" logs "$TB_SERVICE" 2>/dev/null | \
        grep -oE 'p\.[A-Za-z0-9._-]{20,}' | \
        head -1 || echo "")

    if [ -n "$token" ]; then
        echo "$token"
        log_ok "Token extracted from container logs." >&2
        return 0
    fi

    log_error "Could not extract admin token from Tinybird." >&2
    log_error "" >&2
    log_error "Manual recovery:" >&2
    log_error "  1. Access http://localhost:${TB_PORT}/" >&2
    log_error "  2. Log in with default credentials (check container startup logs)" >&2
    log_error "  3. Navigate to Admin → Tokens → Create new admin token" >&2
    log_error "  4. Re-run with: TB_TOKEN='p.eyJ1...' $0" >&2
    exit 1
}

# ---- Push the Tinybird project using Docker ----
deploy_project() {
    local token="$1"

    log_info "Pushing Tinybird project from $PROJECT_DIR..."
    log_info "Target: $TB_URL"

    local deploy_output deploy_exit
    deploy_output=$(docker run --rm \
        --network "$NETWORK" \
        -v "${PROJECT_DIR_ABS}:/project" \
        -w /project \
        -e TB_HOST="$TB_URL" \
        python:3.12-slim \
        sh -c "
            set -e
            echo '==> Installing Tinybird CLI...'
            pip install --root-user-action=ignore --quiet 'tinybird-cli>=5,<6' 2>&1 | grep -v '^\[notice\]'
            echo 'CLI version:' \$(tb --version 2>&1 || echo 'unknown')

            echo '==> Authenticating...'
            tb auth --host '$TB_URL' --token '$token'

            echo '==> Cleaning up any existing resources (idempotent re-run)...'
            # Drop materialized views first (depend on datasources)
            for pipe in \$(tb pipe ls 2>/dev/null | awk '/^\\|/ && !/version/ {print \$2}' | grep -v '^endpoint__'); do
                echo '  Dropping pipe:' \$pipe
                tb pipe rm \$pipe --yes 2>&1 || true
            done
            # Then drop datasources
            for ds in \$(tb datasource ls 2>/dev/null | grep '^name:' | awk '{print \$2}'); do
                echo '  Dropping datasource:' \$ds
                tb datasource rm \$ds --yes 2>&1 || true
            done

            echo '==> Pushing datasources...'
            tb push datasources/ --force --yes

            echo '==> Pushing pipes...'
            tb push pipes/ --force --yes

            echo '==> Waiting for materialized views...'
            sleep 5

            echo '==> Pushing endpoints...'
            tb push endpoints/ --force --yes

            echo '==> Deployment complete.'
        " 2>&1) || deploy_exit=$?

    echo "$deploy_output" | while IFS= read -r line; do
        echo "  $line"
    done

    if [ "${deploy_exit:-0}" -ne 0 ]; then
        log_error "Deployment failed (exit code: $deploy_exit)."
        exit 1
    fi

    log_ok "Project pushed successfully."
}

# ---- Verify the deployment ----
verify_deployment() {
    local token="$1"

    log_info "Verifying deployment..."

    local result
    result=$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -sf -H "Authorization: Bearer $token" "$TB_URL/v0/datasources" 2>/dev/null | \
        docker run --rm -i python:3.12-slim python3 -c "
import sys, json
data = json.load(sys.stdin)
ds_count = len(data.get('datasources', []))
print(f'{ds_count}')
" 2>/dev/null || echo "0")

    log_info "Datasources deployed: $result"

    result=$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -sf -H "Authorization: Bearer $token" "$TB_URL/v0/pipes" 2>/dev/null | \
        docker run --rm -i python:3.12-slim python3 -c "
import sys, json
data = json.load(sys.stdin)
endpoints = [p['name'] for p in data.get('pipes',[]) if p['name'].startswith('endpoint__')]
print(len(endpoints))
" 2>/dev/null || echo "0")

    log_info "Endpoints deployed: $result"
}

# ---- Print summary ----
print_summary() {
    local token="$1"

    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}  Tinybird Deployment Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  ${CYAN}Admin token:${NC}"
    echo -e "  ${YELLOW}$token${NC}"
    echo ""
    echo -e "  ${CYAN}Add to .env.docker:${NC}"
    echo -e "  TINY_BIRD_API_KEY=${YELLOW}$token${NC}"
    echo -e "  TINYBIRD_URL=${YELLOW}$TB_URL${NC}"
    echo ""
    echo -e "  ${CYAN}If using Coolify's docker-compose (service name: tinybird):${NC}"
    echo -e "  TINYBIRD_URL=${YELLOW}http://tinybird:7181${NC}"
    echo ""
    echo -e "  ${CYAN}Then restart services:${NC}"
    echo -e "  ${YELLOW}docker compose restart server dashboard status-page private-location${NC}"
    echo ""
    echo -e "  ${CYAN}Verify an endpoint:${NC}"
    echo -e "  docker run --rm --network $NETWORK curlimages/curl:latest \\"
    echo -e "    curl -s -H 'Authorization: Bearer $token' \\"
    echo -e "    '$TB_URL/v0/pipes/endpoint__http_list_1d__v1.json?monitorId=1'"
    echo ""
}

# ---- Main ----
main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   OpenStatus — Tinybird Self-Hosted Init ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    COMPOSE_CMD=$(detect_compose_cmd)
    log_info "Using: $COMPOSE_CMD"

    # Check project dir
    if [ ! -d "$PROJECT_DIR_ABS" ]; then
        log_error "Project directory '$PROJECT_DIR_ABS' not found."
        log_error "Run this script from the repository root."
        exit 1
    fi

    # Allow token override via env var (for re-runs)
    if [ -n "${TB_TOKEN:-}" ]; then
        log_info "Using provided TB_TOKEN env var (skipping extraction)."
        ADMIN_TOKEN="$TB_TOKEN"
    else
        wait_for_tinybird
        ADMIN_TOKEN=$(extract_admin_token)
    fi

    log_ok "Admin token: ${ADMIN_TOKEN:0:20}..."

    deploy_project "$ADMIN_TOKEN"
    verify_deployment "$ADMIN_TOKEN"
    print_summary "$ADMIN_TOKEN"
}

main "$@"
