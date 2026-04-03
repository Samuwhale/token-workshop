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

- [x] [HIGH] TokenStore batchUpsertTokens never triggers rebuildFlatTokens — after a batch import the flat token cache and resolver go stale because nothing inside the batch calls rebuildFlatTokens() and the write guard suppresses the file watcher; compare with batchDeleteTokens which correctly rebuilds after endBatch(); broader issue: rebuildFlatTokens is called 41 times across token-store.ts with three inconsistent patterns (inside batch try+catch where it just defers, after endBatch, or missing entirely) making every new batch method error-prone; should centralize into a withBatch(fn) helper (token-store.ts:738-769 for the bug, 181-213 for the batch mechanism)
- [x] PublishPanel orphan deletion has a retry race condition and all publish modal confirmations silently swallow async errors — executeOrphanDeletion (PublishPanel.tsx ~L235-269) creates a new correlationId per retry attempt but old promise handlers in orphansPendingRef are not invalidated, so a late response from a timed-out attempt can resolve with stale data; separately, all three modal types in PublishModals.tsx (~L207, ~L408, ~L580) use `try { await onConfirm() } finally { setBusy(false) }` which never surfaces errors to the user — the modal clears loading state and the user gets no feedback that the operation failed

- [x] Command palette has no destructive or batch actions — delete token, bulk delete, export, and show dependents are all available server-side (POST /api/tokens/:set/bulk-delete, GET /api/tokens/:set/dependents/*, POST /api/export) but have no command palette entries; users must navigate to the token tree context menu for every destructive operation (CommandPalette.tsx ~L75-86, tokens.ts ~L807, ~L487)
- [x] No Shift+Click range selection or Ctrl/Cmd+A in multi-select mode — selecting multiple tokens requires clicking each checkbox individually; the tree supports multi-select via checkboxes but has no range selection (Shift+Click first and last) or select-all shortcut, which are standard in every tree/list UI (TokenTreeNode.tsx ~L1044-1049, TokenList.tsx)
- [x] Token editor loses unsaved changes silently when the panel closes — switching sets, clicking another token, or navigating away discards in-progress edits with only a "discard changes?" confirm if isDirty is set; there is no draft auto-save to sessionStorage or recovery mechanism if the user accidentally closes the panel (TokenEditor.tsx ~L938-939, App.tsx ~L520)
- [x] Drag-and-drop only supports single-token moves — useDragDrop tracks a single dragSource and validates all sources are siblings (line 171-174), so users cannot select multiple tokens across groups and drag them together; the server's POST /api/tokens/:set/batch-move endpoint supports batch moves but the UI never calls it for drag operations (useDragDrop.ts ~L28, ~L59-157)
- [x] ThemeManager auto-fill gives no preview of what will be created — the "Fill gaps" action shows an approval modal but doesn't indicate how many tokens will be created, in which set, or whether existing values will be skipped vs. overwritten; the strategy is hardcoded to 'skip' but users can't see or change this (ThemeManager.tsx ~L814-835, ~L2122-2130)
- [x] PublishPanel readiness checks show pass/fail without guided remediation — users see that "scopes" or "descriptions" checks failed but have no indication of priority (scopes are blocking, descriptions are optional) and no step-by-step workflow; fix labels only appear on hover over failed checks (PublishPanel.tsx ~L316-388, ~L369)
- [x] Set metadata (description, Figma collection, Figma mode) only accessible via context menu — users must right-click a set tab to discover "Edit set info"; there's no visible affordance in SetSwitcher manage mode or in the token list header, making it effectively invisible to new users (App.tsx ~L2521-2579, SetSwitcher.tsx)
- [x] ExportPanel silently switches from Platforms mode to Figma Variables mode when server disconnects — the mode auto-switch at line 554-557 happens without notification; users lose their selected export configuration and have no explanation of why the mode changed or how to get back (ExportPanel.tsx ~L552-557)
- [x] Tab key in inline token editing closes the edit instead of moving to the next token — pressing Tab in an inline value edit field should advance focus to the next token's value (matching spreadsheet behavior), but currently it just blurs and exits edit mode; this forces users to click each token individually for sequential edits (TokenTreeNode.tsx MultiModeCell ~L92-110)
- [x] Find & Replace doesn't warn when replacements would break alias references — the regex-based find/replace shows a preview of path changes but doesn't check whether any renamed paths are referenced as alias targets by other tokens; breaking aliases silently creates dangling references that only surface later as validation errors (TokenListModals.tsx ~L818-820)
- [x] [HIGH] onNavigateToToken callback has inconsistent parameter order across panels — AnalyticsPanel declares `(path: string, set: string)` while ThemeManager declares `(set: string, tokenPath: string)`; this means one of them is silently passing wrong arguments when navigating to a token, causing navigation to fail or land on the wrong token (AnalyticsPanel.tsx:33 vs ThemeManager.tsx:29)
- [x] Alias reference detection is manually reimplemented 20+ times across the codebase instead of using core's `isReference()` and `parseReference()` — UI components (TokenEditor.tsx 8x, AliasPicker.tsx 5x, TokenList.tsx 2x, AnalyticsPanel.tsx 2x, BatchEditor.tsx, ColorModifiersEditor.tsx), server (token-tree-utils.ts 2x, style-dict.ts), and shared (tokenParsers.ts) all manually check `startsWith('{') && endsWith('}')` instead of importing from `@tokenmanager/core/dtcg-types`; consolidate to the single core implementation to eliminate subtle divergence risk (e.g. some checks trim whitespace, others don't)
- [x] Plugin sandbox selection flow is pervasively `any`-typed — `collectDescendantsWithBindings` (selectionHandling.ts:291) returns `any[]`, `getSelection` (selectionHandling.ts:315) builds `any[]`, and all node info objects flowing through postMessage to the UI (SelectionInspector, QuickApplyPicker) are untyped; this makes the entire selection inspection pipeline (~15 message types between sandbox and UI) impossible to validate at compile time; define concrete interfaces for node info, binding data, and selection results in shared/types.ts alongside the existing PluginMessage union
- [x] HSL/RGB color conversion is implemented three separate times — `srgbToHsl()`/`hslToSrgb()` in `packages/core/src/color-parse.ts`, `rgbToHsl()`/`hslToRgb()` in `packages/figma-plugin/src/ui/shared/colorUtils.ts`, and `hslToRgbValues()` in `packages/figma-plugin/src/plugin/colorUtils.ts`; the UI colorUtils already imports other functions from core (hexToRgb, rgbToHex, hexToLab) so there's no bundling barrier — remove the duplicate UI implementations and use core's; the plugin sandbox copy is necessary (separate runtime) but should be marked as intentional
- [x] HistoryPanel silently swallows all API fetch errors by returning empty defaults — four `.catch(() => defaultValue)` calls (lines ~221, 222, 244, 777) on git-commits and snapshot-list fetches mean users never see errors when the server's git or snapshot endpoints fail; the panel shows an empty state indistinguishable from "no history exists"; add error state tracking and a retry affordance, matching the pattern already used in AnalyticsPanel's validation fetch
- [x] Server `renameSet` multi-step file mutation has a crash-unsafe window and silent rollback — between the atomic file rename (token-store.ts:593) and the $themes.json update (token-store.ts:615), a server crash leaves themes referencing the old set name with no recovery mechanism; additionally the file-rename rollback on line 618 uses `.catch(() => {})` which silently swallows rename-back failures, so a double failure (themes write fails AND rename-back fails) leaves both files in an inconsistent state with no error logged
- [x] Sync conflict review requires opening each token individually — VariableSyncSubPanel and StyleSyncSubPanel show "local-only", "figma-only", and "conflict" categories but don't display inline value diffs for conflicts; reviewing 50 conflicting tokens requires 50 separate clicks; add inline side-by-side value comparison in the diff list rows (VariableSyncSubPanel.tsx ~L35-80)
- [x] Import conflict strategy is binary overwrite-or-skip with no field-level merge — when importing tokens that already exist, users must choose "overwrite" (losing local descriptions, extensions, metadata) or "skip" (losing updated values); add a "merge" strategy that keeps local metadata while updating values, matching how git merge works for structured data (ImportPanel.tsx ~L642, ~L777)
- [x] No export presets — each export requires re-selecting platforms, type filters, path prefixes, and set scope; power users running the same export weekly must manually reconstruct their configuration every time; add named export presets that persist platform/filter/option combinations to localStorage (ExportPanel.tsx ~L115-152)
- [x] GraphPanel generator pipeline cards have no inline Edit button — users must navigate to the generator's source token in the token tree and find the generator in the derived groups section of TokenEditor to edit a generator's configuration; add a direct "Edit" action button on GeneratorPipelineCard alongside the existing rerun/preview/duplicate/delete actions (GraphPanel.tsx ~L1436+)
- [~] Token editor Extensions JSON field has no real-time syntax validation — invalid JSON in the custom extensions textarea is only caught at save time with "Invalid JSON in Extensions — fix before saving"; add inline validation on change with syntax error highlighting, matching how JSON editors work in VS Code (TokenEditor.tsx ~L1060-1071)
- [x] AnalyticsPanel validation results show no timestamp and have no auto-revalidation — after navigating away and returning, `resultsStale` becomes true but there's no visible timestamp showing when validation last ran, and no option to auto-revalidate on token changes; users can unknowingly act on stale validation data (AnalyticsPanel.tsx ~L95, ~L633-638)
- [~] SelectionInspector "mixed" binding state gives no detail — when multiple layers are selected with different bindings on the same property, the inspector shows "mixed" with no way to see what the actual different values are without deselecting layers one at a time; show a tooltip or expandable list of the distinct values (SelectionInspector.tsx ~L362-366)
- [~] Import from Figma Variables has no mode-name customization UI — multi-mode import creates per-mode token sets with auto-slugified names and users must accept or rename sets after import; add an inline rename step during import preview where users can map Figma mode names to desired set names before committing (ImportPanel.tsx ~L625-632)
- [ ] No "duplicate token" action in token tree or command palette — creating a variation of an existing token requires manually creating a new token and re-entering all values; a "Duplicate" action in the token context menu and command palette would copy all properties (value, type, description, extensions) to a new path, matching Figma's Ctrl+D pattern for variables

- [ ] No token picker for generator source selection — both the template ApplyForm (GraphPanel.tsx ~L687-693) and the full TokenGeneratorDialog require users to type the exact dot-delimited token path from memory; add a searchable token picker/dropdown component filterable by type (color, dimension) that can be used in both flows; this is the single highest-friction point in generator creation
- [ ] Generator source token is immutable after creation — useGeneratorDialog.ts derives `hasSource` from read-only props (~L167); changing a generator's source token requires deleting and recreating; make the source token editable in the generator edit dialog so users can re-bind to a different token without losing config, overrides, and naming
- [ ] Template flow and full dialog are disconnected creation paths — the template ApplyForm (GraphPanel.tsx ~L475-890) creates generators via direct API call, bypassing TokenGeneratorDialog entirely; it lacks inline value fallback, override editing, and multi-brand support; unify by having templates pre-fill and open the full dialog instead of being a parallel reduced form
- [ ] No resolved-value preview for source token — when a source token is bound or selected, the dialog only shows the dot-path as text (TokenGeneratorDialog.tsx ~L493-496); show the resolved value inline (color swatch for colors, formatted dimension for dimensions) so users can confirm they picked the right token
- [ ] Dialog subtitle promises "bind a source token" but no UI exists for it — TokenGeneratorDialog.tsx ~L499 says "Enter a base value or bind a source token" when no source is bound, but there is no mechanism to bind one from the dialog; either add the token picker here or reword the subtitle to match actual capabilities

- [ ] Inline base values are disconnected from the token graph — when users type a raw hex or dimension as an inline value, that value is orphaned inside the generator config and not referenceable as a token; encourage source token binding over inline values by promoting the picker and de-emphasizing the raw input; consider auto-suggesting existing tokens that match the entered value
- [ ] Generator engine `sanitizeNumber` is applied inconsistently — `runTypeScaleGenerator` and `runCustomScaleGenerator` guard against NaN/Infinity via `sanitizeNumber()`, but `runSpacingScaleGenerator` (line 202), `runBorderRadiusScaleGenerator` (line 265), and `runShadowScaleGenerator` (line 330) skip it entirely; if a step multiplier is NaN or Infinity (e.g. user enters bad config), these generators silently produce corrupt dimension tokens that propagate downstream (generator-engine.ts)
- [ ] Plugin sandbox data pipeline is pervasively `any`-typed (~29 occurrences across 6 files) — `consistencyScanner.ts` (11 `any`: tokenMap, tokenValue, $value, rawValue, parseValue), `variableSync.ts` (6 `any`: main `applyVariables` entry point, collections, modes, tokens arrays, resolvedValue, rawValue), `selectionHandling.ts` (6 `any`: applyTokenValue value param, tokenMap values), plus scattered casts in colorUtils, heatmapScanning, variableUtils; the entire plugin sandbox has zero compile-time validation of token data flowing through postMessage; define concrete interfaces for token map entries, variable snapshots, and scan results
- [ ] `dtcg-resolver.ts` `loadSource` silently swallows cycle and bad-reference errors via `console.warn` — when an internal `$ref` pointer creates a cycle (line 253) or resolves to a non-set target (line 261), the function logs a warning and returns an empty Map; since no caller checks for empty results vs. genuinely empty sets, the resolver silently drops entire token sources with no way for the UI to surface the problem; should throw typed errors or return a result-with-diagnostics that callers can display
- [ ] Server `renameSet` and snapshot restore have non-atomic multi-step mutation windows — `renameSet` (token-store.ts:593-623) renames the file then updates `$themes.json` in separate steps with a `.catch(() => {})` rollback that swallows double-failures; snapshot restore (snapshots.ts:50-101) applies sets sequentially so a mid-restore crash leaves mixed old/new data; both need write-ahead journaling or crash-recovery detection on startup

- [ ] CommandPalette token search qualifiers (type:, has:, path:) are undocumented in the UI — the placeholder text mentions them but there's no help tooltip, cheat sheet, or progressive disclosure; users won't discover these powerful filters without prior knowledge; add an inline help popover or footer hint row listing available qualifiers when the search is empty (CommandPalette.tsx ~L104-109, ~L410)
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
