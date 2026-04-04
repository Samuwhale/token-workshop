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

- [!] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error
- [x] [HIGH] Plugin sandbox rollback is broken for fill and stroke properties — `captureNodeProps` (selectionHandling.ts:660) snapshots `node['fill']` and `node['stroke']` which are `undefined` on Figma nodes (correct properties are `fills`/`strokes` plural), so the snapshot is empty and `restoreNodeProps` is a no-op for these properties; additionally `collectNodesForScope` ignores the `filter` parameter for `'selection'` scope (line 645-654), processing all descendants unnecessarily; fix by mapping binding keys to Figma property names in captureNodeProps and applying the filter in the selection branch
- [x] Plugin sandbox heatmap/consistency scans capture `figma.currentPage.selection` and `figma.currentPage.children` references at scan start but do not re-validate them during long-running iteration — if the user switches pages mid-scan, the captured node references become stale (nodes may be on a different page or deleted), leading to wrong results or silent failures; heatmapScanning.ts:103-118 and consistencyScanner.ts:157-162 both have this pattern; should either re-check `figma.currentPage` periodically or abort on page change via `figma.on('currentpagechange')`
- [x] Generator service has in-memory/disk state divergence and stale-detection inconsistency — `create()` and `update()` (generator-service.ts:141-179) update `this.generators` Map before `saveGenerators()` writes to disk, so if the disk write fails the in-memory state diverges from persisted state until restart; `_doSave()` (line 116-123) also leaks `.tmp` files if `fs.rename` fails since there's no finally cleanup; separately, `GET /generators` route (generators.ts:392) uses `JSON.stringify` for `isStale` comparison while the service itself uses `stableStringify`, causing false-positive staleness indicators for objects with different key ordering
- [x] Git sync has multiple concurrency gaps and reconnection data loss — `fetch()` (git-sync.ts:579) runs outside `withLock()` unlike `push()`/`pull()`, so it can interleave with concurrent write operations; `applyDiffChoices` (line 769-804) calls `tokenStore.startWriteGuard()` for files but never clears guards on pull failure, suppressing file-watcher events for up to 30s; `useServerEvents.ts` manual reconnection (line 113-119) creates a new `EventSource` that loses `Last-Event-ID`, so missed events are never replayed despite the comment claiming otherwise (line 28-30)
- [x] ThemeContext re-renders all consumers on every provider render — `useResolvers` hook returns a new object reference each render (useResolvers.ts:224), and this `resolverState` object is included in the ThemeContext `useMemo` dependency array (ThemeContext.tsx:153), defeating memoization and causing every ThemeContext consumer to re-render on every ThemeProvider render; fix by either memoizing the return value inside useResolvers or destructuring individual stable values into the dependency array
- [x] useFigmaMessage leaks pending promise timers on unmount — when the component unmounts, the effect cleanup (useFigmaMessage.ts:57-58) removes the event listener but does not clear `pendingRef.current` Map entries or their associated `setTimeout` timers (line 65-67); timeout callbacks fire after unmount, calling `reject()` which can trigger setState-on-unmounted-component warnings; additionally, `useThemeSwitcher` has a race between localStorage init, Figma clientStorage load, and theme fetch pruning (useThemeSwitcher.ts:18-69) where `fetchThemesInner` can prune `activeThemes` using the stale localStorage value before the Figma-loaded value arrives
- [x] variableSync creates variables for unsupported token types with no value and deleteOrphanVariables has no rollback — `applyVariables` (variableSync.ts:96) silently skips setting the variable value when `convertToFigmaValue` returns `null` for unsupported types (shadow, gradient), creating empty variables with no user feedback; `deleteOrphanVariables` (line 313-345) permanently removes variables with `variable.remove()` with no snapshot or undo capability, so a partial failure leaves the file in an unrecoverable inconsistent state; both should either warn the user or provide rollback like `applyVariables` does

- [x] Duplicate token set — there's no way to clone an entire token set with all its tokens and metadata; users who want to create a variant (e.g., "brand-B" from "brand-A") must create a new set and manually copy groups over; add a "Duplicate set" option to the set context menu and a POST /api/sets/:name/duplicate server route
- [x] Quick-fix actions from HealthPanel and AnalyticsPanel — both panels identify issues (broken aliases, type mismatches, naming violations) but require the user to navigate away to fix them; add inline fix buttons for automatable issues like "delete broken alias", "update type to match referenced token", and "rename to match convention" directly in the issue list
- [~] Generator search/filter in GraphPanel — the generator card list has no search or filter; with 10+ generators it becomes hard to find a specific one; add a search input and optional type filter (color-ramp, type-scale, etc.) to the GraphPanel header
- [ ] Merge ComparePanel's cross-theme comparison into the theme manager — ComparePanel (Define > Compare sub-tab) and the "Compare across themes" context menu action both show token value differences across theme options, but ComparePanel is a standalone sub-tab that duplicates theme-aware resolution logic; fold this into ThemeManager as a "Compare" view within the theme context where users already have mental model of dimensions and options, eliminating a separate concept to discover
- [ ] Preview before publish — the Publish panel applies variables/styles to Figma without showing a concrete preview of what will be created or updated; add a dry-run step that shows "will create N variables, update M, skip K" with expandable details before the user confirms, similar to how git push preview already works
- [ ] No way to filter or search within the History timeline — the merged timeline (actions + commits + snapshots) can grow long and has no search, type filter, or date range filter; add a search input and type-pill toggles (Action | Commit | Snapshot) to the HistoryPanel header so users can quickly find a specific change
- [ ] Validation suppressions are session-only and not shared — AnalyticsPanel allows suppressing individual lint violations, but suppressions are stored in local sessionStorage and lost on reload; persist suppressions server-side (e.g., in $extensions.tokenmanager.suppressions on the token or in a lint config allowlist) so the team shares a consistent view of acknowledged issues
- [ ] Batch delete from multi-select mode — multi-select mode (M key) offers batch edit, move, copy, and rename but no batch delete; users must exit multi-select and delete tokens one-by-one from the context menu; add a "Delete selected" action to the BatchEditor toolbar with a confirmation dialog showing the count and any dependent tokens
- [ ] No zoom/pan on TokenFlowPanel dependency graph — the dependency graph uses a fixed 3-column SVG layout that can't be zoomed or panned; for tokens with many references (20+ upstream, 30+ downstream), the graph overflows or truncates; add mouse-wheel zoom and drag-to-pan using the same SVG transform pattern already used in the node graph editor (GraphPanel)
- [ ] Inline alias creation from token tree — creating an alias currently requires opening the token editor, toggling alias mode (Cmd+L), then typing the reference path; add a drag-and-drop interaction where dragging one token onto another creates an alias, or add an "Alias to..." quick action in the context menu that opens a single-field autocomplete popover without opening the full editor
- [ ] Export panel has no "copy to clipboard" option — ExportPanel generates platform files (CSS, SCSS, JSON, etc.) but the only output is a ZIP download; for single-platform exports or quick copy-paste workflows, add a "Copy to clipboard" button next to each platform preview that copies the generated output directly
- [ ] Set-level diff before git pull — git pull applies remote changes immediately with no preview of which tokens in which sets will change; the push preview exists (GET /sync/push/preview) but pull only shows file-level diffs; add a token-level pull preview that shows "set X: 5 tokens added, 3 modified, 1 deleted" before the user confirms the pull
