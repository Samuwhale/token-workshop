#!/bin/bash
# Backlog Runner - Long-running agent loop for backlog.md
# Usage: ./backlog.sh [--tool amp|claude] [--model <model-id>] [--passes true|false] [--pass-frequency N]
#
# Concurrency-safe: each agent runs in an isolated git worktree.
# backlog.md mutations are serialised by file locks.
# Code changes are cherry-picked back to main under a git lock.
#
# Continuity between sessions via two files:
#   backlog.md      task state ([ ] / [~] / [x] / [!])
#   patterns.md     reusable codebase patterns (injected into every session)
#   progress.txt    full per-item log (human audit trail, not injected)

set -eo pipefail

STOP_REQUESTED=0
graceful_stop() {
  STOP_REQUESTED=1
  echo ""
  echo "  → Stop requested — will exit after current item completes."
}
trap graceful_stop INT TERM

TOOL="claude"
MODEL="claude-sonnet-4-6"
PASSES_ENABLED=1
PASS_FREQUENCY=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)             TOOL="$2"; shift 2 ;;
    --tool=*)           TOOL="${1#*=}"; shift ;;
    --model)            MODEL="$2"; shift 2 ;;
    --model=*)          MODEL="${1#*=}"; shift ;;
    --passes)
      case "$2" in
        true|1|yes)   PASSES_ENABLED=1 ;;
        false|0|no)   PASSES_ENABLED=0 ;;
        *)            echo "Error: --passes must be true or false"; exit 1 ;;
      esac
      shift 2 ;;
    --passes=*)
      _v="${1#*=}"
      case "$_v" in
        true|1|yes)   PASSES_ENABLED=1 ;;
        false|0|no)   PASSES_ENABLED=0 ;;
        *)            echo "Error: --passes must be true or false"; exit 1 ;;
      esac
      shift ;;
    --pass-frequency)   PASS_FREQUENCY="$2"; shift 2 ;;
    --pass-frequency=*) PASS_FREQUENCY="${1#*=}"; shift ;;
    *)                  shift ;;
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
COUNTER_FILE="$SCRIPT_DIR/.completed-count"
ARCHIVE_FILE="$SCRIPT_DIR/backlog-archive.md"
PASS_LOCKDIR="$PROJECT_ROOT/.backlog-pass.lock"
WORKTREE_DIR=""  # Current agent worktree (cleaned up by EXIT trap)
CONSECUTIVE_FAILURES=0
MAX_CONSECUTIVE_FAILURES=5

# Runner log — persists operational output alongside progress.txt
RUNNER_LOG="$SCRIPT_DIR/runner-$(date +%Y%m%d-%H%M%S).log"
exec > >(trap '' INT; tee -a "$RUNNER_LOG") 2>&1

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

# Try to acquire a pass lock, cleaning up stale locks from dead processes first.
try_pass_lock() {
  local lock_pid
  lock_pid=$(cat "$PASS_LOCKDIR/pid" 2>/dev/null || echo "")
  if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
    rm -rf "$PASS_LOCKDIR"
  fi
  mkdir "$PASS_LOCKDIR" 2>/dev/null
}

# ─── Backlog mutation helpers ──────────────────────────────────────
# All backlog.md writes go through these, under lock.

CLAIMED_ITEM=""  # Tracks claimed item for EXIT-trap cleanup

claim_next_item() {
  acquire_lock "$BACKLOG_LOCKDIR" || return 1

  # HIGH/P0/BUG items take priority
  local item_line=$(grep -n -m1 -E '^\- \[ \] \[(HIGH|P0|BUG)\]' "$BACKLOG_FILE" 2>/dev/null || true)
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
  # Tear down any active worktree
  if [ -n "$WORKTREE_DIR" ] && [ -d "$WORKTREE_DIR" ]; then
    rm -f "$WORKTREE_DIR/node_modules" 2>/dev/null
    git -C "$PROJECT_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null \
      || { rm -rf "$WORKTREE_DIR"; git -C "$PROJECT_ROOT" worktree prune 2>/dev/null; }
    WORKTREE_DIR=""
  fi
  # Release any locks we hold
  local lockdir
  for lockdir in "$PASS_LOCKDIR" "$BACKLOG_LOCKDIR" "$GIT_LOCKDIR"; do
    local lock_pid=$(cat "$lockdir/pid" 2>/dev/null || echo "")
    if [ "$lock_pid" = "$$" ]; then
      rm -rf "$lockdir"
    fi
  done
}
trap cleanup_on_exit EXIT

remaining() {
  local count
  count=$(grep -cE '^\- \[ \]' "$BACKLOG_FILE" 2>/dev/null || echo "0")
  # Sanitize: strip anything non-numeric (defensive against grep edge cases)
  count="${count//[!0-9]/}"
  printf '%d\n' "${count:-0}"
}

# ─── Stale [~] recovery ──────────────────────────────────────────
# Only reset stale items if no other backlog runners are active,
# to avoid nuking items legitimately in-progress by another runner.

STALE=$(grep -cE '^\- \[~\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
if [ "$STALE" -gt 0 ]; then
  OTHER_RUNNERS=$(pgrep -f "backlog\.sh" 2>/dev/null | grep -v $$ | wc -l | tr -d ' ' || true)
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

# Clean up orphaned worktrees and stale locks from crashed runners
git -C "$PROJECT_ROOT" worktree prune 2>/dev/null
for _lockdir in "$BACKLOG_LOCKDIR" "$GIT_LOCKDIR" "$PASS_LOCKDIR"; do
  _lock_pid=$(cat "$_lockdir/pid" 2>/dev/null || echo "")
  if [ -n "$_lock_pid" ] && ! kill -0 "$_lock_pid" 2>/dev/null; then
    echo "Cleaning stale lock: $_lockdir (dead PID $_lock_pid)"
    rm -rf "$_lockdir"
  fi
done

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

# ─── Worktree isolation ─────────────────────────────────────────
# Each agent runs in a disposable git worktree so concurrent runners
# never edit files in the same working directory. Code changes are
# cherry-picked back to main; shared append-only files (progress.txt,
# patterns.md) are extracted and appended separately to avoid conflicts.

PROGRESS_BASELINE=0
PATTERNS_BASELINE=0
WORKTREE_BASE_SHA=""  # SHA the worktree was created at (for new-commit detection)

setup_worktree() {
  WORKTREE_BASE_SHA=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo "")
  WORKTREE_DIR=$(mktemp -d "/tmp/backlog-$$-XXXXXX")
  if ! git -C "$PROJECT_ROOT" worktree add --detach "$WORKTREE_DIR" HEAD --quiet 2>/dev/null; then
    echo "ERROR: Failed to create worktree at $WORKTREE_DIR"
    rm -rf "$WORKTREE_DIR"
    WORKTREE_DIR=""
    return 1
  fi
  ln -s "$PROJECT_ROOT/node_modules" "$WORKTREE_DIR/node_modules"
  PROGRESS_BASELINE=$(wc -l < "$WORKTREE_DIR/scripts/backlog/progress.txt" 2>/dev/null || echo 0)
  PATTERNS_BASELINE=$(wc -l < "$WORKTREE_DIR/scripts/backlog/patterns.md" 2>/dev/null || echo 0)
  # Trim leading whitespace from wc -l on macOS
  PROGRESS_BASELINE=$(echo "$PROGRESS_BASELINE" | tr -d ' ')
  PATTERNS_BASELINE=$(echo "$PATTERNS_BASELINE" | tr -d ' ')
}

teardown_worktree() {
  [ -z "$WORKTREE_DIR" ] || [ ! -d "$WORKTREE_DIR" ] && return 0
  rm -f "$WORKTREE_DIR/node_modules" 2>/dev/null
  git -C "$PROJECT_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null \
    || { rm -rf "$WORKTREE_DIR"; git -C "$PROJECT_ROOT" worktree prune 2>/dev/null; }
  WORKTREE_DIR=""
}

# Merges agent changes from a worktree back into main.
# Shared files (progress.txt, patterns.md) are extracted and appended
# separately so they never conflict between concurrent agents.
# Returns 0 on success, 1 on cherry-pick conflict.
merge_worktree_to_main() {
  local message="$1"
  [ -z "$WORKTREE_DIR" ] || [ ! -d "$WORKTREE_DIR" ] && return 0

  # 1. Extract shared-file additions (lines appended by the agent)
  local progress_new="" patterns_new=""
  local wt_progress="$WORKTREE_DIR/scripts/backlog/progress.txt"
  local wt_patterns="$WORKTREE_DIR/scripts/backlog/patterns.md"

  if [ -f "$wt_progress" ]; then
    local current_lines
    current_lines=$(wc -l < "$wt_progress" | tr -d ' ')
    if [ "$current_lines" -gt "$PROGRESS_BASELINE" ]; then
      progress_new=$(tail -n +$((PROGRESS_BASELINE + 1)) "$wt_progress")
    fi
  fi

  if [ -f "$wt_patterns" ]; then
    local current_lines
    current_lines=$(wc -l < "$wt_patterns" | tr -d ' ')
    if [ "$current_lines" -gt "$PATTERNS_BASELINE" ]; then
      patterns_new=$(tail -n +$((PATTERNS_BASELINE + 1)) "$wt_patterns")
    fi
  fi

  # 2. Restore shared files in worktree to HEAD so they're excluded from the code commit
  git -C "$WORKTREE_DIR" checkout HEAD -- scripts/backlog/progress.txt 2>/dev/null || true
  git -C "$WORKTREE_DIR" checkout HEAD -- scripts/backlog/patterns.md 2>/dev/null || true

  # 3. Commit code-only changes in worktree (detached HEAD)
  # Remove node_modules symlink — .gitignore's `node_modules/` pattern
  # matches directories but not symlinks, so git sees it as untracked.
  rm -f "$WORKTREE_DIR/node_modules" 2>/dev/null

  local worktree_sha=""
  if [ -n "$(git -C "$WORKTREE_DIR" status --porcelain 2>/dev/null)" ]; then
    git -C "$WORKTREE_DIR" add -A 2>/dev/null
    git -C "$WORKTREE_DIR" commit -m "backlog agent work" --quiet 2>/dev/null || true
    worktree_sha=$(git -C "$WORKTREE_DIR" rev-parse HEAD 2>/dev/null || echo "")
    # Verify the SHA is actually a new commit (not the base we started from).
    # Compare against WORKTREE_BASE_SHA, NOT current main HEAD — main may have
    # moved due to concurrent runners, which would give a false positive.
    if [ "$worktree_sha" = "$WORKTREE_BASE_SHA" ]; then
      worktree_sha=""
    fi
  fi

  # Nothing to merge?
  if [ -z "$worktree_sha" ] && [ -z "$progress_new" ] && [ -z "$patterns_new" ]; then
    return 0
  fi

  # 4. Merge back to main under git lock
  acquire_lock "$GIT_LOCKDIR" || return 1

  # Sync main with remote first
  git -C "$PROJECT_ROOT" pull --rebase --autostash 2>/dev/null || true

  # Cherry-pick code changes (if any).
  # The worktree was detached at an older HEAD — if main has moved (maintenance
  # passes, concurrent runners), rebase the agent commit onto current main first
  # so the cherry-pick applies cleanly.
  if [ -n "$worktree_sha" ]; then
    local current_main
    current_main=$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null)
    if [ "$current_main" != "$WORKTREE_BASE_SHA" ]; then
      # Rebase the agent commit onto current main inside the worktree.
      # Worktrees share the .git object store, so current_main is already reachable.
      if git -C "$WORKTREE_DIR" rebase -X theirs "$current_main" --quiet 2>/dev/null; then
        worktree_sha=$(git -C "$WORKTREE_DIR" rev-parse HEAD 2>/dev/null || echo "")
      else
        git -C "$WORKTREE_DIR" rebase --abort 2>/dev/null || true
        # Fall through to cherry-pick — it may still succeed for non-overlapping changes
      fi
    fi
    if ! git -C "$PROJECT_ROOT" cherry-pick --no-commit -X theirs "$worktree_sha" 2>/dev/null; then
      echo "  WARNING: Cherry-pick conflict — aborting merge"
      git -C "$PROJECT_ROOT" cherry-pick --abort 2>/dev/null || true
      git -C "$PROJECT_ROOT" reset --hard HEAD 2>/dev/null || true
      release_lock "$GIT_LOCKDIR"
      return 1
    fi
  fi

  # Append shared-file additions to main repo copies
  [ -n "$progress_new" ] && printf '%s\n' "$progress_new" >> "$PROGRESS_FILE"
  [ -n "$patterns_new" ] && printf '%s\n' "$patterns_new" >> "$PATTERNS_FILE"

  # Stage everything and commit
  git -C "$PROJECT_ROOT" add -A 2>/dev/null
  git -C "$PROJECT_ROOT" commit -m "$message" 2>/dev/null || { release_lock "$GIT_LOCKDIR"; return 0; }

  # Push with retry (same logic as git_commit_and_push)
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

  # Normalise all list items to `- [ ] …` format so claim_next_item can find them.
  #   - [HIGH] …  → - [ ] [HIGH] …
  #   - [P0] …    → - [ ] [P0] …
  #   - [BUG] …   → - [ ] [BUG] …
  #   - [!] …     → - [ ] …          (strip failed marker — re-enter as todo)
  local inbox_tmp=$(mktemp "$INBOX_FILE.XXXXXX")
  sed -E \
    -e 's/^- \[(HIGH|P0|BUG)\] /- [ ] [\1] /' \
    -e 's/^- \[!\] /- [ ] /' \
    "$INBOX_FILE" > "$inbox_tmp" \
    && mv "$inbox_tmp" "$INBOX_FILE" \
    || rm -f "$inbox_tmp"

  # Dedup: drop inbox items whose title (first ~60 chars after checkbox) already
  # appears in backlog.md (any state: [ ], [~], [x], [!]).  This prevents
  # discovery passes from re-adding items that are already queued or done.
  local dedup_tmp=$(mktemp "$INBOX_FILE.XXXXXX")
  local skipped=0
  while IFS= read -r line; do
    if [[ "$line" =~ ^-\ \[.\] ]]; then
      # Extract a signature: strip checkbox + optional priority tag, take first 60 chars
      local sig=$(echo "$line" | sed -E 's/^- \[.\] (\[(HIGH|P0|BUG)\] )?//' | cut -c1-60)
      if grep -qF "$sig" "$BACKLOG_FILE" 2>/dev/null; then
        skipped=$((skipped + 1))
        continue
      fi
    fi
    printf '%s\n' "$line"
  done < "$INBOX_FILE" > "$dedup_tmp"
  mv "$dedup_tmp" "$INBOX_FILE" || rm -f "$dedup_tmp"
  if [ "$skipped" -gt 0 ]; then
    echo "  → $skipped duplicate item(s) skipped"
  fi

  HIGH_ITEMS=$(grep -E '^\- \[ \] \[(HIGH|P0|BUG)\]' "$INBOX_FILE" 2>/dev/null || true)
  OTHER_ITEMS=$(grep -E '^\- \[ \]' "$INBOX_FILE" 2>/dev/null | grep -vE '\[(HIGH|P0|BUG)\]' || true)

  # HIGH/P0/BUG: insert before the first [ ] item so the agent picks them next.
  if [ -n "$HIGH_ITEMS" ]; then
    FIRST_TODO_LINE=$(grep -n -m1 '^\- \[ \]' "$BACKLOG_FILE" | cut -d: -f1 || true)
    if [ -n "$FIRST_TODO_LINE" ]; then
      INSERT_AT=$((FIRST_TODO_LINE - 1))
      HEAD=$(head -n "$INSERT_AT" "$BACKLOG_FILE")
      TAIL=$(tail -n +"$FIRST_TODO_LINE" "$BACKLOG_FILE")
      TMPFILE=$(mktemp "$BACKLOG_FILE.XXXXXX")
      printf '%s\n%s\n%s' "$HEAD" "$HIGH_ITEMS" "$TAIL" > "$TMPFILE" && mv "$TMPFILE" "$BACKLOG_FILE" || rm -f "$TMPFILE"
      echo "  → $(echo "$HIGH_ITEMS" | wc -l | tr -d ' ') priority item(s) inserted at top of queue"
    else
      echo "" >> "$BACKLOG_FILE"
      echo "$HIGH_ITEMS" >> "$BACKLOG_FILE"
      echo "  → Priority item(s) appended (no existing [ ] items found)"
    fi
  fi

  # Normal items: append to bottom
  if [ -n "$OTHER_ITEMS" ]; then
    echo "" >> "$BACKLOG_FILE"
    echo "$OTHER_ITEMS" >> "$BACKLOG_FILE"
    echo "  → $(echo "$OTHER_ITEMS" | wc -l | tr -d ' ') normal item(s) appended to bottom"
  fi

  : > "$INBOX_FILE"
  echo "--- Inbox drained ---"

  release_lock "$BACKLOG_LOCKDIR"
}

# ─── Completed-item counter ───────────────────────────────────────
# Persisted across sessions. Used to trigger periodic maintenance passes.

get_completed_count() {
  cat "$COUNTER_FILE" 2>/dev/null || echo "0"
}

# Atomically increments the counter under the backlog lock.
# Returns the new count. Safe for concurrent runners.
increment_completed_count() {
  acquire_lock "$BACKLOG_LOCKDIR" || { echo "0"; return 1; }
  local count
  count=$(cat "$COUNTER_FILE" 2>/dev/null || echo "0")
  count=$((count + 1))
  echo "$count" > "$COUNTER_FILE"
  release_lock "$BACKLOG_LOCKDIR"
  echo "$count"
}

# ─── Periodic cleanup ─────────────────────────────────────────────
# Archives [x] items from backlog.md and trims old progress.txt sections
# when they exceed thresholds. Keeps agent context lean.

cleanup_if_needed() {
  local done_count
  done_count=$(grep -cE '^\- \[x\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
  if [ "$done_count" -le 20 ]; then return 0; fi

  echo ""
  echo "--- Cleanup: archiving completed items (≥$done_count) ---"

  if [ ! -f "$ARCHIVE_FILE" ]; then
    echo "# Backlog Archive" > "$ARCHIVE_FILE"
    echo "Completed items removed from backlog.md to keep it lean." >> "$ARCHIVE_FILE"
  fi

  acquire_lock "$BACKLOG_LOCKDIR" || { echo "  (cleanup skipped — lock timeout)"; return 0; }

  # Re-count inside lock for accuracy
  done_count=$(grep -cE '^\- \[x\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
  if [ "$done_count" -le 20 ]; then release_lock "$BACKLOG_LOCKDIR"; return 0; fi

  local date_str
  date_str=$(date +%Y-%m-%d)

  # Append completed items to archive file
  { printf '\n## Archived %s (%s items)\n' "$date_str" "$done_count"; grep -E '^\- \[x\]' "$BACKLOG_FILE" || true; } >> "$ARCHIVE_FILE"

  # Remove [x] items from backlog.md, squeeze consecutive blank lines
  local tmpfile
  tmpfile=$(mktemp "$BACKLOG_FILE.XXXXXX")
  grep -vE '^\- \[x\]' "$BACKLOG_FILE" | cat -s > "$tmpfile" \
    && mv "$tmpfile" "$BACKLOG_FILE" \
    || { rm -f "$tmpfile"; release_lock "$BACKLOG_LOCKDIR"; return 0; }

  release_lock "$BACKLOG_LOCKDIR"
  echo "  → Archived $done_count items from backlog.md"

  # Trim progress.txt: keep last 30 sections
  local section_count
  section_count=$(grep -c '^## ' "$PROGRESS_FILE" 2>/dev/null || echo 0)
  if [ "$section_count" -gt 30 ]; then
    local keep=30
    local skip=$((section_count - keep))
    local start_line
    start_line=$(grep -n '^## ' "$PROGRESS_FILE" | awk -F: "NR==$((skip+1)){print \$1}" || true)
    if [ -n "$start_line" ]; then
      local tmpfile2
      tmpfile2=$(mktemp "$PROGRESS_FILE.XXXXXX")
      { head -3 "$PROGRESS_FILE"; tail -n +"$start_line" "$PROGRESS_FILE"; } > "$tmpfile2" \
        && mv "$tmpfile2" "$PROGRESS_FILE" \
        || rm -f "$tmpfile2"
      echo "  → Trimmed progress.txt to last $keep sections (was $section_count)"
    fi
  fi

  git_commit_and_push "chore(backlog): archive $done_count completed items + trim progress"
}

# ─── Periodic maintenance passes ──────────────────────────────────
# Every 10 completed items: run product and code discovery passes (offset by 5).
# Passes are read-only — they write items to backlog-inbox.md.
# The main loop implements items; passes just stock the backlog.

run_special_pass() {
  local pass_type="$1"  # "housekeeping" or "ux"
  local prompt_file="$SCRIPT_DIR/${pass_type}-pass.md"

  # Special passes only support the claude tool
  if [[ "$TOOL" != "claude" ]]; then
    echo "  (skipping $pass_type pass — only supported with --tool claude)"
    return 0
  fi

  if [ ! -f "$prompt_file" ]; then
    echo "WARNING: $prompt_file not found — skipping $pass_type pass"
    return 0
  fi

  echo ""
  echo "================================================================"
  echo "  ★ Maintenance Pass: $pass_type"
  echo "================================================================"

  # Set up isolated worktree for the pass (use a local ref to avoid
  # clobbering the outer WORKTREE_DIR used by the EXIT trap)
  local saved_worktree="$WORKTREE_DIR"
  local saved_progress_baseline="$PROGRESS_BASELINE"
  local saved_patterns_baseline="$PATTERNS_BASELINE"
  local saved_base_sha="$WORKTREE_BASE_SHA"
  if ! setup_worktree; then
    echo "  Failed to set up worktree for $pass_type pass — skipping"
    WORKTREE_DIR="$saved_worktree"
    PROGRESS_BASELINE="$saved_progress_baseline"
    PATTERNS_BASELINE="$saved_patterns_baseline"
    WORKTREE_BASE_SHA="$saved_base_sha"
    return 0
  fi
  local pass_worktree="$WORKTREE_DIR"
  local pass_progress_baseline="$PROGRESS_BASELINE"
  local pass_patterns_baseline="$PATTERNS_BASELINE"
  local pass_base_sha="$WORKTREE_BASE_SHA"
  WORKTREE_DIR="$saved_worktree"  # restore so EXIT trap doesn't touch pass worktree
  PROGRESS_BASELINE="$saved_progress_baseline"
  PATTERNS_BASELINE="$saved_patterns_baseline"
  WORKTREE_BASE_SHA="$saved_base_sha"

  local context_file
  context_file=$(mktemp)
  cat "$PATTERNS_FILE" > "$context_file"
  printf '\n\n## Recent session log:\n' >> "$context_file"
  awk '/^## /{found=1; count++} found && count<=5{print} /^---$/ && found && count>=5{exit}' \
    "$PROGRESS_FILE" >> "$context_file" 2>/dev/null || true

  local agent_tmp agent_err
  agent_tmp=$(mktemp)
  agent_err=$(mktemp)

  (cd "$pass_worktree" && trap '' INT; claude \
    --dangerously-skip-permissions \
    --print \
    --no-session-persistence \
    --max-turns 100 \
    --output-format json \
    --json-schema "$JSON_SCHEMA" \
    --model "$MODEL" \
    --append-system-prompt-file "$context_file" \
    < "$prompt_file" > "$agent_tmp" 2>"$agent_err") &
  local pass_pid=$!
  wait $pass_pid || true
  # If Ctrl+C interrupted wait but pass agent is still running, re-wait
  if [ "$STOP_REQUESTED" -eq 1 ] && kill -0 $pass_pid 2>/dev/null; then
    echo "  → Waiting for $pass_type pass to finish…"
    wait $pass_pid 2>/dev/null || true
  fi

  rm -f "$context_file"
  local pass_output
  pass_output=$(cat "$agent_tmp")
  local pass_err_text
  pass_err_text=$(cat "$agent_err" 2>/dev/null || true)
  rm -f "$agent_tmp" "$agent_err"

  # Rate-limit detection — warn and return so main loop can also detect on next item
  if echo "$pass_output $pass_err_text" | grep -qiE 'usage limit|rate.?limit|quota|out of credits|billing|overloaded|capacity|too many requests|529|Claude\.ai/upgrade'; then
    echo "  ⚠ Rate limit hit during $pass_type pass — skipping"
    # Clean up pass worktree
    WORKTREE_DIR="$pass_worktree"
    teardown_worktree
    WORKTREE_DIR="$saved_worktree"
    return 0
  fi

  local pass_status pass_item pass_note
  pass_status=$(echo "$pass_output" | jq -r '.structured_output.status // ""' 2>/dev/null || echo "")
  pass_item=$(echo "$pass_output" | jq -r '.structured_output.item // ""' 2>/dev/null || echo "")
  pass_note=$(echo "$pass_output" | jq -r '.structured_output.note // ""' 2>/dev/null || echo "")

  if [ "$pass_status" = "done" ]; then
    echo "  ✓ $pass_type pass: ${pass_item:-done}"
    [ -n "$pass_note" ] && echo "    $pass_note"
    # Merge pass worktree back to main
    WORKTREE_DIR="$pass_worktree"
    PROGRESS_BASELINE="$pass_progress_baseline"
    PATTERNS_BASELINE="$pass_patterns_baseline"
    WORKTREE_BASE_SHA="$pass_base_sha"
    merge_worktree_to_main "chore(backlog): $pass_type pass – ${pass_item:-maintenance}" || \
      echo "  WARNING: Pass cherry-pick conflict — changes discarded"
    teardown_worktree
  else
    echo "  · $pass_type pass: ${pass_status:-no result} — ${pass_note:-skipped}"
    # Discard pass worktree (no changes to merge)
    WORKTREE_DIR="$pass_worktree"
    teardown_worktree
  fi

  # Restore outer worktree state
  WORKTREE_DIR="$saved_worktree"
  PROGRESS_BASELINE="$saved_progress_baseline"
  PATTERNS_BASELINE="$saved_patterns_baseline"
  WORKTREE_BASE_SHA="$saved_base_sha"
}

# JSON schema for structured agent output
JSON_SCHEMA='{"type":"object","properties":{"status":{"type":"string","enum":["done","failed"]},"item":{"type":"string"},"note":{"type":"string"}},"required":["status"]}'

# Pass schedule:
#   code pass    — every 10 completed items, or when the backlog is empty
#   product pass — every 10 completed items (offset by 5), or when the backlog is empty

CURRENT_COUNT=$(get_completed_count)
PASS_HALF=$(( PASS_FREQUENCY / 2 ))
NEXT_CODE_PASS_IN=$(( PASS_FREQUENCY - (CURRENT_COUNT % PASS_FREQUENCY) ))
[ "$NEXT_CODE_PASS_IN" -eq 0 ] && NEXT_CODE_PASS_IN=$PASS_FREQUENCY
NEXT_PRODUCT_PASS_IN=$(( PASS_FREQUENCY - ((CURRENT_COUNT + PASS_HALF) % PASS_FREQUENCY) ))
[ "$NEXT_PRODUCT_PASS_IN" -eq 0 ] && NEXT_PRODUCT_PASS_IN=$PASS_FREQUENCY

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  Backlog Runner                                             ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo "  PID:    $$"
echo "  Tool:   $TOOL"
echo "  Model:  $MODEL"
echo "  Log:    $RUNNER_LOG"
if [ "$PASSES_ENABLED" -eq 1 ]; then
  echo "  Passes: enabled (every $PASS_FREQUENCY items)"
else
  echo "  Passes: disabled"
fi

# Drain inbox before first iteration so items are available immediately
drain_inbox

IN_PROGRESS=$(grep -cE '^\- \[~\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
FAILED=$(grep -cE '^\- \[!\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
echo ""
echo "  Queue:    $(remaining) ready · ${IN_PROGRESS} in-progress · ${FAILED} failed"
if [ "$PASSES_ENABLED" -eq 1 ]; then
  echo "  Done:     $CURRENT_COUNT total (next code pass in $NEXT_CODE_PASS_IN, product pass in $NEXT_PRODUCT_PASS_IN)"
else
  echo "  Done:     $CURRENT_COUNT total"
fi
echo "  Stop:     Ctrl+C  (or: touch $STOP_FILE)"
echo ""

ITERATION=0
ITERATION_START=""
while true; do
  ITERATION=$((ITERATION + 1))
  REMAINING=$(remaining)
  IN_PROGRESS=$(grep -cE '^\- \[~\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
  ELAPSED=""
  if [ -n "$ITERATION_START" ]; then
    local_elapsed=$(( $(date +%s) - ITERATION_START ))
    if [ "$local_elapsed" -ge 60 ]; then
      ELAPSED=" · last took $((local_elapsed / 60))m$((local_elapsed % 60))s"
    else
      ELAPSED=" · last took ${local_elapsed}s"
    fi
  fi
  ITERATION_START=$(date +%s)
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  #$ITERATION  ·  $REMAINING queued · ${IN_PROGRESS} in-progress${ELAPSED}"
  echo "═══════════════════════════════════════════════════════════════"

  # Backlog empty — run a discovery pass to replenish before giving up
  if [[ "$REMAINING" -eq 0 ]]; then
    echo ""
    echo "  Backlog empty — checking inbox for new items…"
    drain_inbox  # pick up any stragglers first
    REMAINING=$(remaining)
    if [[ "$REMAINING" -gt 0 ]]; then
      echo "  Inbox had $REMAINING item(s) — continuing."
    else
      # Backlog complete — run discovery passes to restock (if enabled)
      if [[ "$PASSES_ENABLED" -eq 0 ]]; then
        echo "  Backlog empty and passes are disabled — stopping."
        break
      elif [[ "$TOOL" == "claude" ]] && try_pass_lock; then
        echo $$ > "$PASS_LOCKDIR/pid"
        echo "  No items found — running discovery passes to replenish backlog…"
        run_special_pass "product"
        drain_inbox
        REMAINING=$(remaining)
        run_special_pass "code"
        rm -rf "$PASS_LOCKDIR"
        drain_inbox
        REMAINING=$(remaining)
      elif [[ "$TOOL" == "claude" ]]; then
        PASS_OWNER=$(cat "$PASS_LOCKDIR/pid" 2>/dev/null || echo "?")
        echo "  No items — another runner (PID $PASS_OWNER) is running a discovery pass. Waiting…"
      else
        echo "  No items — discovery passes require --tool claude. Waiting…"
      fi
      # Final drain — another runner may have filled the inbox since we last checked
      drain_inbox
      REMAINING=$(remaining)
      if [[ "$REMAINING" -eq 0 ]]; then
        echo "  Still no items. Polling inbox every 30s… (Ctrl+C to stop)"
        sleep 30 || true
        drain_inbox
        REMAINING=$(remaining)
        if [[ "$REMAINING" -eq 0 ]]; then
          continue
        fi
      fi
      echo "  $REMAINING new item(s) available — continuing."
    fi
  fi

  # ── Claim an item under lock ──
  CLAIMED_ITEM=""
  if ! claim_next_item; then
    IN_PROGRESS=$(grep -cE '^\- \[~\]' "$BACKLOG_FILE" 2>/dev/null || echo 0)
    echo "  All $IN_PROGRESS item(s) claimed by other runners — waiting 15s…"
    sleep 15 || true
    continue
  fi
  echo "  → $CLAIMED_ITEM"

  # ── Set up isolated worktree for the agent ──
  if ! setup_worktree; then
    echo "  Failed to set up worktree — unclaiming item"
    update_item_status " " "$CLAIMED_ITEM"
    CLAIMED_ITEM=""
    sleep 5 || true
    continue
  fi
  echo "  Worktree: $WORKTREE_DIR"

  # ── Run the agent ──
  echo "  Running agent… (started $(date '+%H:%M:%S'))"
  if [[ "$TOOL" == "amp" ]]; then
    PROMPT_FILE=$(mktemp)
    cat "$SCRIPT_DIR/CLAUDE.md" > "$PROMPT_FILE"
    printf '\n---\n\n## Assigned Item\n\nWork on this specific item (already marked [~] in backlog.md):\n\n%s\n\nDo NOT pick a different item. Do NOT modify backlog.md.\n' "$CLAIMED_ITEM" >> "$PROMPT_FILE"
    OUTPUT=$(cat "$PROMPT_FILE" | (cd "$WORKTREE_DIR" && amp --dangerously-allow-all) 2>&1 | tee /dev/stderr) || true
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
    AGENT_ERR=$(mktemp)
    # Run agent in background so the parent's wait builtin is interruptible by
    # Ctrl+C (fires graceful_stop) without killing the agent process itself.
    # Agent runs inside the worktree for file isolation.
    (cd "$WORKTREE_DIR" && trap '' INT; claude \
      --dangerously-skip-permissions \
      --print \
      --no-session-persistence \
      --max-turns 100 \
      --output-format json \
      --json-schema "$JSON_SCHEMA" \
      --model "$MODEL" \
      --append-system-prompt-file "$CONTEXT_FILE" \
      < "$SCRIPT_DIR/CLAUDE.md" > "$AGENT_TMP" 2>"$AGENT_ERR") &
    AGENT_PID=$!
    AGENT_EXIT=0
    wait $AGENT_PID || AGENT_EXIT=$?
    # If Ctrl+C interrupted wait but agent is still running, re-wait for it to finish
    if [ "$STOP_REQUESTED" -eq 1 ] && kill -0 $AGENT_PID 2>/dev/null; then
      echo "  → Waiting for agent to finish current work…"
      wait $AGENT_PID 2>/dev/null || AGENT_EXIT=$?
    fi

    rm -f "$CONTEXT_FILE"
    OUTPUT=$(cat "$AGENT_TMP")
    rm -f "$AGENT_TMP"

    # Detect usage/rate-limit errors before attempting to parse output.
    # When Claude is out of usage the agent exits non-zero and emits an error
    # on stderr rather than valid JSON — continuing the loop would just spin
    # through all remaining iterations unclaiming and reclaiming the same item.
    if [ $AGENT_EXIT -ne 0 ]; then
      AGENT_ERR_TEXT=$(cat "$AGENT_ERR" 2>/dev/null)
      COMBINED="$OUTPUT $AGENT_ERR_TEXT"
      if echo "$COMBINED" | grep -qiE 'usage limit|rate.?limit|quota|out of credits|billing|overloaded|capacity|too many requests|529|Claude\.ai/upgrade'; then
        rm -f "$AGENT_ERR"
        echo ""
        echo "  ⚠ Rate limit hit — unclaiming item, retry at $(date -v+60S '+%H:%M:%S' 2>/dev/null || date -d '+60 seconds' '+%H:%M:%S' 2>/dev/null || echo '~60s')"
        update_item_status " " "$CLAIMED_ITEM"
        CLAIMED_ITEM=""
        teardown_worktree
        sleep 60 || true
        continue
      fi
    fi
    rm -f "$AGENT_ERR"

    # Human-readable agent summary
    _S=$(echo "$OUTPUT" | jq -r '.structured_output.status // ""' 2>/dev/null || echo "")
    _ITEM=$(echo "$OUTPUT" | jq -r '.structured_output.item // ""' 2>/dev/null || echo "")
    _NOTE=$(echo "$OUTPUT" | jq -r '.structured_output.note // ""' 2>/dev/null || echo "")
    _TURNS=$(echo "$OUTPUT" | jq -r '.num_turns // ""' 2>/dev/null || echo "")
    _SECS=$(echo "$OUTPUT" | jq -r 'if .duration_ms then ((.duration_ms/1000)|floor|tostring)+"s" else "" end' 2>/dev/null || echo "")
    _COST=$(echo "$OUTPUT" | jq -r 'if .total_cost_usd then "$"+(.total_cost_usd*100|round/100|tostring) else "" end' 2>/dev/null || echo "")
    # If output looks like a usage/rate-limit error embedded in stdout JSON error field,
    # stop the runner rather than looping.
    if [ -z "$_S" ] && echo "$OUTPUT" | grep -qiE 'usage limit|rate.?limit|quota|out of credits|overloaded|capacity|too many requests|529'; then
      echo ""
      echo "  ⚠ Rate limit hit — unclaiming item, retry at $(date -v+60S '+%H:%M:%S' 2>/dev/null || date -d '+60 seconds' '+%H:%M:%S' 2>/dev/null || echo '~60s')"
      update_item_status " " "$CLAIMED_ITEM"
      CLAIMED_ITEM=""
      teardown_worktree
      sleep 60 || true
      continue
    fi
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
      CONSECUTIVE_FAILURES=0
      PUSH_ITEM="${ITEM_FROM_AGENT:-$CLAIMED_ITEM}"
      echo ""
      echo "  Merging to main: $PUSH_ITEM"
      if merge_worktree_to_main "chore(backlog): done – $PUSH_ITEM"; then
        update_item_status "x" "$CLAIMED_ITEM"
        echo "  ✓ Merged and marked done"
      else
        echo "  ✗ Cherry-pick conflict — marked failed"
        update_item_status "!" "$CLAIMED_ITEM"
      fi
      CLAIMED_ITEM=""  # prevent EXIT trap from unclaiming
      teardown_worktree

      # Milestone maintenance passes (skip if stop was requested or passes disabled)
      TOTAL_DONE=$(increment_completed_count)
      if [ "$PASSES_ENABLED" -eq 1 ] && [ "$STOP_REQUESTED" -eq 0 ] && [ ! -f "$STOP_FILE" ]; then
        RUN_CODE=0; RUN_PRODUCT=0
        [ $((TOTAL_DONE % PASS_FREQUENCY)) -eq 0 ] && RUN_CODE=1
        [ $(((TOTAL_DONE + PASS_HALF) % PASS_FREQUENCY)) -eq 0 ] && RUN_PRODUCT=1
        if [ $((RUN_CODE + RUN_PRODUCT)) -gt 0 ]; then
          cleanup_if_needed
          # Non-blocking pass lock: if another runner is already running a pass, skip
          if try_pass_lock; then
            echo $$ > "$PASS_LOCKDIR/pid"
            PASS_NAMES=""
            [ "$RUN_PRODUCT" -eq 1 ] && PASS_NAMES="product"
            [ "$RUN_CODE" -eq 1 ] && PASS_NAMES="${PASS_NAMES:+$PASS_NAMES + }code"
            echo ""
            echo "  Milestone: $TOTAL_DONE items done — running $PASS_NAMES discovery pass"
            [ "$RUN_PRODUCT" -eq 1 ] && run_special_pass "product"
            [ "$RUN_CODE" -eq 1 ] && run_special_pass "code"
            rm -rf "$PASS_LOCKDIR"
          else
            PASS_OWNER=$(cat "$PASS_LOCKDIR/pid" 2>/dev/null || echo "?")
            echo "  Milestone: $TOTAL_DONE done — pass skipped (runner PID $PASS_OWNER already running one)"
          fi
        fi
      fi
      ;;
    failed)
      CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
      update_item_status "!" "$CLAIMED_ITEM"
      echo "  [$CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES consecutive failures]"
      CLAIMED_ITEM=""
      teardown_worktree
      ;;
    *)
      CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
      echo "  ⚠ Agent returned unexpected status '$STATUS' — unclaiming item [$CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES]"
      update_item_status " " "$CLAIMED_ITEM"
      CLAIMED_ITEM=""
      teardown_worktree
      ;;
  esac

  # ── Circuit breaker: stop if agents keep failing ──
  if [ "$CONSECUTIVE_FAILURES" -ge "$MAX_CONSECUTIVE_FAILURES" ]; then
    echo ""
    echo "FATAL: $CONSECUTIVE_FAILURES consecutive failures — stopping to avoid wasting resources."
    echo "  Check recent items in backlog.md for patterns (stale references, recurring build errors, etc.)"
    exit 1
  fi

  # ── Drain inbox ──
  drain_inbox

  # Print last progress entry (header + bullet lines only)
  # Note: pipe through head can trigger SIGPIPE (exit 141) with set -eo pipefail,
  # so we guard with || true to prevent the script from exiting.
  SUMMARY=$(awk '/^## /{found=1; buf=""} found && !/^---/{buf=buf"\n"$0} /^---$/ && found{last=buf; found=0} END{print last}' "$PROGRESS_FILE" | sed '/^[[:space:]]*$/d' | head -4 || true)
  if [ -n "$SUMMARY" ]; then
    echo ""
    echo "$SUMMARY"
  fi

  # Graceful stop — triggered by Ctrl+C (STOP_REQUESTED) or stop file
  if [ "$STOP_REQUESTED" -eq 1 ] || [ -f "$STOP_FILE" ]; then
    [ -f "$STOP_FILE" ] && rm -f "$STOP_FILE"
    TOTAL_DONE=$(get_completed_count)
    echo ""
    echo "  Stopped after $ITERATION iterations ($TOTAL_DONE total items completed)."
    exit 0
  fi

  sleep 2 || true
done
