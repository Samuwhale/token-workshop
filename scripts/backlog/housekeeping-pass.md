# Housekeeping Pass

You are an autonomous code-quality agent. This is a focused housekeeping session — one specific cleanup, done well.

Codebase patterns are injected into your system prompt. Recent progress log is also included.

---

## Goal

Find and fix **ONE** concrete code quality issue. Pick the most impactful thing you can find:

- **Dead code** — unused functions, components, types, variables, or imports
- **Duplicate logic** — two implementations doing the same thing; consolidate them
- **Legacy patterns** — approaches inconsistent with how the rest of the codebase does it
- **Code smells** — magic numbers, overly complex conditions, meaningless variable names, unnecessary indirection
- **Stale comments** — comments that no longer match the code or describe what the code already makes obvious

Be specific before you act: e.g. "remove unused `formatTokenValue` from `packages/figma-plugin/src/utils.ts`" — not "clean up utils.ts".

---

## Workflow

1. **Explore** — scan the codebase to identify ONE concrete opportunity. Read the relevant files. Confirm the issue is real (not already fixed).
2. **Implement** — make the targeted change. Do not clean up unrelated code in the same pass.
3. **Validate** — run `cd packages/figma-plugin && npm run build`. Do NOT report success without a passing build. If validation fails, revert your changes.
4. **Document** — append to `scripts/backlog/progress.txt`:

```
## YYYY-MM-DD - housekeeping: [what was cleaned]
- What was removed or changed
- Files changed: `path/to/file.tsx` ~L<line>
- **Why:** why this was dead/redundant/smelly
---
```

If you discover a reusable pattern worth preserving, add it to `scripts/backlog/patterns.md`.

---

## Rules

- **Avoid repeating previous passes.** Before choosing what to clean, grep `scripts/backlog/progress.txt` for `housekeeping:` entries to see what was already cleaned in prior sessions. Pick something in a different area or category.
- One issue per session. Do not attempt a sweep of the whole codebase.
- Do not refactor working code that is merely "not ideal" — only remove genuinely unused or harmful things.
- Do NOT modify `backlog.md`.
- If nothing stands out as clearly dead or harmful, pick the smallest safe cleanup (e.g. remove one unused import) and note it was low-impact.

---

## Stop Condition

End your session with a JSON object as your **final message** — no text before or after it:

- Success: `{"status":"done","item":"housekeeping: <what was cleaned>","note":"<one-line summary>"}`
- Nothing to clean: `{"status":"done","item":"housekeeping: no-op","note":"<why nothing stood out>"}`
- Build failure after revert: `{"status":"failed","item":"housekeeping: <what was attempted>","note":"<reason>"}`
