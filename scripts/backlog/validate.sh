#!/usr/bin/env bash
# Validation pipeline for backlog agents.
# The TypeScript backlog runner is responsible for preparing worktree dependencies.
# This script runs the shared repo validation gates that every completed item must satisfy.
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
(cd packages/core && npx --no-install vitest run --reporter=dot) || fail "core tests"
pass "core tests"
(cd packages/figma-plugin && npx --no-install vitest run --passWithNoTests --reporter=dot) || fail "plugin tests"
pass "plugin tests"
(cd packages/server && npx --no-install vitest run --passWithNoTests --reporter=dot) || fail "server tests"
pass "server tests"

# Gate 2: Build
echo -e "${DIM}── Gate 2: Build ──${RESET}"
(cd packages/figma-plugin && npm run build) || fail "plugin build"
pass "plugin build"
(cd packages/server && npm run build) || fail "server build"
pass "server build"

# Gate 3: Lint (errors only — warnings are acceptable)
echo -e "${DIM}── Gate 3: Lint ──${RESET}"
LINT_OUT=$(npx --no-install eslint packages/*/src/ 2>&1 || true)
# Extract error count from eslint summary line like "✖ 102 problems (3 errors, 99 warnings)"
ERROR_COUNT=$(echo "$LINT_OUT" | sed -n 's/.*(\([0-9]*\) error.*/\1/p' || echo "0")
[ -z "$ERROR_COUNT" ] && ERROR_COUNT=0
if [ "$ERROR_COUNT" != "0" ]; then
  echo "$LINT_OUT" | grep "error" | grep -v "warning"
  fail "lint — $ERROR_COUNT errors"
fi
pass "lint ($ERROR_COUNT errors)"

# Gate 4: Headless UI validation (graceful skip if no browser)
echo -e "${DIM}── Gate 4: UI validation ──${RESET}"
node packages/figma-plugin/standalone/validate.mjs || fail "UI validation"
pass "UI validation"

echo ""
echo -e "${GREEN}All gates passed.${RESET}"
