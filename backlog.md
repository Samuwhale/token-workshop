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

- [x] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle

- [!] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error

- [x] Server token-store.ts has no unit tests — the largest and most critical service (1000+ lines) handling all token CRUD, alias resolution, cross-set dependencies, file watching, and batch operations has zero test coverage; a single bug here can corrupt all token data (packages/server/src/services/token-store.ts)
- [x] Settings backup/restore excludes per-set view mode, export presets, export path prefix, and analytics suppressions — the import whitelist in storage.ts omits several persisted keys that users would expect to survive a plugin reinstall, creating a silent data loss on restore (packages/figma-plugin/src/ui/shared/storage.ts import whitelist, SettingsPanel.tsx)
- [x] Consolidate duplicated Variable/Style sync code — `useVariableSync` (171 lines) and `useStyleSync` (171 lines) are structurally identical hooks with different property names; `VariableSyncSubPanel` (180 lines) and `StyleSyncSubPanel` (180 lines) are 95%+ identical components; `useFigmaSync` duplicates the token-fetch-filter-resolve pattern between `handleSyncGroup` and `handleSyncGroupStyles` (L65-98 vs L100-134); all six files (~915 lines total) should be consolidated into a parameterized `useSyncEntity` hook and a generic `SyncSubPanel` component, cutting ~450 lines of pure duplication
- [x] `useFigmaSync` and `useDragDrop` hooks lack abort signals and unmount guards — `useFigmaSync` progress message handler (L38-49) doesn't check abort signal before calling setState, and `useDragDrop` has no AbortController for its 6+ `apiFetch` calls (L83, L108, L124, L175, L197, L205); both can trigger React state-update-on-unmounted-component warnings; should follow the per-fetch AbortController pattern already applied to `useGitConflicts`, `useGitDiff`, `useLintConfig`, and `useRecentOperations` (packages/figma-plugin/src/ui/hooks/useFigmaSync.ts, packages/figma-plugin/src/ui/hooks/useDragDrop.ts)
- [x] Plugin sandbox `fontLoading.ts` cache is poisoned by API errors — `getAvailableFonts()` (L33-38) sets `cachedFonts` to the promise result of `figma.listAvailableFontsAsync()`, but if the API call throws, the caught exception propagates and `cachedFonts` remains `null`; however the real bug is that a concurrent second caller during the first in-flight `await` will start a duplicate API call because `cachedFonts` is still `null` during the await; should cache the Promise itself (not the result) so concurrent callers share the same in-flight request, and clear the cache on rejection so retries work (packages/figma-plugin/src/plugin/fontLoading.ts L27-38)
- [x] Plugin `variableSync.ts` rollback error handling has inconsistent error-type coercion — Promise rejection `reason` values are interpolated directly into strings via template literals (L158, L163, L178) but `reason` can be any type (Error, string, object, undefined); similarly `revertVariables` (L229-243) pushes formatted errors but `revertStyles` (styleSync.ts L151-186) uses a different sequential try-catch pattern for the same conceptual operation; should normalize error coercion with a shared `toErrorMessage(reason: unknown): string` helper and align the rollback patterns between variable and style sync (packages/figma-plugin/src/plugin/variableSync.ts, packages/figma-plugin/src/plugin/styleSync.ts)
- [x] [HIGH] TokenStore.shutdown() does not await in-flight save chains — `shutdown()` (token-store.ts:1909-1915) clears the debounce timer and closes the watcher, but never awaits `_saveChains` (the per-set promise-chain mutexes that serialize `saveSet()` calls); if a route handler triggers `saveSet()` just before the server shuts down, the process can exit while `fs.writeFile`/`fs.rename` is still running, leaving behind `.tmp` files or partially-written token files; fix: `await Promise.all([...this._saveChains.values()])` before closing the watcher
- [x] Generator config fields cannot reference existing tokens — all numeric and color parameters (e.g. `chromaBoost`, `ratio`, `shadowScale color`, `contrastCheck backgroundHex`, `customScale` step multipliers) must be hardcoded; there is no way to bind a config field to a token path so that a change to the source token propagates automatically; the fix requires: (1) extending the generator config type system to support a `tokenRef` value alongside literal primitives, (2) adding a token-picker input (reusing `AliasAutocomplete` with type-appropriate filtering) to each config field row in `TokenGeneratorDialog.tsx` and the per-type config editors (`ColorRampGenerator.tsx`, etc.), and (3) updating the backend validator and run-time resolver in `generator-service.ts` to resolve `tokenRef` values before executing the generator; the UI should display the referenced token's resolved value as a secondary label so the user knows what the field will evaluate to at run time (generator-types.ts, TokenGeneratorDialog.tsx ~L744, AliasAutocomplete.tsx, generator-service.ts ~L627, generators route validators)

- [~] **React error #300 crash when creating a token generator** — `[ErrorBoundary:Generators]` catches a minified React error #300 ("Cannot update a component while rendering a different component") during generator creation. Root cause: in `GraphPanel.tsx` (line 255), `handleTemplateSaved` is defined inline inside the `if (selectedTemplate)` render branch — not as a `useCallback` at hook scope — so it gets a new function reference on every render. This unstable `onSaved` reference flows into `useGeneratorSave`'s `commitSave` useCallback (which has `onSaved` in its dependency array, line 170 of `useGeneratorSave.ts`), causing `commitSave` and `handleConfirmSave` to also recreate on every render. The likely consequence is an update-during-render violation somewhere in the downstream render cycle. Fix: move `handleTemplateSaved` to `useCallback` at hook scope in `GraphPanel`, and memoize the inline `generatorTemplate` object (lines 242–250) with `useMemo` to stabilise the prop passed to `TokenGeneratorDialog`.

- [ ] Surface dependency relationships in the token editor — when editing/viewing a token, add a "References" section showing: aliases this token references (clickable links), tokens that reference this token (count + expandable list), and a "View in dependency graph" link that opens TokenFlowPanel pre-focused on that token. The token editor is where users spend most time, and dependency info is most useful while editing. The link to the full graph is a natural discovery path for the buried Dependencies panel.
- [ ] Show generator provenance on generated tokens — when viewing a token produced by a generator, show a "Generated by [Generator Name]" tag in the token editor/detail view linking back to that generator in GraphPanel. In the token tree, add a subtle icon on generator-produced tokens (cheap to compute since the generator tracks output paths). Creates a feedback loop: users see provenance → discover generators exist → click through to the graph.
- [ ] **Extract shared primitives from token editor and generator dialog to eliminate duplicated input components** — The token editor (TokenEditor.tsx, ValueEditors.tsx), inline token creation (TokenList.tsx lines 3399-3680), and generator dialog (TokenGeneratorDialog.tsx + generators/) each implement their own versions of the same input primitives, with no code reuse between them. Concrete duplications: (1) **Color input** — ColorEditor in ValueEditors.tsx is full-featured (format cycling hex/rgb/hsl/oklch/p3, ColorPicker modal, wide-gamut detection), but the generator dialog (line ~831-851) and ShadowScaleGenerator (lines 158-179) each roll their own simplified `<input type="color">` + hex text field, and inline token creation uses a plain text input with no picker at all. Fix: extract a `ColorInput` primitive from ColorEditor with a `compact` prop that renders the simple picker+hex version, so all three flows use the same component. (2) **Dimension input with unit toggle** — DimensionEditor in ValueEditors.tsx has StepperInput with arrow buttons, formula mode, and a `<select>` for px/rem/em/%. The generator dialog (lines 853-887) has its own `<input type="number">` with separate button-style px/rem toggles. ShadowScaleGenerator has five bare `<input type="number">` fields with no units at all. Fix: extract a `DimensionInput` primitive with optional unit toggle and optional stepper, reusable across all three. (3) **Unit toggle** — Token editor uses a `<select>` with 4 unit options; generator uses button pills with 2 options. These are the same concept with different DOM. Fix: a `UnitToggle` component that accepts a list of units and renders consistently. (4) **Type selector** — Token creation uses a flat `<select>` with 7 optgroups and 25+ options. Generator uses a 2-column button grid from a hardcoded TYPE_LABELS record. The type categories and labels are defined separately in each. Fix: shared `TOKEN_TYPE_CATEGORIES` constant and a `TypeSelector` component that can render as either a compact dropdown or an icon grid. (5) **Token source / alias picker** — TokenEditor uses AliasPicker (full alias resolution chain, cycle detection). Generator dialog has its own source token binding UI (lines 759-820) with matching-token suggestions. Both use AliasAutocomplete internally but wrap it differently. Fix: a unified `SourceTokenPicker` that handles both alias-reference mode and generator-source-binding mode. (6) **Collapsible sections** — TokenGeneratorDialog, ShadowScaleGenerator, and token creation all implement their own disclosure-triangle toggle pattern (`setShowX(v => !v)` + conditional render). Fix: a `Collapsible` component with consistent styling and animation.
- [ ] `buildTree()` in useTokens.ts recurses into arrays, diverging from `flattenWithNames()` — `buildTree` (useTokens.ts:265) checks `typeof value === 'object'` without `!Array.isArray(value)`, so array-valued DTCG tokens (gradients, shadows) get treated as groups with numeric index keys ("0", "1", etc.); `flattenWithNames` (useTokens.ts:21) correctly excludes arrays; also, `buildTree` drops group-level `$extensions` (line 266-273) while preserving them on token nodes (line 262); both inconsistencies should be fixed together
- [ ] Manual snapshot recovery retries the same failed set infinitely on every server startup — `recoverPendingRestore` (manual-snapshot.ts:305-319) catches a `restoreSnapshot` failure and returns without clearing the journal, intending "retry on next startup"; but if the error is persistent (corrupted token data, schema change, invalid JSON), the recovery will fail identically every restart, logging the same error forever; needs a max-retry counter or a mechanism to skip/quarantine the failing set after N attempts
- [ ] Style Dictionary export leaks temp directories on build failure — `exportTokens` (style-dict.ts:314-430) creates a temp directory at line 321, but the cleanup at lines 423-427 is only reached on the happy path; if `sd.buildAllPlatforms()` (line 403) throws an exception that isn't caught by the per-platform try-catch (e.g., StyleDictionary constructor throws at line 393), the function exits without cleaning up `tmpDir`; the cleanup should be in a `finally` block wrapping the entire function body
- [ ] `useSyncBindings` callback has `syncing` in its dependency array causing stale closure races — in ConnectionContext.tsx:77-96, the `sync` callback lists `syncing` as a useCallback dependency, so it recreates on every sync start/end; but the `if (!connected || syncing) return` guard at line 78 captures the `syncing` value at callback creation time; between two rapid sync triggers, the second call can start before the first's `setSyncing(true)` causes a re-render, bypassing the guard; should use a ref for the syncing guard instead of relying on state in the callback closure
- [ ] Non-network token fetch errors are silently logged to console with no UI feedback — `refreshTokens` in useTokens.ts:100-105 only calls `onNetworkError?.()` for network failures; server 500s, JSON parse errors, or other non-network failures are `console.error`'d with no state update; the UI continues showing stale tokens with no indication that the fetch failed; the same pattern appears in `fetchTokensForSet` at lines 176-181; should set an error state that surfaces in the UI
