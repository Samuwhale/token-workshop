# Discovery Pass

You are an autonomous discovery agent. Your job is NOT to implement anything — it is to explore ONE area of the codebase, identify concrete gaps, and write actionable backlog items to `backlog-inbox.md`.

Codebase patterns are injected into your system prompt. Recent progress log is also included.

---

## Goal

Find **3–8 concrete, actionable issues** in ONE focused area and write them to `backlog-inbox.md`. Good targets:

- **Functional gaps** — features the app is missing that users would expect (e.g. no way to do X, no feedback when Y fails)
- **UX gaps** — unclear flows, missing affordances, confusing labels, no empty states, no confirmation before destructive actions
- **QoL gaps** — extra clicks, no keyboard shortcuts, fields that don't auto-focus, things that should be smarter
- **Code correctness** — edge cases that aren't handled, inputs that aren't validated, silent error swallowing
- **Bugs** — logic that is clearly wrong, states that can get stuck, race conditions, off-by-ones

---

## Workflow

1. **Choose an area** — pick ONE component, feature, or flow you haven't recently explored (check `scripts/backlog/progress.txt` for `discover-pass:` entries to avoid repetition). Good areas: a specific panel, a server route, the sync flow, the generator, the export flow, etc.

2. **Explore** — read the relevant source files. Understand what it does, what it doesn't do, and where it could go wrong. Look at both the frontend (`packages/figma-plugin/src/ui/`) and the server (`packages/server/`) if relevant.

3. **Write findings** — for each issue found, append a line to `backlog-inbox.md` in one of these formats:
   - Normal priority: `- [ ] Short title — one sentence describing the gap and where it is in the code`
   - High priority (bugs, data loss risk): `- [HIGH] Short title — one sentence describing the gap`

   Good item titles are specific and actionable: "No confirmation before deleting a non-empty group" not "improve delete UX".

4. **Document** — append to `scripts/backlog/progress.txt`:

```
## YYYY-MM-DD - discover-pass: [area explored]
- Area: `path/to/component.tsx` (or route, feature, flow)
- Found N items — written to backlog-inbox.md
- Notable: [the most interesting gap found]
---
```

---

## Rules

- Do NOT implement any changes. This is a read-only exploration pass.
- Do NOT modify `backlog.md`.
- Write only to `backlog-inbox.md` and `scripts/backlog/progress.txt`.
- Each item must be a complete, standalone sentence — the agent that picks it up won't have your context.
- Do not duplicate items already in `backlog.md` (check for similar wording before writing).
- Aim for 3–8 items. More is not better — only write issues that are real and worth fixing.
- If the area you chose is already well-covered by existing backlog items, pick a different area.

---

## Stop Condition

End your session with a JSON object as your **final message** — no text before or after it:

- Found items: `{"status":"done","item":"discover-pass: <area explored>","note":"<N items written to inbox>"}`
- Area already covered: `{"status":"done","item":"discover-pass: no-op","note":"<why — area was already covered or no gaps found>"}`
