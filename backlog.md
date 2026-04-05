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

- [x] No way to duplicate a theme dimension with all its options — ThemeManager.tsx supports creating and deleting dimensions but has no "Duplicate dimension" action; for design systems with similar theme axes (e.g. duplicating a "brand" dimension to create "sub-brand" with the same option structure), users must manually recreate every option and reassign every set; a duplicate action that copies the dimension structure and set assignments (with a name suffix) would save significant manual work
- [x] Generator editor has no "preview diff" before regenerating — TokenGeneratorDialog.tsx applies generator changes immediately on save; for generators that produce dozens of tokens (e.g. an 11-step color ramp), there's no way to see what will change before committing; adding a "Preview changes" step that shows a diff of current vs. proposed token values would prevent accidental overwrites and give users confidence to experiment with generator settings
- [x] Bulk create tab only supports a flat text-area format — CreatePanel.tsx BulkTab accepts a path:value text format but doesn't support pasting a DTCG JSON group structure, which is the most common format users would copy from another tool or documentation; the bulk tab should detect and parse nested DTCG JSON input in addition to the flat format
- [x] [HIGH] Server does not validate token $value on create or update — tokens.ts POST/PATCH routes check that $value is not undefined but accept any value regardless of the declared $type; a color token can be saved with value `[1, 2, 3]`, a dimension token can be saved with value `true`, and alias references are not checked for circular dependencies until resolve time; add type-aware validation on write that rejects structurally invalid values and checks alias targets exist
- [x] PanelRouter.tsx props interface has 80+ props — PanelRouterProps (lines 57-191) is a 135-line interface passing 80+ individual props from App.tsx; despite the context providers (Connection, TokenData, Theme, Inspect), the remaining App-local state still creates a massive prop surface; extracting NavigationContext (activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel) and EditorContext (editingToken, previewingToken, highlightedToken, and their setters) would cut the prop count roughly in half

- [x] Inconsistent modal accessibility across dialogs — ConfirmModal, KeyboardShortcutsModal, CommandPalette, and PublishModals all use useFocusTrap, Escape-to-close, and full ARIA attributes (role="dialog", aria-modal, aria-labelledby), but TokenGeneratorDialog (the 3-step generator stepper) has none of these: no Escape handler, no backdrop click-to-close, no focus trap, no role="dialog"; PublishPanel's 4 inline preview/confirm modals have Escape and backdrop handlers but no focus trap; TokenEditor's internal "Save changes?" confirm dialog has role="dialog" but no Escape handler or focus trap; TokenListModals rename/delete/extract modals have role="dialog" but no useFocusTrap — the accessibility level a user gets depends entirely on which dialog they happen to open (violates: consistency, accessibility)
- [x] TokenList search input has no clear button and no Escape-to-clear — the search input (TokenList.tsx:2588-2615) has no "✕" clear affordance despite ThemeManager's dimension search having one (ThemeManager.tsx:698-710); the onKeyDown handler only navigates autocomplete hints (ArrowDown/ArrowUp/Tab/Enter) and does not handle Escape; users must manually select-all and delete to clear a query, or find the "Clear filters" button in the no-results empty state, which is invisible when results exist; this contrasts with every other search input in the plugin that either has a clear button or Escape support (violates: consistency, user control and freedom)
- [x] Token editor form validation feedback is inconsistent across token types — simple types (color, dimension, number) show inline validation with red borders and error text; the Find & Replace modal shows regex errors immediately and uses colored banners for warnings; but the New Group dialog (TokenListModals.tsx:395-435) only shows errors after submission; Extract to Alias path validation shows errors inline but with different styling than the group dialog; Typography editor shows unavailable font weight warnings in the sub-field but no field-level error state; dimension unit conversion warnings use a different display pattern (inline text vs banner vs border); there is no single shared validation feedback component — each form invents its own error display approach (violates: consistency, error prevention)
- [x] Export panel presents too many filter options simultaneously without progressive disclosure — the Platforms export mode shows target platform checkboxes, token set checkboxes, token type pill buttons, a path prefix text input, a CSS selector input, and a changes-only toggle all visible at once; for a user who just wants to export CSS for all tokens, the cognitive load of scanning past set filters, type filters, and path prefix is unnecessary; the token type filter has a collapsed "Filter types" toggle but the other filter groups (sets, path prefix, CSS selector) are always expanded with no way to collapse them (violates: aesthetic and minimalist design, progressive disclosure)
- [x] Escape key behavior is inconsistent between search inputs across panels — TokenList search (TokenList.tsx:2598) does not handle Escape at all (only hint navigation); ThemeManager dimension search (ThemeManager.tsx:701) clears the query and blurs on Escape; ThemeManager preview token search has no Escape handler; ThemeManager missing-override filter has no Escape handler; a user who learns Escape-to-clear in one panel will be confused when it doesn't work in another (violates: consistency, user control and freedom)
- [x] Generator config editors have no undo affordance for individual field changes — while the generator dialog stepper (StepWhat) has undo/redo buttons for config snapshots, individual form fields within generator config editors (ColorRampGenerator bezier points, SpacingScaleGenerator step multipliers, TypeScaleConfigEditor ratio/base values) support no Ctrl+Z undo beyond native browser input undo; if a user accidentally drags a bezier control point or changes a ratio value, the only recovery is the snapshot-level undo which may roll back multiple changes at once; this is especially problematic for the interactive bezier curve editor where precise adjustments are easily lost (violates: user control and freedom, error recovery)

- [x] ImportPanelContext is a 1,265-line monolith with 44 useState hooks, 36 useCallbacks, and 12 direct apiFetch calls — extract into domain-specific hooks (useImportFileRead, useImportPreview, useImportApply, useImportDTCG) following the same pattern used to decompose TokenList's state into useTokenCrud/useSetTabs/etc.; every state change in any import sub-feature currently re-renders the entire import panel and all its children
- [x] Token store file watcher fires scheduleRebuild unconditionally after loadSet fails — in token-store.ts lines 262-269 and 276-283, the catch block on loadSet logs the error and emits a file-load-error event, but scheduleRebuild still runs immediately after, broadcasting a set-updated/set-added SSE event that triggers full client-side token refreshes with potentially stale or missing data; the rebuild call should be skipped (or a degraded-mode event emitted) when loadSet fails
- [x] Token rename recovery in token-store.ts deletes the pending-rename marker even when applyThemesRename fails (lines 127-130) — if themes.json is unwritable or corrupted, the .catch swallows the error, fs.unlink removes the marker, and the next server restart will not retry the themes update, leaving the rename permanently half-finished with the file renamed but theme references pointing at the old name
- [x] useGitStatus nested try-catch structure makes the outer error handler unreachable — in useGitStatus.ts lines 66-83, both the status fetch (line 70) and branch fetch (line 77) have inner catch blocks that swallow all errors including non-AbortError network failures; the outer catch at line 80-82 that would call setGitError is dead code; branch fetch failures silently produce an empty branch list with no UI feedback, and a total network failure silently sets isRepo:false instead of showing an error state
- [x] Plugin sandbox revert-variables and revert-styles handlers accept snapshot data with `as any` casts and no runtime validation — controller.ts lines 213 and 224 pass msg.varSnapshot and msg.styleSnapshot directly to revertVariables/revertStyles without checking the shape of records, createdIds, or mode values; a malformed snapshot (from a stale UI version or corrupted postMessage) would crash the plugin sandbox with an uncaught TypeError deep in the Figma API calls, with no error message sent back to the UI
- [x] ExportPanel.tsx independently fetches /api/sets in 3 separate locations (lines 260, 536, 611) instead of receiving set data from TokenDataContext which already maintains the set list — the component also has its own stale set-list state that can diverge from the canonical list after set creation/deletion/rename operations performed in other panels
- [x] Merge Resolver panel into ThemeManager — ResolverPanel.tsx (889 lines) and ThemeManager.tsx (1,741 lines) both manage theme-like behavior with overlapping concepts; resolvers are DTCG v2025.10 modifiers that serve the same user goal as theme dimensions; having them as a separate sub-tab forces users to learn two mental models ("themes" vs "resolvers") and the `convertFromThemes` migration button confirms they're the same concept at different abstraction levels; fold resolver editing into ThemeManager as a "DTCG Resolver" section within each dimension, eliminating the separate sub-tab and reducing the Define tab from 4 sub-tabs to 3
- [x] Add inline token value editing on double-click in the token tree — TokenList.tsx requires opening the full TokenEditor modal to change any value; for simple edits (changing a color hex, adjusting a dimension, toggling a boolean), this is excessive friction; double-clicking a token value cell should open a compact inline editor (type-appropriate: color picker for colors, number input for dimensions, text for strings) that saves on Enter/blur and cancels on Escape
- [x] Expose token operations in the command palette — CommandPalette.tsx (814 lines) supports navigation and panel commands but cannot perform token-level operations like rename, duplicate, delete, move-to-group, or extract-to-alias; power users managing hundreds of tokens should be able to hit Cmd+K, type "rename color.brand.500", and start renaming without first finding the token in the tree and right-clicking
- [x] Unify the three undo/redo systems into a single timeline — users must understand local undo (Cmd+Z, client-side), server operation log (History panel > Recent Operations), and Git commits (History panel > Git) as three separate undo mechanisms with different scopes and behaviors; merge these into a single chronological "Activity" timeline where each entry shows what changed, and one-click rollback works regardless of whether the change was local, server-side, or committed to Git
- [x] Add a "Publish All" fast path that skips per-target confirmation — PublishPanel.tsx (2,070 lines) requires users to separately compare and confirm Figma Variables, Figma Styles, and Git in sequence; for the common case of "push everything local to Figma", add a single "Publish All" button that shows one combined diff summary and applies all three targets in one confirmation step
- [x] Add Cmd+A select-all shortcut in token list — multi-select mode (toggled with M key) supports batch operations but has no select-all keyboard shortcut; users must click "Select All" in the toolbar or manually shift-click ranges; Cmd+A should select all visible tokens (respecting active search/filter) when multi-select mode is active, and toggle multi-select mode on if it's off
- [x] Add "create another" action in CreatePanel — CreatePanel.tsx Single tab clears the form after creating a token but doesn't auto-focus back to the path input; TokenEditor has "Save & Create Another" (Cmd+Shift+Enter) but CreatePanel doesn't; after creating a token, the path field should auto-focus with the parent group path pre-filled so the user can immediately type the next sibling token name
- [x] Add a "copy as alias reference" action for tokens — users frequently need to copy the alias reference syntax (`{path.to.token}`) to paste into another token's value; the existing copy shortcuts only offer JSON (Cmd+C) and CSS variable (Cmd+Shift+C) formats; add a third copy format that produces the DTCG alias string, accessible via right-click context menu and a keyboard shortcut
- [x] ConsistencyPanel snap-to-token has no bulk action — each consistency finding must be individually expanded and snapped one at a time; when an audit finds 30 unsnapped colors, users must click 30 times; add a "Snap all N suggestions" bulk action with a confirmation showing the count and a grouped preview of changes, and a "Snap all in category" action per type group (colors, dimensions, typography)
- [x] Stale generator indicators are not prominent enough — generators have an `isStale` flag when source tokens change but the UI only shows this in the generator list as a subtle indicator; add a persistent banner or badge on the Generators sub-tab itself (e.g., "3 generators stale") and an optional notification when tokens that feed a generator are edited, with a one-click "Regenerate stale" action
- [x] Server connection setup is buried in Settings — new users must navigate to Settings (gear icon in overflow panel) to enter the server URL and connect; the Welcome/QuickStart modal exists but is only shown once; if the plugin loads without a server connection, show a prominent inline connection prompt on the main Tokens tab instead of requiring users to find Settings

- [x] Token and group context menus in the token tree have no visible affordance — TokenTreeNode.tsx token rows and group rows expose 12+ actions (rename, duplicate, move to set, copy to set, link to token, detach from generator, compare with, view history, etc.) only via right-click with zero visual hint that a context menu exists; ThemeManager set rows have a ⋮ button and NodeGraphCanvas has a + button with explicit "Right-click or + to add" help text, but the token tree — where users spend most of their time — has no equivalent; group rows are worse: ALL group operations (rename, edit type, move/copy to set, duplicate, set scopes, create variables) are context-menu-only with no toolbar or hover button alternative (violates: visibility, discoverability, consistency)
- [x] Clipboard copy from context menu gives no visual feedback — TokenTreeNode.tsx inline hover buttons (handleCopyPath line 947, handleCopyValue line 953) show a brief checkmark via `copiedWhat` state with a 1500ms timeout, but clipboard copies triggered from the context menu (lines 1906, 1941, 1960) call `navigator.clipboard.writeText()` then immediately close the menu with no "Copied!" indicator, no toast, and failures are silently logged to console; the user clicks a copy button, the menu vanishes, and there is no confirmation the copy succeeded — this is inconsistent even within the same component (violates: visibility of system status, consistency)
- [x] CreatePanel Single tab has no keyboard shortcut to submit — TokenEditor supports Cmd+S, Cmd+Enter, and Cmd+Shift+Enter (useTokenEditorSave.ts lines 165-191) for save operations, but CreatePanel.tsx has no keydown listener at all; the "Create Token" button (line 511) is click-only; users creating multiple tokens in sequence must mouse to the button each time; this is the most friction-heavy gap between the two token-authoring surfaces in the app (violates: consistency, efficiency of use)
- [x] CreatePanel and TokenEditor diverge significantly for the same task — both surfaces create tokens but offer different capability levels: TokenEditor has draft auto-save to sessionStorage (line 843), conflict detection against server state (useTokenEditorSave.ts lines 92-104), circular alias detection, a `saveBlockReason` system with contextual disabled-button text, and a rich "Extends" picker for composite types; CreatePanel has none of these — it shows a simple amber "Token already exists — will overwrite" warning (line 350) with no conflict detection, no draft recovery if the user accidentally closes, no block reason feedback on the button, and no extends support; a user who learns to rely on draft recovery in the editor will lose work when the CreatePanel is closed accidentally (violates: consistency, error prevention)
- [x] Publish readiness checks require manual re-triggering after fixing issues — PublishPanel.tsx readiness gate (lines 466-586) shows blocking and warning checks but the "Check readiness" button must be clicked again after the user fixes an issue to verify the fix; there is no auto-recheck when the user returns to the Publish tab or when token data changes; a user who fixes an alias issue in the token editor, switches back to Publish, and sees the stale "1 required issue" banner must remember to click "Re-check" — the stale state creates false anxiety about whether the fix worked (violates: visibility of system status, recognition over recall)
- [x] Settings changes are immediate with no per-section reset or undo — SettingsPanel.tsx auto-saves every setting to localStorage on change (e.g., line 398 `lsSet(STORAGE_KEYS.DENSITY, d)`) with no confirmation and no way to revert individual changes; if a user accidentally changes the contrast background color or export CSS selector, there is no "Reset to default" button per setting and no undo; the only recovery is the nuclear "Clear All Data" in the danger zone (line 843) or manually re-entering the previous value; the import/export backup feature exists but is designed for full-profile transfer, not quick undo of accidental changes (violates: user control and freedom, error recovery)

- [x] useTokenCrud.ts (657 lines) has near-identical move and copy flows — moveConflictAction/copyConflictAction, moveConflictNewPath/copyConflictNewPath, handleRequestMoveToken/handleRequestCopyToken, handleConfirmMoveToken/handleConfirmCopyToken are duplicated with only the API verb differing; consolidate into a single `useTokenRelocate(mode: 'move' | 'copy')` parameterized flow to halve the state and callbacks, then split the remaining rename/delete/duplicate/inline-save operations into focused hooks (useTokenRename, useTokenDelete, useTokenDuplicate) to bring useTokenCrud under 200 lines
- [x] `Record<string, any>` is used as the de-facto token type across 30+ call sites in UI hooks — `useTokens.ts` fetches `{ tokens: Record<string, any> }`, `useSetMergeSplit.ts` flattens into `Record<string, any>`, `useGeneratorPreview.ts` stores existing tokens as `Record<string, any>`, `useTokenEditorFields.ts` types modeValues as `Record<string, any>`, and `history/types.ts` casts `SnapshotDiff.before`/`after` through `as any` despite the interface already having `$type`/`$value` — define a proper `DTCGTokenRecord` type (or reuse `DTCGToken` from core) for API response typing and propagate it through hooks to eliminate the `as any` casts and catch type errors at compile time
- [x] Generator routes in generators.ts are missing explicit 404 checks before mutations — `POST /generators/:id/run` (line 695) uses `gen?.targetSet ?? ''` optional chaining instead of an early 404 return, causing empty snapshot captures and a misleading operation log entry when the generator doesn't exist; the same pattern appears in `PUT /generators/:id/steps/:stepName/override` (line 738) and `DELETE /generators/:id/steps/:stepName/override` (line 757); all three should add the explicit `if (!gen) return reply.status(404)` guard already used by GET/PUT/DELETE at lines 523, 545, 629
- [x] TokenList filter setters duplicate the same scroll-anchor computation 3 times — `setSearchQuery` (line 283), `setTypeFilter` (line 294), and `setRefFilter` (line 305) each contain an identical 5-line block that finds the first visible item index from virtualScrollTopRef/flatItemsRef/itemOffsetsRef and saves it to scrollAnchorPathRef; extract a `saveScrollAnchor()` helper and call it from each setter
- [~] Plugin sandbox revert handlers bypass type safety with `as any` casts and no runtime shape validation — controller.ts lines 213 and 224 pass `msg.varSnapshot as any` and `msg.styleSnapshot as any` to `revertVariables`/`revertStyles`; if the UI sends a malformed or stale snapshot (missing `records`, `createdIds`, or `modeMap` fields), the plugin crashes with an uncaught TypeError deep in Figma API calls with no error sent back to the UI; add typed interfaces for the snapshot shapes and validate the incoming message before passing to revert functions

- [ ] Token tree has no keyboard arrow-key navigation — TokenTreeNode.tsx rows have no onKeyDown handler for ArrowUp/ArrowDown traversal; keyboard-only users cannot navigate the token list without Tab-cycling through every interactive element in each row; implement roving tabindex with ArrowUp/ArrowDown to move between rows and ArrowLeft/ArrowRight to collapse/expand groups
- [ ] Batch editor has no preview of which tokens will be affected before applying — BatchEditor.tsx applies transforms (numeric, color, find-replace) to the selection and only shows "N tokens skipped" after the fact; add a pre-apply preview showing each token's current value and proposed new value so users can verify before committing
- [ ] Generator edit reopens full 3-step dialog for minor tweaks — clicking edit on a GeneratorPipelineCard opens the complete Where/What/Review stepper even when the user just wants to adjust a single config value (e.g. a color stop or ratio); add an "Edit config" shortcut that opens directly to Step 2 (What) with the existing config pre-loaded, skipping target selection
- [ ] Command palette qualifier autocomplete is static — CommandPalette.tsx shows qualifier chip buttons (type:, has:, value:, etc.) but typing a qualifier like "type:" doesn't offer completions for available values (e.g. "color", "dimension"); add dynamic suggestions after the colon that enumerate actual values from the current token data
- [ ] No batch delete endpoint on server — tokens.ts supports batch-move, batch-copy, batch-rename, batch-update but has no batch-delete route; clients must loop individual DELETE requests; add POST /api/tokens/:set/batch-delete accepting an array of paths
- [ ] Import preview has no side-by-side diff for conflicts — ImportPanelContext handles conflicts with a per-token cycle-through (skip/overwrite/rename) but never shows the existing token value alongside the incoming value; add a two-column diff view so users can compare current vs imported values before choosing a resolution strategy
- [ ] CSS and Tailwind imports silently skip dynamic values — ImportPanelContext processes CSS custom properties and Tailwind configs but expressions like calc(), var() compositions, and JS functions are silently dropped with no feedback; log skipped entries and show a "N values skipped (unsupported)" summary with the list of skipped property names
- [ ] PanelHelpHint is missing from several complex panels — PublishPanel, ExportPanel, BatchEditor, and ConsistencyPanel have no contextual help hint; these panels have non-obvious workflows (readiness gates, export platform options, batch transform modes, snap-to-token) that would benefit from the same dismissible help banner pattern used in GraphPanel and ThemeManager
- [ ] No "recent tokens" or "frequently edited" quick access — users managing hundreds of tokens must search or scroll to find tokens they edit repeatedly; add a "Recent" section at the top of the token list or a "Recent tokens" command palette category that tracks the last 10-15 edited tokens with one-click navigation
- [ ] Resolver store load errors are not exposed to the UI — resolver-store.ts tracks loadErrors internally but no API endpoint exposes them; when a resolver JSON file has syntax errors or invalid structure, the UI shows no indication that a resolver failed to load; add errors to the GET /api/resolvers response and surface them as warnings in the ThemeManager resolver section
- [ ] Search input behavior is fragmented across three systems — in-tree search (TokenList "/" key), command palette (Cmd+K with ">" prefix), and set switcher each have different fuzzy matching algorithms, different qualifier support, and different keyboard behaviors; consolidate the search UX so the command palette serves as the single advanced search surface and in-tree search delegates to it for structured queries
