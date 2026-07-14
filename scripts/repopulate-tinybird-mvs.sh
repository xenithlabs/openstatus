#!/usr/bin/env bash
# =============================================================================
# repopulate-tinybird-mvs.sh
# Rebuild all Tinybird materialized views from their raw datasources.
# Runs entirely inside Docker — no local Python/curl installation needed.
# Only prerequisite: Docker.
#
# Usage:
#   chmod +x scripts/repopulate-tinybird-mvs.sh
#   ./scripts/repopulate-tinybird-mvs.sh
#
# What it does:
#   Fetches the current node SQL from each materialized pipe, truncates the
#   target datasource, deletes and recreates the node — which resets the
#   materialized pipe's offset so it processes all historical data.
# =============================================================================

set -euo pipefail

# ---- Configuration ----
TB_SERVICE="${TB_SERVICE:-tinybird-local}"
TB_PORT="${TB_PORT:-7181}"
TB_URL="http://${TB_SERVICE}:${TB_PORT}"
NETWORK="${NETWORK:-openstatus}"
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

    local token
    token=$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -sf "$TB_URL/tokens" 2>/dev/null | \
        docker run --rm -i python:3.12-slim python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    token = data.get('admin_token', '') or data.get('workspace_admin_token', '')
    if token:
        print(token)
        sys.exit(0)
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

    log_error "Could not extract admin token from Tinybird." >&2
    log_error "Try: TB_TOKEN='p.eyJ1...' $0" >&2
    exit 1
}

# ── Helpers ───────────────────────────────────────────────────────────────

tb_api() {
    local method="${1:-GET}"
    local path="$2"
    docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -s -X "$method" "${TB_URL}${path}" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" 2>/dev/null
}

py_json() {
    docker run --rm -i python:3.12-slim python3 -c "$1" 2>/dev/null
}

# ── Repopulate a single pipe ──────────────────────────────────────────────

repopulate_pipe() {
    local pipe="$1"

    echo -n "  ${YELLOW}${pipe}${NC} ... "

    # 1. Fetch pipe info to get node SQL and target datasource
    local pipe_info
    pipe_info=$(tb_api GET "/v0/pipes/${pipe}")
    if [ -z "$pipe_info" ]; then
        echo -e "${RED}pipe not found${NC}"
        return 1
    fi

    local datasource node_id node_sql node_name
    datasource=$(echo "$pipe_info" | py_json "
import sys, json
d = json.load(sys.stdin)
nodes = d.get('nodes', [])
if nodes:
    n = nodes[0]
    mat = n.get('materialized', '')
    ds_info = n.get('datasource', {})
    ds_name = ds_info.get('name', '')
    print(ds_name or mat)
")

    node_id=$(echo "$pipe_info" | py_json "
import sys, json
nodes = json.load(sys.stdin).get('nodes', [])
print(nodes[0]['id'] if nodes else '')
")

    node_name=$(echo "$pipe_info" | py_json "
import sys, json
nodes = json.load(sys.stdin).get('nodes', [])
print(nodes[0]['name'] if nodes else 'aggregate')
")

    node_sql=$(echo "$pipe_info" | py_json "
import sys, json
nodes = json.load(sys.stdin).get('nodes', [])
print(nodes[0]['sql'] if nodes else '')
")

    if [ -z "$node_sql" ] || [ -z "$datasource" ]; then
        echo -e "${RED}no node or datasource found${NC}"
        return 1
    fi

    # 2. Truncate target datasource
    local trunc_resp
    trunc_resp=$(tb_api POST "/v0/datasources/${datasource}/truncate")
    if echo "$trunc_resp" | grep -qi "error"; then
        echo -e "${RED}truncate failed${NC}"
        return 1
    fi

    # 3. Delete existing nodes
    local all_node_ids
    all_node_ids=$(echo "$pipe_info" | py_json "
import sys, json
for n in json.load(sys.stdin).get('nodes', []):
    print(n['id'])
")

    for nid in $all_node_ids; do
        tb_api DELETE "/v0/pipes/${pipe}/nodes/${nid}" > /dev/null 2>&1
    done

    # 4. Recreate node with the original SQL
    local create_resp
    create_resp=$(docker run --rm --network "$NETWORK" curlimages/curl:latest \
        curl -s -X POST "${TB_URL}/v0/pipes/${pipe}/nodes" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        --data-urlencode "name=${node_name}" \
        --data-urlencode "sql=${node_sql}" \
        --data-urlencode "type=materialized" \
        --data-urlencode "datasource=${datasource}" 2>/dev/null)

    if echo "$create_resp" | grep -q '"id"'; then
        echo -e "${GREEN}OK${NC} (→ ${datasource})"
    else
        local err_msg
        err_msg=$(echo "$create_resp" | py_json "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('error', d.get('message', str(d)[:200])))
except:
    print(sys.stdin.read()[:200])
" || echo "$create_resp")
        echo -e "${RED}create failed: ${err_msg:0:200}${NC}"
        return 1
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────

main() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║   OpenStatus — Tinybird MV Repopulation  ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
    echo ""

    COMPOSE_CMD=$(detect_compose_cmd)
    log_info "Using: $COMPOSE_CMD"
    log_info "Network: $NETWORK"
    log_info "Target: $TB_URL"
    echo ""

    # Allow token override via env var (for re-runs)
    if [ -n "${TB_TOKEN:-}" ]; then
        log_info "Using provided TB_TOKEN env var (skipping extraction)."
        ADMIN_TOKEN="$TB_TOKEN"
    else
        wait_for_tinybird
        ADMIN_TOKEN=$(extract_admin_token)
    fi

    log_ok "Admin token: ${ADMIN_TOKEN:0:20}..."
    echo ""

    # Discover all materialized pipes and their target datasources
    log_info "Discovering materialized pipes..."
    local pipe_list
    pipe_list=$(tb_api GET "/v0/pipes" | py_json "
import sys, json
pipes = json.load(sys.stdin).get('pipes', [])
for p in pipes:
    if p.get('type') == 'materialized':
        name = p.get('name', '')
        if name.startswith('aggregate__'):
            print(name)
")

    if [ -z "$pipe_list" ]; then
        log_error "No materialized pipes found."
        exit 1
    fi

    # Convert to array
    readarray -t PIPES <<< "$pipe_list"
    TOTAL=${#PIPES[@]}
    PASS=0
    FAIL=0

    log_info "Pipes to repopulate: $TOTAL"
    echo ""

    for pipe in "${PIPES[@]}"; do
        [ -z "$pipe" ] && continue
        repopulate_pipe "$pipe"
        if [ $? -eq 0 ]; then
            ((PASS++)) || true
        else
            ((FAIL++)) || true
        fi
    done

    echo ""
    echo -e "${GREEN}=========================================${NC}"
    echo -e " Results: ${GREEN}${PASS}${NC} passed, ${RED}${FAIL}${NC} failed (of ${TOTAL})"
    echo -e "${GREEN}=========================================${NC}"

    if [ "$FAIL" -gt 0 ]; then
        exit 1
    fi

    echo ""
    log_info "MVs are repopulating. Full backfill may take a few minutes."
    echo "Check progress with:"
    echo "  docker run --rm --network $NETWORK curlimages/curl:latest \\"
    echo "    curl -H 'Authorization: Bearer \$ADMIN_TOKEN' \\"
    echo "    '$TB_URL/v0/sql?q=SELECT%20count()%20FROM%20mv__http_14d__v1'"
    echo ""
}

main "$@"
