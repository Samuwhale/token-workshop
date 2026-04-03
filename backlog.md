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

- [!] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error
- [x] ThemeManager.tsx has 30+ useState/useRef hooks managing overlapping concerns — the component (L63-159) tracks drag-and-drop, bulk operations, previews, comparisons, filters, menus, modals, and pagination all in a single function body; this mirrors the App.tsx state explosion pattern (43 useState) and makes every change risky because any state update re-evaluates all hooks; extract cohesive state groups into custom hooks (e.g., useThemeDragDrop, useThemeBulkOps, useThemeCompare) following the same pattern used to extract useFindReplace and useDragDrop from TokenList

- [x] TokenFlowPanel does not highlight circular alias dependencies — the dependency walk collects all chains but if A references B which references A, no visual indicator (red edge, badge, or warning) marks the cycle; users must mentally trace the graph to spot loops (TokenFlowPanel.tsx ~L308-357)
- [x] Export panel is missing Tailwind config and CSS-in-JS output formats — only 8 platforms are supported (CSS, SCSS, Less, JSON, TS, Dart, iOS-Swift, Android); Tailwind config and CSS-in-JS (styled-components/Emotion object syntax) are common export targets for frontend teams (ExportPanel.tsx ~L387-390, server export.ts)
- [x] [HIGH] Multiple UI hooks clear state optimistically before async API calls complete, losing user work on network errors — `useDragDrop.ts:62` sets `dragSource=null` before the batch-rename fetch (dropped tokens vanish on error), `useGroupOperations.ts` clears moving/copying group state before the move/copy API completes (concurrent operations can interleave), and `useTokenSyncBase.ts:237-238` clears rows/dirs after `Promise.all` partial failures (user sees inconsistent sync state with no retry path); all should defer state cleanup to after the async operation succeeds or provide rollback on failure
- [x] [HIGH] useTokenCrud handleRenameToken treats rename-preview API failure as "zero dependencies" and proceeds with the rename — if the preview fetch fails (L141-143), `data` defaults to `{count:0, changes:[]}` and `executeTokenRename` runs immediately without showing the confirmation dialog, silently breaking any alias references the server would have reported; should show an error and block the rename until preview succeeds (useTokenCrud.ts L134-155)
- [x] Set switcher renders all sets flat with no folder grouping — sets using folder hierarchy names like `brand/colors` and `brand/spacing` appear as a flat alphabetical list instead of collapsible folder groups; at scale this makes the switcher hard to navigate (SetSwitcher.tsx ~L276-296)
- [x] Git sub-panel does not show commits ahead/behind remote — the branch status only shows "Clean" or "X changes" with no indication of how many commits are ahead of or behind the remote; users cannot tell if a push or pull is needed without clicking Compare (GitSubPanel.tsx ~L55-83)
- [x] SelectionInspector shows mixed binding count but not which properties are mixed — the header displays "N mixed bindings" but users must expand every property row to find which ones have conflicting values across the multi-selection; a filter or highlight for mixed-only properties would save significant time (SelectionInspector.tsx ~L718-734)
- [x] No bulk token creation API — tokens can only be created one at a time via `POST /tokens/:set/*`; importing or generating tokens that need atomic multi-token creation must loop individual requests, which is slow and non-atomic (routes/tokens.ts)
- [x] ExtractTokensPanel has no batch rename for extracted tokens — each token name must be edited individually in its own text input; users extracting 50 primitives from a Figma selection cannot apply a common prefix or naming pattern in bulk (ExtractTokensPanel.tsx ~L268-282)
- [x] Typography value editor allows selecting font weights unavailable in the chosen font family — the weight dropdown offers all standard weights (100-900) regardless of what the selected fontFamily supports; no validation or warning when picking an unavailable weight (ValueEditors.tsx ~L656)
- [x] App.tsx command palette useMemo has 30 dependencies and recalculates frequently — the `commands` array is rebuilt on nearly every state change because its dependency array includes 30+ values including state that changes on every interaction; extracting command definitions to a stable registry would prevent unnecessary recalculation (App.tsx ~L870-1188)
- [x] variableSync.ts has O(n) sequential async calls and a stale variable cache — `readFigmaVariables` calls `getVariableByIdAsync` once per variable per mode (O(vars×modes) sequential awaits), `deleteOrphanVariables` does the same, and the sync loop fetches `localVariables` once at L45 but never refreshes it after creating new variables, so `findVariableInList` can miss just-created entries and produce duplicates; batch the per-variable fetches with `Promise.all` and refresh the variable list after each creation (variableSync.ts L45, L204, L237)
- [x] Git sync conflict resolution route has no rollback, no input validation, and no partial-failure handling — `/sync/conflicts/resolve` (sync.ts L194-212) loops through resolutions calling `resolveFileConflict` sequentially; if resolution #3 fails, files #1-2 are already staged but `finalizeMerge` will fail, leaving the repo in a half-resolved merge state with no recovery path; also does not validate that `file` names correspond to actual conflicted files or that region indices are valid
- [x] ResolverStore file watcher has a race between async `onFileChange` and sync `onFileRemove` — if a resolver file is created then quickly deleted, `onFileChange` starts an async `loadFile`, `onFileRemove` synchronously deletes the entry, then when `loadFile` completes it re-adds the deleted resolver with stale data; the resolver appears in memory despite the file being gone from disk (resolver-store.ts L318-329)
- [x] styleSync.ts silently swallows parse failures for color tokens and gradient stops without user feedback — `parseColor` returning null (L112) causes the style to be skipped with no error/warning logged or surfaced; gradient stops that fail to parse are silently dropped, potentially creating a gradient with fewer stops than intended (e.g., 5→3); should track and report skipped tokens/stops so users know which styles failed (styleSync.ts L104-157)

- [~] ExtractTokensPanel does not bind created tokens to the originating selection — after batch-extracting tokens from a Figma layer, users must manually return to SelectionInspector and bind each one individually, breaking the extract-to-bind workflow
- [~] Three comparison components (ComparePanel, CrossThemeComparePanel, ThemeCompare in ThemeManager) each implement their own token resolution, diff calculation, and CSV export logic — extract shared comparison utilities and consider a unified comparison view
- [ ] BatchEditor preview is capped at 8 items with no way to expand — power users editing 50+ tokens cannot verify what will change before applying
- [ ] No inline token value editing — every edit requires opening the full TokenEditor sidebar; double-click on a value cell in the tree should open a minimal inline editor for simple types (color, number, dimension, string)
- [ ] AnalyticsPanel validation results go stale after token edits but there is no visible staleness indicator — the resultsStale flag exists in state but is never surfaced in the UI, so users do not know they are looking at outdated data
- [ ] No "Extract and Bind Unbound" fast-path in SelectionInspector — users inspecting a layer with many unbound properties must create tokens one-by-one; add a batch action that extracts all unbound properties as tokens and binds them in one step
- [ ] ResolverPanel has no command palette entry or keyboard shortcut — it is only reachable via ThemeManager then scrolling to the Advanced section, making DTCG resolver configuration nearly invisible to users who do not know it exists
- [ ] HistoryPanel has no side-by-side diff view for comparing two arbitrary points in history — users can see what changed in a single commit but cannot compare state-at-commit-A vs state-at-commit-B
- [ ] Token search qualifiers in the command palette (type:color, has:ref, path:brand, value:#, has:description, has:generated) are documented only in a collapsible hint inside the palette — they should be listed in the keyboard shortcuts modal and help docs
- [ ] No combined preview before Publish All — the Publish All button triggers variable sync, style sync, and git commit sequentially without first showing a unified summary of all changes across the three channels
- [ ] Contrast matrix in AnalyticsPanel has no filtering by token group or sorting by failure severity — with 100+ color tokens the matrix becomes unwieldy and finding the worst WCAG violations requires scanning every cell
- [ ] No keyboard shortcut to jump directly to token search mode — users must first open command palette (Cmd+K) then type the ">" prefix; a dedicated shortcut like Cmd+Shift+F would save a step for the most common power-user action
