#!/usr/bin/env bash
# Lightweight validation for docs, prompts, and backlog metadata changes.
# This keeps non-product backlog work from paying the full repo validation cost
# while still proving the runner package builds and backlog state can be loaded.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'

fail() { echo -e "${RED}FAIL${RESET} $1"; exit 1; }
pass() { echo -e "${GREEN}PASS${RESET} $1"; }

echo -e "${DIM}── Gate 1: backlog runner build ──${RESET}"
pnpm --filter backlog-runner build || fail "backlog runner build"
pass "backlog runner build"

echo -e "${DIM}── Gate 2: backlog sync ──${RESET}"
pnpm backlog:sync >/dev/null || fail "backlog sync"
pass "backlog sync"

echo ""
echo -e "${GREEN}Docs/prompt validation passed.${RESET}"
