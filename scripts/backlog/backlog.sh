#!/bin/bash
# Backlog Runner - Long-running agent loop for backlog.md
# Usage: ./backlog.sh [--tool amp|claude] [max_iterations]
#
# Concurrency-safe: multiple runners can operate on the same backlog
# simultaneously. All backlog.md mutations are serialised by file locks
# and performed in the shell — agents never modify backlog.md directly.
#
# Continuity between sessions via two files:
#   backlog.md      task state ([ ] / [~] / [x] / [!])
#   patterns.md     reusable codebase patterns (injected into every session)
#   progress.txt    full per-item log (human audit trail, not injected)

set -e

STOP_REQUESTED=0
graceful_stop() {
  STOP_REQUESTED=1
  echo ""
  echo "  → Stop requested — will exit after current item completes."
}
trap graceful_stop INT TERM

TOOL="claude"
MAX_ITERATIONS=20

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)    TOOL="$2"; shift 2 ;;
    --tool=*)  TOOL="${1#*=}"; shift ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then MAX_ITERATIONS="$1"; fi
      shift ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKLOG_FILE="$PROJECT_ROOT/backlog.md"
INBOX_FILE="$PROJECT_ROOT/backlog-inbox.md"
STOP_FILE="$PROJECT_ROOT/backlog-stop"
PATTERNS_FILE="$SCRIPT_DIR/patterns.md"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
BACKLOG_LOCKDIR="$PROJECT_ROOT/.backlog.lock"
GIT_LOCKDIR="$PROJECT_ROOT/.backlog-git.lock"

if [ ! -f "$BACKLOG_FILE" ]; then
  echo "Error: backlog.md not found at $PROJECT_ROOT"
  exit 1
fi

if [ ! -f "$PATTERNS_FILE" ]; then
  echo "Error: patterns.md not found at $SCRIPT_DIR"
  exit 1
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Backlog Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# ─── Lock primitives ───────────────────────────────────────────────
# Uses mkdir for portable atomic locking (works on macOS + Linux).
# Re-entrant: if the calling process already holds the lock, returns
# immediately. This prevents deadlocks during EXIT-trap cleanup.

acquire_lock() {
  local lockdir="$1"
  local timeout="${2:-30}"
  # Re-entrant: if we already hold this lock, succeed immediately
  if [ -d "$lockdir" ]; then
    local lock_pid=$(cat "$lockdir/pid" 2>/dev/null || echo "")
    if [ "$lock_pid" = "$$" ]; then
      return 0
    fi
  fi
  local attempts=0
  local max_attempts=$((timeout * 5))  # 0.2s sleep per attempt
  while ! mkdir "$lockdir" 2>/dev/null; do
    # Check for stale lock from dead process
    local lock_pid=$(cat "$lockdir/pid" 2>/dev/null || echo "")
    if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
      rm -rf "$lockdir"
      continue  # retry mkdir immediately — only one racer will succeed
    fi
    attempts=$((attempts + 1))
    if [ "$attempts" -ge "$max_attempts" ]; then
      echo "ERROR: Could not acquire lock $lockdir after ${timeout}s"
      return 1
    fi
    sleep 0.2
  done
  echo $$ > "$lockdir/pid"
}

release_lock() {
  rm -rf "$1"
}

# ─── Backlog mutation helpers ──────────────────────────────────────
# All backlog.md writes go through these, under lock.

CLAIMED_ITEM=""  # Tracks claimed item for EXIT-trap cleanup

claim_next_item() {
  acquire_lock "$BACKLOG_LOCKDIR" || return 1

  # HIGH/P0 items take priority
  local item_line=$(grep -n -m1 -E '^\- \[ \] \[(HIGH|P0)\]' "$BACKLOG_FILE" 2>/dev/null || true)
  if [ -z "$item_line" ]; then
    item_line=$(grep -n -m1 -E '^\- \[ \]' "$BACKLOG_FILE" 2>/dev/null || true)
  fi

  if [ -z "$item_line" ]; then
    release_lock "$BACKLOG_LOCKDIR"
    return 1  # nothing to claim
  fi

  local line_num=$(echo "$item_line" | cut -d: -f1)
  CLAIMED_ITEM=$(echo "$item_line" | cut -d: -f2- | sed 's/^- \[ \] //')

  # Mark [~] via atomic temp-file + mv
  local tmpfile=$(mktemp "$BACKLOG_FILE.XXXXXX")
  sed "${line_num}s/^\(- \)\[ \]/\1[~]/" "$BACKLOG_FILE" > "$tmpfile" \
    && mv "$tmpfile" "$BACKLOG_FILE" \
    || { rm -f "$tmpfile"; CLAIMED_ITEM=""; release_lock "$BACKLOG_LOCKDIR"; return 1; }

  release_lock "$BACKLOG_LOCKDIR"
}

update_item_status() {
  local to_marker="$1"  # x, !, or space (for unclaim)
  local item="$2"
  [ -z "$item" ] && return 0
  acquire_lock "$BACKLOG_LOCKDIR" || return 1

  local tmpfile=$(mktemp "$BACKLOG_FILE.XXXXXX")
  # awk index() does literal string matching — safe for special chars in item text
  awk -v to="$to_marker" -v item="$item" '
    !done && index($0, "[~] " item) {
      sub(/\[~\]/, "[" to "]")
      done = 1
    }
    {print}
  ' "$BACKLOG_FILE" > "$tmpfile" \
    && mv "$tmpfile" "$BACKLOG_FILE" \
    || rm -f "$tmpfile"

  release_lock "$BACKLOG_LOCKDIR"
}

# ─── EXIT trap: unclaim on crash ──────────────────────────────────

cleanup_on_exit() {
  if [ -n "$CLAIMED_ITEM" ]; then
    update_item_status " " "$CLAIMED_ITEM" 2>/dev/null || true
    CLAIMED_ITEM=""
  fi
}
trap cleanup_on_exit EXIT

remaining() {
  grep -cE '^\- \[ \]' "$BACKLOG_FILE" 2>/dev/null || echo 0
}

# ─── Stale [~] recovery ──────────────────────────────────────────
# Only reset stale items if no other backlog runners are active,
# to avoid nuking items legitimately in-progress by another runner.

STALE=$(grep -cE '^\- \[~\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
if [ "$STALE" -gt 0 ]; then
  OTHER_RUNNERS=$(pgrep -f "backlog\.sh" 2>/dev/null | grep -v $$ | wc -l | tr -d ' ')
  if [ "$OTHER_RUNNERS" -eq 0 ]; then
    echo "WARNING: $STALE stale [~] item(s) from a crashed session — resetting to [ ]"
    acquire_lock "$BACKLOG_LOCKDIR"
    TMPFILE=$(mktemp "$BACKLOG_FILE.XXXXXX")
    sed 's/^\(- \)\[~\]/\1[ ]/g' "$BACKLOG_FILE" > "$TMPFILE" \
      && mv "$TMPFILE" "$BACKLOG_FILE" \
      || rm -f "$TMPFILE"
    release_lock "$BACKLOG_LOCKDIR"
  else
    echo "NOTE: $STALE [~] item(s) found — skipping reset ($OTHER_RUNNERS other runner(s) active)"
  fi
fi

# ─── Git helpers ──────────────────────────────────────────────────
# Serialises git operations across runners and retries push with
# rebase on conflict (non-fast-forward rejection).

git_commit_and_push() {
  local message="$1"
  acquire_lock "$GIT_LOCKDIR" || return 1

  if [ -z "$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null)" ]; then
    release_lock "$GIT_LOCKDIR"
    return 0
  fi

  git -C "$PROJECT_ROOT" add -A
  git -C "$PROJECT_ROOT" commit -m "$message" || { release_lock "$GIT_LOCKDIR"; return 0; }

  local attempt=0
  while [ $attempt -lt 3 ]; do
    if git -C "$PROJECT_ROOT" push 2>/dev/null; then
      release_lock "$GIT_LOCKDIR"
      return 0
    fi
    attempt=$((attempt + 1))
    git -C "$PROJECT_ROOT" pull --rebase --autostash 2>/dev/null || true
    sleep $((attempt * 2))
  done

  echo "WARNING: Push failed after 3 attempts — changes committed locally"
  release_lock "$GIT_LOCKDIR"
}

# ─── Inbox drain ─────────────────────────────────────────────────
# Triages backlog-inbox.md items into backlog.md under the same lock
# used for claim/update, preventing conflicts with concurrent runners.

drain_inbox() {
  acquire_lock "$BACKLOG_LOCKDIR" 5 || { echo "  (inbox drain skipped — lock timeout)"; return 0; }

  if [ ! -f "$INBOX_FILE" ] || ! grep -qE '\S' "$INBOX_FILE" 2>/dev/null; then
    release_lock "$BACKLOG_LOCKDIR"
    return 0
  fi

  echo ""
  echo "--- Inbox has new items — triaging into backlog.md ---"

  # Normalise priority items: `- [HIGH] …` → `- [ ] [HIGH] …`
  local inbox_tmp=$(mktemp "$INBOX_FILE.XXXXXX")
  sed 's/^- \[\(HIGH\|P0\)\] /- [ ] [\1] /' "$INBOX_FILE" > "$inbox_tmp" \
    && mv "$inbox_tmp" "$INBOX_FILE" \
    || rm -f "$inbox_tmp"

  HIGH_ITEMS=$(grep -E '^\- \[ \] \[(HIGH|P0)\]' "$INBOX_FILE" 2>/dev/null || true)
  OTHER_ITEMS=$(grep -vE '^\- \[ \] \[(HIGH|P0)\]' "$INBOX_FILE" 2>/dev/null || true)

  # HIGH/P0: insert before the first [ ] item so the agent picks them next.
  if [ -n "$HIGH_ITEMS" ]; then
    FIRST_TODO_LINE=$(grep -n '^\- \[ \]' "$BACKLOG_FILE" | head -1 | cut -d: -f1)
    if [ -n "$FIRST_TODO_LINE" ]; then
      INSERT_AT=$((FIRST_TODO_LINE - 1))
      HEAD=$(head -n "$INSERT_AT" "$BACKLOG_FILE")
      TAIL=$(tail -n +"$FIRST_TODO_LINE" "$BACKLOG_FILE")
      TMPFILE=$(mktemp "$BACKLOG_FILE.XXXXXX")
      printf '%s\n%s\n%s' "$HEAD" "$HIGH_ITEMS" "$TAIL" > "$TMPFILE" && mv "$TMPFILE" "$BACKLOG_FILE" || rm -f "$TMPFILE"
      echo "  → $(echo "$HIGH_ITEMS" | wc -l | tr -d ' ') HIGH/P0 item(s) inserted at top of queue"
    else
      echo "" >> "$BACKLOG_FILE"
      echo "$HIGH_ITEMS" >> "$BACKLOG_FILE"
      echo "  → HIGH/P0 item(s) appended (no existing [ ] items found)"
    fi
  fi

  # Normal items: append to bottom
  if [ -n "$OTHER_ITEMS" ]; then
    echo "" >> "$BACKLOG_FILE"
    echo "$OTHER_ITEMS" >> "$BACKLOG_FILE"
    echo "  → Normal item(s) appended to bottom"
  fi

  truncate -s 0 "$INBOX_FILE"
  echo "--- Inbox drained ---"

  release_lock "$BACKLOG_LOCKDIR"
}

# JSON schema for structured agent output
JSON_SCHEMA='{"type":"object","properties":{"status":{"type":"string","enum":["done","failed"]},"item":{"type":"string"},"note":{"type":"string"}},"required":["status"]}'

echo "Starting Backlog Runner — Tool: $TOOL — Max iterations: $MAX_ITERATIONS"
echo "  Remaining items: $(remaining)"
echo "  Stop signal:     Ctrl+C  (or: touch $STOP_FILE)"

for i in $(seq 1 $MAX_ITERATIONS); do
  REMAINING=$(remaining)
  echo ""
  echo "==============================================================="
  echo "  Iteration $i / $MAX_ITERATIONS  ($TOOL)  —  $REMAINING items remaining"
  echo "==============================================================="

  # Early exit: no [ ] items left
  if [ "$REMAINING" -eq 0 ]; then
    echo ""
    echo "No remaining [ ] items in backlog.md. All done!"
    exit 0
  fi

  # ── Claim an item under lock ──
  CLAIMED_ITEM=""
  if ! claim_next_item; then
    echo "No items available to claim (all in-progress or empty). Exiting."
    exit 0
  fi
  echo "  Claimed: $CLAIMED_ITEM"

  # ── Run the agent ──
  # The claimed item is injected into the agent's context so it knows
  # exactly which item to work on without reading backlog.md.
  if [[ "$TOOL" == "amp" ]]; then
    PROMPT_FILE=$(mktemp)
    cat "$SCRIPT_DIR/CLAUDE.md" > "$PROMPT_FILE"
    printf '\n---\n\n## Assigned Item\n\nWork on this specific item (already marked [~] in backlog.md):\n\n%s\n\nDo NOT pick a different item. Do NOT modify backlog.md.\n' "$CLAIMED_ITEM" >> "$PROMPT_FILE"
    OUTPUT=$(cat "$PROMPT_FILE" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
    rm -f "$PROMPT_FILE"
  else
    # Build context file: patterns + recent progress + assigned item
    CONTEXT_FILE=$(mktemp)
    cat "$PATTERNS_FILE" > "$CONTEXT_FILE"
    printf '\n\n## Recent session log:\n' >> "$CONTEXT_FILE"
    awk '/^## /{found=1; count++} found && count<=3{print} /^---$/ && found && count>=3{exit}' \
      "$PROGRESS_FILE" >> "$CONTEXT_FILE" 2>/dev/null || true
    printf '\n\n## Assigned Item\n\nWork on this specific item (already marked [~] in backlog.md):\n\n%s\n\nDo NOT pick a different item. Do NOT modify backlog.md.\n' "$CLAIMED_ITEM" >> "$CONTEXT_FILE"

    AGENT_TMP=$(mktemp)
    # Run agent in background so the parent's wait builtin is interruptible by
    # Ctrl+C (fires graceful_stop) without killing the agent process itself.
    (trap '' INT; claude \
      --dangerously-skip-permissions \
      --print \
      --no-session-persistence \
      --max-turns 100 \
      --output-format json \
      --json-schema "$JSON_SCHEMA" \
      --fallback-model claude-haiku-4-5-20251001 \
      --append-system-prompt-file "$CONTEXT_FILE" \
      < "$SCRIPT_DIR/CLAUDE.md" > "$AGENT_TMP" 2>/dev/null) &
    AGENT_PID=$!
    wait $AGENT_PID || true

    rm -f "$CONTEXT_FILE"
    OUTPUT=$(cat "$AGENT_TMP")
    rm -f "$AGENT_TMP"

    # Human-readable agent summary
    _S=$(echo "$OUTPUT" | jq -r '.structured_output.status // ""' 2>/dev/null || echo "")
    _ITEM=$(echo "$OUTPUT" | jq -r '.structured_output.item // ""' 2>/dev/null || echo "")
    _NOTE=$(echo "$OUTPUT" | jq -r '.structured_output.note // ""' 2>/dev/null || echo "")
    _TURNS=$(echo "$OUTPUT" | jq -r '.num_turns // ""' 2>/dev/null || echo "")
    _SECS=$(echo "$OUTPUT" | jq -r 'if .duration_ms then ((.duration_ms/1000)|floor|tostring)+"s" else "" end' 2>/dev/null || echo "")
    _COST=$(echo "$OUTPUT" | jq -r 'if .total_cost_usd then "$"+(.total_cost_usd*100|round/100|tostring) else "" end' 2>/dev/null || echo "")
    case "$_S" in done) _ICON="✓" ;; failed) _ICON="✗" ;; *) _ICON="·" ;; esac
    echo ""
    if [ -n "$_ITEM" ]; then echo "  $_ICON $_S: $_ITEM"; else echo "  $_ICON ${_S:-unknown}"; fi
    [ -n "$_NOTE" ] && echo "    $_NOTE"
    _META="${_TURNS:+${_TURNS} turns}${_SECS:+ · ${_SECS}}${_COST:+ · ${_COST}}"
    [ -n "$_META" ] && echo "    ${_META# · }"
  fi

  # ── Update backlog status based on agent result ──
  STATUS=$(echo "$OUTPUT" | jq -r '.structured_output.status // ""' 2>/dev/null || echo "")
  ITEM_FROM_AGENT=$(echo "$OUTPUT" | jq -r '.structured_output.item // ""' 2>/dev/null || echo "")

  case "$STATUS" in
    done)
      PUSH_ITEM="${ITEM_FROM_AGENT:-$CLAIMED_ITEM}"
      update_item_status "x" "$CLAIMED_ITEM"
      CLAIMED_ITEM=""  # prevent EXIT trap from unclaiming
      echo ""
      echo "--- Pushing: $PUSH_ITEM ---"
      git_commit_and_push "chore(backlog): done – $PUSH_ITEM"
      ;;
    failed)
      update_item_status "!" "$CLAIMED_ITEM"
      CLAIMED_ITEM=""
      ;;
    *)
      echo "WARNING: Agent returned unexpected status '$STATUS' — unclaiming item"
      update_item_status " " "$CLAIMED_ITEM"
      CLAIMED_ITEM=""
      ;;
  esac

  # ── Drain inbox ──
  drain_inbox

  # Print last progress entry (header + bullet lines only)
  SUMMARY=$(awk '/^## /{found=1; buf=""} found && !/^---/{buf=buf"\n"$0} /^---$/ && found{last=buf; found=0} END{print last}' "$PROGRESS_FILE" | sed '/^[[:space:]]*$/d' | head -4)
  if [ -n "$SUMMARY" ]; then
    echo ""
    echo "$SUMMARY"
  fi

  # Graceful stop — triggered by Ctrl+C (STOP_REQUESTED) or stop file
  if [ "$STOP_REQUESTED" -eq 1 ] || [ -f "$STOP_FILE" ]; then
    [ -f "$STOP_FILE" ] && rm -f "$STOP_FILE"
    echo ""
    echo "Stop signal received. Exiting after iteration $i."
    exit 0
  fi

  sleep 2 || true
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS) without completing."
echo "  Remaining items: $(remaining)"
echo "  Check backlog.md for current status."
exit 1
