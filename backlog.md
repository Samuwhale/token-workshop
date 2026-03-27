# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be triaged at the end of each iteration:

- `- [HIGH] item title…` or `- [P0] item title…` — inserted before the first `[ ]` item (picked next by the agent).
- All other items are appended to the bottom.

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

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### UX

---

## Import

### Bugs

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### QoL

---

## Settings & Data Management

### QoL

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

- [HIGH] `varCorrelationIdRef` and `varReadResolveRef` are shared between `computeVarDiff` and `runReadinessChecks` — if both are called concurrently (auto-run on mount + manual click), the second call overwrites the shared ref and the first promise never resolves, causing a silent hang or timeout (`SyncPanel.tsx:L68-69, L243-258`)

- [HIGH] ExportPanel unreachable — `ExportPanel` is a fully-built 815-line component that is never imported or rendered in `App.tsx`; users have no way to access platform export (CSS/Dart/Swift/Android/JSON) or Figma variable import from the plugin UI (`packages/figma-plugin/src/ui/components/ExportPanel.tsx`)

# Backlog Inbox

Items spotted during UX passes but out of scope for that session.

- [HIGH] Bulk-rename regex has no ReDoS protection — `isRegex=true` with a catastrophic backtracking pattern (e.g. `(a+)+b`) applied to a large token set can hang the Node.js event loop (`server/services/token-store.ts:803-809`)

- [HIGH] `templateIdForTokenType` fallback returns non-existent template ID — `GraphPanel.tsx:600` returns `'modular-type-scale'` for non-color/dimension tokens but `GRAPH_TEMPLATES` has id `'modular-type'`; `find()` returns `undefined`, `initialTemplate` is set to `null`, and the pending-token-type hint is silently discarded when opening the Graph tab from a token's context menu.

- [HIGH] `handleCreateToken` silently swallows server errors — `SelectionInspector.tsx:373-391`: when `res.ok` is false (e.g. 409 conflict when a token already exists, 500 on server error), the `createError` state is never set and `creating` resets to `false` with no feedback, leaving the user staring at a blank form with no indication of what went wrong.
- [HIGH] Deep inspect "Go to token" button is permanently invisible — `SelectionInspector.tsx:1005-1007`: the parent `<div>` for each deep-inspect child row is missing the `group` Tailwind class, so `opacity-0 group-hover:opacity-100` on the navigate button never triggers; the button is hidden and unreachable at all times.
- [HIGH] `syncBindings` applies raw `$value` without resolving aliases — `controller.ts:1234`: alias tokens (e.g. `$value: "{color.primary}"`) are passed directly to `applyTokenValue` which treats the string literally, producing a type mismatch that increments `errors`; the user sees "X bindings failed — check token types" when the real fix is that aliases need to be resolved before sync.

- [x] TokenList: delete fails silently — if DELETE request fails the token is already removed from the UI; no error is shown and the stale state persists until next refresh
- [x] ImportPanel: unhandled fetch failure when loading set list — `.catch(() => {})` means the set dropdown silently shows nothing if the API is unreachable
- [x] PublishPanel: generic "An unexpected error occurred" errors give no context about which operation failed or why — include the HTTP status or operation name
- [x] SyncPanel: readiness check timeout has no user messaging — if plugin fails to respond the spinner runs indefinitely with no "try reloading" hint

- [x] ImportPanel: `handleImportVariables` sends individual POST requests per token (L249-260) instead of using the batch endpoint — causes N+1 network round-trips for large Figma files; styles/JSON import already uses `/api/tokens/:set/batch` (L337-344)
- [x] ImportPanel: `$description` and `$scopes` read from Figma variables (controller.ts L509-510) are never included in the import POST body (L253) — imported tokens silently lose their descriptions and scoping metadata
- [x] ImportPanel: `commitNewSet` (L304) performs no validation on the new set name — invalid characters or empty-after-trim names are sent directly to the server; should validate against the set name regex before committing
- [x] ImportPanel: `readFigmaStyles` only reads the first paint from multi-fill styles (controller.ts L527) — gradient fills and multi-paint styles are silently converted to only their first solid fill, with no indication to the user that data was lost
- [x] ImportPanel: `handleImportVariables` individual token failures (L254 `.catch(() => null)`) only increment a counter — user sees "3 failed" but has no way to know which tokens failed or why; consider collecting failed paths and showing them in the success message
- [~] ImportPanel: `styles-read` message handler (L116) has no correlationId check — if user clicks "Read Styles" twice quickly, a stale response from the first read could be consumed by the second, potentially showing outdated data; `variables-read` already has correlationId protection (L96)

- [x] Remove unnecessary exports from hook files — `UseGeneratorsResult`, `UseGeneratorDialogParams`, `UseGeneratorDialogReturn`, `TokenGraphProps`, `QuickStartDialogProps`, `ParsedToken`, `parseInput`, `HeatmapNode` are exported but only used internally
- [~] Consolidate duplicate `ThemeOption`/`ThemeDimension` types — defined identically in `useThemeSwitcher.ts`, `ThemeCompare.tsx`, and `ThemeManager.tsx`; consumers should import from one place
- [ ] Remove unused `updateServerUrl` from `useServerConnection` return — returned from hook but never destructured by any caller
- [ ] Remove unnecessary `rgbToHsl` export in `colorUtils.ts` — only used internally by `hexToHsl` in the same file
- [ ] Remove unused `allSets` param from `UseGeneratorDialogParams` — accepted in interface but never read by hook body

- [HIGH] ThemeManager `executeDeleteDimension` and `executeDeleteOption` don't check `res.ok` — server rejection (404/500) is silently ignored while optimistic local state update removes the dimension/option from the UI; `fetchDimensions()` eventually restores it but user gets no error feedback (`ThemeManager.tsx:252-260, 297-310`)
- [HIGH] ThemeManager `handleSetState` doesn't check `res.ok` — a server-rejected set state toggle (e.g. 400 from invalid status) appears to succeed because `fetch` doesn't throw on HTTP errors; the catch block only handles network failures, not HTTP error responses (`ThemeManager.tsx:326-337`)
- [ ] ThemeManager `handleDrop` (set reorder) doesn't check `res.ok` — after drag-and-drop reordering, the POST to save new order silently fails on server error; local state is already updated optimistically with no rollback (`ThemeManager.tsx:376-384`)
- [ ] ThemeCompare path display uses `diff.path.split('.')` to extract parent/leaf segments — breaks for tokens with dots in segment names (e.g. `spacing.1.5` shows parent `spacing.1` and leaf `5` instead of parent `spacing` and leaf `1.5`); should use `nodeParentPath`/`formatDisplayPath` from tokenListUtils (`ThemeCompare.tsx:230-232`)
- [ ] `useThemeSwitcher` stale active-theme cleanup uses `setActiveThemesState` instead of `setActiveThemes` — removed dimensions are cleaned from React state but persist in localStorage and Figma clientStorage, causing phantom theme selections to reappear on next load (`useThemeSwitcher.ts:53-60`)
- [ ] `useThemeSwitcher` theme fetch failure is silently swallowed by `.catch(() => {})` — if `/api/themes` returns an error or the server is temporarily unreachable, dimensions silently remain empty with no user-visible error message or retry affordance (`useThemeSwitcher.ts:63`)

- [BUG] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [ ] TokenList delete failure is silent — console.error but no user-visible feedback when token/group deletion fails (TokenList.tsx ~L1261)
- [ ] SyncPanel shows no empty state when first loaded — unclear whether "nothing to sync" or "run a check first"
- [ ] ImportPanel has unused `importProgress` state — progress indicator for large imports is declared but never set or displayed
- [ ] BatchEditor operations lack validation feedback — `hasOp` gates buttons but no explanation of what input is needed
- [ ] ConfirmModal error display doesn't handle long error text — single-line `<p>` with no wrapping or scroll for verbose errors

- [ ] PreviewPanel resolveValue: shadow/typography composite token values also produce [object Object] — needs structured formatting for shadow ({ offsetX, offsetY, blur, spread, color }) and typography ({ fontFamily, fontSize, ... }) objects
- [ ] Many fetch URLs for token API use set name without encodeURIComponent (ThemeManager, PublishPanel, SyncPanel, AnalyticsPanel, useFigmaSync, ColorScaleGenerator, etc.) — would break if set names contain special characters like spaces or slashes

- [HIGH] `deleteToken` emits no SSE change event — `createToken`, `updateToken`, and `batchUpsertTokens` all call `this.emit()` but `deleteToken` (token-store.ts:483-492) does not, so SSE-connected clients are never notified when a token is deleted
- [HIGH] `deleteTokensByGeneratorId` emits no SSE change event — after bulk-deleting generator-tagged tokens (token-store.ts:511-534), no `this.emit()` call is made, so clients won't refresh after generator output is cleaned up
- [HIGH] `moveToken` silently overwrites target — `moveToken` (token-store.ts:785) calls `setTokenAtPath` without checking if a token already exists at that path in the target set; if one does, it is silently overwritten with no error or warning
- [HIGH] `bulkRename` mutates in-memory tree before `beginBatch`/`saveSet` — token-store.ts:879-884 applies `setTokenAtPath`/`deleteTokenAtPath` before L886 `beginBatch()` and L888 `saveSet()`; if `saveSet` throws, the in-memory tree is mutated but the disk file still has old paths, leaving the store in an inconsistent state
- [ ] Set name validation rejects `/` but UI expects folder-structured names — server routes (sets.ts:37, 82) and token-store.ts (L347, 405, 449) enforce `^[a-zA-Z0-9_-]+$`, but the UI's `buildSetFolderTree` (App.tsx:126) splits on `/` to create folder hierarchy; users can never create folder-structured sets through the API
- [ ] `moveGroup` doesn't check for path collisions in target set — token-store.ts:762-763 copies tokens from source to target set without verifying that the target paths are unoccupied; existing tokens at those paths are silently overwritten
- [ ] `updateAliasRefs` only handles simple string `$value` — token-store.ts:633 checks `key === '$value' && typeof val === 'string'`, so alias references embedded inside composite/object `$value` fields (e.g. shadow tokens with `{ color: "{color.primary}" }`) are not updated when groups or tokens are renamed
