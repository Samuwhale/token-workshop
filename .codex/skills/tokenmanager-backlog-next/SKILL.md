---
name: tokenmanager-backlog-next
description: Handle the next logical TokenManager backlog item in this repo. Use when the user asks Codex to pick the next backlog task, work through the backlog, or automatically choose and execute one backlog item from backlog.md while updating backlog state and progress notes.
---

# TokenManager Backlog Next

Use this skill only for this repo's interactive backlog workflow. This is not the continuous backlog runner.

## Goal

Pick one logical next item from `backlog.md`, claim it, implement it, run targeted verification, update progress notes, mark it done or failed, and stop.

## Source Of Truth

- Backlog: `backlog.md`
- Progress log: `scripts/backlog/progress.txt`
- Reusable patterns: `scripts/backlog/patterns.md`
- Backlog helper: `node scripts/backlog/codex-backlog-skill.mjs`

Do not use `packages/backlog-runner` or the continuous runner loop for this workflow.

## Required Workflow

1. Run `node scripts/backlog/codex-backlog-skill.mjs pick-next`.
2. Read the returned JSON and tell the user which item was selected and why in one short sentence.
3. Treat that item as owned by this session. Do not manually edit the backlog marker.
4. Implement the item immediately.
5. Run targeted verification for the changed area.
6. Append a progress entry to `scripts/backlog/progress.txt`.
7. Add a concise reusable note to `scripts/backlog/patterns.md` only if the work revealed a general pattern worth keeping.
8. Mark the item complete with:
   - Success: `node scripts/backlog/codex-backlog-skill.mjs finish --item "<exact item title>" --status done`
   - Failure/blocker: `node scripts/backlog/codex-backlog-skill.mjs finish --item "<exact item title>" --status failed`

If you claimed an item, do not leave it as `[~]`.

## Selection Rule

The helper already applies the selection heuristic:

- First ready `[HIGH]` item
- Otherwise the ready item most related to recent backlog work
- Otherwise first ready item in backlog order

Accept the helper's choice unless the returned item is obviously stale relative to the current code. If it is stale, explain that briefly, mark it failed, and stop instead of silently choosing a different item.

## Scope Rule

- Default to exactly one backlog item.
- You may continue to a second item only if your finished change clearly and directly resolves the next selected item too, in the same subsystem, without a separate design pass.
- Never start a broad backlog sweep.

## Verification Rule

Use targeted checks only. Choose commands from changed files:

- `packages/core/**`: `pnpm --filter @tokenmanager/core build`
- `packages/server/**`: `pnpm --filter @tokenmanager/server build`
- `packages/figma-plugin/**`: `pnpm preview:build`
- Plugin UI flow or navigation changes: also run `pnpm preview:validate`
- Mixed changes: run all relevant commands

Do not default to `bash scripts/backlog/validate.sh`.
Do not add tests unless the change naturally requires updating an existing one.

## Progress Entry Format

Append this shape to `scripts/backlog/progress.txt`:

```md
## YYYY-MM-DD - [backlog item title]
- What was implemented (or what failed)
- Files changed: `path/to/file.tsx` ~L123
- **Learnings for future iterations:**
  - Specific reusable lesson
---
```

Keep entries concise and concrete.

## Guardrails

- No commit, no push, no PR flow.
- No backlog pass scheduling.
- No worktree setup.
- Keep the code clean. No hacks, no dead code, no compatibility shims.
- If blocked, record the blocker in progress, mark the item failed, and stop.
