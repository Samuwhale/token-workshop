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

- [x] SelectionInspector "mixed" binding state gives no detail — when multiple layers are selected with different bindings on the same property, the inspector shows "mixed" with no way to see what the actual different values are without deselecting layers one at a time; show a tooltip or expandable list of the distinct values (SelectionInspector.tsx ~L362-366)
- [x] Import from Figma Variables has no mode-name customization UI — multi-mode import creates per-mode token sets with auto-slugified names and users must accept or rename sets after import; add an inline rename step during import preview where users can map Figma mode names to desired set names before committing (ImportPanel.tsx ~L625-632)
- [x] No "duplicate token" action in token tree or command palette — creating a variation of an existing token requires manually creating a new token and re-entering all values; a "Duplicate" action in the token context menu and command palette would copy all properties (value, type, description, extensions) to a new path, matching Figma's Ctrl+D pattern for variables

- [x] No token picker for generator source selection — both the template ApplyForm (GraphPanel.tsx ~L687-693) and the full TokenGeneratorDialog require users to type the exact dot-delimited token path from memory; add a searchable token picker/dropdown component filterable by type (color, dimension) that can be used in both flows; this is the single highest-friction point in generator creation
- [x] Generator source token is immutable after creation — useGeneratorDialog.ts derives `hasSource` from read-only props (~L167); changing a generator's source token requires deleting and recreating; make the source token editable in the generator edit dialog so users can re-bind to a different token without losing config, overrides, and naming
- [x] Template flow and full dialog are disconnected creation paths — the template ApplyForm (GraphPanel.tsx ~L475-890) creates generators via direct API call, bypassing TokenGeneratorDialog entirely; it lacks inline value fallback, override editing, and multi-brand support; unify by having templates pre-fill and open the full dialog instead of being a parallel reduced form
- [x] No resolved-value preview for source token — when a source token is bound or selected, the dialog only shows the dot-path as text (TokenGeneratorDialog.tsx ~L493-496); show the resolved value inline (color swatch for colors, formatted dimension for dimensions) so users can confirm they picked the right token
- [x] Dialog subtitle promises "bind a source token" but no UI exists for it — TokenGeneratorDialog.tsx ~L499 says "Enter a base value or bind a source token" when no source is bound, but there is no mechanism to bind one from the dialog; either add the token picker here or reword the subtitle to match actual capabilities

- [x] Inline base values are disconnected from the token graph — when users type a raw hex or dimension as an inline value, that value is orphaned inside the generator config and not referenceable as a token; encourage source token binding over inline values by promoting the picker and de-emphasizing the raw input; consider auto-suggesting existing tokens that match the entered value
- [x] Generator engine `sanitizeNumber` is applied inconsistently — `runTypeScaleGenerator` and `runCustomScaleGenerator` guard against NaN/Infinity via `sanitizeNumber()`, but `runSpacingScaleGenerator` (line 202), `runBorderRadiusScaleGenerator` (line 265), and `runShadowScaleGenerator` (line 330) skip it entirely; if a step multiplier is NaN or Infinity (e.g. user enters bad config), these generators silently produce corrupt dimension tokens that propagate downstream (generator-engine.ts)
- [~] Plugin sandbox data pipeline is pervasively `any`-typed (~29 occurrences across 6 files) — `consistencyScanner.ts` (11 `any`: tokenMap, tokenValue, $value, rawValue, parseValue), `variableSync.ts` (6 `any`: main `applyVariables` entry point, collections, modes, tokens arrays, resolvedValue, rawValue), `selectionHandling.ts` (6 `any`: applyTokenValue value param, tokenMap values), plus scattered casts in colorUtils, heatmapScanning, variableUtils; the entire plugin sandbox has zero compile-time validation of token data flowing through postMessage; define concrete interfaces for token map entries, variable snapshots, and scan results
- [x] `dtcg-resolver.ts` `loadSource` silently swallows cycle and bad-reference errors via `console.warn` — when an internal `$ref` pointer creates a cycle (line 253) or resolves to a non-set target (line 261), the function logs a warning and returns an empty Map; since no caller checks for empty results vs. genuinely empty sets, the resolver silently drops entire token sources with no way for the UI to surface the problem; should throw typed errors or return a result-with-diagnostics that callers can display
- [~] Server `renameSet` and snapshot restore have non-atomic multi-step mutation windows — `renameSet` (token-store.ts:593-623) renames the file then updates `$themes.json` in separate steps with a `.catch(() => {})` rollback that swallows double-failures; snapshot restore (snapshots.ts:50-101) applies sets sequentially so a mid-restore crash leaves mixed old/new data; both need write-ahead journaling or crash-recovery detection on startup

- [~] CommandPalette token search qualifiers (type:, has:, path:) are undocumented in the UI — the placeholder text mentions them but there's no help tooltip, cheat sheet, or progressive disclosure; users won't discover these powerful filters without prior knowledge; add an inline help popover or footer hint row listing available qualifiers when the search is empty (CommandPalette.tsx ~L104-109, ~L410)
- [ ] CommandPalette search results mix groups and tokens with no visual section headers — group matches appear before token matches but there's no heading separating them, making it confusing when a user expects token results but gets group results first; add "Groups" / "Tokens" section labels in results (CommandPalette.tsx ~L468-505)
- [ ] No keyboard shortcut for Delete, Rename, or Duplicate token — common operations like delete (Backspace/Del), rename (F2), and duplicate (Cmd+D) have no keyboard shortcuts despite the tree supporting full keyboard navigation; these are standard shortcuts in Figma's own Variables panel and every file manager (shortcutRegistry.ts, TokenList.tsx)
- [ ] Token editor auto-focus is missing in edit mode — when opening the editor to edit an existing token, no field receives focus; users must click to start editing; in create mode autoFocus works on the path field, but edit mode should focus the value field or the first editable field (TokenEditor.tsx ~L1244)
- [ ] Token editor save failure has no retry affordance — when saving fails (server error, validation, conflict), the user sees an error message but must manually re-trigger save; add a "Retry" button next to the error message, matching the pattern used in PublishModals (TokenEditor.tsx ~L1067-1070)
- [ ] Preview panel is only accessible via a small toggle button in the Tokens tab — the split-view preview is a powerful feature (template galleries for colors, typography, buttons, forms, cards, effects) but there's no command palette entry, no keyboard shortcut, and the toggle button is not labeled; add a Cmd+P shortcut and a "Toggle preview" command palette entry (PreviewPanel.tsx, App.tsx)
- [ ] ResolverPanel is hidden behind ThemeManager's "Advanced" toggle — DTCG v2025.10 resolvers are a core feature but users must discover them by toggling Advanced mode inside Theme Manager; surface Resolvers as a dedicated sub-tab under Define (alongside Tokens, Themes, Generators) or add a prominent link in the ThemeManager header (ResolverPanel.tsx, App.tsx tab structure)
- [ ] ComparePanel and CrossThemeComparePanel are only accessible via right-click context menu — no command palette entries, no keyboard shortcuts, and no visible buttons in the main UI; these are powerful features (multi-token diff and cross-theme comparison) that most users will never discover; add command palette entries and consider an icon button in the token list toolbar (ComparePanel.tsx, CrossThemeComparePanel.tsx, App.tsx)
- [ ] SetSwitcher manage mode has no drag-and-drop for set reordering — reordering uses move-up/move-down buttons which require O(n) clicks to move a set across a long list; add drag-and-drop reordering matching the pattern already used in the token tree (SetSwitcher.tsx ~L378-402)
- [ ] Consistency Panel is buried inside Binding Audit sub-tab — the token consistency checker (suggesting token bindings for hardcoded values) is hidden behind a Coverage/Suggestions toggle inside the Binding Audit panel; many users exploring the Apply tab will only see the Heatmap and miss this feature entirely; consider surfacing it as a visible sub-tab or adding a command palette entry (ConsistencyPanel.tsx, BindingAuditPanel.tsx)
- [ ] No Tokens Studio import format — EmptyState.tsx line 133 mentions "Tokens Studio" as a supported format but ImportPanel has no dedicated Tokens Studio importer; Tokens Studio JSON uses a different structure than DTCG (nested groups with $value but also $type inheritance and set references); users migrating from Tokens Studio must manually convert their files before importing (ImportPanel.tsx)
- [ ] BatchEditor has no bulk copy-to-set operation — tokens can be moved between sets but not copied; "Copy to set" would create duplicates in the target set while preserving originals, useful for forking token sets for new brands or platforms (BatchEditor.tsx ~L1000+)
- [ ] SettingsPanel server connection has redundant "Enter to connect" and "Save & Connect" button — two different affordances for the same action (connecting to a server URL) creates confusion; consolidate into a single "Connect" button with Enter-key support, and add clear success/error feedback with troubleshooting hints (SettingsPanel.tsx ~L503-567)

- [ ] Undo/redo restore and redo handlers update local state even when the server API call fails — useDragDrop.ts (L104-136), useGroupOperations.ts (L65-81), useTokenCrud.ts (L82-98), and useFindReplace.ts (L350-370) all call `onRenamePath`/`onRefresh` after their API calls regardless of success or failure; in useDragDrop the try/catch logs a warning and shows an error toast but then falls through to update local state (`onRenamePath` + `onRefresh`) causing the UI to show the undo was applied when the server still has the old state; useGroupOperations has no try/catch at all in restore/redo making any network error an unhandled promise rejection; fix all undo/redo handlers to skip local state updates when the API call fails and add try/catch to useGroupOperations
- [ ] Server themes routes and resolver-store use 19 `Object.assign(new Error(...), { statusCode })` instead of typed error classes — routes/themes.ts has 14 instances and services/resolver-store.ts has 5, all creating errors with manually-attached statusCode properties instead of using NotFoundError/ConflictError/BadRequestError from errors.ts; additionally routes/resolvers.ts (L41-43, L84-85, L117-119) uses manual `(err as Error & { statusCode?: number })` extraction instead of `handleRouteError()` which is used in every other route file; consolidate both: replace Object.assign errors with typed error classes and switch resolvers.ts to use handleRouteError
- [ ] color-parse.ts Lab→XYZ→sRGB conversion is copy-pasted between `lab` and `lch` cases — lines 528-547 (lab case) and 550-571 (lch case) contain identical f3/XYZ-to-sRGB logic (the `f3` function, X/Y/Z calculation with illuminant D65 constants, and the three `fromLinear` calls); the only difference is how L/a/b are derived from the input channels; extract a shared `labToSrgbCoords(L, a, b)` helper and call it from both cases to eliminate the duplication
- [ ] Find & Replace across all sets registers undo for all targeted sets even when the user aborts mid-loop — useFindReplace.ts L326-337 iterates `setNames` with an `ac.signal.aborted` break guard, but the undo registration at L344-370 uses `capturedSets = Object.keys(renamedBySet)` which correctly only includes sets where `renamed > 0`; however the redo handler at L360-370 calls bulk-rename on all `capturedSets` which may include sets that were only partially renamed (the abort can occur after the API call for a set succeeds but before the response count is processed); track exactly which sets completed successfully and only register undo/redo for those
- [ ] Generator auto-run failures are fire-and-forget with no persistent record — index.ts L88-99 catches generator auto-run errors with `console.warn` and emits a transient `generator-error` SSE event, but if no client is connected the error is lost; there is no operation log entry, no persistent failure record, and no way for a user who connects later to see that generators failed; record auto-run failures in the operation log or a dedicated error store so the UI can surface them in the history panel
