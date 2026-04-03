# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: anything that makes this the best plugin — from atomic fixes to full overhauls. No users yet, no backwards compat needed. -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by backlog.sh each iteration -->

---

## App Shell & Navigation

### Bugs

### QoL

### UX

---

## Token Management

### Bugs

### QoL

### UX

---

## Theme Management

### Bugs

### QoL

### UX

---

## Sync

### Bugs

### QoL

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

---

## Import

### Bugs

### QoL

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### Bugs

### QoL

---

## Settings & Data Management

### Bugs

### QoL

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [~] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle

- [x] Theme comparison panel is buried and hard to discover — the side-by-side token diff across theme options is a powerful feature but is only accessible by toggling a compare mode inside ThemeManager; surface it as a prominent action (e.g., "Compare options" button on each dimension row) or make it accessible from the command palette
- [x] No token value history per token — the History panel shows operation-level history (bulk changes, generator runs) but there's no way to see the history of a single token's value over time; power users managing brand colors or key spacing values need to see "this token was #1a73e8, then changed to #1967d2 on March 15"; add a "Value history" section to TokenDetailPreview or the token editor that queries the operation log filtered by token path
- [x] AnalyticsPanel duplicate detection and lint's no-duplicate-values rule overlap — AnalyticsPanel has its own duplicate value detection section while the lint system has a `no-duplicate-values` rule; users see duplicates in two different places with potentially different results; consolidate by having AnalyticsPanel read from lint results rather than running its own scan, or remove the analytics duplicate section and link to the lint violations view

- [x] Merge HeatmapPanel and ConsistencyPanel into a single "Canvas Audit" panel — both scan Figma layers for token binding issues (Heatmap shows coverage status, Consistency finds near-match values); merging them reduces cognitive overhead ("where do I go to check my canvas?") and lets the combined panel show coverage bars alongside actionable near-match suggestions in one view (HeatmapPanel.tsx, ConsistencyPanel.tsx, App.tsx sub-tab definitions)
- [x] Auto-generated docs page is invisible from the plugin UI — the server serves a full HTML style guide at /docs with color swatches, typography specimens, and spacing bars, but there is no link, button, or command palette entry to open it; add a "View style guide" action that opens `${serverUrl}/docs` in the default browser, and add a command palette entry for it (routes/docs.ts, App.tsx commands)
- [x] Publish readiness checks go stale silently after token edits — the pre-publish gate requires manually clicking "Run checks" each time; after editing tokens or syncing, the previous check results stay on screen with no staleness indicator; add an "outdated" badge when tokens have changed since last check, and optionally auto-run checks when the Publish tab becomes active (PublishPanel.tsx ~L326-356)
- [x] Find/replace cannot scope by token type — users with mixed-type sets (colors + dimensions + strings in one set) cannot restrict find/replace to only colors or only dimensions; the scope selector offers "active set" or "all sets" but no type filter; add a token type dropdown filter so users can e.g. find/replace only within color values (useFindReplace.ts, TokenList.tsx find/replace UI)
- [x] File-based imports (JSON, CSS, Tailwind) lack per-token conflict resolution — Figma Variables import has a full merge UI where users can accept/reject individual conflicting tokens, but file-based imports only offer bulk strategies (overwrite all / skip all / merge); add the same per-token conflict resolution UI for file imports so users can selectively choose which tokens to overwrite (ImportPanel.tsx ~L400-600)
- [x] CSS and Tailwind imports silently skip dynamic expressions with no report — when importing CSS with `calc()` or Tailwind configs with JS functions, the parser drops unsupported values but shows no list of what was skipped; add a post-import summary showing "N tokens imported, M skipped" with an expandable list of skipped entries and their original expressions (ImportPanel.tsx, tokenParsers.ts)
- [x] No node graph search or filtering — the graph view of generators has no way to find a specific generator or token node; users with many generators must pan/zoom manually to find what they need; the list view has search but graph view has none; add a search input that highlights/zooms-to matching nodes in the graph (GraphPanel.tsx, NodeGraphCanvas.tsx)
- [~] Three separate comparison UIs serve overlapping purposes — ComparePanel (snapshot vs current), CrossThemeComparePanel (single token across theme options), and ThemeCompare (two options side-by-side) are three different components with different entry points and different layouts; consolidate into a single comparison view with selectable comparison modes (what vs what) so users don't need to learn three different mental models (ComparePanel.tsx, CrossThemeComparePanel.tsx, ThemeCompare.tsx)
- [~] No token dependency impact preview before destructive actions — deleting or renaming a token that other tokens alias shows no preview of affected dependents; users discover broken aliases after the fact; add an impact summary ("This will break N alias references in M sets") to the delete/rename confirmation dialog, with a list of affected token paths (TokenEditor.tsx rename, TokenList.tsx delete confirmation, token-tree-utils.ts alias tracking)
- [~] Node graph has no undo/redo for node positioning or edge changes — moving nodes, adding/deleting edges, and adding transform nodes in the graph editor have no undo support; accidentally deleting an edge or moving a node requires manual reconstruction; the graph state changes should integrate with the existing undo system (NodeGraphCanvas.tsx, useNodeGraph.ts)
- [ ] BatchEditor cannot batch-edit token values arithmetically — while batch operations support description changes, type changes, and alias assignment, there's no way to arithmetically transform selected values (e.g., "multiply all selected dimensions by 1.5" or "lighten all selected colors by 10%"); add value transformation operations for numeric and color types (BatchEditor.tsx ~L100-200)

- [ ] Duplicated Lab→XYZ→sRGB conversion in core package — `color-math.ts:labToHex` (L74-86) and `color-parse.ts:labToSrgbCoords` (L560-572) contain identical math (same constants, same `f3` helper, same matrix); `labToHex` additionally calls `rgbToHex` while `labToSrgbCoords` returns `[r,g,b]` with `clamp01`; consolidate into a single shared function and have both call it to prevent divergence during future edits
- [ ] Server route input validation gaps across generators, lint, and search — generator config validation (`routes/generators.ts` L131-149) accepts `NaN`/`Infinity` via `typeof x === 'number'` checks without `isFinite`; `PUT /api/lint/config` (`routes/lint.ts` L20-24) persists raw `Partial<LintConfig>` with zero schema validation; `GET /api/tokens/search` (`routes/tokens.ts` L29-50) accepts user-provided regex without ReDoS safety checks; all three are boundary validation gaps at the HTTP layer
- [ ] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error
- [ ] Multiple UI hooks lack AbortController cleanup on unmount, risking setState-after-unmount — `useGenerators.ts` (L245-256) uses only `AbortSignal.timeout(5000)` with no unmount abort; `useTokens.ts:refreshTokens` (L64-101) similarly has no unmount cancellation; `useFigmaSync.ts` (L119-143) runs a batch PATCH loop with no abort mechanism if the component unmounts mid-loop; `useServerConnection.ts:markDisconnected` (L58-66) calls `checkConnection()` without abort — contrast with `useLint`, `useThemeSwitcher`, `useResolvers` which correctly use `AbortController` refs with effect cleanup; the inconsistency should be fixed by adding the same abort-on-unmount pattern to all hooks that do async fetches
- [ ] TokenTreeNode.tsx suppresses exhaustive-deps warnings via eslint-disable, masking stale closure bugs — the `useEffect` at L47-52 depends only on `[isTabPending]` but reads `canEdit`, `value`, `tokenType`, and calls `onTabActivated`; the `useEffect` at L260 depends only on `[pendingTabEdit]` but reads `node.isGroup`, `node.$type`, `node.$value`, `canInlineEdit`, and `clearPendingTabEdit`; both effects can operate on stale data when their unlisted dependencies change without `isTabPending`/`pendingTabEdit` also changing; fix by adding proper dependencies or extracting stable refs
- [ ] ThemeManager.tsx has 30+ useState/useRef hooks managing overlapping concerns — the component (L63-159) tracks drag-and-drop, bulk operations, previews, comparisons, filters, menus, modals, and pagination all in a single function body; this mirrors the App.tsx state explosion pattern (43 useState) and makes every change risky because any state update re-evaluates all hooks; extract cohesive state groups into custom hooks (e.g., useThemeDragDrop, useThemeBulkOps, useThemeCompare) following the same pattern used to extract useFindReplace and useDragDrop from TokenList
