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

- [x] Move lint rule configuration from SettingsPanel into the Validation panel (AnalyticsPanel) — SettingsPanel.tsx L503-575 embeds full lint rule toggles, severity selectors, and pattern inputs via LintConfigPanel, but users must navigate to Settings to configure rules then to Ship > Validation to see violations; co-locating rule configuration with violation results in a single panel lets users iterate on rules and see impact immediately
- [x] Find-and-replace has no preview of skipped conflicts and no progress during bulk rename — useFindReplace.ts shows matched tokens but tokens that would conflict with existing paths are silently marked "will be skipped" with no summary count; during execution (`frBusy=true`) there is no progress indicator for large sets; the 30s timeout (L8) triggers a misleading "cancelled" error instead of "timed out"
- [x] Heatmap and consistency scanner results are silently capped with no indication — heatmapScanning.ts caps results at 100 untokenized components (L43), 300 heatmap nodes (L187), and 200 usage layers (L261) via `.slice()` with no UI indication that results were truncated; users with large pages think compliance is higher than it actually is; show "300 of N shown" badges and allow expanding or paginating
- [x] Rename/move token has no impact preview showing affected aliases — `POST /api/tokens/:set/tokens/rename` has `updateAliases` flag but no preview endpoint showing which tokens would be updated; users can't assess the blast radius of a rename before committing; add a preview/dry-run mode that returns the list of aliases that would be rewritten
- [x] Consistency scanner has quadratic time complexity on large pages — consistencyScanner.ts iterates all tokens for each scanned node (O(nodes * tokens)); for a page with 5,000 nodes and 1,000 tokens this causes multi-second hangs; build a reverse index (value -> token path) upfront to reduce to O(nodes * log(tokens))
- [x] No backup/restore for plugin settings — SettingsPanel has 40+ localStorage keys across UI preferences, export config, navigation state, lint rules, and per-set sort/filter; there is no "Export settings" / "Import settings" action to transfer configuration between machines or recover after clearing browser data; add a JSON export/import for user-configurable settings

- [x] [HIGH] BatchEditor undo/redo block references three undefined variables and crashes at runtime — BatchEditor.tsx L357-374: `succeeded` (never declared), `results` (never declared, expects Promise.allSettled output that doesn't exist since L348 uses a single batch API call), and `patchToken` (never imported or defined) are all referenced in the undo/redo code path; any batch edit that triggers this block throws ReferenceError; additionally `onApply()` is called twice (L379 inside the if-block and L381 unconditionally), causing a double refresh; fix by deriving success from the batch API response's `updated` count and using `apiFetch` for individual token patches in undo/redo

- [x] Merge ConsistencyPanel and HeatmapPanel into a single "Binding Audit" panel — both live under Apply as separate sub-tabs, both scan Figma layers for token-related issues (HeatmapPanel checks binding coverage, ConsistencyPanel finds hardcoded values that could be tokens), both have card-based expand/collapse UIs with batch-apply actions; merging them into one panel with a Coverage/Suggestions toggle reduces the Apply tab from 3 sub-tabs to 2 and eliminates the user's mental overhead of understanding two separate scanning concepts
- [x] useDragDrop silently stops on first failure during batch move — useDragDrop.ts L89 `break`s on first error when moving multiple tokens, leaving remaining items unmoved; users see a generic "partial" error toast but aren't told which specific token failed or why, and can't retry just the failed items
- [x] useSetMergeSplit has no conflict revalidation after target change — users can check conflicts (L70-99), then change the target set (L64-68) before confirming, which silently invalidates the conflict analysis; the merge executes against stale `mergeSrcFlat` data captured at check time; add a dirty flag or auto-recheck when target changes
- [x] Bulk token creation table (useTableCreate) loses all work if dialog is closed — the table-create form has no auto-save or recovery; accidentally closing the dialog after entering 20 rows of token data loses everything; persist in-progress table state to sessionStorage and offer recovery on reopen
- [x] useUndo keyboard shortcut fires even when a text input has focus — useUndo.ts L84-94 listens for Ctrl+Z globally on `window`; if a user is typing in the find-replace input or token editor and presses Ctrl+Z, the hook fires the server undo instead of the browser's native text undo; add an `isTyping` guard matching the pattern already used in TokenList.tsx L915
- [x] git-sync.ts `finalizeMerge()` silently swallows commit failure, leaving repo in broken merge state — L256-260: if `git.commit()` throws (e.g., no staged files, hook failure), the error is caught and only `console.warn`'d; the caller and user believe the merge succeeded when the repo is still in an unfinished merge state; this is dangerous because subsequent git operations (pull, push, checkout) will fail with confusing errors; the error should be rethrown so the UI can show the failure and offer abort/retry
- [x] sync.ts has ~130 lines of token-diff-building logic copy-pasted 3 times across commit-diff, push-preview, and pull-preview routes — L186-240 (commit diff), L469-514 (push preview), and L539-583 (pull preview) contain identical flatten→compare→diff code; additionally, all 4 git-sync.ts diff methods (L313, L364, L425, L463) use unsafe `status.charAt(0) as 'A' | 'M' | 'D'` which silently miscategorizes git rename (R), copy (C), and type-change (T) statuses; extract a shared `buildTokenDiff(fileDiffs)` helper and add proper status validation/mapping
- [x] resolver-store.ts write guard starts BEFORE the actual file write, creating a race window for partial reads — L206-207: `_startWriteGuard(filePath)` is called before `fs.writeFile()`, so the 500ms ignore window starts ticking during the write; if the write takes >500ms (large file, slow disk), the guard expires and the file watcher reads a partially-written JSON file, corrupting in-memory state; also, any external edit within the 500ms window after our write (L272-275) is silently dropped; fix by starting the guard after writeFile resolves, or use atomic write (write to .tmp then rename)
- [x] ThemeManager disabled-sets section has inverted collapse/expand logic — ThemeManager.tsx L1567: `{isDisabledCollapsed && disabledSets.map(...)}` renders the disabled sets when the section is collapsed and hides them when expanded; the chevron rotation (L1564) correctly reflects collapsed state but the content visibility check is backwards; should be `{!isDisabledCollapsed && disabledSets.map(...)}`

- [x] "Generated by X" badge on derived tokens in TokenList is not clickable — clicking the badge should navigate to the generator in the Generators sub-tab, but it is a static label; the generator name is already stored in `$extensions.tokenmanager.generatedBy`; wire it to `navigateTo('define', 'generators')` with the generator pre-selected, making the relationship actionable instead of decorative (TokenTreeNode.tsx ~L1623)
- [x] TokenEditor silently discards edits when closed without saving — pressing Escape or clicking outside the editor panel loses all in-progress changes with no confirmation prompt; add an "unsaved changes" guard that either auto-saves (preferred) or prompts "Save changes?" before closing, matching the standard expectation for form editors (TokenEditor.tsx ~L1300, no dirty-state check on close)
- [x] BatchEditor shows no indication of which tokens were skipped for type-incompatible operations — when applying opacity scaling or numeric transforms to a mixed selection containing non-numeric types, incompatible tokens are silently skipped; the success toast only shows "N tokens updated" with no mention of skipped tokens; add a secondary count "M tokens skipped (incompatible type)" to the result toast so users know their selection wasn't fully applied (BatchEditor.tsx ~L82-89)
- [~] PublishPanel has no dry-run mode before syncing — clicking "Sync Variables", "Publish Styles", or "Commit to Git" executes immediately with no preview of what will change; given that a sync can create, update, and delete hundreds of variables, this is a high-stakes one-click operation; add a "Preview" step that shows a diff of what will be created/updated/deleted before the user confirms (PublishPanel.tsx)
- [x] PublishPanel diff filter text resets when switching sections — if a user types a filter string in the Variables diff view, then clicks "Styles" or "Git" and returns, the filter is cleared; since all three sections share the same token namespace, the filter should persist across section switches (PublishPanel.tsx ~L63, `diffFilter` is unkeyed local state)
- [x] HistoryPanel token path filter fires API requests on every keystroke without debounce — typing "color.brand" into the filter field triggers a separate server fetch for each character; should debounce 300ms before querying, matching the pattern used by the token search in TokenList (HistoryPanel.tsx ~L267-270)
- [~] HistoryPanel restore gives no preview and no progress feedback — clicking "Restore" on a commit begins a two-step server operation (fetch diffs, apply snapshot) with no indication of what tokens will be overwritten or how many; add a confirmation dialog showing the count of tokens that will be changed/reverted before executing, and show a progress indicator during the restore (HistoryPanel.tsx ~L330-362)
- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [~] GraphPanel has no inline output preview before saving a generator — creating a generator requires configuring it, saving, then navigating to TokenList or TokenFlowPanel to see the output; this breaks the authoring feedback loop; add a live "Preview output" section within GraphPanel that renders the first N generated tokens in real time as parameters change, before the generator is saved (GraphPanel.tsx ~L400 lines, no preview section)
- [~] ThemeManager coverage gap view is a raw token list with no visual status hierarchy — the "Missing coverage" section shows uncovered tokens as a flat indented list with no color coding or severity grouping; for a theme with 50 uncovered tokens the list is overwhelming; add green/yellow/red status chips per token (analogous to HeatmapPanel's coverage indicators) and a "Fill with source set" batch action that auto-creates override entries for all gaps in one click (ThemeManager.tsx ~L88-92)
- [~] No "Copy resolved value" action on token detail — TokenDetailPreview copies the token path to clipboard, but there is no way to copy the resolved value (e.g. `#FF5733`) without manually reading it from the preview swatch; add a copy-value button alongside the existing copy-path button, especially useful for tokens with deeply-nested alias chains where the resolved value is not immediately obvious (TokenTreeNode.tsx, TokenEditor preview area)
- [~] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)
- [~] No keyboard shortcut to quickly duplicate a selected token — duplicating a token requires: right-click → "More" submenu (if it exists) or manual create with the same type, then re-enter all fields; a `Cmd+D` shortcut on a selected token row that creates a copy with the name suffixed "-copy" and opens it for renaming would match standard tool behavior and save several clicks for tasks like creating a dark-mode variant of an existing token (TokenTreeNode.tsx context menu, useTokenTree keyboard handler)

- [ ] Command palette token search shows no color swatch or value preview — searching tokens via `>` in the command palette (⌘K) shows a type badge and path but no visual preview; color tokens should show a small colored dot, dimension tokens should show the resolved value inline, so users can visually distinguish `color.brand.primary` from `color.brand.secondary` without navigating to each one (CommandPalette.tsx ~L353-370)
- [ ] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)
- [ ] Theme dimension set-status labels are confusing non-standard terminology — ThemeManager uses "Foundation"/"Override"/"Not included" as labels for set states (STATE_LABELS at ThemeManager.tsx:10-14) which don't match the API terms (source/enabled/disabled) or standard DTCG terminology; users must read the tooltip to understand the stacking model; rename to clearer terms like "Base"/"Override"/"Excluded" or add visible inline help explaining the layer priority
- [ ] Token creation form doesn't remember last-used group — creating multiple tokens in the same group (e.g., adding `color.brand.secondary` after `color.brand.primary`) requires re-selecting the group each time; the create form should default to the group of the previously created token when using "Save & New" (⇧↵) to reduce repetitive input
- [ ] Git commit flow has no token-level diff preview — SyncPanel shows file-level changes for git commit but doesn't show which individual tokens changed within those .tokens.json files; users must mentally diff nested JSON to understand what they're committing; showing a token-level added/changed/removed summary per file would match the quality of the variable sync diff UI
- [ ] No "navigate to group" from command palette — the command palette token search (`>`) only navigates to individual tokens; power users with deeply nested hierarchies want to jump directly to a group path like `color.brand` and have the tree expand and scroll to that group; add a `group:` qualifier or auto-detect group paths (CommandPalette.tsx token search mode)
- [ ] Keyboard-driven multi-select doesn't support Shift+Arrow range selection — pressing 'M' enters multi-select mode but extending the selection requires mouse clicks; Shift+Up/Down from the focused row should extend/shrink the selection range, matching standard tree-view keyboard interaction patterns (TokenList.tsx keyboard handler)
- [ ] Server API response shapes are inconsistent across mutation endpoints — some routes return `{ ok: true }`, others `{ created: true, name }`, others `{ dimension }`, and batch routes return `{ updated, operationId }`; this prevents the client from using a single response handler and makes error detection inconsistent; standardize on a consistent envelope shape across all mutation endpoints (packages/server/src/routes/*.ts)
- [ ] Token creation form has no per-type value format hints — the value input shows a generic placeholder but doesn't explain what format each type expects; entering a border value, typography object, or shadow array requires prior knowledge of the DTCG spec; add a small "expected format" hint or example below the value input that changes based on the selected type (TokenList.tsx create form ~L3620-3651)
- [ ] No way to reorder tokens within a group from the keyboard — tokens can be reordered via drag-and-drop but there's no Alt+Up/Alt+Down keyboard shortcut to move a selected token up or down within its group; this is a standard accessibility and power-user expectation for ordered lists (TokenTreeNode.tsx, TokenList.tsx keyboard handler)
