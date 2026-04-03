#!/usr/bin/env bash
# Validation pipeline for backlog agents.
# Runs in worktrees (no turbo, no pnpm — uses npm/npx + symlinked node_modules).
#
# Worktrees only get root node_modules symlinked. Per-package node_modules
# (pnpm workspace links) are missing. This script handles that by symlinking
# them if needed, then cleaning up.
#
# Usage: bash scripts/backlog/validate.sh
# Exit codes: 0 = all gates pass, 1 = failure

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'

fail() { echo -e "${RED}FAIL${RESET} $1"; exit 1; }
pass() { echo -e "${GREEN}PASS${RESET} $1"; }

# --- Ensure per-package node_modules exist (worktree support) ---
# In a pnpm worktree, per-package node_modules are .gitignored and missing.
# We symlink each package's node_modules from the main tree (which has pnpm's
# workspace links including .bin/ entries for package-level devDeps like vitest).
CREATED_LINKS=()
# Resolve the main project root from the root node_modules symlink target
MAIN_ROOT=""
if [ -L "node_modules" ]; then
  MAIN_ROOT=$(cd -P "node_modules/.." 2>/dev/null && pwd)
fi

ensure_pkg_node_modules() {
  [ -z "$MAIN_ROOT" ] && return 0 # not in a worktree, nothing to do
  for pkg in packages/*/; do
    local pkg_name
    pkg_name=$(basename "$pkg")
    local main_pkg_nm="$MAIN_ROOT/packages/$pkg_name/node_modules"
    local local_nm="${pkg}node_modules"
    # Skip if already a symlink pointing to the right place
    [ -L "$local_nm" ] && continue
    # Skip if a real node_modules with .bin exists (proper install)
    [ -d "${local_nm}/.bin" ] && continue
    if [ -d "$main_pkg_nm" ]; then
      # Move any existing vite/vitest cache dirs out of the way, then symlink
      if [ -d "$local_nm" ]; then
        rm -rf "${local_nm}.bak" 2>/dev/null
        mv "$local_nm" "${local_nm}.bak"
      fi
      ln -s "$main_pkg_nm" "$local_nm"
      CREATED_LINKS+=("$local_nm")
    fi
  done
}
cleanup_pkg_links() {
  for link in "${CREATED_LINKS[@]:-}"; do
    rm -f "$link" 2>/dev/null
    # Restore any backed-up cache dir
    if [ -d "${link}.bak" ]; then
      mv "${link}.bak" "$link" 2>/dev/null
    fi
  done
}
trap cleanup_pkg_links EXIT
ensure_pkg_node_modules

# Gate 1: Unit/integration tests
echo -e "${DIM}── Gate 1: Tests ──${RESET}"
(cd packages/core && npx vitest run --reporter=dot) || fail "core tests"
pass "core tests"
(cd packages/figma-plugin && npx vitest run --passWithNoTests --reporter=dot) || fail "plugin tests"
pass "plugin tests"
(cd packages/server && npx vitest run --passWithNoTests --reporter=dot) || fail "server tests"
pass "server tests"

# Gate 2: Build (plugin only — server has pre-existing type errors)
echo -e "${DIM}── Gate 2: Build ──${RESET}"
(cd packages/figma-plugin && npm run build) || fail "plugin build"
pass "plugin build"

# Gate 3: Lint (errors only — warnings are acceptable)
echo -e "${DIM}── Gate 3: Lint ──${RESET}"
LINT_OUT=$(npx eslint packages/*/src/ 2>&1 || true)
# Extract error count from eslint summary line like "✖ 102 problems (3 errors, 99 warnings)"
ERROR_COUNT=$(echo "$LINT_OUT" | sed -n 's/.*(\([0-9]*\) error.*/\1/p' || echo "0")
[ -z "$ERROR_COUNT" ] && ERROR_COUNT=0
if [ "$ERROR_COUNT" != "0" ] && [ "$ERROR_COUNT" -gt "5" ]; then
  # 5 errors are pre-existing baseline — only fail if new errors introduced
  echo "$LINT_OUT" | grep "error" | grep -v "warning"
  fail "lint — $ERROR_COUNT errors (baseline is 5)"
fi
pass "lint ($ERROR_COUNT errors, baseline 5)"

# Gate 4: Headless UI validation (graceful skip if no browser)
echo -e "${DIM}── Gate 4: UI validation ──${RESET}"
node packages/figma-plugin/standalone/validate.mjs || fail "UI validation"
pass "UI validation"

echo ""
echo -e "${GREEN}All gates passed.${RESET}"
