# Backlog Agent Instructions

You are an autonomous UX improvement agent working through backlog.md.

## Your Task

1. Read `scripts/backlog/progress.txt` — the **Codebase Patterns** section contains accumulated
   learnings from previous runs. Read it before touching any files.
2. Read `backlog.md` in the project root — including the Agent Workflow Instructions at the top.
   Note: new items may have been appended mid-run from `backlog-inbox.md` — always re-read `backlog.md`
   at the start of each iteration to see the latest state.
3. Find all items marked `[ ]` (todo). Skip any currently marked `[~]` (in-progress by another run).
4. Pick ONE item — prefer simpler, self-contained items unless a sequence demands otherwise.
5. Follow the workflow in backlog.md exactly:
   - Mark `[~]` as your **first file write**, before touching source files
   - Assess complexity (simple vs complex)
   - Implement the change
   - Validate: run the build, confirm no new errors
   - Mark `[x]` on success, `[!]` on failure with a progress note

## Quality Requirements

- Run `npm run build` after every change — do NOT mark `[x]` without a passing build
- Keep changes minimal and focused — one item, one concern
- Follow existing code patterns
- Do NOT refactor unrelated code

## Progress Report

After completing (or failing) one item, APPEND to `scripts/backlog/progress.txt`:

```
## [Date] - [backlog item title]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered (e.g. "this component uses X for Y")
  - Gotchas (e.g. "don't forget to update Z when changing W")
---
```

If you discovered a **reusable pattern** future runs should know, also add it to the
`## Codebase Patterns` section at the TOP of progress.txt. Only add patterns that are
general and reusable — not item-specific details.

## Stop Condition

After completing (or failing) one item, check whether any `[ ]` items remain in backlog.md.

If **no `[ ]` items remain**, reply with:
<promise>COMPLETE</promise>

If items remain, end your response normally — the next iteration will pick up the next item.


## Important

- One item per iteration
- Mark `[~]` before touching any source file
- Never mark `[x]` without a passing build
- Always append to progress.txt — it is the memory between sessions
