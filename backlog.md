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

- [x] Generalize variable/style/scope sync into a parameterized abstraction — useFigmaSync.ts declares multiple useState hooks tripling the same (pending/applying/progress/error) pattern for variables, styles, and scopes; PublishPanel.tsx duplicates near-identical builder functions for var vs style diff rows (buildVarFigmaMap ↔ buildStyleFigmaMap, buildVarLocalOnlyRow ↔ buildStyleLocalOnlyRow, etc., differing only in field names); consolidating into parameterized factories and a single state-per-flow record type would halve the sync code
- [x] AbortError detection pattern duplicated ~70 times across hooks with inconsistent variants — `if (err instanceof Error && err.name === 'AbortError') return` appears across 33+ files; some use the unsafe `(err as Error).name === 'AbortError'` without instanceof check; extract a shared `isAbortError(err): boolean` utility and replace all call sites

### Performance

- [x] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by ~250ms (ExportPanel.tsx)

### Correctness & Safety

- [x] Manual snapshot restore has no concurrency guard — `manual-snapshot.ts:restore()` writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; needs a mutex (same promise-chain pattern as TokenStore/GitSync)
- [x] Server resolver routes accept unvalidated request bodies and token rename routes skip path validation — POST /resolvers, POST /resolvers/from-themes, and PUT /resolvers/:name cast request.body directly to ResolverFile without validating required fields; token rename-preview endpoints (tokens.ts) check query params for truthiness but skip isValidTokenPath() validation that all other path-accepting endpoints use

### Accessibility

### Maintainability

- [x] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click (TokenTreeNode.tsx group context menu)

- [x] Inconsistent destructive-action safety across panels — ThemeManager confirms dimension delete (ConfirmModal at ThemeManager.tsx:2365) but silently deletes options (ThemeManager.tsx:1726→700); SnapshotsSource deletes snapshots with no confirmation at all (SnapshotsSource.tsx:213-226); AnalyticsPanel deletes individual unused tokens without confirmation (AnalyticsPanel.tsx:557-568) while bulk delete has inline confirm; the safety level a user gets depends on which panel they're in rather than the severity of the action (violates: consistency, error prevention)
- [x] SelectionInspector binding operations give no visible feedback — handleRemoveBinding (SelectionInspector.tsx:396), handleUnbindAllInGroup (:404), and handleClearAllBindings (:439) all fire postMessage to the plugin but show no toast, spinner, or inline confirmation to the user; the only signal is the undo slot pushed silently to the undo stack, so a user clearing all bindings on a complex component has no way to tell if the action succeeded without manually re-inspecting each property (violates: visibility of system status)
- [x] ResolverPanel edit and delete icon buttons use title-only with no aria-label — the pencil edit button (ResolverPanel.tsx:583-592) and X delete button (:594-602) set `title="Edit resolver"` / `title="Delete resolver"` but have no `aria-label`, making them invisible to screen readers; this also applies broadly: the agent audit found ~117 icon-only buttons across 50 component files with neither aria-label nor title, concentrated in AnalyticsPanel, ExportPanel, BatchEditor, Collapsible, and CreatePanel (violates: accessibility)
- [x] Import conflict resolution cycling behavior is opaque — the per-token decision button in ImportConflictResolver.tsx (lines 148-170) cycles through accept→merge→reject→accept on each click, but there is no visible affordance explaining this order or what the current state means; users must click repeatedly to discover the three states and learn the cycle direction, and there is no way to jump directly to a specific decision without cycling past unwanted options (violates: recognition over recall, user control)
- [x] [HIGH] Token-store batchUpsertTokens creates new sets outside the snapshot boundary (token-store.ts:874-891) — if _createSetNoRebuild succeeds but the subsequent batch fails and restoreSnapshots runs, the newly created empty set remains registered in this.sets but its tokens are restored to empty state; the snapshot should be taken before set creation, or set creation should be rolled back in the catch block; similar issue exists in batchDeleteTokens (token-store.ts:950-968) where deleted sets are not tracked for rollback
- [x] No success feedback after ThemeManager and ResolverPanel mutations — creating a theme dimension, adding an option, renaming, or saving a resolver edit all complete silently with only the list refreshing as implicit feedback (ThemeManager create dimension ~L2217, add option ~L1551; ResolverPanel save edit ~L281); contrast with set management operations (useSetRename, useSetDelete, useSetDuplicate) which all show explicit success toasts; a user performing multiple quick edits in ThemeManager can't tell which ones succeeded vs. were silently dropped (violates: visibility of system status, consistency)
- [x] Import panel lacks Escape key handling and keyboard shortcuts for bulk actions — ImportPanel.tsx, ImportSourceSelector.tsx, and ImportConflictResolver.tsx have no onKeyDown handlers for Escape to go back or cancel; the conflict resolver's bulk action buttons (Accept all, Merge all, Reject all at ImportConflictResolver.tsx:72-89) have no keyboard shortcuts; and the per-token cycling button has no keyboard alternative to clicking (violates: flexibility and efficiency of use, accessibility)
- [x] ThemeManager.tsx is a 2439-line monolith with 44 useState hooks — extract domain-specific custom hooks (useThemeDimensions, useThemeCoverage, useThemeCompare, useThemeOptions) and use a context provider to eliminate prop-drilling, mirroring the TokenListModalsContext pattern already applied to TokenList; the component has 8 identical error-handling blocks, duplicated dimension/option existence checks, and no loading guards on async server calls allowing duplicate submissions
- [x] Plugin variableSync main mutation loop (variableSync.ts:109-130) has no per-token try-catch — a single failed Figma API call (setValueForMode, scopes assignment, or setPluginData) aborts the entire sync loop and triggers a full rollback of all previously successful variables; styleSync already handles this correctly with per-token try-catch (styleSync.ts:108-133) that logs failures and continues; variableSync should adopt the same per-token error isolation pattern so one bad token doesn't undo the entire batch
- [x] Core resolver formula unit extraction silently falls back to 'px'/'ms' when extractFormulaUnit returns null (resolver.ts:307-311) — if a formula like `{spacing.base} * 2` references a dimension token with unit 'em', the resolved number correctly evaluates to the scaled value but the unit is lost and defaults to 'px'; extractFormulaUnit should walk the resolved dependencies to inherit the unit from the referenced token rather than using a hardcoded fallback
- [x] Plugin controller.ts scan signal management has a race condition (controller.ts:46-67, 336-345) — if two scan-token-usage messages arrive before the first scan completes, createScanSignal overwrites _activeScanSignal with the second signal, then when the first scan's finally block calls clearScanSignal(signal) it clears the second scan's signal because _activeScanSignal was already replaced; the second scan then runs without a registered abort signal so cancelActiveScan() becomes a no-op

- [x] Consolidate AnalyticsPanel sub-features into their host panels — AnalyticsPanel (1596 lines) is a grab-bag of six unrelated features (validation issues, set statistics, contrast matrix, duplicate detection, scale inspector, component coverage) each of which belongs closer to the panel that owns its domain: validation issues should be inline in the Tokens tab as a filter (already partially exists via showIssuesOnly), contrast matrix fits in the Preview panel or a color-specific tool, duplicate detection belongs in Health, and component coverage already has a dedicated canvas-audit tab; consolidating would eliminate a 1600-line omnibus panel and make each feature discoverable where users are already working
- [x] Merge HealthPanel into the Validation sub-tab — HealthPanel shows a high-level summary of lint violations, generator health, heatmap coverage, and validation issues, but each of those already has its own dedicated panel; the Health tab adds a layer of indirection where users see a summary card then click a CTA that navigates to the real panel; folding the health summary into the top of the Validation sub-tab (as a collapsible dashboard strip) would reduce the tab count by one without losing any information
- [~] Consolidate the four comparison components into a single parameterized compare view — ComparePanel.tsx (379 lines), CrossThemeComparePanel.tsx (284 lines), ThemeCompare.tsx (452 lines), and UnifiedComparePanel.tsx (162 lines) implement three comparison modes that share ~60% of their rendering logic (side-by-side value columns, color swatches, diff indicators, CSV export); a single CompareView component parameterized by data source (selected tokens, theme options, single token × themes) would halve the code and make the comparison UX consistent across modes
- [ ] Add "Copy token value" to the Figma Edit menu and plugin shortcuts — the context menu offers 5+ copy formats (CSS var, DTCG ref, SCSS, raw value, JSON) but all require right-clicking a specific token; power users managing hundreds of tokens need a keyboard-driven "copy focused token value" shortcut (e.g. Cmd+Shift+C) that copies the currently highlighted/selected token's value in the user's preferred format from Settings without opening a context menu
- [ ] Token editor should preserve scroll position when saving — TokenEditor.tsx remounts on each editingToken state change (the key is the token path), so saving a token and immediately opening the next one via Cmd+Down resets the editor scroll to top; for composite types (typography, shadow) where the editor is taller than the viewport, this means users lose their place after every save; the editor should either persist scroll position keyed by token path or use a transition that doesn't remount
- [ ] Resolver panel has no inline preview of resolved output — ResolverPanel.tsx lets users create and edit resolver rules but provides no immediate feedback about what the resolver produces; users must save the resolver, switch to the Tokens tab, and mentally diff the values to understand the effect; adding a live "Resolved preview" section that shows a sample of 5-10 tokens with their before/after resolved values would make resolver authoring dramatically faster
- [ ] ConsistencyPanel scan results are lost on tab switch — ConsistencyPanel.tsx stores scan results in local useState (line 154), so navigating away from the Canvas Audit tab and returning clears all results, forcing a re-scan that can take 30-60 seconds on large files; scan results should be lifted to InspectContext (which already holds heatmap results) so they persist across tab switches
- [ ] SetSwitcher dropdown should show which sets are themed — SetSwitcher.tsx displays set names with folder grouping and token counts but gives no indication of which sets are assigned to theme dimensions; a user choosing which set to edit for a themed override has to switch to the Themes tab to check assignments; adding a small "dark", "light", etc. badge next to themed sets would save constant tab-switching
- [ ] No way to duplicate a theme dimension with all its options — ThemeManager.tsx supports creating and deleting dimensions but has no "Duplicate dimension" action; for design systems with similar theme axes (e.g. duplicating a "brand" dimension to create "sub-brand" with the same option structure), users must manually recreate every option and reassign every set; a duplicate action that copies the dimension structure and set assignments (with a name suffix) would save significant manual work
- [ ] Generator editor has no "preview diff" before regenerating — TokenGeneratorDialog.tsx applies generator changes immediately on save; for generators that produce dozens of tokens (e.g. an 11-step color ramp), there's no way to see what will change before committing; adding a "Preview changes" step that shows a diff of current vs. proposed token values would prevent accidental overwrites and give users confidence to experiment with generator settings
- [ ] Bulk create tab only supports a flat text-area format — CreatePanel.tsx BulkTab accepts a path:value text format but doesn't support pasting a DTCG JSON group structure, which is the most common format users would copy from another tool or documentation; the bulk tab should detect and parse nested DTCG JSON input in addition to the flat format
- [ ] PanelRouter.tsx props interface has 80+ props — PanelRouterProps (lines 57-191) is a 135-line interface passing 80+ individual props from App.tsx; despite the context providers (Connection, TokenData, Theme, Inspect), the remaining App-local state still creates a massive prop surface; extracting NavigationContext (activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel) and EditorContext (editingToken, previewingToken, highlightedToken, and their setters) would cut the prop count roughly in half

- [ ] Inconsistent modal accessibility across dialogs — ConfirmModal, KeyboardShortcutsModal, CommandPalette, and PublishModals all use useFocusTrap, Escape-to-close, and full ARIA attributes (role="dialog", aria-modal, aria-labelledby), but TokenGeneratorDialog (the 3-step generator stepper) has none of these: no Escape handler, no backdrop click-to-close, no focus trap, no role="dialog"; PublishPanel's 4 inline preview/confirm modals have Escape and backdrop handlers but no focus trap; TokenEditor's internal "Save changes?" confirm dialog has role="dialog" but no Escape handler or focus trap; TokenListModals rename/delete/extract modals have role="dialog" but no useFocusTrap — the accessibility level a user gets depends entirely on which dialog they happen to open (violates: consistency, accessibility)
- [ ] TokenList search input has no clear button and no Escape-to-clear — the search input (TokenList.tsx:2588-2615) has no "✕" clear affordance despite ThemeManager's dimension search having one (ThemeManager.tsx:698-710); the onKeyDown handler only navigates autocomplete hints (ArrowDown/ArrowUp/Tab/Enter) and does not handle Escape; users must manually select-all and delete to clear a query, or find the "Clear filters" button in the no-results empty state, which is invisible when results exist; this contrasts with every other search input in the plugin that either has a clear button or Escape support (violates: consistency, user control and freedom)
- [ ] Token editor form validation feedback is inconsistent across token types — simple types (color, dimension, number) show inline validation with red borders and error text; the Find & Replace modal shows regex errors immediately and uses colored banners for warnings; but the New Group dialog (TokenListModals.tsx:395-435) only shows errors after submission; Extract to Alias path validation shows errors inline but with different styling than the group dialog; Typography editor shows unavailable font weight warnings in the sub-field but no field-level error state; dimension unit conversion warnings use a different display pattern (inline text vs banner vs border); there is no single shared validation feedback component — each form invents its own error display approach (violates: consistency, error prevention)
- [ ] Export panel presents too many filter options simultaneously without progressive disclosure — the Platforms export mode shows target platform checkboxes, token set checkboxes, token type pill buttons, a path prefix text input, a CSS selector input, and a changes-only toggle all visible at once; for a user who just wants to export CSS for all tokens, the cognitive load of scanning past set filters, type filters, and path prefix is unnecessary; the token type filter has a collapsed "Filter types" toggle but the other filter groups (sets, path prefix, CSS selector) are always expanded with no way to collapse them (violates: aesthetic and minimalist design, progressive disclosure)
- [ ] Escape key behavior is inconsistent between search inputs across panels — TokenList search (TokenList.tsx:2598) does not handle Escape at all (only hint navigation); ThemeManager dimension search (ThemeManager.tsx:701) clears the query and blurs on Escape; ThemeManager preview token search has no Escape handler; ThemeManager missing-override filter has no Escape handler; a user who learns Escape-to-clear in one panel will be confused when it doesn't work in another (violates: consistency, user control and freedom)
- [ ] Generator config editors have no undo affordance for individual field changes — while the generator dialog stepper (StepWhat) has undo/redo buttons for config snapshots, individual form fields within generator config editors (ColorRampGenerator bezier points, SpacingScaleGenerator step multipliers, TypeScaleConfigEditor ratio/base values) support no Ctrl+Z undo beyond native browser input undo; if a user accidentally drags a bezier control point or changes a ratio value, the only recovery is the snapshot-level undo which may roll back multiple changes at once; this is especially problematic for the interactive bezier curve editor where precise adjustments are easily lost (violates: user control and freedom, error recovery)
