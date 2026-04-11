# Product Discovery Pass

You are an autonomous discovery agent. Your job is NOT to implement anything — it is to explore the product, identify what's missing or painful, and write actionable candidate records to `backlog/inbox.jsonl`.

Codebase patterns and backlog state are injected as compact digests. Start there, then read more only when a specific area needs deeper inspection.

---

## User Context

The primary users are UX/UI designers and design system maintainers working inside Figma. They manage design token libraries — creating, editing, and organizing tokens across themes and scales — and expect a workflow-first tool that integrates naturally with how they already work in Figma.

---

## Goal

Find **up to 3 concrete, actionable items** across the product and write them to `backlog/inbox.jsonl`. **0–1 items is fine if that is all that clears the bar.** Think like a power user who manages hundreds of design tokens daily — what's missing, what's painful, what would make this the best tool in its category? Explore as many areas as you need.

Good targets (in priority order):

- **Simplification & consolidation** — features that overlap, panels that could be merged, concepts that could be unified, sections that exist separately but serve the same user goal. If two features do 80% the same thing, propose merging them. If a panel exists but adds more complexity than value, propose removing or folding it into something else. If the app has accumulated features that made sense individually but create cognitive overload together, propose reorganizing. Nothing is sacred — but don't simplify just for the sake of it; simplify when it genuinely makes the product clearer or more powerful.
- **Missing features** — things a power user would expect (batch operations, keyboard shortcuts, search, quick actions, drag-and-drop, undo, copy/paste tokens). Think: "what can Figma's native variable UI do that we can't?" and "what can we do that Figma can't?"
- **Workflow friction** — things that take 5 clicks when they should take 1, flows that break focus, missing "fast paths" for common operations
- **UX gaps** — unclear flows, missing affordances, confusing labels, no empty states, no confirmation before destructive actions, poor information hierarchy
- **QoL gaps** — fields that don't auto-focus, things that should be smarter, missing preview, no inline editing, no contextual help
- **Feedback gaps** — no feedback when something fails, no way to recover from mistakes, operations that should be reversible but aren't
- **Discoverability** — features that exist but are hard to find or use without prior knowledge
- **Polish** — rough interactions, visual inconsistencies, missing loading states

Items can range from atomic fixes to full overhauls — don't artificially limit scope. This project has no shipped users and no backwards-compatibility constraints, so structural rethinks are welcome:
- Small: `{"title":"Add confirmation before deleting a non-empty group","priority":"normal","touch_paths":["packages/figma-plugin/src/ui/components"],"acceptance_criteria":["Deleting a non-empty group requires an explicit confirmation step"],"source":"product-pass"}`
- Ambitious: `{"title":"Add keyboard-navigable token tree with expand collapse and multi-select","priority":"high","touch_paths":["packages/figma-plugin/src/ui"],"acceptance_criteria":["The token tree supports keyboard navigation, expansion, and multi-select without pointer input"],"source":"product-pass"}`
- Bold: `{"title":"Add inline token value editing on double-click instead of routing every edit through the editor panel","priority":"normal","touch_paths":["packages/figma-plugin/src/ui"],"acceptance_criteria":["Users can edit token values inline from the tree without opening the editor panel for simple changes"],"source":"product-pass"}`
- Consolidation: `{"title":"Merge the Resolvers panel into the Theme Manager so theme scoped overrides live in one workflow","priority":"high","touch_paths":["packages/figma-plugin/src/ui","packages/core"],"acceptance_criteria":["Resolver editing moves into the Theme Manager flow and the standalone panel is removed"],"source":"product-pass"}`
- Removal: `{"title":"Remove the table view because the tree view already covers the same workflow with better hierarchy","priority":"normal","touch_paths":["packages/figma-plugin/src/ui"],"acceptance_criteria":["The redundant table view is removed and its remaining useful controls are absorbed into the tree workflow"],"source":"product-pass"}`
- Overhaul: `{"title":"Restructure the token editor from a monolithic component into focused sub-components with shared state boundaries","priority":"high","touch_paths":["packages/figma-plugin/src/ui/components"],"acceptance_criteria":["The token editor is split into cohesive sub-components without the current prop-drilling and local-state sprawl"],"source":"product-pass"}`

Overhaul, consolidation, and removal items are encouraged when a whole area of the product would benefit from a rethink rather than incremental patches. Don't bloat the app — if removing or merging something makes it simpler without losing real value, that's a win. The implementing agent has full freedom to touch as many files as needed.

---

## Quality Bar

Only write an item if it passes **all** of these checks:

- **Durable** — would this still look worth doing next week, or is it a transient observation?
- **Root-level** — does this address a root cause or workflow gap, not a surface symptom?
- **Non-redundant** — does this add meaningfully new work, or does it overlap with something already on the backlog?
- **Consolidating** — if you found several related gaps, did you merge them into one broader item instead of writing each separately?
- **Ownable** — can a single agent coherently own this item from start to finish?

Prefer broader workflow or architectural tasks over micro-fixes. Prefer consolidation over fragmentation. If nothing clears this bar, write 0 items — that is a valid outcome.

---

## Workflow

1. **Explore broadly** — check `scripts/backlog/progress.txt` for recent `product-pass:` entries to avoid retreading the same ground. Then read the injected backlog digest before roaming the codebase. Use it to understand what themes are already important, where the queue is dense, and what adjacent workflow gaps or missing follow-through work the current backlog implies. Then roam the codebase — panels, flows, server routes, whatever catches your eye. Look at both the frontend (`packages/figma-plugin/src/ui/`) and the server (`packages/server/`).

3. **Write findings** — for each issue found, append one JSON object per line to `backlog/inbox.jsonl`:

```json
{"title":"Short standalone title","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context","source":"product-pass"}
```

   Rules:
   - `touch_paths` must contain the concrete repo paths that best describe the intended implementation surface.
   - `acceptance_criteria` must contain at least one concrete completion check.
   - Omit `validation_profile` when it can be inferred from the touched paths.
   - Omit `capabilities` unless a shared reservation surface is clearly needed.
   - Keep `context` short and implementation-relevant.

4. **Document** — append to `scripts/backlog/progress.txt`:

```
## YYYY-MM-DD - product-pass
- Areas explored: [list of areas/files touched]
- Found N items — written to backlog/inbox.jsonl
- Notable: [the most interesting gap found]
---
```

---

## Rules

- Do NOT implement any changes. This is a read-only exploration pass.
- Do NOT modify `backlog.md`.
- Write only to `backlog/inbox.jsonl` and `scripts/backlog/progress.txt`.
- Each item must be a complete, standalone sentence — the agent that picks it up won't have your context.
- Use the current backlog as input when generating ideas: extend clusters that already exist, identify missing prerequisite or follow-through work, and surface cross-cutting consolidation opportunities suggested by the queue.
- Do not duplicate items already in `backlog.md` or merely rephrase them (check for similar wording and intent before writing).
- Write at most 3 items. Only write issues that are real, durable, and clear the quality bar above.
- Feature and UX items should outnumber bug items. If you found mostly bugs, step back and think about the user's workflow.

---

## Stop Condition

End your session with a JSON object as your **final message** — no text before or after it:

- Found items: `{"status":"done","item":"product-pass","note":"<N items written to candidate queue>"}`
- Nothing found: `{"status":"done","item":"product-pass: no-op","note":"<why>"}`
