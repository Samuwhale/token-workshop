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

- [x] [HIGH] UI hooks have pervasive stale-closure and effect-ordering bugs across 6+ hooks — usePinnedTokens persist effect writes old set's pin list to the new set's localStorage key on setName change (corrupts data), useGeneratorPreview leaves previewLoading stuck true on early exit, useSetMergeSplit mergeLoading never resets when the stale-check guard returns inside try (bypasses finally), useGitStatus gitLoading stays true forever when the last fetch is aborted, useTokenSyncBase applyDiff closes over stale rows/dirs state instead of using refs, and useNearbyTokenMatch uses stale allTokensFlat in its debounced callback so new tokens are invisible
- [x] No token "pinned" or "recently edited" quick-access outside the token list — the pinned tokens feature (usePinnedTokens) and recently-touched tracking (useRecentlyTouched) only surface within the token list panel; there's no way to access pinned or recent tokens from other panels (e.g., while in the Theme Manager or Selection Inspector); add a pinned/recent tokens section to the command palette
- [x] Generator dry-run diff is not surfaced in the UI before first creation — when creating a new generator, the preview shows generated token values but doesn't show which existing tokens would be overwritten; the server has `POST /api/generators/:id/check-overwrites` and `dry-run` endpoints but neither is called during the initial creation flow in TokenGeneratorDialog; show a "will overwrite N existing tokens" warning before confirming creation
- [x] Plugin ↔ UI message contract has no type safety and is broken in multiple places — 4+ plugin message types are sent but never handled in the UI (select-next-sibling-result, applied-to-nodes, removed-binding-from-node, canvas-heatmap-progress), the variables-read-error message uses field `message` in variableSync.ts but `error` in the controller catch path causing the UI to show "undefined", and two apply paths (TokenList.handleApplyStyles and useFigmaSync.handleSyncGroup) fire messages without correlationId so failures are silently swallowed; needs a shared typed message schema between plugin and UI
- [x] Core validateColorModifiers silently drops valid mix operations — the mix branch in color-modifier.ts L33-39 requires an `amount` field that is not part of the ColorModifierOp mix schema and is not used by applyColorModifiers, so a valid {type:'mix', color:'#fff', ratio:0.5} is silently excluded from the output; existing tests mask this by always supplying amount:0
- [x] Server generator routes reject valid shadowScale type and root-metadata rollback is broken — VALID_GENERATOR_TYPES is duplicated between routes/generators.ts and services/generator-service.ts with the route list missing 'shadowScale', so POST/PUT for shadow scale generators returns 400 even though the service supports them; separately, snapshotGroup in routes/tokens.ts falls back to the sentinel '__root__' when groupPath is empty, which matches no real token paths, making operation log snapshots empty and root metadata updates non-rollbackable
- [x] Server OperationLog and ManualSnapshotStore have concurrency and atomicity bugs — OperationLog.ensureLoaded has no guard against concurrent first-call races (two requests arriving before the first record() completes both parse the file and the second overwrites the first's append), and ManualSnapshotStore.persist uses plain writeFile instead of the tmp-rename atomic pattern used by OperationLog and DimensionsStore, risking corruption on crash

- [~] No PluginResponse discriminated union for controller→UI messages — shared/types.ts defines PluginMessage (UI→controller, 35 types) but has no corresponding outbound type; at least 6 response types (applied-to-nodes, search-layers-result, peers-for-property-result, removed-binding-from-node, select-next-sibling-result, scan-token-usage-result) are posted from controller.ts/selectionHandling.ts/heatmapScanning.ts without type declarations, making it impossible for UI code to type-guard responses
- [x] Non-atomic file writes in lint.ts, manual-snapshot.ts, style-dict.ts, and git-sync.ts — these services use direct `fs.writeFile()` without the tmp+rename pattern used by token-store, resolver-store, generator-service, operation-log, and themes route; lint.ts:80 and manual-snapshot.ts:66 write JSON config that chokidar watchers could see as partial content; style-dict.ts:232,238 writes export files that could be corrupted on crash; git-sync.ts:276 writes resolved merge output directly
- [x] Generator service does not clear generatorErrors on delete (generator-service.ts:166-171) — when a generator is deleted, `this.generatorErrors` is never cleared for that ID; if a new generator is later created with the same ID, stale error state leaks through; also when a generator in a dependency chain fails (line 468-473), downstream generators still execute against stale output instead of being skipped
- [~] 16 eslint-disable-next-line react-hooks/exhaustive-deps suppressions across UI hooks and components — useTokens.ts:119, useWindowExpand.ts:19, useTokenNavigation.ts:27, useNearbyTokenMatch.ts:130, PublishPanel.tsx:1121/1298/1734, HistoryPanel.tsx:746/1254, SetSwitcher.tsx:40, SelectionInspector.tsx:270/298/562, PublishModals.tsx:186/360, PublishShared.tsx:124; each suppression hides a potential stale-closure bug and should be audited — either fix the deps array or document why suppression is safe with a comment
- [x] useTokenDataLoading triggers redundant flat-token fetches on every tree change — the hook accepts `tokens` (the tree object from useTokens) as a dependency (line 47) which changes on every token mutation, but useTokens already fetches and rebuilds the tree; this causes a double-fetch (once for tree in useTokens, once for flat in useTokenDataLoading) on every change; should instead react to a lightweight change counter or SSE event rather than the full tree reference

- [x] ExportPanel conflates "export to platforms" with "import from Figma Variables" in one tab — Mode B (Figma Variables) reads from Figma and saves to the server, which is an import not an export; rename it "Import from Figma" or move it to its own sub-tab to eliminate the mental model collision (ExportPanel.tsx ~L573-599 mode toggle)
- [~] GeneratorPipelineCard in GraphPanel has no Edit button — users can rerun, preview, duplicate, and delete generators from the pipeline list view, but editing requires navigating to TokenEditor → Derived Groups; add an Edit action to GeneratorPipelineCard that opens TokenGeneratorDialog with the existing generator (GraphPanel.tsx ~L1015-1227)
- [ ] PublishPanel "Publish All" is blocked by Git merge conflicts even when Variables and Styles diffs are ready — Git VCS state should not gate unrelated Figma sync operations; either allow partial publish (Variables + Styles only) or surface a clear "resolve conflicts first" action rather than silently disabling the button (PublishPanel.tsx ~L128-130)
- [ ] No unified set management — set creation, deletion, rename, reorder, and duplication are scattered across TokenList context menus, SetSwitcher (read-only), and ThemeManager set assignment; a dedicated "Manage Sets" panel or enhanced SetSwitcher with CRUD actions would reduce the scavenger hunt (SetSwitcher.tsx, TokenList.tsx, ThemeManager.tsx)
- [ ] HistoryPanel fetches only the last 50 Git commits with no pagination or search — users with active repos quickly exceed this limit and lose visibility into older changes; add "Load more" pagination and a commit message search filter (HistoryPanel.tsx ~L209, ~L542-570)
- [ ] Validation issues in AnalyticsPanel only offer "Go →" navigation with no quick-fix actions — for rules like require-description, max-alias-depth, and no-duplicate-values the fix is mechanical and could be applied inline (e.g., "Add empty description", "Flatten alias to direct target", "Convert to alias of canonical token"); adding one-click fix buttons would turn the validation panel from diagnostic to actionable (AnalyticsPanel.tsx ~L784-795)
- [ ] ThemeManager coverage gap auto-fill buttons are hidden behind hover (opacity-0 group-hover:opacity-100) — the "Fill" action per token and "Fill all gaps" per option are the primary recovery action for coverage gaps but are invisible until the user hovers; make them always visible or use the faint-always-visible pattern (ThemeManager.tsx coverage section ~L2054-2150)
- [ ] No inline token value editing in the token list — changing any token value requires opening the full TokenEditor panel; double-click on a value cell should open a minimal inline editor (text input for simple types, color picker for colors) that saves on blur/Enter, matching the interaction model of spreadsheets and Figma's native variable table (TokenTreeNode.tsx, TokenList.tsx)
- [ ] AnalyticsPanel duplicate color detection requires manually selecting the canonical token per group — the shortest-path or most-referenced token could be auto-suggested as the canonical choice, with a "Use suggestion" bulk action to deduplicate in one click instead of radio-button-per-group (AnalyticsPanel.tsx ~L1073-1199)
- [ ] Color contrast matrix in AnalyticsPanel paginates at 16 tokens per page with no export — for a palette of 50+ colors, users must click through pages to find failing pairs; add a "show failures only" filter toggle and a "Copy as CSV" export for the full matrix (AnalyticsPanel.tsx ~L977-1071)
