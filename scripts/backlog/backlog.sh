#!/bin/bash
# Backlog Runner - Long-running agent loop for backlog.md
# Usage: ./backlog.sh [--tool amp|claude] [max_iterations]
#
# Continuity between sessions via two files:
#   backlog.md      task state ([ ] / [~] / [x] / [!])
#   patterns.md     reusable codebase patterns (injected into every session)
#   progress.txt    full per-item log (human audit trail, not injected)

set -e

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

remaining() {
  grep -cE '^\- \[ \]' "$BACKLOG_FILE" 2>/dev/null || echo 0
}

echo "Starting Backlog Runner — Tool: $TOOL — Max iterations: $MAX_ITERATIONS"
echo "  Remaining items: $(remaining)"
echo "  Stop signal:     touch $STOP_FILE"

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

  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$SCRIPT_DIR/CLAUDE.md" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    # Inject patterns.md (lean, stable) — not the full progress log
    OUTPUT=$(claude \
      --dangerously-skip-permissions \
      --print \
      --append-system-prompt-file "$PATTERNS_FILE" \
      < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee /dev/stderr) || true
  fi

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Backlog completed all tasks!"
    echo "Completed at iteration $i / $MAX_ITERATIONS"
    exit 0
  fi

  # Drain inbox: if backlog-inbox.md has non-whitespace content, append to backlog.md and clear it
  if [ -f "$INBOX_FILE" ] && grep -qE '\S' "$INBOX_FILE" 2>/dev/null; then
    echo ""
    echo "--- Inbox has new items — appending to backlog.md ---"
    echo "" >> "$BACKLOG_FILE"
    cat "$INBOX_FILE" >> "$BACKLOG_FILE"
    truncate -s 0 "$INBOX_FILE"
    echo "--- Inbox drained ---"
  fi

  # Print last progress entry (header + bullet lines only)
  SUMMARY=$(awk '/^## /{found=1; buf=""} found && !/^---/{buf=buf"\n"$0} /^---$/ && found{last=buf; found=0} END{print last}' "$PROGRESS_FILE" | sed '/^[[:space:]]*$/d' | head -4)
  if [ -n "$SUMMARY" ]; then
    echo ""
    echo "$SUMMARY"
  fi

  # Graceful stop
  if [ -f "$STOP_FILE" ]; then
    rm -f "$STOP_FILE"
    echo ""
    echo "Stop signal received. Exiting after iteration $i."
    exit 0
  fi

  sleep 2
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS) without completing."
echo "  Remaining items: $(remaining)"
echo "  Check backlog.md for current status."
exit 1
