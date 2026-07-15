#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# compare-status-pages.sh
#
# Head-to-head comparison suite for the Next.js status-page vs HTMX status-page.
#
# Usage:
#   ./scripts/compare-status-pages.sh              # Full run
#   ./scripts/compare-status-pages.sh --build-only # Build images only
#   ./scripts/compare-status-pages.sh --test-only  # Run tests (assumes running)
#   ./scripts/compare-status-pages.sh --cleanup    # Tear down
#
# Prerequisites:
#   - Docker with compose plugin
#   - .env.docker configured (DATABASE_URL, AUTH_SECRET, etc.)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yaml"
COMPARE_PROFILE="comparison"
COMPARE_RESULT_FILE="$PROJECT_DIR/compare-results.txt"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()  { echo -e "${BLUE}[compare]${NC} $*"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ warn ]${NC} $*"; }
fail() { echo -e "${RED}[ FAIL ]${NC} $*"; }

# ── Help ────────────────────────────────────────────────────────────────────

usage() {
  cat << 'EOF'
Usage: compare-status-pages.sh [OPTION]

Options:
  --build-only    Build Docker images, don't run tests
  --test-only     Run tests against already-running services (skip build/seed)
  --cleanup       Stop and remove comparison containers
  --help          Show this message

Without options, performs the full pipeline:
  1. Migrate + seed the database (if not already done)
  2. Seed comparison test data
  3. Build comparison Docker images
  4. Start both status pages + run comparison tests
  5. Print results and clean up
EOF
  exit 0
}

# ── Cleanup ──────────────────────────────────────────────────────────────────

do_cleanup() {
  log "Stopping comparison services..."
  docker compose -f "$COMPOSE_FILE" --profile "$COMPARE_PROFILE" down \
    --volumes --remove-orphans 2>/dev/null || true
  ok "Comparison services stopped"
}

# ── Build ────────────────────────────────────────────────────────────────────

do_build() {
  log "Building comparison Docker images..."
  docker compose -f "$COMPOSE_FILE" --profile "$COMPARE_PROFILE" build \
    status-page-htmx status-page-compare
  ok "Build complete"
}

# ── Seed comparison data ─────────────────────────────────────────────────────

do_seed() {
  log "Checking if database is seeded..."
  
  # Run migrate + seed if not already done. These are no-ops if DB exists.
  log "Running migrations..."
  docker compose -f "$COMPOSE_FILE" run --rm db-migrate 2>&1 | tail -3 || true
  
  log "Seeding base data..."
  docker compose -f "$COMPOSE_FILE" --profile seed run --rm db-seed 2>&1 | tail -3 || true
  
  ok "Base seed complete"
}

# ── Run tests ────────────────────────────────────────────────────────────────

do_test() {
  log "Starting comparison services..."

  # Start both status pages + the compare runner.
  # --abort-on-container-exit stops everything when the test container finishes.
  # --exit-code-from returns the test container's exit code.
  set +e
  docker compose -f "$COMPOSE_FILE" --profile "$COMPARE_PROFILE" up \
    --abort-on-container-exit \
    --exit-code-from status-page-compare \
    --attach status-page-compare \
    status-page-compare 2>&1 | tee "$COMPARE_RESULT_FILE"
  EXIT_CODE=$?
  set -e

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    ok "All comparison tests PASSED"
  else
    fail "Comparison tests FAILED (exit code: $EXIT_CODE)"
  fi

  # Print summary from results file
  if [ -f "$COMPARE_RESULT_FILE" ]; then
    echo ""
    echo "──────────────────────────────────────────────────────────"
    echo "  Test Summary"
    echo "──────────────────────────────────────────────────────────"
    grep -E '(pass|fail|test|PASS|FAIL|✓|✗|expect)' "$COMPARE_RESULT_FILE" \
      | tail -30 || true
    echo "──────────────────────────────────────────────────────────"
  fi

  return $EXIT_CODE
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  local MODE="full"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --build-only) MODE="build"; shift ;;
      --test-only)  MODE="test"; shift ;;
      --cleanup)    do_cleanup; exit 0 ;;
      --help)       usage ;;
      *)            warn "Unknown option: $1"; usage ;;
    esac
  done

  cd "$PROJECT_DIR"

  case "$MODE" in
    build)
      do_build
      ok "Build-only complete. Run with --test-only to execute tests."
      ;;
    test)
      do_test
      ;;
    full)
      log "=== OpenStatus Status Page Comparison Suite ==="
      echo ""

      do_build
      echo ""

      do_seed
      echo ""

      do_test
      EXIT_CODE=$?
      echo ""

      log "Cleaning up..."
      do_cleanup

      echo ""
      if [ $EXIT_CODE -eq 0 ]; then
        ok "Comparison suite completed successfully."
        echo ""
        echo "  Next.js status page  : http://localhost:3003/test-page/en"
        echo "  HTMX  status page   : http://localhost:3004/test-page/en"
        echo ""
        echo "  Results saved to    : $COMPARE_RESULT_FILE"
      else
        fail "Comparison suite exited with code $EXIT_CODE"
        echo "  Check $COMPARE_RESULT_FILE for details"
      fi
      exit $EXIT_CODE
      ;;
  esac
}

main "$@"
