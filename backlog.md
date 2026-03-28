# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by backlog.sh each iteration -->

---

## App Shell & Navigation

### Bugs

- [ ] `getErrorMessage` used in `App.tsx` `useSyncBindings` but never imported — will throw `ReferenceError` at runtime when a sync network error occurs

### QoL

### UX

---

## Token Management

### Bugs

- [ ] `findVariableInList` matches by `name` (dots) not Figma variable name (slashes) — `applyVariables` passes `token.path` (e.g. `colors.primary.500`) but Figma uses slashes (`colors/primary/500`), so the lookup always fails for nested tokens and creates duplicate variables instead of updating existing ones
- [ ] `parseColor` in controller.ts only handles hex strings — if a color token uses `rgb()`, `hsl()`, or a named CSS color (which core's validator accepts), `parseColor` returns `null` and the color is silently not applied
- [ ] `deleteTokenAtPath` won't prune groups that only have `$`-prefixed metadata keys (`$type`, `$description`) — orphaned metadata remains after the last child token is deleted
- [ ] `batchUpsertTokens` calls `endBatch()` before `emit()` and `endBatch()` is not in a `finally` block — if `saveSet` throws, batch depth is never decremented and all subsequent rebuilds are suppressed
- [ ] `replaceSetTokens` double-rebuild — explicitly calls `rebuildFlatTokens()` inside the batch, then `endBatch()` triggers another rebuild

### QoL

### UX

---

## Theme Management

### Bugs

- [ ] Theme dimensions store cache is never invalidated on external file changes — `renameSet` writes to `$themes.json` directly, bypassing the `DimensionsStore` cache; subsequent reads return stale data
- [ ] Race condition in `fetchThemes` (`useThemeSwitcher`) — fire-and-forget fetch with no abort/generation guard; rapid `tokens` changes cause overlapping fetches where the last to resolve wins regardless of order
- [ ] Side effects inside `setActiveThemesState` updater — `lsSetJson()` and `parent.postMessage()` inside the setState updater will fire multiple times in React concurrent mode

### QoL

### UX

---

## Sync

### Bugs

- [ ] Git sync `applyDiffChoices` pushes even when pull commit fails silently — the push proceeds after a caught pull error, potentially pushing stale state
- [ ] Git sync commit endpoint accepts arbitrary file paths — `files` array is passed directly to `git.add()` with no validation that paths resolve within the token directory; a malicious client could stage files like `../../etc/secrets`
- [ ] Race condition in file write guard — `_writingFiles` entries are cleared via `setTimeout(..., 500ms)`; if writes take longer than 500ms (slow disk, large files), the watcher reloads a partially-written file, corrupting in-memory state
- [ ] `renameSet` is not atomic — if old file deletion fails after new file creation and theme updates, the system has two files and inconsistent in-memory state with no cleanup for partial failure

### QoL

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

- [ ] `setGroupScopesProgress` called but never declared — `handleApplyGroupScopes` in `useFigmaSync.ts` calls `setGroupScopesProgress(...)` three times but neither the state nor setter exist; throws `ReferenceError` at runtime when applying group scopes
- [ ] `scanCanvasHeatmap` can freeze Figma on large pages — `findAll` iterates every node synchronously and reads plugin data for all bindable properties with no batching or yielding, unlike `syncBindings` which batches
- [ ] Race condition in `fetchAllTokensFlatWithSets` — no AbortController or generation counter; rapid set switches cause overlapping fetches that can overwrite `allTokensFlat`/`pathToSet` with stale data, corrupting theme switcher and alias navigation

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

- [ ] `getGeneratorTypeLabel` in `GraphPanel.tsx` missing cases for `accessibleColorPair`, `darkModeInversion`, `responsiveScale` — no `default` branch, returns `undefined` which renders as "undefined" in the UI
- [ ] `TYPE_LABELS` in `TokenGeneratorDialog.tsx` missing same three generator types — accessing these keys returns `undefined`, showing broken labels
- [ ] `handleSave` in `useGeneratorDialog` doesn't reset `saving` state on non-mapping success path — if `onSaved` doesn't unmount the component, the save button stays disabled permanently

### UX

---

## Token Editor

### Bugs

- [ ] `ColorPicker` initializes HSL state from props but never syncs — `useState(hexToHsl(value))` only runs the initializer once; if the parent changes the `value` prop, the picker's internal hue/sat/lit state won't update

### QoL

---

## Settings & Data Management

### Bugs

- [ ] CSS selector injection in export — `cssSelector` from request body is passed directly to Style Dictionary with no sanitization
- [ ] Lint `path-pattern` rule vulnerable to ReDoS — user-supplied regex patterns are compiled directly into `new RegExp()` without calling `isSafeRegex()` first (the guard only exists in the `bulkRename` path)

### QoL

- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

- [x] ExportPanel: No loading indicator during platform export — the `handleExport` call sets `exporting` state but the UI does not show a spinner or progress message while waiting for the server response

---

## Code Quality

### Redundancy & Duplication

- [x] ExportPanel: Duplicate PLATFORMS constant — the same `PLATFORMS` array is defined identically in both `ExportPanel.tsx` and `PublishPanel.tsx`; should be extracted to a shared constant to avoid drift
- [ ] Duplicated `flattenTokenGroup` in `useGeneratorDialog.ts` — re-implements the same function already available from `@tokenmanager/core`
- [ ] Duplicated `flattenForVarDiff`/`flattenForStyleDiff` in `PublishPanel.tsx` — duplicates logic from `flattenTokenGroup` in core and `flattenWithNames` in `useTokens`
- [ ] Duplicated tree-walking patterns in `token-store.ts` — `updateAliasRefs`, `updateBulkAliasRefs`, `collectGroupLeafTokens` all implement nearly identical recursive walkers; extract a generic walker
- [ ] `computeDerivedPaths` in `useGenerators.ts` has 11 nearly identical if-else branches — all do the same thing (extract step names from config and build paths); collapse into a single generic function
- [ ] `countLeafNodes` is in `colorUtils.ts` despite being unrelated to colors — misplaced token tree utility function
- [ ] `ExportPanel` uses raw `localStorage` instead of centralized `lsGet`/`lsSet` helpers — bypasses the try/catch safety net and doesn't use `STORAGE_KEYS`

### Performance

- [x] Theme dimensions store reads `$themes.json` from disk on every GET request — `createDimensionsStore` has no in-memory cache; each `load()` call re-reads and re-parses the file
- [ ] `fetchAllTokensFlat` and `fetchAllTokensFlatWithSets` fetch sets sequentially — serial `for` loop makes one fetch per set; should use `Promise.all` for parallel fetches
- [ ] `lintTokens` and `validateAllTokens` rebuild flat tokens redundantly — iterate all sets calling `getFlatTokensForSet` even though `tokenStore.flatTokens` already has the merged data
- [ ] `useUndo` keyboard listener churns on every undo/redo — `executeUndo`/`executeRedo` recreated on every `past`/`future` change, causing the keyboard handler effect to tear down and re-register; use refs instead

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [x] Export route merges all sets into one namespace with silent overwrites — `deepMergeInto` merges all requested sets into a single flat object, so if two sets define the same token path, the second silently overwrites the first with no warning
- [ ] `PluginMessage` loosely typed as `{ type: string; [key: string]: any }` — the shared types file defines specific message types but they aren't used in the controller switch statement; easy to typo property names
- [ ] `$value` typed as `any` in `TokenNode` interface (`useTokens.ts`) — type safety lost throughout entire token data flow
- [ ] 21 `as any` casts across UI components — particularly concerning in `SemanticMappingDialog.tsx` where API response bodies are cast to access `.error` without a proper typed response shape
- [ ] `substituteVars` in `eval-expr.ts` only replaces 4 hardcoded variable names (`base`, `index`, `multiplier`, `prev`) — function signature accepts `Record<string, number>` implying arbitrary keys, but extra keys are silently ignored
- [ ] `weightToFontStyle` mapping in controller uses hardcoded English style names — fonts using "Book", "Roman", "Demi" etc. cause `loadFontAsync` to throw, silently skipping typography application
- [ ] Multiple `eslint-disable react-hooks/exhaustive-deps` comments suppress legitimate warnings — `ImportPanel.tsx`, `TokenList.tsx`, `App.tsx`, `PublishPanel.tsx`, `AnalyticsPanel.tsx` all have stale closure risks from omitted deps

### Accessibility

- [ ] Most icon-only buttons lack `aria-label` — only 123 aria-label/role occurrences across 21 files for a UI with hundreds of interactive elements
- [ ] HeatmapPanel color-only status indicators — red/yellow/green indicators rely solely on color with no pattern/icon distinction for color vision deficiencies

### Maintainability

- [ ] `TokenList.tsx` is 4695 lines — largest file in the codebase; split into sub-components (row renderers, drag-drop logic, inline editing, context menu, filter/sort controls)
- [ ] `App.tsx` is 2829 lines with 50+ useState calls — extract set management, merge/split, rename, delete, and duplicate logic into dedicated hooks
- [ ] `TokenEditor.tsx` is 2485 lines — extract form sections (value editors per type, metadata editor, alias picker) into separate components
- [ ] `PublishPanel.tsx` is 1642 lines — extract diff computation, variable publishing, and style publishing into separate hooks/components
- [ ] `controller.ts` (plugin main) is 1533 lines — split by concern: variable sync, style sync, selection handling, heatmap scanning, font loading
- [ ] `SelectionInspector.tsx` is 1279 lines — extract property rows, binding UI, and deep-inspect mode into sub-components
- [ ] `token-store.ts` is 1209 lines — extract path helpers, alias ref updaters, and tree walkers into a separate utility module
- [ ] `token-store.ts` uses `any` types pervasively for token group traversal — `Record<string, unknown>` with type narrowing would be safer

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [x] No token search highlighting — filtering tokens by name narrows the list but doesn't highlight the matching substring in results, making it hard to spot the exact match in large sets
- [x] No "duplicate token" or "create sibling" action — creating a variant of an existing token requires manually entering the full path from scratch instead of forking from the current token
- [x] Batch editor find-and-replace has no regex support — only literal string matching is available, so common refactors like renaming `spacing.*` to `dimension.*` require manual work per token
- [x] Batch editor operations show no preview of affected tokens — scaling dimensions, changing types, or find-replacing paths execute immediately with no "these N tokens will change from X to Y" dry-run
- [x] Token delete does not warn about dependent tokens — deleting a token that other tokens alias silently breaks downstream references; the server should block or warn like it does for set deletion
- [x] No color contrast checker in ColorPicker — editing a color token has no inline WCAG AA/AAA pass/fail indicator against common backgrounds, forcing users to check contrast separately
- [x] No color harmony suggestions in ColorPicker — no complementary, triadic, or analogous color suggestions when editing a color token, making systematic palette design harder
- [x] CommandPalette token search capped at 100 results with no pagination — users with 500+ tokens can't find matches beyond the cap, and there's no indication results were truncated
- [x] CommandPalette token results don't show which set a token belongs to — when the same path exists in multiple sets, users can't distinguish between them in search results
- [x] ThemeManager has no search/filter for token sets — configuring dimension options with 50+ sets requires scrolling through the entire list with no way to filter by name
- [x] No "expand all / collapse all" keyboard shortcut in token tree — users manually expanding/collapsing hundreds of nested groups have no fast path; only individual toggle is available
- [x] ExportPanel has no output preview — exporting to CSS/Dart/Swift generates a zip but users can't preview the actual generated code before downloading
- [x] No custom export path or selector template — all CSS exports use `:root` selector with no option for scoped output like `.light { --color: ... }` or custom folder structures
- [x] HeatmapPanel has no export or reporting — users can't export binding coverage as CSV/JSON or share a "200/1000 layers bound (20%)" summary with stakeholders
- [x] HeatmapPanel "select all red" action has no follow-up workflow — selecting unbound layers has no batch "bind all to token X" or "create tokens for these" next step
