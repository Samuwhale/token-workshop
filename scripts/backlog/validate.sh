#!/usr/bin/env bash
# Validation pipeline for backlog agents.
# Runs in worktrees (no turbo, no pnpm — just npm/npx + symlinked node_modules).
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
ERROR_COUNT=$(echo "$LINT_OUT" | grep -oP '\d+ error' | grep -oP '\d+' || echo "0")
if [ "$ERROR_COUNT" != "0" ] && [ "$ERROR_COUNT" != "3" ]; then
  # 3 errors are pre-existing baseline — only fail if new errors introduced
  echo "$LINT_OUT" | grep "error" | grep -v "warning"
  fail "lint — $ERROR_COUNT errors (baseline is 3)"
fi
pass "lint ($ERROR_COUNT errors, baseline 3)"

# Gate 4: Headless UI validation (graceful skip if no browser)
echo -e "${DIM}── Gate 4: UI validation ──${RESET}"
node packages/figma-plugin/standalone/validate.mjs || fail "UI validation"
pass "UI validation"

echo ""
echo -e "${GREEN}All gates passed.${RESET}"
