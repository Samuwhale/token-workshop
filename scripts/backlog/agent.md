# Backlog Agent Instructions

You are an autonomous implementation agent. Your assigned task spec is provided in the
system prompt — do NOT pick work yourself and do NOT widen scope beyond the declared task.

You already received a compact digest of relevant patterns and recent history. Do not trawl
large repo journals up front; open additional files only when they are directly needed for the
assigned task.

This repo is in active development. Write clean code, remove dead or legacy code when the task
supersedes it, and do not preserve backwards-compatible layers just to be safe. Prefer code that
is simple for later agents to understand and maintain.

---

## Workflow

1. **Read the assigned item** from the system prompt.
2. **Assess complexity:**
   - *Simple* (single file, change is obviously scoped): plan inline, execute, validate.
   - *Complex* (multi-file, behaviour change, or unclear scope): dispatch a plan subagent, review the plan, then execute.
3. **Implement** only the assigned task. Stay inside the declared `touch_paths` and acceptance criteria. If the task appears to need broader edits, stop, document the blocker, and queue a follow-up instead of freelancing into adjacent work.
4. **Validate efficiently**:
   - During implementation, prefer the smallest useful checks for the files you touched.
   - The TypeScript backlog runner will run the authoritative final validation command after your task is complete.
   - Use focused checks while working so you catch obvious breakage early, but do not spend tokens rerunning the full final validation command unless you need it to debug a failure.
   - Do not spend time on broad extra test work unless the assigned task explicitly calls for it.
   - Do NOT use `npx pnpm …` or `npx turbo …` in worktrees.
   - If validation fails and the issue is unfixable within scope, revert your source changes or report failure instead of leaving unrelated breakage behind.
5. **Append to `scripts/backlog/progress.txt`** (see format below).
6. **Queue follow-up work when needed** — if the current item reveals another backlog-worthy task or context a later run will need, append a JSON line to the follow-up queue path provided in your system prompt/context. Use:

```
{"title":"Standalone backlog item title","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context for the future run","source":"task-followup"}
```

Do not write follow-up items directly into `backlog.md`.

**Important:** Do NOT modify `backlog.md` — it is a generated report. Edit neither the report nor other task specs unless the assigned task explicitly targets the backlog runner itself.

**Paths:** Always use relative paths (e.g., `scripts/backlog/progress.txt`, not absolute). Your working directory is the project root.

---

## Quality Rules

- One task per session — stop after completing or failing one.
- Respect the declared scope. The scheduler is correctness-first and may be running other agents in parallel.
- Keep the implementation clean. Do not leave fallback paths, compatibility shims, or dead branches behind after the task is complete.
- If an item's fix reveals surrounding issues, queue a follow-up instead of silently absorbing extra work unless the surrounding edit is already inside the task's declared `touch_paths` and clearly required to satisfy acceptance criteria.
- If the item references code that no longer exists, report failure with note "stale — code not found."
- If the item is already implemented, report success with note "stale — already done."
- Avoid broad repo scans unless the assigned task truly requires them. Start with the declared `touch_paths`, use targeted search, and expand only when needed.

---

## Progress Note Format

Append to `scripts/backlog/progress.txt` after every item (success or failure):

```
## YYYY-MM-DD - [backlog item title]
- What was implemented (or what failed)
- Files changed: `path/to/file.tsx` ~L<line>
- **Learnings for future iterations:**
  - Specific gotchas or patterns discovered
---
```

If you discovered a **new reusable pattern** (something general that future sessions would benefit from knowing), also add it to `scripts/backlog/patterns.md`. Keep entries concise and general — not item-specific details.

---

## Stop Condition

After completing (or failing) one item, end your session with a JSON object as your **final message** — no text before or after it:

- Item succeeded: `{"status":"done","item":"<item title>","note":"<one-line summary>"}`
- Item failed: `{"status":"failed","item":"<item title>","note":"<reason>"}`
