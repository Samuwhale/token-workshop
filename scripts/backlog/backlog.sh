#!/bin/bash
# Backlog Runner - Long-running agent loop for backlog.md
# Usage: ./backlog.sh [--tool amp|claude] [max_iterations]
#
# Each iteration is a fresh Claude session. Continuity is handled via documents:
#   - backlog.md       task state ([ ] / [~] / [x] / [!])
#   - progress.txt     codebase patterns + per-item learnings (injected into every session)

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
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"

if [ ! -f "$BACKLOG_FILE" ]; then
  echo "Error: backlog.md not found at $PROJECT_ROOT"
  exit 1
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Backlog Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Backlog Runner - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"
echo "  To stop after the current iteration: touch $STOP_FILE"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Backlog Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  # Early exit: no [ ] items left
  if ! grep -qE '^\- \[ \]' "$BACKLOG_FILE"; then
    echo ""
    echo "No remaining [ ] items in backlog.md. All done!"
    exit 0
  fi

  if [[ "$TOOL" == "amp" ]]; then
    OUTPUT=$(cat "$SCRIPT_DIR/CLAUDE.md" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    # Fresh session every time. Progress.txt is appended to the system prompt
    # so codebase patterns carry over without polluting the context window.
    OUTPUT=$(claude \
      --dangerously-skip-permissions \
      --print \
      --append-system-prompt-file "$PROGRESS_FILE" \
      < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee /dev/stderr) || true
  fi

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Backlog completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  # Drain inbox: if backlog-inbox.md has content, append it to backlog.md and clear it
  if [ -f "$INBOX_FILE" ] && grep -qE '\S' "$INBOX_FILE" 2>/dev/null; then
    echo ""
    echo "--- Inbox has new items — appending to backlog.md ---"
    echo "" >> "$BACKLOG_FILE"
    cat "$INBOX_FILE" >> "$BACKLOG_FILE"
    truncate -s 0 "$INBOX_FILE"
    echo "--- Inbox drained ---"
  fi

  # Print the last entry appended to progress.txt (header + bullet lines, no meta)
  SUMMARY=$(awk '/^## /{found=1; buf=""} found && !/^---/{buf=buf"\n"$0} /^---$/ && found{last=buf; found=0} END{print last}' "$PROGRESS_FILE" | sed '/^[[:space:]]*$/d' | head -4)
  if [ -n "$SUMMARY" ]; then
    echo ""
    echo "$SUMMARY"
  else
    echo "Iteration $i complete."
  fi
  # Graceful stop: if backlog-stop exists, exit cleanly
  if [ -f "$STOP_FILE" ]; then
    rm -f "$STOP_FILE"
    echo ""
    echo "Stop signal received. Exiting after iteration $i."
    exit 0
  fi

  sleep 2
done

echo ""
echo "Backlog runner reached max iterations ($MAX_ITERATIONS) without completing."
echo "Check backlog.md for current status."
exit 1
