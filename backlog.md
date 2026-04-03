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

- [x] No Tokens Studio import format — EmptyState.tsx line 133 mentions "Tokens Studio" as a supported format but ImportPanel has no dedicated Tokens Studio importer; Tokens Studio JSON uses a different structure than DTCG (nested groups with $value but also $type inheritance and set references); users migrating from Tokens Studio must manually convert their files before importing (ImportPanel.tsx)

- [x] Server themes routes and resolver-store use 19 `Object.assign(new Error(...), { statusCode })` instead of typed error classes — routes/themes.ts has 14 instances and services/resolver-store.ts has 5, all creating errors with manually-attached statusCode properties instead of using NotFoundError/ConflictError/BadRequestError from errors.ts; additionally routes/resolvers.ts (L41-43, L84-85, L117-119) uses manual `(err as Error & { statusCode?: number })` extraction instead of `handleRouteError()` which is used in every other route file; consolidate both: replace Object.assign errors with typed error classes and switch resolvers.ts to use handleRouteError
- [~] Find & Replace across all sets registers undo for all targeted sets even when the user aborts mid-loop — useFindReplace.ts L326-337 iterates `setNames` with an `ac.signal.aborted` break guard, but the undo registration at L344-370 uses `capturedSets = Object.keys(renamedBySet)` which correctly only includes sets where `renamed > 0`; however the redo handler at L360-370 calls bulk-rename on all `capturedSets` which may include sets that were only partially renamed (the abort can occur after the API call for a set succeeds but before the response count is processed); track exactly which sets completed successfully and only register undo/redo for those
- [~] Generator auto-run failures are fire-and-forget with no persistent record — index.ts L88-99 catches generator auto-run errors with `console.warn` and emits a transient `generator-error` SSE event, but if no client is connected the error is lost; there is no operation log entry, no persistent failure record, and no way for a user who connects later to see that generators failed; record auto-run failures in the operation log or a dedicated error store so the UI can surface them in the history panel
- [~] [HIGH] GeneratorService.executeGenerator overwrites concurrent generator updates — at generator-service.ts L603-613, after executing a generator, the code reads `this.generators.get(id)` then spreads it with `lastRunAt`/`lastRunSourceValue`; if another request called `update()` on the same generator between execution start and this final write, those changes are silently overwritten by the stale spread; fix by re-reading the generator inside `withGeneratorLock` or using a compare-and-swap on `updatedAt`
- [ ] useThemeSwitcher re-fetches themes on every render because `tokens` (unknown[]) is a new array reference each time — the effect at useThemeSwitcher.ts:83 depends on `[fetchThemesInner, tokens]` but `tokens` is a TokenNode[] recreated by `buildTree` on every fetch; this causes an unnecessary `/api/themes` call on every token change; replace the `tokens` dependency with `tokenRevision` (a stable incrementing number already exposed by useTokens) or remove it entirely since the effect already re-runs when `connected`/`serverUrl` change via `fetchThemesInner`
- [ ] Plugin sandbox message protocol has unmatched response types — `search-layers-result`, `peers-for-property-result`, `consistency-scan-progress`, `consistency-scan-result`, and `consistency-scan-error` are sent from the sandbox via `figma.ui.postMessage` but are not defined in the `PluginMessage` union type in `types.ts`; additionally `applied-to-selection` (selectionHandling.ts:188) is sent but not in MESSAGE_SCHEMA; the UI `onmessage` handler silently ignores unknown types so these responses are potentially dropped; audit all `figma.ui.postMessage` calls against the PluginMessage union and MESSAGE_SCHEMA, add missing types, and add a catch-all warning for unhandled message types in the UI handler
- [ ] syncBindings silently counts missing tokens as "skipped" and captureNodeProps fails on figma.mixed — in selectionHandling.ts:748-752, when a token path in a binding is not found in the tokenMap, it increments `skipped` (not `errors`) and leaves the stale binding on the node with no UI indication; separately, captureNodeProps (line 644-655) uses `JSON.parse(JSON.stringify(val))` to snapshot node properties but `figma.mixed` (a Symbol) is not JSON-serializable, so the snapshot silently loses the original value and rollback on error cannot restore mixed-property nodes; fix: report missing tokens distinctly from skipped (include the missing paths in the response), and handle figma.mixed by storing a sentinel or skipping the snapshot for mixed properties
- [ ] Server git-sync operations (pull, push, fetch, commit) have no timeout and can hang indefinitely — git-sync.ts uses `simple-git` for all git operations (lines 217, 222, 227, 295, 388, 451, 491, 533, 585, 598, 607) without any timeout configuration; a network partition or unresponsive remote will block the server's token lock (via withLock) indefinitely, preventing all other mutations; simple-git supports a `timeout` option in its constructor — configure a reasonable default (e.g. 30s for fetch/pull/push) and surface timeout errors as typed errors so the sync UI can show actionable feedback
- [ ] selectionHandling.ts applyToSelection has no rollback on partial failure — applyToSelection (line 159-190) iterates selected nodes and applies token values one at a time; if the 3rd of 5 nodes throws, nodes 1-2 are already mutated and the function reports "Applied to 2 layer(s); 1 failed" but cannot undo the partial application; syncBindings (line 697+) has a snapshot-based rollback mechanism but applyToSelection does not use it; refactor applyToSelection to use the same captureNodeProps/restoreNodeProps pattern so partial failures can be fully rolled back, or at minimum report which specific nodes failed so the user can manually fix them
- [ ] git-sync.ts operations have no mutual exclusion — pull(), applyDiffChoices(), resolveFileConflict(), and commit() can run concurrently without any locking; interleaved git add/checkout/commit commands can corrupt the staging area and produce wrong commits; this is separate from the existing "no timeout" backlog item; add a process-level mutex (e.g., promise-chain lock like TokenStore's `withLock`) around all git-mutating operations so they serialize correctly
- [ ] TokenStore write guards leak on delete and clearAll — deleteSet() (token-store.ts L623) and clearAll() (L648) call `_startWriteGuard()` but never call `_clearWriteGuard()` on success; guards only expire via the 30-second timeout fallback; during that window the chokidar watcher silently ignores external changes to those paths (e.g., git checkout restoring deleted files); ResolverStore has the same pattern on its delete success path (L155-162); fix by calling `_clearWriteGuard()` after the fs operation completes in both stores
- [ ] useTokenCrud undo/redo closures capture stale set context — in useTokenCrud.ts, executeTokenRename (L78-79), handleConfirmMoveToken (L434), and handleConfirmCopyToken (L459) capture `setName` and `serverUrl` at operation time; if the user switches to a different set before undoing, the undo handler operates on the originally-captured set rather than the current one; either capture the set name inside the undo/redo callback (reading from a ref), or validate that the current set still matches the captured set before executing undo
- [ ] BatchEditor handleMove and handleCopy are near-identical 35-line functions with divergent skip-counter logic — BatchEditor.tsx handleMove (L481-515) and handleCopy (L517-551) share identical structure (same params, error handling, undo registration) differing only in the API endpoint and feedback message; additionally the rename path computation at L558-560 duplicates the `renameChanges` useMemo at L271-291; the opacity/scale skip counters (`skippedTypeIncompat`) conflate "type not applicable" with "type incompatible" and produce misleading user feedback when both opacity and scale are active; extract a shared `createBatchHandler('move'|'copy')` factory function, unify rename computation, and fix the skip-counter labels to distinguish "not a color token" from "uses reference value"
