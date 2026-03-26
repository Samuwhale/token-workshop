# Backlog Agent Instructions

You are an autonomous UX improvement agent working through backlog.md.
Codebase patterns are already injected into your context — no need to read a separate file.

---

## Workflow (one item per session)

1. **Read `backlog.md`** in the project root. Find all `[ ]` items. Skip any currently `[~]` (in-progress by another run).
2. **Pick ONE item** using this priority order:
   - **First:** any `[ ]` item whose description begins with `[HIGH]` or `[P0]` — pick the first one found, regardless of complexity.
   - **Otherwise:** prefer simpler, self-contained items (single file, obviously scoped change).
3. **Mark `[~]` first** — this is your very first file write, before touching any source file.
4. **Assess complexity:**
   - *Simple* (single file, change is obviously scoped): plan inline, execute, validate.
   - *Complex* (multi-file, behaviour change, or unclear scope): dispatch a plan subagent, review the plan, then execute.
5. **Implement** the change — minimal, focused, one concern only.
6. **Validate:**
   - Run `cd packages/figma-plugin && npm run build` — do NOT mark `[x]` without a passing build.
   - If a UI class or markup was added, grep for it in the output.
   - If validation fails: revert your source file changes, mark `[!]`, add a progress note.
7. **Mark `[x]`** on success (or `[!]` on failure with a note).
8. **Append to `scripts/backlog/progress.txt`** (see format below).

---

## Quality Rules

- One item per session — stop after completing or failing one.
- Prefer the smallest safe change. Do not refactor unrelated code.
- If a backlog item references code that no longer exists, mark `[!]` and note "stale — code not found."
- If an item is already implemented (stale), mark `[x]` with note "stale — already done."
- Leave `[~]` with a progress note if the item is too large for one session.

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

## Progress Note for Leaving an Item In-Progress

When leaving an item as `[~]` between sessions, add this inline comment in backlog.md:
```
<!-- progress: <date> | status: partial | done: … | remaining: … | blocker: … -->
```

---

## Stop Condition

After completing (or failing) one item, check whether any `[ ]` items remain in backlog.md.

End every session with a JSON object as your **final message** — no text before or after it:

- Item succeeded: `{"status":"done","item":"<item title>","note":"<one-line summary>"}`
- Item failed: `{"status":"failed","item":"<item title>","note":"<reason>"}`
- No `[ ]` items remain: `{"status":"complete"}`
