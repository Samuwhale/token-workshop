# Product Discovery Pass

You are an autonomous discovery agent. Your job is NOT to implement anything — it is to explore the product, identify what's missing or painful, and write actionable backlog items to `backlog-inbox.md`.

Codebase patterns are injected into your system prompt. Recent progress log is also included.

---

## Goal

Find **5–15 concrete, actionable items** across the product and write them to `backlog-inbox.md`. Think like a power user who manages hundreds of design tokens daily — what's missing, what's painful, what would make this the best tool in its category? Explore as many areas as you need.

Good targets (in priority order):

- **Missing features** — things a power user would expect (batch operations, keyboard shortcuts, search, quick actions, drag-and-drop, undo, copy/paste tokens). Think: "what can Figma's native variable UI do that we can't?" and "what can we do that Figma can't?"
- **Workflow friction** — things that take 5 clicks when they should take 1, flows that break focus, missing "fast paths" for common operations
- **UX gaps** — unclear flows, missing affordances, confusing labels, no empty states, no confirmation before destructive actions, poor information hierarchy
- **QoL gaps** — fields that don't auto-focus, things that should be smarter, missing preview, no inline editing, no contextual help
- **Feedback gaps** — no feedback when something fails, no way to recover from mistakes, operations that should be reversible but aren't
- **Discoverability** — features that exist but are hard to find or use without prior knowledge
- **Polish** — rough interactions, visual inconsistencies, missing loading states

Items can range from small to ambitious — don't artificially limit scope:
- Small: `- [ ] No confirmation before deleting a non-empty group`
- Ambitious: `- [ ] Add keyboard-navigable token tree with expand/collapse and multi-select`
- Bold: `- [ ] Add inline token value editing on double-click instead of requiring the editor panel`

---

## Workflow

1. **Explore broadly** — check `scripts/backlog/progress.txt` for recent `product-pass:` entries to avoid retreading the same ground. Then roam the codebase — panels, flows, server routes, whatever catches your eye. Look at both the frontend (`packages/figma-plugin/src/ui/`) and the server (`packages/server/`).

3. **Write findings** — for each issue found, append a line to `backlog-inbox.md`:
   - Normal: `- [ ] Short title — one sentence describing the gap and where it is`
   - High priority (data loss risk, broken flow): `- [ ] [HIGH] Short title — one sentence`

   **Format matters:** Every item MUST start with `- [ ] `. High-priority items use `- [ ] [HIGH]`. Do NOT use `- [HIGH]` or other formats — they will be normalised but may lose the tag.

   Don't artificially limit scope. If the tool needs a feature, write it down — the implementing agent will figure out the details.

4. **Document** — append to `scripts/backlog/progress.txt`:

```
## YYYY-MM-DD - product-pass
- Areas explored: [list of areas/files touched]
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
- Aim for 5–15 items. Only write issues that are real and worth acting on.
- Feature and UX items should outnumber bug items. If you found mostly bugs, step back and think about the user's workflow.

---

## Stop Condition

End your session with a JSON object as your **final message** — no text before or after it:

- Found items: `{"status":"done","item":"product-pass","note":"<N items written to inbox>"}`
- Nothing found: `{"status":"done","item":"product-pass: no-op","note":"<why>"}`
