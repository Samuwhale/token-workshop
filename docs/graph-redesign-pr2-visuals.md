# PR 2 — Graph view: visuals, chrome diet & polish

## Goal in one line

With the mode-driven structure already in place from PR 1, replace the chrome-heavy toolbar, redesign the empty and Issues states, fix the label/LOD policy on token nodes, and aggregate generator output explosions — so the graph feels calm, legible, and intentional at any scale.

## Why this is a separate PR

PR 1 changed *how* the graph decides what to render. This PR changes *how* it looks and what controls surround it. Splitting them means:

- Reviewers can read this PR as "design polish" without having to re-derive the data flow.
- We can ship PR 1 to staging, validate the focus-first behaviour with real token data, and incorporate findings into the visual design before committing to it.
- A visual regression in this PR is unambiguously a styling/layout problem, not a data-shape problem.

## Scope: what changes

### 1. Toolbar diet

**What.** Replace the current `view mode + collection filter + type filter + search + …` toolbar with a sparse, mode-driven control bar:

- **Left:** segmented mode switch — `Focus` / `Issues`. Issues shows a count chip when > 0.
- **Center:** the focus picker — a single search input that becomes the primary way to focus a token. Selecting a result sets `focusId`. In Issues mode this control is hidden.
- **Right:** collection scope selector (only when more than one collection exists). Hop-depth toggle (`1 / 2 / chain`) appears only in Focus mode and only when `focusId` is set.

Type filter is removed entirely. (It existed to thin the global view; with focus-first that's the wrong tool. If we ever build Map mode, we add it back there.)

**Why.** Every removed control is one fewer thing for a designer to reason about. The current toolbar is a workaround for the canvas showing too much; once the canvas shows the right thing by default, most of the toolbar's job evaporates. The CLAUDE.md guidance — "be extremely wary of chrome and UI clutter," "prefer fewer visible elements" — is the explicit standard here.

### 2. `GraphFocusEmpty` empty state

**What.** A new component shown in Focus mode when `focusId === null`. Centered on the canvas:

- A prominent search input ("Inspect a token's dependencies…") with autocomplete over all tokens in scope.
- Below it, two short lists: **Recently edited** (3–5 tokens, from a small recents store) and **Has issues** (3–5 tokens with broken aliases or cycles, sourced from `useIssuesGroups`).
- A subtle "Show issues mode" link as a fallback exit if the user opened the graph mainly to debug.

No graph rendered. The canvas background stays clean.

**Why.** The empty state is a feature, not a hole — it's the place where designers decide what they're inspecting. Today, opening the graph slams you into a wall of nodes and dares you to find your token. The empty state turns the first interaction into intent capture.

### 3. `GraphIssuesList` proper card design

**What.** Replace PR 1's placeholder list with proper cards. Each card represents one issue and contains:

- A one-line description ("Broken alias to `colors.brand.legacy`", "Cycle: `a → b → a`").
- A miniature inline subgraph showing only the affected endpoints + edge (no full layout — just two or three nodes drawn small).
- Inline actions: **Detach**, **Rewire** (opens the existing rewire popover with the broken edge preselected), **Open in Focus** (sets `focusId` to the upstream token and switches to Focus mode).
- Cards are grouped by collection with a sticky group header.

**Why.** Issues are intrinsically list-shaped, not graph-shaped — there's no spatial relationship between unrelated broken aliases. Forcing them into one canvas (today's "Issues" view filter) makes them harder to scan, not easier. A card list with a tiny embedded subgraph keeps the visual context that makes the graph valuable while dropping the layout cost.

### 4. `TokenNode` label policy & LOD

**What.**

- In Focus mode neighbours: render only the meaningful path tail (`primary.500`, not `colors.brand.primary.500`). The focused node itself shows the full path.
- Drop the `zoom < 0.7` compact threshold. LOD is now driven by mode and node role, not zoom.
- Full path remains accessible via tooltip/inspector.
- Tighten internal padding so token nodes are visually quieter at default size.

**Why.** Full dotted paths dominate the visual field and overlap each other, especially in deeply nested collections. The leaf segment alone carries the meaning a designer needs in a focused view; the rest is repetition (everything in this neighborhood shares a prefix anyway). Removing the zoom-based LOD eliminates the "mid-zoom is the worst zoom" problem.

### 5. Generator output aggregation (visual)

**What.** When a focused subgraph includes a generator with many outputs, render the produces relationship as one edge into a single "produces · N" cluster pill, not N individual edges and nodes. Click the pill to expand into the underlying tokens (which then become regular focusable nodes).

**Why.** A generator that emits 50 tokens currently spawns 50 nodes and 50 edges in any view that includes it — a guaranteed hairball. Aggregating preserves the "this generator produces these" relationship without paying the visual cost. The data-side aggregator landed in PR 1; this PR is the visual treatment.

### 6. Drop the always-on dimming behaviour

**What.** Remove the global "dim non-active-set to 0.25 opacity" behaviour. Hover and selection get subtler treatments (a brighter focus ring, a thicker edge stroke).

**Why.** Dimming is a workaround for too much being on screen — when the canvas shows ~10 relevant nodes, dimming the irrelevant ones is unnecessary because there aren't any. Keeping it would make Focus mode look noisy without adding information.

### 7. Legend cleanup

**What.** Shrink the legend to a small, popover-style affordance accessible from a single icon button in the toolbar — only surfacing node-type and edge-type meanings on demand. Remove the always-visible legend rail.

**Why.** With fewer simultaneous concepts on the canvas (no clusters in Focus mode, generators inline, no dimming) the legend has less to explain. A persistent legend is itself chrome; a popover gives users help when they want it without paying for it the rest of the time.

### 8. Recents tracking

**What.** A tiny "recently focused tokens" store (last 5, persisted via `usePersistedJsonState`). Updated whenever `focusId` is set to a non-null value. Surfaced in the empty state.

**Why.** Designers iterate on the same handful of tokens during a session. Surfacing recents in the empty state turns "open graph → search → click result" into "open graph → click result" for the common path.

## Scope: what does NOT change in PR 2

- The state model and hook split (already done in PR 1).
- Map mode — still deferred.
- Token list, token details, generator authoring (out of scope for the redesign overall).
- Persistence schema (graph state remains UI-only).

## Files

| File | Change |
|---|---|
| `packages/figma-plugin/src/ui/components/graph/GraphToolbar.tsx` | Rewrite for the diet |
| `packages/figma-plugin/src/ui/components/graph/GraphFocusEmpty.tsx` | New |
| `packages/figma-plugin/src/ui/components/graph/GraphIssuesList.tsx` | New (replaces PR 1's placeholder list) |
| `packages/figma-plugin/src/ui/components/graph/IssueCard.tsx` | New |
| `packages/figma-plugin/src/ui/components/graph/nodes/TokenNode.tsx` | Label policy; padding; drop zoom-LOD |
| `packages/figma-plugin/src/ui/components/graph/nodes/ClusterNode.tsx` | Adjust for "produces · N" pill role; click-to-expand |
| `packages/figma-plugin/src/ui/components/graph/GraphCanvas.tsx` | Remove always-on dimming; tweak hover/selection treatments |
| `packages/figma-plugin/src/ui/components/graph/GraphLegend.tsx` | Convert to popover, shrink |
| `packages/figma-plugin/src/ui/hooks/useGraphRecents.ts` | New |

## Verification

Before opening the PR, all of these pass:

1. Open the graph tab. Empty state shows the focus picker, recents (if any), and an issues shortcut.
2. Type a token name into the focus picker; autocomplete narrows the list. Selecting a result moves into Focus mode on that token.
3. Focus mode shows a clean subgraph; neighbour labels show only the path tail; the focused node shows the full path.
4. Hover a neighbour: nothing dims; the hovered node gets a focus ring, the connecting edge thickens.
5. Toggle hop depth between 1, 2, and chain. The view expands without re-fitting; layout stays anchored.
6. Open a token whose alias chain runs through a generator: the generator appears inline; produces-cluster pill is visible; clicking it expands into individual outputs.
7. Switch to Issues mode. Cards group by collection with sticky headers. Each card shows endpoints and inline actions.
8. From an Issues card, click "Open in Focus": switches to Focus mode on the right token.
9. From an Issues card, click "Detach": detach popover appears; applying it removes the issue from the list.
10. Open the legend popover from the toolbar. Close it. Confirm no persistent legend rail remains.
11. Open the graph against a 500+ token store. Focus mode renders ≤20 nodes with no overlapping labels at any zoom level. No hairball edges anywhere.
12. Re-open the graph after closing it. The mode, focusId, hopDepth, and collection scope are restored.
13. Recents reflect the last 5 tokens focused, in MRU order.
14. `pnpm typecheck`, lint, and a manual smoke test pass.
