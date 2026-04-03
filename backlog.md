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

- [x] PreviewPanel Buttons/Forms/Card templates are static CSS demos that don't reflect the user's actual tokens — ButtonsTemplate (PreviewPanel.tsx:582) uses hardcoded `var(--color-primary, #0066ff)` with generic fallbacks; if the user's tokens use different naming conventions the templates render entirely from hardcoded fallbacks; either dynamically map the user's actual tokens to template slots or let users assign tokens to template properties
- [x] ResolverPanel has no edit flow for existing resolvers — users can create and delete resolvers but cannot edit name, description, or modifier configuration after creation; the only path is delete-and-recreate which loses any associated state; add inline editing or an edit mode for resolver properties (ResolverPanel.tsx ~L383-513)
- [x] PreviewPanel dark mode toggle is not persisted — switching between light/dark resets every time the user changes template tabs or re-opens the panel; persist the dark mode preference in localStorage so it survives across sessions (PreviewPanel.tsx ~L287-315)
- [x] No per-token value changelog — users can see set-level git history and operation log but have no way to answer "what were the previous values of this specific token and when did they change"; add a "History" section to the TokenEditor that shows the value timeline for the selected token by filtering git diffs or operation log entries to that path
- [x] Keyboard shortcut definitions are scattered across 5+ files with no single source of truth — handlers live in App.tsx, TokenList.tsx, TokenEditor.tsx, SelectionInspector.tsx, and CommandPalette.tsx while KeyboardShortcutsModal.tsx has its own static display list; adding or changing a shortcut requires updating multiple files and the documentation can easily drift from reality; consolidate into a single shortcut registry that both handlers and the help modal consume
- [x] SettingsPanel import applies immediately with no preview of what will change — importing a settings JSON file (SettingsPanel.tsx ~L242-273) overwrites current lint rules, export defaults, and UI preferences in one shot with no diff/confirmation dialog; show a preview of what settings will be overwritten before applying
- [x] No token reference format picker when copying a token path — the context menu and command palette offer separate "Copy path", "Copy CSS var", and "Copy value" actions but the most common need is switching between dotted path, CSS var `var(--token-path)`, and DTCG alias `{token.path}` formats; add a small format submenu or a "Copy as…" action with format options in the token context menu (TokenTreeNode.tsx context menu, App.tsx clipboard handlers ~L2781-2788)

- [x] [HIGH] Operation-log rollback is not transactional — if `executeSteps()` throws during structural rollback (operation-log.ts:299), the subsequent token snapshot capture (line 303) runs against partially-modified state, recording an inconsistent `currentSnapshot` for the rollback entry; a failed rollback leaves both structural state and tokens in an unpredictable half-rolled-back state with no recovery path; wrap the structural-steps + snapshot-capture + token-restore sequence in a try/catch that reverts structural steps (using the already-computed `inverseSteps`) on failure

- [x] Server services silently swallow errors in 6+ locations via console.warn-and-continue — token-store.ts:148,157 catches watcher reload errors as console.warn (stale cache served silently), generator-service.ts:468-472 catches generator execution failures and stores them in an in-memory map the UI never polls, resolver-store.ts:272-274 skips invalid resolver files during init with no caller notification, style-dict.ts:288-290 converts export failures into fake `error.txt` files instead of returning error status; consolidate around a consistent error propagation strategy (typed error return or event emission) so callers can surface failures to the user
- [x] Plugin sandbox has 3 message handlers without try-catch that can crash the entire message loop — `search-layers` (controller.ts:320), `find-peers-for-property` (controller.ts:322), and `eyedropper`/`sampleSelectionColor` (controller.ts:350) are not wrapped in try-catch unlike all other handlers; if any of these throw, the `figma.ui.onmessage` handler crashes and stops processing all subsequent messages, effectively bricking the plugin until reload
- [x] Plugin sandbox overwrites existing Figma variables and paint styles without confirmation or undo grouping — variableSync.ts:66-95 silently mutates existing variables when names collide (snapshots are captured but never surfaced to UI for review), styleSync.ts:104-116 replaces multi-paint styles with a single solid color, and selectionHandling.ts:768 applies token values to nodes in a loop where partial failures leave earlier nodes modified with no rollback; these should either preview changes before applying or use Figma's `figma.group()` API to make the entire batch undoable as one step
- [x] Duplicate `extractApplyResult` functions and sync boilerplate across useFigmaSync.ts, useStyleSync.ts, and useVariableSync.ts — all three hooks define identical `{ count, total, failures }` extraction functions (useFigmaSync.ts:8-12, useStyleSync.ts:40-44, useVariableSync.ts:22-26) and share the same response shape; useStyleSync and useVariableSync already use `useTokenSyncBase` but useFigmaSync duplicates that base logic manually with its own state management; consolidate the shared extraction into a single module and migrate useFigmaSync to use useTokenSyncBase
- [x] Core resolver.ts has unsafe type casts on composite token values in 6+ locations — lines 340, 367, 454, 469, 509, 528 cast token `$value` to `Record<string, unknown>` without runtime type checks; if a token has a primitive $value where an object is expected (e.g., a color token in a shadow group due to user error), the spread/property access silently produces wrong output or throws a confusing runtime error; add type guards before the casts or use a helper like `assertCompositeValue(value, expectedType, path)` that throws a clear resolution error

- [x] Duplicate `fmtValue` formatting functions across ComparePanel, CrossThemeComparePanel, and separate `formatValue`/`formatTokenValue` helpers in tokenListUtils, generatorShared, changeHelpers, and selectionInspectorUtils — six independent implementations of "format a token value for display" with subtly different type handling (e.g., shadow array formatting, typography joining, dimension unit defaults); consolidate into a single shared `formatTokenValueForDisplay(type, value)` in `shared/` that all panels and utilities import
- [x] ThemeManager has no drag-and-drop reordering for dimensions or options — dimension order and option order can only be changed via the reorder API endpoints (PUT /api/themes/dimensions-order, PUT /api/themes/dimensions/:id/options-order) but the ThemeManager UI provides no interactive reordering UI; add drag-to-reorder handles on dimension rows and option pills, similar to the existing token drag-drop in TokenList
- [x] TokenFlowPanel (dependency graph) has no loading state and no empty state guidance — when no token is selected the panel shows nothing with no hint about what to do; add "Select a token to see its dependency graph" empty state text
- [x] No way to search or filter tokens by value in the command palette — the command palette (Cmd+K) supports token path search and group navigation but doesn't expose the `value:` qualifier that the token list search bar supports; power users who want to quickly find "all tokens with value #FF0000" must leave the command palette and type `value:#FF0000` in the search bar instead; wire the `value:` qualifier into the command palette's token search mode
- [x] ConsistencyPanel scan scope limited to selection and page — the consistency scanner (which finds hardcoded values close to token values) only supports scanning the current selection or current page; the heatmap coverage scanner supports selection/page/all-pages scope; add "all pages" scope to ConsistencyPanel for comprehensive consistency audits across the entire file
- [~] No global cross-set find-and-replace for token values — the existing find-and-replace (useFindReplace hook, Cmd+H) only operates on token paths/names within a single set; there's no way to find and replace token *values* (e.g., change all `#FF0000` color values to `#EE0000`) or to run a find-replace across all sets at once; the server has per-set `bulk-rename` but no cross-set or value-targeting variant
- [x] Batch editor has no "set description" or "set extensions" operations — BatchEditor.tsx supports rename, move, delete, change type, scale values, and set opacity, but there's no way to bulk-add or bulk-edit `$description` or `$extensions` across selected tokens; power users managing hundreds of tokens need batch description editing for documentation compliance
- [x] ExportPanel has no "copy to clipboard" option — the export flow (ExportPanel.tsx) generates files for download as a ZIP but offers no way to copy the generated CSS/SCSS/JSON output directly to clipboard; for quick integration tasks users want to copy a single platform's output without downloading and extracting a ZIP
- [~] Theme dimension option management requires too many clicks — adding a new option to a theme dimension and assigning sets has no bulk assignment UI; adding a new theme variant to a design system with many sets requires individual clicks per set; add a "Copy assignments from existing option" action or a batch set-assignment modal
- [~] [HIGH] UI hooks have pervasive stale-closure and effect-ordering bugs across 6+ hooks — usePinnedTokens persist effect writes old set's pin list to the new set's localStorage key on setName change (corrupts data), useGeneratorPreview leaves previewLoading stuck true on early exit, useSetMergeSplit mergeLoading never resets when the stale-check guard returns inside try (bypasses finally), useGitStatus gitLoading stays true forever when the last fetch is aborted, useTokenSyncBase applyDiff closes over stale rows/dirs state instead of using refs, and useNearbyTokenMatch uses stale allTokensFlat in its debounced callback so new tokens are invisible
- [x] [HIGH] Core resolver formula evaluation permanently loses units — a dimension formula like "{spacing.base} * 2" resolves to the bare number 16 instead of {value: 16, unit: 'px'} because evalExpr returns a plain number and resolveValue does not reconstruct the typed value object; all downstream consumers expecting a DimensionValue or DurationValue from formula tokens get a number and break silently
- [~] AnalyticsPanel token type distribution chart is text-only — the analytics panel shows token counts by type as plain text rows; a small horizontal bar chart would make relative proportions immediately visible and help identify over/under-represented token types at a glance
- [ ] No token "pinned" or "recently edited" quick-access outside the token list — the pinned tokens feature (usePinnedTokens) and recently-touched tracking (useRecentlyTouched) only surface within the token list panel; there's no way to access pinned or recent tokens from other panels (e.g., while in the Theme Manager or Selection Inspector); add a pinned/recent tokens section to the command palette
- [ ] Generator dry-run diff is not surfaced in the UI before first creation — when creating a new generator, the preview shows generated token values but doesn't show which existing tokens would be overwritten; the server has `POST /api/generators/:id/check-overwrites` and `dry-run` endpoints but neither is called during the initial creation flow in TokenGeneratorDialog; show a "will overwrite N existing tokens" warning before confirming creation
- [ ] Plugin ↔ UI message contract has no type safety and is broken in multiple places — 4+ plugin message types are sent but never handled in the UI (select-next-sibling-result, applied-to-nodes, removed-binding-from-node, canvas-heatmap-progress), the variables-read-error message uses field `message` in variableSync.ts but `error` in the controller catch path causing the UI to show "undefined", and two apply paths (TokenList.handleApplyStyles and useFigmaSync.handleSyncGroup) fire messages without correlationId so failures are silently swallowed; needs a shared typed message schema between plugin and UI
- [ ] Core validateColorModifiers silently drops valid mix operations — the mix branch in color-modifier.ts L33-39 requires an `amount` field that is not part of the ColorModifierOp mix schema and is not used by applyColorModifiers, so a valid {type:'mix', color:'#fff', ratio:0.5} is silently excluded from the output; existing tests mask this by always supplying amount:0
- [ ] Server generator routes reject valid shadowScale type and root-metadata rollback is broken — VALID_GENERATOR_TYPES is duplicated between routes/generators.ts and services/generator-service.ts with the route list missing 'shadowScale', so POST/PUT for shadow scale generators returns 400 even though the service supports them; separately, snapshotGroup in routes/tokens.ts falls back to the sentinel '__root__' when groupPath is empty, which matches no real token paths, making operation log snapshots empty and root metadata updates non-rollbackable
- [ ] Server OperationLog and ManualSnapshotStore have concurrency and atomicity bugs — OperationLog.ensureLoaded has no guard against concurrent first-call races (two requests arriving before the first record() completes both parse the file and the second overwrites the first's append), and ManualSnapshotStore.persist uses plain writeFile instead of the tmp-rename atomic pattern used by OperationLog and DimensionsStore, risking corruption on crash
