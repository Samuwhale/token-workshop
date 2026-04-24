# Graph View / Editor — Design & Implementation Spec (revised)

## Context

Token authors need to *see* how tokens depend on each other. Today the relationships are implicit: `{alias.path}` strings inside `$value`, plus generator-produced tokens that look indistinguishable from authored ones. The flat token tree answers "what tokens exist?" well, but does not answer:

- What does this token resolve through? (alias chain back to a primitive)
- What would break if I change this token? (downstream consumers)
- Where did this token come from? (which generator produced it, from what source)
- Are there cycles, broken refs, or orphans hiding in the relationships?

Two design decisions ground this spec:

**Lists are the right answer most of the time.** `TokenResolver.getDependents()` already exists and is already surfaced as a clickable "Dependent tokens" list in TokenDetails (`TokenDetails.tsx:2060–2104`). The inverse — *what does this token resolve through?* — is not yet surfaced anywhere, and a pure list closes that gap with no graph chrome at all. Competitor research confirms the pattern: Figma, Tokens Studio, Supernova, Specify, and Knapsack all center token authoring around collections / lists / tables / side panels, not diagram-first editing.

**Graphs earn their keep where lists collapse.** Branching generator fan-out, multi-collection alias chains, cycle visualization with context, orphan clustering — these are visual problems lists handle badly. The graph's job is precisely those situations.

So the work has two complementary deliverables: an upstream **"Resolves to" chain list** added to TokenDetails, and a navigable, editable **Graph** sub-tab in the Library.

The intended outcome: designers and design-system maintainers can answer routine dependency questions inline in TokenDetails, navigate generator lineage and cross-collection chains visually in the Graph, and rewire / detach / delete from the Graph when that's the right surface. Heavier authoring (value edits, generator config, renames) continues to live in the existing surfaces.

---

## 0. Audit conclusions and product principles

This spec should stay intentionally narrow. The product already has the right primary surfaces:

- **Tokens** is the authoring table: create, group, edit, rename, compare, and work across all collection modes.
- **TokenDetails** is the inspector/editor: mode values, generated ownership, upstream "Resolves to", downstream "Dependent tokens", history/review links.
- **Graph** is a dependency lens: answer topology questions, inspect generator lineage, fix broken/cyclic references, and perform only topology-safe edits.
- **Review** is the system health queue: duplicate values, broken aliases, stale generators, deprecated usage, and suppress/fix actions.
- **History** is accountability: token-level and library-level changes.
- **Publish** is delivery: Figma variables and code exports.

The graph must not become a second token editor. Every extra graph control should clear a specific ambiguity that lists cannot solve.

### External patterns to copy

- Figma Variables treat collections as the container for variables and modes, show modes as value columns, and keep alias creation/detach on the value field.
- Tokens Studio uses reference pickers filtered by compatible token type, shows raw reference plus resolved value, and lets source/reference-only sets participate in resolution without direct application.
- Supernova mirrors Figma's collection view for imported variables instead of forcing every theme into one global view.
- Specify's format models each token value as mode-aware and validates reference compatibility.
- Knapsack emphasizes centralized management of Variables, Collections, and Modes with Figma import preserving those groupings.

Research references:

- Figma variables overview: https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- Figma create/manage variables: https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections
- Figma modes and cross-collection references: https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables
- Tokens Studio references: https://docs.tokens.studio/manage-tokens/token-values/references
- Tokens Studio token sets/themes: https://docs.tokens.studio/manage-tokens/token-sets and https://documentation.tokens.studio/platform/themes
- Supernova token collections: https://learn.supernova.io/latest/design-systems/design-tokens/working-with-tokens/your-tokens-in-supernova-PAENjVFx-PAENjVFx
- Specify token format: https://docs.specifyapp.com/concepts/specify-design-token-format
- Knapsack tokens/theming: https://www.knapsack.cloud/feature-listing/design-tokens-theming

---

## 1. Information Architecture

### Placement — Library sub-tab

Add `"graph"` as a fourth `LibrarySubTab`, peer to `tokens`, `health`, `history`. The graph is a *lens on* tokens; it inherits the Library's collection scope from the left rail and can be focused from the current token/details/review context without sharing hover or selection churn.

```
[Collections rail]  Tokens  Graph  Review  History
                            ^ dependency lens
```

**Why a sub-tab and not a top-level workspace:** Top-level would force a context switch and re-pick of collection scope. The graph is authoring-adjacent — it belongs where users already are when they think about tokens.

**Why between Tokens and Review:** the graph is a bridge. Designers author in Tokens, inspect relationships in Graph, then move to Review for system health and History for accountability.

### Default state on entry

- Scope = the Library's currently selected collection. Multi-collection scope is opt-in via the toolbar's collection multi-select.
- Focus = the current `tokenDetails` target or `highlightedToken` in the working collection, if present. Otherwise no focus — show the whole collection, fit-to-viewport.
- Default depth when focused: 2 upstream + 2 downstream. Auto-expand to depth 3 if the depth-2 result has fewer than 20 visible nodes. **No depth stepper** — refocus is the only widening gesture.

### Secondary entry points

- **TokenDetails → "View in graph"** action next to the existing "Dependent tokens" list.
- **Review issues (broken-ref and cycle only) → "View in graph"** opens the graph focused on the offending node with the bad edge highlighted. This requires a new `onViewIssueInGraph(issue)` prop through `HealthPanel` / `HealthIssuesView` and either structured issue metadata or a graph-side parser that can identify the offending edge from the issue.
- **GeneratedGroupEditor success action → "See outputs in graph"** opens the graph focused on the generator node with depth=1 to its produced tokens. Current save behavior closes the editor and calls `openGeneratedTokens(...)`; keep "View tokens" as the primary success action and add graph as a secondary action, not an automatic redirect. This requires `GeneratorSaveSuccessInfo` to include `generatorId`.

Skip: right-click on tree items, global chrome buttons, entries from Canvas/Publish.

### Selection sync

Do not invent a broad global selection model for v1. Use a small library-scoped focus intent that can be written by Tokens, TokenDetails, Review, and GeneratedGroupEditor:

```ts
type LibraryGraphFocusIntent =
  | { kind: "token"; path: string; collectionId: string; highlightEdgeId?: string }
  | { kind: "generator"; generatorId: string };
```

Graph reads this intent on entry, then owns its local graph focus/viewport. Tokens continues to use the existing `highlightedToken` / `tokenDetails` state; Review continues to own `healthScope`. This avoids coupling hover/selection churn across panels.

---

## 2. TokenDetails — "Resolves to" upstream chain

This list is part of the same work as the graph, but lives in TokenDetails. It is the authoring win that does not require the graph to exist, and it is responsible for the bulk of the daily "what does this hook up to?" answers.

Insert immediately above the existing "Dependent tokens" block at `TokenDetails.tsx:2060`. Same `tm-token-details__list-box` styling.

```
Resolves to
  colors.button.bg → colors.brand → colors.blue.500 → #3366FF
```

- Renders the upstream alias chain to its terminal literal value.
- Multi-mode source: group rows by mode label. Never collapse to a "primary mode" — every mode value IS a value (CLAUDE.md).
- Each row is a button → existing `onNavigateToToken(path, collectionId)`.
- For formulas (`"{spacing.base} * 2"`), the chain ends at the resolved numeric literal with the formula shown next to the upstream reference.
- For composites (typography, shadow), the terminal literal is rendered as a compact value preview.

Powered by a new sibling hook `useTokenAncestors` modeled on `useTokenDependents.ts`. Prefer deriving the chain locally from the raw token maps and existing collection/mode helpers; no new server endpoint is needed if the UI can produce the same result as existing resolution.

Implementation correction: `TokenResolver` is not mode-aware today; it resolves one flat token map at a time. `useTokenAncestors` must build the chain per mode by materializing that mode's values first:

1. Find the owning collection from `collections` + `collectionId`.
2. Read the token's per-mode values with `readTokenModeValuesForCollection(token, collection)`.
3. For each mode, create a resolver input where every token in that collection uses that mode's value. Cross-collection references should resolve through `resolveCollectionIdForPath(...)` and the target collection's matching mode when it exists, otherwise its primary mode.
4. Walk references with the same parser rules as `TokenResolver` (`isReference`, `isFormula`, `makeReferenceGlobalRegex`) and stop on missing refs, cycles, or terminal literals.
5. Return rows grouped by mode name. Hide the whole block when every mode has no upstream reference.

If this becomes too expensive or inconsistent with server resolution, add a dedicated `GET /api/tokens/:collectionId/ancestors/*` endpoint later. Do not add it for v1 unless UI-only resolution proves wrong.

---

## 3. The Graph Itself — Visual Design

### Two node shapes only

- **Token node** — rounded rectangle with a compact leading swatch. Color tokens show the true color; non-color tokens show a muted type glyph. Do not use a 3px side stripe — it violates the app's low-chrome guidance and reads like generic dashboard decoration.
- **Generator node** — squircle / pill with a subtle inset fill (tonal shift, *not* a stroke). Small generator-kind glyph on the left (ramp / scale / inversion).

No third shape for collections — collection boundaries are clusters (see below), not nodes.

### Three edge styles

| Edge kind | Style | Direction | Meaning |
|-----------|-------|-----------|---------|
| `alias` | solid 1.5px, arrow at dependent | aliased target → referencing token | "this value flows into that token" |
| `generator-source` | dashed 1.5px | token → generator | "this token feeds the generator" |
| `generator-produces` | solid 1px | generator → token | "the generator made this token" |

Health overlays (additive on top of style):

- **Broken ref** → edge red-dashed with a break glyph; target rendered as ghost node showing the missing path.
- **Cycle** → edges in the cycle drawn amber; offending nodes show an amber dot top-right; cycle counter appears in the scope chip.
- **Generator error** → generator node tinted error-red; its produces-edges drawn muted.

Cross-collection edges add a small `↗` chevron near the source endpoint to signal the boundary crossing.

### Two zoom bands

- **Small (<0.7×):** swatch + leaf name only.
- **Default (≥0.7×):** swatch + leaf name + muted group path above + first-mode resolved value on the right (only if it fits). Health icon overlay only if non-ok.

No third "large" band. Authoring happens in the side panel, not on the node.

### Multi-mode handling — single edge, mode count glyph

CLAUDE.md's "all modes simultaneously" rule governs *authoring* surfaces. In the graph, a 4-mode token aliasing 4 different targets would render as 4 parallel edges per pair, which becomes unreadable at any non-trivial scale.

**Multi-mode alias edges always collapse to a single edge per (source, target) pair.** When the alias differs across modes, annotate the edge with a small mode-count glyph (`·3` = "active in 3 modes"). There is no toggle to expand them — debugging multi-mode behavior happens in TokenDetails, where every mode is already a first-class authoring surface.

### Clusters

Compound graph layout. Cluster regions render as low-contrast rounded backgrounds (~4% tonal shift above canvas, no stroke). Cluster label sits top-left in muted text — no chip, no border.

- **Single-collection scope:** cluster by group path derived from the token path (e.g. `color/brand` for `color.brand.500`). Generator nodes cluster under their `targetGroup`.
- **Multi-collection scope:** cluster outer-level by collection, inner by group.
- **Auto-collapse rule:** when total visible-node count exceeds ~80, non-focal clusters render as collapsed pills (name + count); incident edges aggregate to the pill with an edge-count tick. Click to expand. Below the threshold, everything renders expanded.
- **Don't cluster by `$type`** — too chaotic when modes cross types.

### Empty / zero-dep states

- **Empty collection:** centered line "No tokens in this collection yet." + "Add token" button (opens token editor). No illustration.
- **Tokens but no aliases or generators:** centered line "Nothing is aliased or generated here yet." + two link-styled actions: "Create an alias" (opens token picker over a chosen token) and "Add a generator" (opens GeneratedGroupEditor). No canvas drawn.

---

## 4. Layout

### Engine: dagre (`@dagrejs/dagre` v1)

JS-only, no worker, ~25KB gz, deterministic, handles compound (clustered) graphs natively. Chosen over ELK for bundle size and singlefile-bundle simplicity (`vite-plugin-singlefile` + `minify: false` makes worker-loaded layout engines risky).

### Direction: left → right (`rankdir: 'LR'`)

Sources on the left, derived on the right. Reads like a pipeline:

```
primitive          alias            semantic         consumer
color.blue.500 ──► color.brand ───► button.bg ────► (used in...)
       │
       │ (source)
       ▼
[colorRamp gen] ──produces──► color.blue.100, .200, .300, .500, ...
```

Mental model: "where does this come from?" reads right-to-left along arrows. Matches Figma auto-layout, spreadsheet formulas, and most lineage diagrams.

### Cycle handling

Two notions of cycle exist:

- `TokenResolver` already detects cycles via DFS and throws an error message with the cycle path. Validation issues should normalize this into structured graph health. **Authoritative source is resolver/validation, not layout.**
- Dagre's feedback-arc-set silently reverses one edge per cycle to break it for layout.

Use normalized resolver/validation cycle data to mark `AliasEdge.inCycle = true` for visual highlight. Let dagre lay out as-is. Don't trust dagre's FAS for cycle detection.

### Auto-layout only — no manual node positioning

Per user direction, v1 has no drag-to-rearrange. Pan / zoom / focus / scope changes only. Eliminates layout decay, keeps graphs identical for everyone on the team, removes a whole class of state-persistence bugs. A "Reset view" control in the toolbar fits the viewport to current scope.

### Memoization

Cache dagre output keyed by `GraphModel.fingerprint` (sorted node-id + edge-id hash). Editing a token's `$description` does not change the fingerprint → reuse layout. Editing its `$value` to a new reference does → relayout.

During an active drag-to-rewire interaction, freeze layout. Re-run on commit only (with a 120ms unfreeze delay).

---

## 5. Interaction Model

### Browse / navigate

- Pan: drag background. Zoom: scroll / pinch / `Cmd+=` / `Cmd+-`.
- `F` = fit selection; `0` = fit all; `1` = 100% zoom.
- `/` or `Cmd+K` = anchored search field (top-center). Matches token path substrings; Enter jumps + focuses; Escape closes.
- **No minimap.** Save the chrome.

### Scope and filters

A persistent **scope chip** at top-left of the canvas is the source of truth. Always shows current scope in plain English:

```
Palette · 124 tokens                 (whole collection)
Palette → button.bg                  (focused, depth auto)
Palette + Brand · 312 tokens         (multi-collection)
Palette · Colors only · 2 issues     (filter applied)
```

Click the chip to reveal scope controls (collection multi-select, clear-focus). Filter control sits next to it: token type, generator kind, health status. Keep filter UI to one line — minimal chrome.

Filtered-out nodes are *not drawn* (not dimmed). Dimming at scale produces muddy canvases.

### Selection

- **Hover:** highlight node + incident edges + 1-hop neighbors; dim the rest. No tooltip (default-zoom node already shows path + value).
- **Single click:** select. Opens TokenDetails as a 360–400px right side panel via the existing `renderLibraryScaffold`'s `contextualPanel` slot. Graph stays interactive on the left; not dimmed. Click empty canvas to dismiss panel.
- **Double click:** refocus graph on this node (scope narrows to its ancestry/descendants at default depth).
- **Right click:** minimal context menu — "Open details", "Focus on this", "Copy path", "Find usages in canvas". Destructive actions ("Delete") nested under "More" with confirmation.
- **Multi-select:** Shift-click or marquee-drag. Floating action bar above selection: Compare (only when exactly 2 selected → opens existing CompareView), Delete, Copy paths. **No bulk-alias** — too easy to misfire.

### Keyboard navigation

When a node has focus:

- Arrow keys move to nearest neighbor along that axis in laid-out coordinates.
- Enter / Space opens TokenDetails (token) or GeneratedGroupEditor (generator).
- Backspace prompts deletion (see §6).

---

## 6. Editing in the Graph (Rewire + Detach + Delete)

The graph supports three topology-level edits. Everything else (values, names, descriptions, generator config) stays in existing editors.

### A. Rewire alias — drag edge from A to B

1. User drags from the alias handle on token A onto token B. This means "make A reference B". The committed graph edge is rendered B → A because value flows from the aliased target to the dependent token.
2. **Cycle guard first:** run a graph-aware cycle check against the collection-qualified graph after simulating A → B. Reuse `detectAliasCycle` only for the simple single-collection/direct-alias case; it is not enough for duplicate paths, formulas, or cross-collection refs. If non-null, toast "Would create a cycle: a → b → a" and abort before PATCH.
3. **Mode picker** (multi-mode source only): inline popover anchored to the new edge — "Apply to all modes" (default) or pick a subset via mode checkboxes. Single-mode tokens skip this step.
4. PATCH token A's `$value` / mode value to `{<B.path>}` for the chosen mode(s). New `applyAliasRewire({ tokenPath, tokenCollectionId, targetPath, targetCollectionId, modes })` on `WorkspaceControllerContext` wraps the same PATCH endpoint and post-success refresh that `handleEditorSave` uses today. The server remains authoritative and must still reject invalid references, type mismatches, and cycles.
5. Refresh comes for free: PATCH → server → `tokenChangeKey++` → `useGraphData` re-memo → graph updates.

**No optimistic update in v1.** Local server PATCH is typically <50ms. Show a brief "Updating…" pulse on the affected edge. On failure, dispatch through `shared/toastBus` or `setErrorToast`; edge snaps back from authoritative state.

**Type-mismatch protection:** invalid drops (target's resolved type incompatible with source's `$type`) get a red no-drop cursor with a one-line tooltip explaining why ("Color token can't alias a dimension token").

### B. Detach alias — select edge, press Backspace

Detaching reverts the source token to a literal value. We must not silently destroy data.

1. User selects an alias edge, presses Backspace (or right-click → "Detach alias").
2. Inline confirm popover anchored on the edge:
   > "Detach `colors.button.bg` from `colors.brand`?
   > Set value to `#3366FF` (current resolved value)? [Detach] [Cancel]"
3. The proposed literal is resolved with the same per-mode materialization used by `useTokenAncestors`; do not call a non-existent `TokenResolver.resolve(path, mode)` API. For multi-mode: confirm shows per-mode literals, with a single Detach button that applies to all selected modes (default: all modes that this edge is active in).
4. PATCH through new `applyAliasDetach({ tokenPath, tokenCollectionId, modes })`, with `value: <resolved literal>` instead of `{ref}`.

Edge cases:

- Source value is a **formula** (`"{base} * 2"`) — detach replaces the whole expression with the resolved numeric literal. Confirm copy explicitly says "Replaces formula with literal value `12`."
- Source aliases a **composite** (typography, shadow): resolved literal expands to the full composite object. Confirm shows a compact preview.

### C. Delete token / delete generator

- **Delete token (right-click → Delete or Backspace on selected node):** Opens the existing token-deletion confirm dialog (reuse the same confirm UX as Tokens list). If deletion would break N existing aliases, the dialog lists them so the user can decide.
- **Delete generator (right-click on generator node → Delete):** Opens the existing generator-delete confirm. Mention how many produced tokens will be detached/deleted.

Deletion uses existing endpoints — no new server work.

### What does NOT belong in the graph (defer to existing editors)

- Editing token values, names, descriptions, type, modes → TokenDetails (side panel).
- Creating / reconfiguring generators → `GeneratedGroupEditor` modal (graph just launches it).
- Renaming or moving tokens between groups → Tokens list inline rename.
- Bulk-alias or bulk-rename → Tokens list batch operations.
- Creating tokens from scratch in v1 (defer to v1.1).

This keeps the graph's interaction surface tight and predictable.

---

## 7. Data Architecture

### Domain → graph pipeline

Build a pure `GraphModel` from existing inputs. Construction lives in `@tokenmanager/core` so server-side analysis (future lint rules, health scans) can reuse it.

**New file: `packages/core/src/graph.ts`** — exports:

```ts
export interface BuildGraphInput {
  collections: Array<{ id: string; modes: Array<{ name: string }> }>;
  tokensByCollection: Record<string, Record<string, Token>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  generators: TokenGenerator[];
  derivedTokenPaths: Map<string, TokenGenerator>;  // from useGenerators, after semantic outputs are included
  validationIssues?: Array<{
    rule: string;
    path?: string;
    collectionId?: string;
    message: string;
    targetPath?: string;
    targetCollectionId?: string;
    cyclePath?: string[];
  }>;
}

export function buildGraph(input: BuildGraphInput): GraphModel;
```

Add named exports to `packages/core/src/index.ts` (`buildGraph`, `GraphModel`, `GraphNode`, `GraphEdge`). **Do not use `export *`** — direct named re-exports only (per existing pattern; `export *` has caused TDZ pain in singlefile bundle).

### Types

```ts
export type GraphNodeId = string;
// "token:<collectionId>::<path>" | "gen:<generatorId>"

export type GraphHealthStatus =
  | 'ok' | 'broken' | 'cycle' | 'deprecated' | 'generator-error';

export interface TokenGraphNode {
  kind: 'token';
  id: GraphNodeId;
  path: string;
  collectionId: string;
  displayName: string;        // last path segment
  $type?: TokenType;
  health: GraphHealthStatus;
  isGeneratorManaged: boolean;
  ownerGeneratorId?: string;
  hasDependents: boolean;
  hasDependencies: boolean;
}

export interface GeneratorGraphNode {
  kind: 'generator';
  id: GraphNodeId;
  generatorId: string;
  generatorType: GeneratorType;
  name: string;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  targetCollection: string;
  targetGroup: string;
  outputCount: number;
  enabled: boolean;
  health: GraphHealthStatus;
  errorMessage?: string;
}

export type GraphNode = TokenGraphNode | GeneratorGraphNode;

export interface AliasEdge {
  kind: 'alias';
  id: GraphEdgeId;            // `alias:${upstream}->${downstream}`
  from: GraphNodeId;          // upstream referenced token
  to: GraphNodeId;            // downstream token containing the reference
  modeCount?: number;         // active mode count for this upstream/downstream pair
  modeNames?: string[];       // used for popovers and detach confirmation, not always rendered
  inCycle?: boolean;
}
export interface GeneratorSourceEdge {
  kind: 'generator-source';
  id: GraphEdgeId; from: GraphNodeId; to: GraphNodeId;
}
export interface GeneratorProducesEdge {
  kind: 'generator-produces';
  id: GraphEdgeId; from: GraphNodeId; to: GraphNodeId; stepName: string;
}
export type GraphEdge = AliasEdge | GeneratorSourceEdge | GeneratorProducesEdge;

export interface GraphModel {
  nodes: Map<GraphNodeId, GraphNode>;
  edges: Map<GraphEdgeId, GraphEdge>;
  outgoing: Map<GraphNodeId, GraphEdgeId[]>;
  incoming: Map<GraphNodeId, GraphEdgeId[]>;
  fingerprint: string;        // hash over sorted node + edge ids
}
```

### Key data decisions

- **Same path in two collections = two distinct nodes.** `tokensByCollection` is the source of truth; never fuse cross-collection same-path tokens into one node.
- **Reference resolution without explicit collection:** mirror the existing UI fallback in `shared/collectionPathLookup.resolveCollectionIdForPath`. If the result is `ambiguous`, render a broken/ambiguous ghost target instead of picking a collection silently. The graph must agree with TokenDetails on what `{foo.bar}` means.
- **Formula references included:** `"{spacing.base} * 2"` produces an alias edge to `spacing.base`. `TokenResolver`'s reference regex already captures this.
- **Cross-collection edges included** with a small `↗` chevron near the source endpoint.
- **Excluded:** generator-config token references (`$tokenRefs`) — too noisy, revisit if users ask.
- **Generator outputs include scale and semantic outputs.** Current `getGeneratorManagedOutputs(...)` only covers step outputs. Before graph lineage ships, update or add a helper that includes `semanticLayer.mappings` so generated semantic aliases appear as produced tokens too.
- **Multi-mode aliases collapse** to a single edge with a `·N` count glyph when modes differ; never per-mode parallel edges.
- `hasDependents` / `hasDependencies` precomputed so node port affordances render without crawling adjacency.
- **Cycle and broken-ref health come from validation where available.** `TokenResolver` currently throws plain `Error` for circular references; do not rely on a non-existent `CyclicReferenceError` type. Add structured issue metadata (`targetPath`, `targetCollectionId`, `cyclePath`) to validation output if parsing messages proves brittle.

### UI hook: `useGraphData`

```ts
// packages/figma-plugin/src/ui/hooks/useGraphData.ts
export function useGraphData(params?: { validationIssues?: BuildGraphInput["validationIssues"] }): GraphModel {
  const { pathToCollectionId, collectionIdsByPath, perCollectionFlat } =
    useTokenFlatMapContext();
  const { collections } = useCollectionStateContext();
  const { generators, derivedTokenPaths } = useGeneratorContext();
  return useMemo(
    () => buildGraph({
      collections,
      tokensByCollection: perCollectionFlat,
      pathToCollectionId,
      collectionIdsByPath,
      generators,
      derivedTokenPaths,
      validationIssues: params?.validationIssues,
    }),
    [collections, perCollectionFlat, pathToCollectionId, collectionIdsByPath, generators, derivedTokenPaths, params?.validationIssues],
  );
}
```

Expected rebuild cost at 2000 tokens + 50 generators: 3–8ms. Incremental rebuild not needed.

### Scope selection (focused subgraph)

Pure function in `components/graph/graphScope.ts`:

```ts
export function selectSubgraph(full: GraphModel, scope: GraphScope): GraphModel;
```

For `mode: 'focus'`, two-queue BFS: one walks `outgoing`, one walks `incoming`, each bounded by `depth` (fixed at 2; auto-expand to 3 when result < 20 nodes). Include any edge whose endpoints are both in the visited set.

### State management — new `GraphContext`

Don't extend `TokenDataContext` / `NavigationContext` / `EditorContext` — separate concerns. New `GraphContext` owns:

- `scope: GraphScope` (mode, focusNodeId, selectedCollectionIds, filters)
- `searchQuery: string`
- `viewportPersisted: { x, y, zoom }`

Persist `scope.filters`, `scope.selectedCollectionIds`, `searchQuery`, `viewportPersisted` keyed by `workingCollectionId` via existing `usePersistedState`. Reset `focusNodeId` on navigation away.

Ephemeral render state (hover, selection ring, drag-rewire preview) stays as `useState` local to `GraphCanvas` — avoids context-driven re-renders on every frame.

---

## 8. Rendering — React Flow (`@xyflow/react` v12)

Chosen over dagre+SVG / ELK / cytoscape / hand-rolled canvas for:

- React-native node components (use existing primitives; consistent theming via `--color-figma-*`).
- Native `onConnect` for drag-to-rewire — the single biggest editing interaction.
- Built-in viewport virtualization (`onlyRenderVisibleElements`) for the 2000-node case.
- ESM, no workers, no dynamic imports → safe with `vite-plugin-singlefile` + `minify: false`.
- Bundle ~45–55 KB gz (acceptable on top of dagre's ~25 KB).

**Smoke test before committing:** add `@xyflow/react` + its CSS, run `build.mjs`, confirm `dist/ui.html` renders. If CSS inlining fails, import as `?raw` or hand-author the ~30 essential `.react-flow__*` selectors.

**React 18 confirmed** (`packages/figma-plugin/package.json`) — xyflow v12 compatible.

### Performance strategy

1. `<ReactFlow onlyRenderVisibleElements />`.
2. Layout memoized by `GraphModel.fingerprint` + cluster mode.
3. `GraphModel` cached in a ref; only recomputed on `TokenDataContext` revision bump (avoid rebuild on selection-state churn).
4. Freeze layout during drag-to-rewire (`onConnectStart` → frozen; `onConnectEnd` → unfreeze after 120ms).
5. `React.memo` on `TokenNode` and `GeneratorNode`.
6. `resolvedValuePreview` is lazy — computed on hover through the same per-mode resolver helper used by `useTokenAncestors`.
7. Cycle/drag edges use CSS animations, never JS-driven `strokeDashoffset` updates.

Targets: 60fps pan/zoom at 500 visible; <200ms relayout at 2000; <300ms initial mount.

---

## 9. Accessibility

- Each node renders as a `tabIndex={0}` focusable wrapper with visible focus ring (`outline: 2px solid var(--color-figma-focus)`).
- Arrow keys: navigate to nearest neighbor along that axis in laid-out coordinates.
- Enter / Space: opens TokenDetails / GeneratedGroupEditor.
- Zoom shortcuts registered through existing `useCommandPaletteCommands` so they appear in the help panel.
- **Screen-reader fallback:** offscreen `<aside role="region" aria-label="Graph outline">` mirrors the focused node's incoming + outgoing neighbors as a linkified list (same shape as TokenDetails' "Dependent tokens"). Visual canvas wrapper gets `aria-hidden`.
- High-contrast: all node/edge colors come from CSS vars (`--color-figma-graph-*`) so OS overrides work.

---

## 10. File / Module Layout

```
packages/core/src/
  graph.ts                              # NEW: buildGraph(), GraphModel + node/edge types
  index.ts                              # add named exports for the above

packages/figma-plugin/src/ui/
  contexts/
    GraphContext.tsx                    # NEW: graph scope, filters, viewport, focus intent

  hooks/
    useTokenAncestors.ts                # NEW (mirror of useTokenDependents)
    useGraphData.ts                     # NEW
    useGraphScope.ts                    # NEW
    useGraphLayout.ts                   # NEW (dagre wrapper, memoized)
    useGraphKeyboardNav.ts              # NEW
    useGraphMutations.ts                # NEW (rewire/detach/delete)

  components/
    TokenDetails.tsx                    # MODIFIED: insert "Resolves to" block above existing dependents at line 2060
    graph/
      GraphPanel.tsx                    # top-level panel rendered from PanelRouter
      GraphCanvas.tsx                   # <ReactFlow> host
      GraphToolbar.tsx                  # scope chip, collection multi-select, filter, search, reset view
      GraphEmptyState.tsx
      GraphSROutline.tsx                # a11y fallback list
      nodes/
        TokenNode.tsx
        GeneratorNode.tsx
      edges/
        AliasEdge.tsx
        GeneratorSourceEdge.tsx
        GeneratorProducesEdge.tsx
      interactions/
        RewireConfirm.tsx               # mode picker popover
        DetachConfirm.tsx               # detach alias popover
      graphTypes.ts                     # UI-local: GraphFilters, GraphScope
      graphScope.ts                     # selectSubgraph BFS
      graphLayout.ts                    # runDagre(graph, direction, clusters)
      graphTheme.ts                     # CSS-var mapping

  panels/
    PanelRouter.tsx                     # add: library.graph case → renderLibraryGraph()

  shared/
    navigationTypes.ts                  # add "graph" to LibrarySubTab, TOP_TABS, WORKSPACE_TABS, matchRoutes
```

### Critical files to modify

- `packages/figma-plugin/src/ui/shared/navigationTypes.ts` — `LibrarySubTab`, `TOP_TABS[0].subTabs`, `WORKSPACE_TABS[0].sections` + `matchRoutes`.
- `packages/figma-plugin/src/ui/panels/PanelRouter.tsx` — add `library.graph` route to `PANEL_MAP.library`, mirror the `renderLibraryScaffold` pattern used for tokens/health/history. Update the `section` parameter type to include `"graph"` and decide that the left rail still selects the working collection while the graph toolbar handles optional multi-collection scope.
- `packages/figma-plugin/src/ui/contexts/WorkspaceControllerContext.tsx` — add graph mutation methods to the tokens controller, not the editor controller: `applyAliasRewire`, `applyAliasDetach`, and `openGraphFocus`.
- `packages/figma-plugin/src/ui/components/TokenDetails.tsx` — insert "Resolves to" block above the existing "Dependent tokens" block at line 2060.
- `packages/figma-plugin/src/ui/components/HealthPanel.tsx` and `packages/figma-plugin/src/ui/components/health/HealthIssuesView.tsx` — add "View in graph" only for broken/cycle issues.
- `packages/figma-plugin/src/ui/hooks/useGeneratedGroupSave.ts` — include `generatorId` in `GeneratorSaveSuccessInfo` so the graph can focus the saved generator.
- `packages/core/src/generator-types.ts` — expose graph-ready generator outputs that include semantic-layer produced aliases, not only scale steps.
- `packages/server/src/services/lint.ts` and `packages/figma-plugin/src/ui/hooks/useValidationCache.ts` — add optional structured issue metadata for graph highlighting if message parsing is not robust enough.
- `packages/core/src/index.ts` — add named exports for `buildGraph`, types.
- `packages/figma-plugin/package.json` — add `@xyflow/react ^12`, `@dagrejs/dagre ^1`.

### Critical files to reuse (no modification)

- `packages/core/src/resolver.ts` — `TokenResolver` (deps, dependents, resolveAll, cycle detection).
- `packages/core/src/dtcg-types.ts` — `isReference`, `parseReference`, `isFormula`.
- `packages/figma-plugin/src/ui/components/token-editor/tokenEditorHelpers.ts` — `detectAliasCycle`.
- `packages/figma-plugin/src/ui/contexts/TokenDataContext.tsx` — `perCollectionFlat`, `pathToCollectionId`, `collectionIdsByPath`.
- `packages/figma-plugin/src/ui/hooks/useGenerators.ts` — `derivedTokenPaths`.
- `packages/figma-plugin/src/ui/hooks/useTokenDependents.ts` — pattern for `useTokenAncestors`.
- `packages/figma-plugin/src/ui/shared/collectionPathLookup.ts` — `resolveCollectionIdForPath`.
- `packages/figma-plugin/src/ui/primitives/` — Button, IconButton, Chip, Tooltip, etc.
- `packages/figma-plugin/src/ui/shared/toastBus.ts`.

---

## 11. Anti-goals

The graph is NOT:

- A replacement for the Tokens list (authoring values, renaming, bulk ops stay there).
- A replacement for `GeneratedGroupEditor` (graph launches the wizard, doesn't reimplement it).
- A whole-canvas diagram tool (no freeform notes, no user-placed nodes, no export-as-image, no shareable saved viewports).
- A comparison tool (Compare stays 2-way diff; selecting two nodes just launches existing CompareView).
- A pseudo-IDE (no commit, no in-canvas undo timeline; app-level undo applies as normal).
- A user-curated layout (no drag-to-rearrange — auto-layout only, deterministic for everyone).
- A surface for multi-mode debugging (per-mode parallel edges are out — TokenDetails owns that view).

---

## 12. Risks & Pause Points

### Recommended implementation sequence

1. **TokenDetails upstream chain first.** This solves the highest-frequency authoring question without graph chrome and validates per-mode dependency resolution.
2. **Read-only graph second.** Add navigation, scope, health overlays, generator lineage, search, and keyboard access. No mutation until the dependency model is trusted.
3. **Topology edits last.** Add rewire, detach, and delete only after the read-only graph agrees with TokenDetails, Review, and generated ownership.

**Confirm before implementing:**

1. **React Flow CSS under singlefile bundle.** Add `@xyflow/react` + dagre, run `build.mjs`, confirm `dist/ui.html` renders before building UI on top.
2. **Cross-collection alias resolution behavior.** Verify `buildGraph`'s reference-to-node resolution produces identical results to the existing `resolveCollectionIdForPath` fallback. Use a manual fixture or temporary local check during development; do not add a committed unit test unless explicitly asked.
3. **Plugin iframe drag gesture.** Drag-edge UX needs verification on Figma desktop and Figma web before the rewire UX is built on top. The `useDragDrop` precedent in `TokenList` confirms drag works at scale, but `onConnect`-style port-to-port drag is a different gesture.

**Watch:**

4. Dagre cycle layout vs resolver/validation cycle detection — use normalized graph health for `inCycle`; treat dagre's FAS reversal as cosmetic.
5. Generator deletion mid-session — `focusNodeId` must tolerate "node no longer exists" (toast + clear focus). Mirrors existing `editingGeneratedGroup` resilience in PanelRouter.
6. Bundle growth ≈ 80 KB gz (xyflow + dagre). Acceptable but flag in PR.
7. Default depth=2 may feel empty on leaf tokens — auto-expand-to-3 rule covers it but should be verified on real data.

---

## 13. Verification

End-to-end test path before declaring v1 complete:

**Setup**

1. Start dev: `pnpm dev`; open the plugin in Figma desktop.
2. Load a sample collection containing: 50+ authored tokens, ≥1 colorRamp generator with semantic aliases, ≥1 cross-collection alias, ≥1 known broken reference, ≥1 known cycle.

**TokenDetails — "Resolves to"**

- Open an aliased token in TokenDetails. Confirm the upstream chain renders above "Dependent tokens", terminates at a literal value, and rows are clickable.
- Open a multi-mode token. Confirm rows are grouped by mode label.
- Open a formula-valued token. Confirm chain ends at the resolved literal with the formula visible.
- Open a leaf primitive (no upstream). Confirm the block is hidden — no empty-state chrome.

**Graph navigation**

- Switch to Library → Graph sub-tab. Confirm scope chip shows current collection + token count.
- Select a token in Tokens view, switch to Graph — confirm focus matches selection at default depth.
- From TokenDetails "View in graph" — confirm focused graph state.
- From a Review "broken reference" issue → "View in graph" — confirm node + bad edge highlighted.
- From a Review cycle issue → "View in graph" — confirm cycle edges amber + scope-chip cycle counter.
- From GeneratedGroupEditor success action → "See outputs in graph" — confirm generator + produces-edges visible.

**Visual & layout**

- Confirm token nodes show swatch + leaf name + value at default zoom.
- Confirm generator nodes have distinct shape and kind glyph.
- Confirm alias / generator-source / generator-produces edges have distinct styles.
- Confirm cycle edges render amber with cycle counter in scope chip.
- Confirm broken-ref edge renders red-dashed with ghost target node.
- Confirm clusters group by collection (multi) or group path (single), no hard borders.
- Confirm multi-mode aliases render as a single edge with `·N` glyph when modes differ.
- Confirm clusters auto-collapse when total visible-node count exceeds threshold.
- Confirm fit-to-viewport, pan, zoom, search.

**Multi-collection scope**

- Open the toolbar collection multi-select; pick brand + product. Confirm both render with cross-collection edges marked `↗`.
- Confirm outer cluster is per collection; inner cluster is per group.

**Editing**

- Drag from token A's alias handle onto token B → confirm cycle guard, mode picker (multi-mode), success toast, edge appears as B → A, A's `$value` updated.
- Try dropping onto a type-incompatible target → confirm red no-drop cursor + tooltip; no PATCH fired.
- Try a connection that would create a cycle → confirm "Would create a cycle" toast; no PATCH fired.
- Select an alias edge, press Backspace → confirm detach popover with proposed literal; confirm formula-source case shows "Replaces formula with literal".
- Right-click token → Delete → confirm existing delete dialog opens with breakage list.
- Double-click generator → confirm GeneratedGroupEditor opens in edit mode.

**Performance**

- Collection with 500 tokens — confirm pan/zoom at 60fps.
- Collection with 2000 tokens — confirm <300ms initial mount, <200ms relayout on alias rewire.
- Confirm layout doesn't recompute when toggling unrelated state (selection, hover).

**Accessibility**

- Tab into the graph → focus ring visible on a node.
- Arrow keys move focus between connected nodes; Enter opens details; Backspace prompts deletion.
- Confirm screen reader reads the offscreen outline for focused node's neighbors.

(Per CLAUDE.md, do not write tests unless asked. The xyflow + dagre build smoke check is in scope. Cross-collection resolution should be verified manually or with a temporary local script unless the user explicitly asks for committed tests.)

---

## 14. Out-of-scope for v1 (explicit deferrals)

- Optimistic mutations + rollback machinery.
- Creating tokens from scratch in the graph (`N` shortcut etc.).
- Per-mode parallel edges.
- Depth stepper / focus-radius slider.
- Manual node positioning / saved layouts.
- Decorator API for third-party overlays. Diff overlay against publish snapshot, recently-touched ring, lint badges all defer here. Revisit when there is a concrete second consumer; introducing the API earlier is premature abstraction.
- History integration (annotate nodes with "changed in commit X").
- Export as image / shareable URL with viewport state.
- Multi-collection scope as default (multi works but default is current collection).
- Minimap.
- First-time hint banner (drag affordance is self-evident).
