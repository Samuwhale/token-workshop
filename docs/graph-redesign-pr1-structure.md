# PR 1 — Graph view: state & structure refactor

## Goal in one line

Replace the conflated `(viewMode, filters, search)` state model with a mode-driven model (`mode`, `focusId`, `hopDepth`) so the graph can render a focused subgraph by default and surface issues as a separate mode — without yet changing visuals or chrome.

## Why this is a separate PR

Untangling the state model and the rendering pipeline is the structural change that everything else hangs off. Doing it in isolation lets us:

- Land a behavioural shift (focus-first) without simultaneously shipping new components and visuals, which would be hard to review.
- Keep visual regressions out of the diff so the next PR is purely about polish.
- Test end-to-end (Focus mode renders a clean neighborhood, Issues mode lists problems) before adding the toolbar/empty-state work.

If we shipped this in one giant PR with PR 2's visuals, reviewers would not be able to tell whether a regression was a layout-engine issue, a state-shape issue, or a styling issue.

## Scope: what changes

### 1. New mode-driven top-level state in `GraphPanel`

**What.** Replace the existing state cluster (search query, selectedCollectionIds, view mode, filters, cluster expansion) with:

```ts
type GraphMode = 'focus' | 'issues';        // 'map' deferred to a follow-up
type GraphState = {
  mode: GraphMode;
  focusId: string | null;                   // token or generator id
  hopDepth: 1 | 2 | 'chain';                // focus mode only
  scopeCollectionIds: string[];             // still useful as a coarse filter
};
```

Persist this with the existing `usePersistedJsonState` hook so the graph remembers what you were doing.

**Why.** Today every toolbar control is independent state, and every render path has to reconcile their combinations. Collapsing to a single `mode` discriminator means each rendering path is single-purpose and the impossible combinations (e.g., "issues view + type filter + search disabling clustering") simply cease to exist. State you can't represent can't break.

### 2. Replace `useGraphScope` with three focused hooks

**What.** Delete `useGraphScope`. Introduce:

- `useFocusedSubgraph(focusId, hopDepth, scopeCollectionIds)` — given a focus id, returns the subgraph (nodes + edges) within `hopDepth` upstream and downstream, plus a flag indicating whether more hops exist (so the toolbar can show "show more"). Aggregates >8 same-kind neighbours into one cluster pill.
- `useIssuesGroups(scopeCollectionIds)` — returns issues grouped by collection: ghost references, broken aliases, cycles, ambiguous generator sources. Each group entry carries enough data to render a card (endpoints, modes affected, suggested action).
- (deferred) `useMapClusters(scope)` — not built in this PR; placeholder file with a TODO.

**Why.** `useGraphScope` today is a serial pipeline (collection → view → type → search → cluster) where every stage is conditional on the others. That's the source of the "search disables clustering" trap and the cluster-threshold-of-80 problem (the threshold has to be high precisely because the pipeline can't differentiate intent). Splitting by *intent* lets each hook pick a layout, density, and aggregation that fits its job, and lets us drop the global threshold entirely.

### 3. Add a focused-tree layout in `graphLayout.ts`

**What.** Add a `layoutFocused(subgraph, focusId)` function that:

- Pins the focused node at a deterministic canvas coordinate (center-left).
- Lays upstream nodes in a column to the left, downstream nodes in a column to the right.
- Stacks multiple hops as additional columns (hop 2 = further out).
- Returns positions only — no styling.

Keep the existing dagre layout function for any future Map mode use; do not delete it.

**Why.** Dagre's auto-layout works for arbitrary graphs but produces unpredictable positions, so any data change forces a `fitView` reset, which disorients the user mid-edit. A deterministic focused layout means the camera and node positions stay stable when the user edits — that single change kills a class of "where did my graph go?" complaints. Keeping dagre around means we don't paint ourselves into a corner if we later add Map mode.

### 4. Drive `GraphCanvas` from mode

**What.** `GraphCanvas` becomes a thin switch:

```tsx
if (mode === 'focus') return <FocusCanvas .../>;
if (mode === 'issues') return <IssuesPlaceholder .../>;
```

`FocusCanvas` is the renamed/refactored existing canvas, but it consumes `useFocusedSubgraph` output and `layoutFocused` positions. `IssuesPlaceholder` is intentionally minimal in this PR — a basic vertical list of issues using existing TokenNode visuals; it's the *data path* we're proving, not the final card design (that's PR 2).

Drag-to-rewire and edge-detach interactions stay wired in `FocusCanvas`. Remove the `fitView` call that fires on every data change.

**Why.** Splitting the canvas by mode is what lets each mode have its own rendering rules without `if (mode)` branches scattered through every node renderer. A placeholder Issues view in this PR is enough to verify that `useIssuesGroups` returns the right data; we'll style it properly in PR 2.

### 5. Touch up `GraphInspector` to react to focus, not selection

**What.** Inspector currently keys on selection. Change it to key on `focusId`. Selection inside the focused subgraph (e.g., for compare or batch delete) becomes a separate concern handled within `FocusCanvas`.

**Why.** Today selection drives both "what's highlighted" and "what's in the inspector," which means clicking a node in the canvas to highlight it also pops the inspector — adding chrome whether you wanted it or not. Decoupling lets focus be the editing target and selection be a transient interaction.

## Scope: what does NOT change in PR 1

These are deliberately deferred to PR 2 so this PR stays a state/structure refactor:

- Toolbar layout (still has the existing controls, even though some are now no-ops).
- TokenNode label policy (still shows full path; LOD threshold still 0.7).
- New empty-state component (`GraphFocusEmpty`) — for now, "no focus" renders a plain "Pick a token" message.
- Issues cards visual design — placeholder list.
- Legend changes.
- Generator output aggregation visuals (the *data* hook can already aggregate; visuals come in PR 2).
- Map mode.

## Files

| File | Change |
|---|---|
| `packages/figma-plugin/src/ui/components/graph/GraphPanel.tsx` | Restructure state shape; route by `mode` |
| `packages/figma-plugin/src/ui/components/graph/GraphCanvas.tsx` | Split into `FocusCanvas` + minimal `IssuesPlaceholder`; drop `fitView` reset |
| `packages/figma-plugin/src/ui/hooks/useGraphScope.ts` | Delete |
| `packages/figma-plugin/src/ui/hooks/useFocusedSubgraph.ts` | New |
| `packages/figma-plugin/src/ui/hooks/useIssuesGroups.ts` | New |
| `packages/figma-plugin/src/ui/components/graph/graphLayout.ts` | Add `layoutFocused`; keep dagre layout |
| `packages/figma-plugin/src/ui/components/graph/graphClusters.ts` | Remove the global 80-threshold; expose a generic `aggregateNeighbours(nodes, max)` helper for the focus subgraph hook to call |
| `packages/figma-plugin/src/ui/components/graph/GraphInspector.tsx` | React to `focusId` instead of selection |

## Verification

Before opening the PR, all of these pass:

1. Open the plugin, open the graph tab. The canvas mounts in Focus mode and shows a "Pick a token" empty state.
2. Click a token from the token list (or wherever the existing entry point is). The graph renders the focused subgraph: focus node center-left, immediate refs left, immediate consumers right.
3. Toggle hop depth to 2 (via a temporary debug control or directly in state — the styled toggle ships in PR 2). The subgraph expands by one ring.
4. Edit a focused token's value. The canvas does **not** refit; focus and pan stay where they were.
5. Drag the upstream edge to a new target. Confirm-modes popover appears and rewire works.
6. Select an alias edge and press Backspace. Detach popover appears and detach works.
7. Switch mode to Issues (programmatically — toolbar shipping in PR 2). A list of issue rows appears, one per problem, with sensible labels.
8. With a collection of 500+ tokens, opening the graph and focusing on one token renders <20 nodes — confirming the old "filter without clustering" path is gone.
9. `pnpm typecheck` and the project's lint pass cleanly.
10. Manual smoke test: nothing in the existing token list / token editor / generator editor flow has regressed.
