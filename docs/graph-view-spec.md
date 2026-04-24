# Graph View / Editor — Design & Implementation Spec

## Context

Token authors need a way to *see* how tokens depend on each other. Today the relationships are implicit: `{alias.path}` strings inside `$value`, and generator-produced tokens that look indistinguishable from authored ones. The flat token tree answers "what tokens exist?" well, but does not answer:

- What does this token resolve through? (alias chain back to a primitive)
- What would break if I change this token? (downstream consumers)
- Where did this token come from? (which generator produced it, from what source)
- Are there cycles, broken refs, or orphans hiding in the relationships?

This spec adds a **Graph** section to the Library workspace: a deterministic, auto-laid-out node-and-edge view of token aliases and generator lineage, with light topology-level editing (rewire, detach, delete). It complements — does not replace — the token list, TokenDetails, and the GeneratedGroupEditor wizard.

The intended outcome: designers and design-system maintainers can answer dependency questions visually in seconds, and make low-risk topology edits (rewire an alias, delete an unused token) without leaving the graph. Heavier authoring (value edits, generator config, renames) continues to live in the existing surfaces.

---

## 1. Information Architecture

### Placement — Library sub-tab

Add `"graph"` as a fourth `LibrarySubTab`, peer to `tokens`, `health`, `history`. The graph is a *lens on* tokens; it inherits the Library's collection scope (left rail) and shares selection state with the Tokens view.

```
[Collections rail]  Tokens  Graph  Review  History
                            ^ active
```

**Why a sub-tab and not a top-level workspace:** Top-level would force a context switch and re-pick of collection scope. The graph is authoring-adjacent — it belongs where users already are when they think about tokens.

### Default state on entry
- Scope = the Library's currently selected collection.
- Focus = the token currently selected in Tokens view, if any. Otherwise no focus — show the whole collection, fit-to-viewport, clusters auto-collapsed for groups with >12 tokens.
- Default depth when focused: 2 upstream + 2 downstream. Auto-expand to depth 3 if the depth-2 result has fewer than 20 visible nodes.

### Secondary entry points
Worth wiring; cheap and high signal:
- **TokenDetails → "Open in graph"** action next to the existing "Used by" list.
- **Health issues (broken-ref and cycle only) → "View in graph"** opens the graph focused on the offending node with the bad edge highlighted. Skip this for duplicates / unused / deprecated — graph adds nothing there.
- **GeneratedGroupEditor → "See outputs in graph"** opens the graph focused on the generator node with depth=1 to its produced tokens.

Skip: right-click on tree items, global chrome buttons, entries from Canvas/Publish. The sub-tab is already one click away.

### Selection sync
Library-level `selectedTokenPath` is shared between Tokens, Graph, Health. Switching sub-tabs preserves selection.

---

## 2. The Graph Itself — Visual Design

### Two node shapes only

- **Token node** — rounded rectangle. 3px vertical accent on the left edge in the token's `$type` color (true color swatch for color tokens; muted neutral for everything else). Swatch is the one decorative element worth its weight — it makes color relationships scannable at a glance.
- **Generator node** — squircle / pill with a subtle inset fill (tonal shift, *not* a stroke). Small generator-kind glyph on the left (ramp / scale / inversion).

No third shape for collections — collection boundaries are clusters (see below), not nodes.

### Three edge styles

| Edge kind | Style | Direction | Meaning |
|-----------|-------|-----------|---------|
| `alias` | solid 1.5px, arrow at target | source token → aliased target | "this token references that token" |
| `generator-source` | dashed 1.5px | token → generator | "this token feeds the generator" |
| `generator-produces` | solid 1px | generator → token | "the generator made this token" |

Health overlays (additive on top of style):
- **Broken ref** → edge red-dashed with a break glyph; target rendered as ghost node showing the missing path.
- **Cycle** → edges in the cycle drawn amber; offending nodes show an amber dot top-right; cycle counter appears in the scope chip.
- **Generator error** → generator node tinted error-red; its produces-edges drawn muted.

### Node content by zoom band

- **Small (<0.6×):** swatch + leaf name only.
- **Medium (~1.0×, default):** swatch + leaf name + muted group path above + first-mode resolved value on the right (only if it fits). Health icon overlay only if non-ok.
- **Large (>1.5×):** full path, all modes' values stacked compactly, mode labels visible. Read-only — editing happens in the side panel.

### Multi-mode handling — pragmatic deviation

CLAUDE.md's "all modes simultaneously" rule governs *authoring* surfaces (token list, editor). In the graph, a single 4-mode token aliasing 4 different targets would render as 4 parallel edges per pair, which becomes unreadable at any non-trivial scale.

**Default: collapse per-mode alias edges into a single edge per (source, target) pair.** When the alias differs across modes, annotate the edge with a small mode-count glyph (`·3` = "active in 3 modes"). A toolbar toggle "Per-mode edges" expands them into parallel edges labeled by mode name when the user is debugging multi-mode behavior.

This is a view-state concession, not a domain change. The authoring truth remains in TokenDetails which continues to show all modes.

### Clusters (grouping)

Use compound graph layout to cluster tokens. Cluster regions render as low-contrast rounded backgrounds (~4% tonal shift above canvas, no stroke). Cluster label sits top-left in muted text — no chip, no border.

- **Single-collection scope:** cluster by `targetGroup` path segments (e.g. `color/brand`).
- **Multi-collection scope:** cluster outer-level by collection, inner by group.
- **Collapse rule:** clusters with >12 tokens that don't contain the focal node start collapsed. A collapsed cluster renders as a single pill with name + count; incident edges aggregate to it with an edge-count tick. Click to expand in place.
- **Don't cluster by `$type`** — too chaotic when modes cross types.

### Empty / zero-dep states

- **Empty collection:** centered line "No tokens in this collection yet." + "Add token" button (opens token editor). No illustration.
- **Tokens but no aliases or generators:** centered line "Nothing is aliased or generated here yet." + two link-styled actions: "Create an alias" (opens token picker over a chosen token) and "Add a generator" (opens GeneratedGroupEditor). No canvas drawn.

---

## 3. Layout

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
- `TokenResolver` already detects cycles via DFS and throws `CyclicReferenceError` with the cycle path. **Authoritative.**
- Dagre's feedback-arc-set silently reverses one edge per cycle to break it for layout.

Use TokenResolver's cycle data to mark `AliasEdge.inCycle = true` for visual highlight. Let dagre lay out as-is. Don't trust dagre's FAS for cycle detection.

### Auto-layout only — no manual node positioning

Per user direction, v1 has no drag-to-rearrange. Pan / zoom / focus / scope changes only. Eliminates layout decay, keeps graphs identical for everyone on the team, removes a whole class of state-persistence bugs. A "Reset view" control in the toolbar fits the viewport to current scope.

### Memoization
Cache dagre output keyed by `GraphModel.fingerprint` (sorted node-id + edge-id hash). Editing a token's `$description` does not change the fingerprint → reuse layout. Editing its `$value` to a new reference does → relayout.

During an active drag-to-rewire interaction, freeze layout. Re-run on commit only.

---

## 4. Interaction Model

### Browse / navigate
- Pan: drag background. Zoom: scroll / pinch / `Cmd+=` / `Cmd+-`.
- `F` = fit selection; `0` = fit all; `1` = 100% zoom.
- `/` or `Cmd+K` = anchored search field (top-center). Matches token path substrings; Enter jumps + focuses; Escape closes.
- Minimap: bottom-right, **only rendered when graph is larger than viewport**. Auto-hide otherwise.

### Scope and filters

A single persistent **scope chip** at top-left of the canvas is the source of truth. Always shows current scope in plain English:

```
Palette · 124 tokens                 (whole collection)
Palette → button.bg · depth 2        (focused)
Palette + Brand · 312 tokens         (multi-collection)
Palette · Colors only · 2 issues     (filter applied)
```

Click the chip to reveal scope controls (collection picker, depth stepper 1–5, clear-focus). Filter control sits next to it: collection, token type, generator kind, health status. Keep filter UI to one line — minimal chrome.

Filtered-out nodes are *not drawn* (not dimmed). Dimming at scale produces muddy canvases.

### Selection
- **Hover:** highlight node + incident edges + 1-hop neighbors; dim the rest. No tooltip (medium-zoom node already shows path + value).
- **Single click:** select. Opens TokenDetails as a 360–400px right side panel *inside* the graph sub-view. Graph stays interactive on the left; not dimmed. Click empty canvas to dismiss panel.
- **Double click:** refocus graph on this node (scope narrows to its ancestry/descendants at default depth).
- **Right click:** minimal context menu — "Open details", "Focus on this", "Copy path", "Find usages in canvas". Destructive actions ("Delete") nested under "More" with confirmation.
- **Multi-select:** Shift-click or marquee-drag. Floating action bar above selection: Compare (only when exactly 2 selected → opens existing CompareView), Delete, Copy paths. **No bulk-alias** — too easy to misfire.

### Keyboard navigation
When a node has focus:
- Arrow keys move to nearest neighbor along that axis in laid-out coordinates.
- Enter / Space opens TokenDetails (token) or GeneratedGroupEditor (generator).
- Shift+Enter on a generator toggles `enabled`.
- Backspace prompts deletion (see §5).

### Progressive disclosure — first-time hint

When the graph first opens with >0 edges, a single inline hint at top-center:
> "Drag from a token's right edge to alias it to another. Double-click to focus."

Dismisses on any interaction; remembered in localStorage. No tour, no modal, no overlay tutorial. The graph is self-evident for anyone who has used Figma auto-layout.

---

## 5. Editing in the Graph (v1: Rewire + Detach + Delete)

The graph supports three topology-level edits. Everything else (values, names, descriptions, generator config) stays in existing editors.

### A. Rewire alias — drag edge from A to B

1. User drags from a token's right-edge port onto another token. React Flow fires `onConnect({ source, target })`.
2. **Cycle guard first:** call existing `detectAliasCycle` from `tokenEditorHelpers.ts` against `allTokensFlat`. If non-null, toast "Would create a cycle: a → b → a" and abort. No network call.
3. **Mode picker** (multi-mode source only): inline popover anchored to the new edge — "Apply to all modes" (default) or pick a subset via mode checkboxes. Single-mode tokens skip this step.
4. PATCH the source token's `$value` to `{<target.path>}` for the chosen mode(s). Reuse the existing token save flow — expose `applyAliasRewire({ fromPath, fromCollectionId, toPath, toCollectionId, modes })` on `WorkspaceControllerContext` that wraps the same PATCH endpoint and post-success refresh that TokenDetails uses today (`handleEditorSave`).
5. Refresh comes for free: PATCH → server → `TokenDataContext` revision bump → `useGraphData` re-memo → graph updates.

**No optimistic update in v1.** Local server PATCH is typically <50ms. Show a brief "Updating…" pulse on the affected edge. On failure, toast via `toastBus`; edge snaps back from authoritative state.

**Type-mismatch protection:** invalid drops (target's resolved type incompatible with source's `$type`) get a red no-drop cursor with a one-line tooltip explaining why ("Color token can't alias a dimension token").

### B. Detach alias — select edge, press Backspace

Detaching reverts the source token to a literal value. We must not silently destroy data.

1. User selects an alias edge, presses Backspace (or right-click → "Detach alias").
2. Inline confirm popover anchored on the edge:
   > "Detach `colors.button.bg` from `colors.brand`?
   > Set value to `#3366FF` (current resolved value)? [Detach] [Cancel]"
3. The proposed literal is `TokenResolver.resolve(sourcePath, mode).$value`. For multi-mode: confirm shows per-mode literals, with a single Detach button that applies to all selected modes (default: all modes that this edge is active in).
4. PATCH through the same `applyAliasRewire` machinery, with `value: <resolved literal>` instead of `{ref}`.

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

## 6. Data Architecture

### Domain → graph pipeline

Build a pure `GraphModel` from existing inputs. Construction lives in `@tokenmanager/core` so server-side analysis (future lint rules, health scans) can reuse it.

**New file: `packages/core/src/graph.ts`** — exports:

```ts
export interface BuildGraphInput {
  tokens: Record<string, { path: string; collectionId: string; $type?: TokenType; $value: unknown; lifecycle?: TokenLifecycle }>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  generators: TokenGenerator[];
  derivedTokenPaths: Map<string, TokenGenerator>;  // from useGenerators
  cyclicPaths?: Set<string>;                       // from TokenResolver
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
  id: GraphEdgeId;            // `alias:${from}->${to}`
  from: GraphNodeId;
  to: GraphNodeId;
  modeLabel?: string;         // only set when per-mode toggle is on
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

- **Same path in two collections = two distinct nodes.** Mirrors `pathToCollectionId` / `collectionIdsByPath` behavior; never fuse cross-collection same-path tokens into one node.
- **Reference resolution without explicit collection:** mirror the existing UI fallback in `shared/collectionPathLookup.resolveCollectionIdForPath` — first match wins. Don't invent a new resolution order; the graph must agree with TokenDetails on what `{foo.bar}` means.
- **Formula references included:** `"{spacing.base} * 2"` produces an alias edge to `spacing.base`. `TokenResolver`'s reference regex already captures this.
- **Cross-collection edges included** with a small "↗" chevron to signal collection boundary crossing.
- **Excluded:** generator-config token references (`$tokenRefs`) — too noisy, revisit if users ask.
- **Mode-aware edges OFF by default**, opt-in via toolbar toggle.
- `hasDependents` / `hasDependencies` precomputed so node port affordances render without crawling adjacency.

### UI hook: `useGraphData`

```ts
// packages/figma-plugin/src/ui/hooks/useGraphData.ts
export function useGraphData(): GraphModel {
  const { allTokensFlat, pathToCollectionId, collectionIdsByPath } =
    useTokenFlatMapContext();
  const { generators, derivedTokenPaths } = useGeneratorContext();
  return useMemo(
    () => buildGraph({
      tokens: allTokensFlat, pathToCollectionId, collectionIdsByPath,
      generators, derivedTokenPaths,
    }),
    [allTokensFlat, pathToCollectionId, collectionIdsByPath, generators, derivedTokenPaths],
  );
}
```

Expected rebuild cost at 2000 tokens + 50 generators: 3–8ms. Incremental rebuild not needed.

### Scope selection (focused subgraph)

Pure function in `components/graph/graphScope.ts`:
```ts
export function selectSubgraph(full: GraphModel, scope: GraphScope): GraphModel;
```
For `mode: 'focus'`, two-queue BFS: one walks `outgoing`, one walks `incoming`, each bounded by `depth`. Include any edge whose endpoints are both in the visited set. At depth=2 typical result is dozens to low hundreds of nodes — well under render budget.

### State management — new `GraphContext`

Don't extend `TokenDataContext` / `NavigationContext` / `EditorContext` — separate concerns. New `GraphContext` owns:
- `scope: GraphScope` (mode, focusNodeId, depth, filters)
- `searchQuery: string`
- `viewportPersisted: { x, y, zoom }`
- `perModeEdgesEnabled: boolean`

Persist `scope.filters`, `searchQuery`, `viewportPersisted`, `perModeEdgesEnabled` keyed by `workingCollectionId` via existing `usePersistedState`. Reset `focusNodeId` on navigation away.

Ephemeral render state (hover, selection ring, drag-rewire preview) stays as `useState` local to `GraphCanvas` — avoids context-driven re-renders on every frame.

---

## 7. Rendering — React Flow (`@xyflow/react` v12)

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
6. `resolvedValuePreview` is lazy — computed on hover via `TokenResolver.resolve(path)` (already cached internally).
7. Cycle/drag edges use CSS animations, never JS-driven `strokeDashoffset` updates.

Targets: 60fps pan/zoom at 500 visible; <200ms relayout at 2000; <300ms initial mount.

---

## 8. Accessibility

- Each node renders as a `tabIndex={0}` focusable wrapper with visible focus ring (`outline: 2px solid var(--color-figma-focus)`).
- Arrow keys: navigate to nearest neighbor along that axis in laid-out coordinates.
- Enter / Space: opens TokenDetails / GeneratedGroupEditor.
- Zoom shortcuts registered through existing `useCommandPaletteCommands` so they appear in the help panel.
- **Screen-reader fallback:** offscreen `<aside role="region" aria-label="Graph outline">` mirrors the focused node's incoming + outgoing neighbors as a linkified list (same shape as TokenDetails "Used by"). Visual canvas wrapper gets `aria-hidden`.
- High-contrast: all node/edge colors come from CSS vars (`--color-figma-graph-*`) so OS overrides work.

---

## 9. Extensibility — decorator API

Avoid the "add prop for every overlay" trap.

```ts
// packages/figma-plugin/src/ui/components/graph/decorators.ts
export interface NodeDecoration {
  badges?: { label: string; tone: 'info'|'warn'|'error'|'success' }[];
  ring?: 'recently-touched' | 'diff-added' | 'diff-changed';
  overlayIcon?: ReactNode;
}
export interface EdgeDecoration {
  style?: 'solid'|'dashed'|'dotted';
  tone?: 'neutral'|'warn'|'error'|'success';
  badge?: string;
}
export interface GraphDecorator {
  id: string;
  decorateNode?(node: GraphNode): NodeDecoration | null;
  decorateEdge?(edge: GraphEdge): EdgeDecoration | null;
}
```

A `GraphDecoratorRegistry` context lets feature code register decorators without touching the core graph component. Future overlays (publish-diff status, lint badges, recently-touched glow) plug in additively.

---

## 10. File / Module Layout

```
packages/core/src/
  graph.ts                              # NEW: buildGraph(), GraphModel + node/edge types
  index.ts                              # add named exports for the above

packages/figma-plugin/src/ui/
  contexts/
    GraphContext.tsx                    # NEW

  hooks/
    useGraphData.ts                     # NEW
    useGraphScope.ts                    # NEW
    useGraphLayout.ts                   # NEW (dagre wrapper, memoized)
    useGraphKeyboardNav.ts              # NEW
    useGraphMutations.ts                # NEW (rewire/detach/delete)

  components/graph/
    GraphPanel.tsx                      # top-level panel rendered from PanelRouter
    GraphCanvas.tsx                     # <ReactFlow> host
    GraphToolbar.tsx                    # scope chip, depth, filter, search, per-mode toggle, reset view
    GraphEmptyState.tsx
    GraphSROutline.tsx                  # a11y fallback list
    nodes/
      TokenNode.tsx
      GeneratorNode.tsx
    edges/
      AliasEdge.tsx
      GeneratorSourceEdge.tsx
      GeneratorProducesEdge.tsx
    hover/
      NodeHoverCard.tsx
    interactions/
      RewireConfirm.tsx                 # mode picker popover
      DetachConfirm.tsx                 # detach alias popover
    graphTypes.ts                       # UI-local: GraphFilters, GraphScope
    graphScope.ts                       # selectSubgraph BFS
    graphLayout.ts                      # runDagre(graph, direction, clusters)
    decorators.ts                       # registry + types
    graphTheme.ts                       # CSS-var mapping

  panels/
    PanelRouter.tsx                     # add: library.graph case → renderLibraryGraph()

  shared/
    navigationTypes.ts                  # add "graph" to LibrarySubTab, TOP_TABS, WORKSPACE_TABS, etc.
```

### Critical files to modify
- `packages/figma-plugin/src/ui/shared/navigationTypes.ts` — `LibrarySubTab`, `TOP_TABS[0].subTabs`, `WORKSPACE_TABS[0].sections` + `matchRoutes`.
- `packages/figma-plugin/src/ui/panels/PanelRouter.tsx` — add `library.graph` route to `PANEL_MAP.library`, mirror the `renderLibraryScaffold` pattern used for tokens/health/history.
- `packages/figma-plugin/src/ui/contexts/WorkspaceControllerContext.tsx` — add `applyAliasRewire`, `applyAliasDetach` (or expose via `EditorShellController` per existing patterns).
- `packages/core/src/index.ts` — add named exports for `buildGraph`, types.
- `packages/figma-plugin/package.json` — add `@xyflow/react ^12`, `@dagrejs/dagre ^1`.

### Critical files to reuse (no modification)
- `packages/core/src/resolver.ts` — `TokenResolver` (deps, dependents, resolveAll, cycle detection).
- `packages/core/src/generator-types.ts` — `TokenGenerator`, `GeneratorType`, `getGeneratorManagedOutputs`.
- `packages/core/src/dtcg-types.ts` — `isReference`, `parseReference`, `isFormula`.
- `packages/figma-plugin/src/ui/components/token-editor/tokenEditorHelpers.ts` — `detectAliasCycle`.
- `packages/figma-plugin/src/ui/contexts/TokenDataContext.tsx` — `allTokensFlat`, `pathToCollectionId`, `collectionIdsByPath`.
- `packages/figma-plugin/src/ui/hooks/useGenerators.ts` — `derivedTokenPaths`.
- `packages/figma-plugin/src/ui/shared/collectionPathLookup.ts` — `resolveCollectionIdForPath`.
- `packages/figma-plugin/src/ui/primitives/` — Button, IconButton, Chip, Tooltip, etc.
- `packages/figma-plugin/src/ui/utils/toastBus.ts`.

---

## 11. Anti-goals

The graph is NOT:
- A replacement for the Tokens list (authoring values, renaming, bulk ops stay there).
- A replacement for `GeneratedGroupEditor` (graph launches the wizard, doesn't reimplement it).
- A whole-canvas diagram tool (no freeform notes, no user-placed nodes, no export-as-image, no shareable saved viewports).
- A comparison tool (Compare stays 2-way diff; selecting two nodes just launches existing CompareView).
- A pseudo-IDE (no commit, no in-canvas undo timeline; app-level undo applies as normal).
- A user-curated layout (no drag-to-rearrange — auto-layout only, deterministic for everyone).

---

## 12. Risks & Pause Points

**Confirm before implementing:**
1. **React Flow CSS under singlefile bundle.** Add `@xyflow/react` + dagre, run `build.mjs`, confirm `dist/ui.html` renders before building UI on top.
2. **Cross-collection alias resolution behavior.** Verify `buildGraph`'s reference-to-node resolution produces identical results to the existing `resolveCollectionIdForPath` fallback. Add a unit test against the same fixtures TokenDetails uses.

**Watch:**
3. Dagre cycle layout vs `TokenResolver` cycle detection — use resolver's data for `inCycle` flag; treat dagre's FAS reversal as cosmetic.
4. Generator deletion mid-session — `focusNodeId` must tolerate "node no longer exists" (toast + clear focus). Mirrors existing `editingGeneratedGroup` resilience in PanelRouter.
5. Bundle growth ≈ 80 KB gz (xyflow + dagre). Acceptable but flag in PR.
6. Plugin iframe gesture handling — drag-edge UX needs verification on Figma desktop and Figma web.
7. Default depth=2 may feel empty on leaf tokens — rule already in spec: auto-expand to depth 3 when depth-2 result has <20 nodes.

---

## 13. Verification

End-to-end test path before declaring v1 complete:

**Setup**
1. Start dev: `pnpm dev` (or whichever existing script); open the plugin in Figma desktop.
2. Load a sample collection containing: 50+ authored tokens, ≥1 colorRamp generator with semantic aliases, ≥1 cross-collection alias, ≥1 known broken reference, ≥1 known cycle.

**Navigation**
- Switch to Library → Graph sub-tab. Confirm scope chip shows current collection + token count.
- Select a token in Tokens view, switch to Graph — confirm focus matches selection at depth 2.
- From TokenDetails "Open in graph" — confirm focused graph state.
- From a Health "broken reference" issue → "View in graph" — confirm node + bad edge highlighted.
- From GeneratedGroupEditor → "See outputs in graph" — confirm generator + produces-edges visible.

**Visual & layout**
- Confirm token nodes show swatch + leaf name + value at default zoom.
- Confirm generator nodes have distinct shape and kind glyph.
- Confirm alias / generator-source / generator-produces edges have distinct styles.
- Confirm cycle edges render amber with cycle counter in scope chip.
- Confirm broken-ref edge renders red-dashed with ghost target node.
- Confirm clusters group by collection (multi) or group path (single), no hard borders.
- Confirm large clusters (>12) auto-collapse and aggregate edges to a count tick.
- Confirm fit-to-viewport, pan, zoom, minimap auto-show/hide.

**Editing**
- Drag from token A's right-edge port onto token B → confirm cycle guard, mode picker (multi-mode), success toast, edge appears, A's `$value` updated.
- Try dropping onto a type-incompatible target → confirm red no-drop cursor + tooltip; no PATCH fired.
- Try a connection that would create a cycle → confirm "Would create a cycle" toast; no PATCH fired.
- Select an alias edge, press Backspace → confirm detach popover with proposed literal; confirm formula-source case shows "Replaces formula with literal".
- Right-click token → Delete → confirm existing delete dialog opens with breakage list.
- Double-click generator → confirm GeneratedGroupEditor opens in edit mode.
- Right-click token → "New generator from this token" → confirm GeneratedGroupEditor opens in create mode with source prefilled.

**Multi-mode**
- Toggle "Per-mode edges" — confirm collapsed edges expand into mode-labeled parallel edges only where modes differ.
- Rewire on a multi-mode token — confirm mode picker subset works; re-check graph reflects per-mode state when toggle is on.

**Performance**
- Collection with 500 tokens — confirm pan/zoom at 60fps.
- Collection with 2000 tokens — confirm <300ms initial mount, <200ms relayout on alias rewire.
- Confirm layout doesn't recompute when toggling unrelated state (selection, hover).

**Accessibility**
- Tab into the graph → focus ring visible on a node.
- Arrow keys move focus between connected nodes; Enter opens details; Backspace prompts deletion.
- Confirm screen reader reads the offscreen outline for focused node's neighbors.

**Tests** (per CLAUDE.md, do not write tests unless asked — but if asked):
- Pure unit tests for `buildGraph`, `selectSubgraph`, `detectAliasCycle` integration. `test.each` for cycle / cross-collection / formula-ref fixtures. No tests for layout (visual / non-deterministic across versions of dagre).

---

## 14. Out-of-scope for v1 (explicit deferrals)

- Optimistic mutations + rollback machinery.
- Creating tokens from scratch in the graph (`N` shortcut etc.).
- "Per-mode edges" as default.
- Manual node positioning / saved layouts.
- Diff overlay against publish snapshot, recently-touched ring, lint badges — wired through decorator API in v1.1+.
- History integration (annotate nodes with "changed in commit X").
- Export as image / shareable URL with viewport state.
- Multi-collection scope as default (multi works but default is current collection).
