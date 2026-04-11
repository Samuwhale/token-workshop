# Code Discovery Pass

You are an autonomous discovery agent. Your job is NOT to implement anything — it is to explore the codebase, identify concrete issues, and write actionable candidate records to `backlog/inbox.jsonl`.

Codebase patterns and backlog state are injected as compact digests. Start there, then read more only when a specific code area needs deeper inspection.

---

## Goal

Find **up to 3 concrete, actionable items** across the codebase and write them to `backlog/inbox.jsonl`. **0–1 items is fine if that is all that clears the bar.** Look for things that are wrong, wasteful, or risky in the code. Explore as many areas as you need.

**Prefer fewer, larger items over many small ones.** Each item should represent a meaningful chunk of work — not a one-line fix. If you spot several related small issues (e.g. 4 similar error-handling gaps in the same module), combine them into a single item that addresses the pattern. Only write a small standalone item if it's truly isolated and high-priority (e.g. a crash or data-loss bug).

Good targets (in order of preference):

- **Structural overhauls** — tangled architecture, monolithic components, or patterns that make the codebase fragile. These are the highest-value items because they prevent entire classes of bugs.
- **Bugs** — logic errors, wrong conditions, race conditions, state that can get stuck
- **Duplicate logic** — two or more implementations doing the same thing that should be consolidated
- **Error handling patterns** — groups of related error-handling gaps (not individual one-liners)
- **API contract violations** — code that sends or expects a shape the server no longer provides
- **Type unsafety** — clusters of `as any` casts or unchecked accesses in the same area
- **Dead code** — unused functions, components, types (only when there's a meaningful amount to remove)

Avoid writing items for: individual stale comments, single magic numbers, one-line dead imports, or other trivial fixes. These are not worth a backlog slot.

This project has no shipped users and no backwards-compatibility constraints, so structural rethinks are welcome:
- Medium: `{"title":"Unify TokenList fetch error handling so failed requests surface a real error state and retry path","priority":"normal","touch_paths":["packages/figma-plugin/src/ui"],"acceptance_criteria":["TokenList request failures surface a consistent error state instead of being swallowed"],"source":"code-pass"}`
- Larger: `{"title":"Remove the sync race where server responses can overwrite in-flight edits","priority":"high","touch_paths":["packages/figma-plugin/src","packages/server/src"],"acceptance_criteria":["In-flight edits are preserved when overlapping sync responses resolve out of order"],"source":"code-pass"}`
- Overhaul: `{"title":"Split TokenList state management into domain-specific hooks instead of one monolithic component state graph","priority":"high","touch_paths":["packages/figma-plugin/src/ui"],"acceptance_criteria":["TokenList state is organized by domain concern with fewer cross-cutting state dependencies"],"source":"code-pass"}`

**Strongly prefer overhaul items** when the root cause of multiple issues is structural. If you see 5 bugs that all stem from the same tangled architecture, write one overhaul item instead of 5 band-aid items. One well-scoped overhaul is worth more than five small fixes.

---

## Quality Bar

Only write an item if it passes **all** of these checks:

- **Durable** — would this still look worth doing next week, or is it a transient observation?
- **Root-level** — does this address a structural root cause, not a surface symptom?
- **Non-redundant** — does this add meaningfully new work, or does it overlap with something already on the backlog?
- **Consolidating** — if you found several related issues in the same module, did you merge them into one broader item instead of writing each separately?
- **Ownable** — can a single agent coherently own this item from start to finish?

Prefer broader structural or architectural tasks over isolated fixes. Prefer consolidation over fragmentation. If nothing clears this bar, write 0 items — that is a valid outcome.

---

## Workflow

1. **Explore broadly** — check `scripts/backlog/progress.txt` for recent `code-pass:` entries to avoid retreading the same ground. Then read the injected backlog digest before roaming the codebase. Use it to understand which architectural areas already have momentum so you can identify missing root-cause work, prerequisite refactors, and adjacent structural issues implied by the current queue. Then roam the codebase — components, hooks, server routes, utilities, whatever you find. Look at both the frontend and server.

3. **Write findings** — for each issue found, append one JSON object per line to `backlog/inbox.jsonl`:

```json
{"title":"Short standalone title","priority":"high|normal|low","touch_paths":["repo/path"],"acceptance_criteria":["Concrete completion check"],"validation_profile":"optional","capabilities":["optional"],"context":"Optional concise context","source":"code-pass"}
```

   Rules:
   - `touch_paths` must contain the concrete repo paths that best describe the intended implementation surface.
   - `acceptance_criteria` must contain at least one concrete completion check.
   - Omit `validation_profile` when it can be inferred from the touched paths.
   - Omit `capabilities` unless the task needs a shared reservation surface.

4. **Document** — append to `scripts/backlog/progress.txt`:

```
## YYYY-MM-DD - code-pass
- Areas explored: [list of areas/files touched]
- Found N items — written to backlog/inbox.jsonl
- Notable: [the most interesting issue found]
---
```

---

## Rules

- Do NOT implement any changes. This is a read-only exploration pass.
- Do NOT modify `backlog.md`.
- Write only to `backlog/inbox.jsonl` and `scripts/backlog/progress.txt`.
- Each item must be a complete, standalone sentence — the agent that picks it up won't have your context.
- Use the current backlog as input when generating ideas: extend existing architectural themes, identify missing root-cause or follow-through work, and look for deeper structural items suggested by clusters already on the queue.
- Do not duplicate items already in `backlog.md` or merely rephrase them (check for similar wording and intent before writing).
- Write at most 3 items. Prefer fewer, larger items. Only write issues that are real, durable, and clear the quality bar above.

---

## Stop Condition

End your session with a JSON object as your **final message** — no text before or after it:

- Found items: `{"status":"done","item":"code-pass","note":"<N items written to candidate queue>"}`
- Nothing found: `{"status":"done","item":"code-pass: no-op","note":"<why>"}`
