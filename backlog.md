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
- [~] [HIGH] Server does not validate token $value on create or update — tokens.ts POST/PATCH routes check that $value is not undefined but accept any value regardless of the declared $type; a color token can be saved with value `[1, 2, 3]`, a dimension token can be saved with value `true`, and alias references are not checked for circular dependencies until resolve time; add type-aware validation on write that rejects structurally invalid values and checks alias targets exist
- [ ] PanelRouter.tsx props interface has 80+ props — PanelRouterProps (lines 57-191) is a 135-line interface passing 80+ individual props from App.tsx; despite the context providers (Connection, TokenData, Theme, Inspect), the remaining App-local state still creates a massive prop surface; extracting NavigationContext (activeTopTab, activeSubTab, overflowPanel, navigateTo, setOverflowPanel) and EditorContext (editingToken, previewingToken, highlightedToken, and their setters) would cut the prop count roughly in half

- [ ] Inconsistent modal accessibility across dialogs — ConfirmModal, KeyboardShortcutsModal, CommandPalette, and PublishModals all use useFocusTrap, Escape-to-close, and full ARIA attributes (role="dialog", aria-modal, aria-labelledby), but TokenGeneratorDialog (the 3-step generator stepper) has none of these: no Escape handler, no backdrop click-to-close, no focus trap, no role="dialog"; PublishPanel's 4 inline preview/confirm modals have Escape and backdrop handlers but no focus trap; TokenEditor's internal "Save changes?" confirm dialog has role="dialog" but no Escape handler or focus trap; TokenListModals rename/delete/extract modals have role="dialog" but no useFocusTrap — the accessibility level a user gets depends entirely on which dialog they happen to open (violates: consistency, accessibility)
- [ ] TokenList search input has no clear button and no Escape-to-clear — the search input (TokenList.tsx:2588-2615) has no "✕" clear affordance despite ThemeManager's dimension search having one (ThemeManager.tsx:698-710); the onKeyDown handler only navigates autocomplete hints (ArrowDown/ArrowUp/Tab/Enter) and does not handle Escape; users must manually select-all and delete to clear a query, or find the "Clear filters" button in the no-results empty state, which is invisible when results exist; this contrasts with every other search input in the plugin that either has a clear button or Escape support (violates: consistency, user control and freedom)
- [ ] Token editor form validation feedback is inconsistent across token types — simple types (color, dimension, number) show inline validation with red borders and error text; the Find & Replace modal shows regex errors immediately and uses colored banners for warnings; but the New Group dialog (TokenListModals.tsx:395-435) only shows errors after submission; Extract to Alias path validation shows errors inline but with different styling than the group dialog; Typography editor shows unavailable font weight warnings in the sub-field but no field-level error state; dimension unit conversion warnings use a different display pattern (inline text vs banner vs border); there is no single shared validation feedback component — each form invents its own error display approach (violates: consistency, error prevention)
- [ ] Export panel presents too many filter options simultaneously without progressive disclosure — the Platforms export mode shows target platform checkboxes, token set checkboxes, token type pill buttons, a path prefix text input, a CSS selector input, and a changes-only toggle all visible at once; for a user who just wants to export CSS for all tokens, the cognitive load of scanning past set filters, type filters, and path prefix is unnecessary; the token type filter has a collapsed "Filter types" toggle but the other filter groups (sets, path prefix, CSS selector) are always expanded with no way to collapse them (violates: aesthetic and minimalist design, progressive disclosure)
- [ ] Escape key behavior is inconsistent between search inputs across panels — TokenList search (TokenList.tsx:2598) does not handle Escape at all (only hint navigation); ThemeManager dimension search (ThemeManager.tsx:701) clears the query and blurs on Escape; ThemeManager preview token search has no Escape handler; ThemeManager missing-override filter has no Escape handler; a user who learns Escape-to-clear in one panel will be confused when it doesn't work in another (violates: consistency, user control and freedom)
- [ ] Generator config editors have no undo affordance for individual field changes — while the generator dialog stepper (StepWhat) has undo/redo buttons for config snapshots, individual form fields within generator config editors (ColorRampGenerator bezier points, SpacingScaleGenerator step multipliers, TypeScaleConfigEditor ratio/base values) support no Ctrl+Z undo beyond native browser input undo; if a user accidentally drags a bezier control point or changes a ratio value, the only recovery is the snapshot-level undo which may roll back multiple changes at once; this is especially problematic for the interactive bezier curve editor where precise adjustments are easily lost (violates: user control and freedom, error recovery)

- [ ] ImportPanelContext is a 1,265-line monolith with 44 useState hooks, 36 useCallbacks, and 12 direct apiFetch calls — extract into domain-specific hooks (useImportFileRead, useImportPreview, useImportApply, useImportDTCG) following the same pattern used to decompose TokenList's state into useTokenCrud/useSetTabs/etc.; every state change in any import sub-feature currently re-renders the entire import panel and all its children
- [ ] Token store file watcher fires scheduleRebuild unconditionally after loadSet fails — in token-store.ts lines 262-269 and 276-283, the catch block on loadSet logs the error and emits a file-load-error event, but scheduleRebuild still runs immediately after, broadcasting a set-updated/set-added SSE event that triggers full client-side token refreshes with potentially stale or missing data; the rebuild call should be skipped (or a degraded-mode event emitted) when loadSet fails
- [ ] Token rename recovery in token-store.ts deletes the pending-rename marker even when applyThemesRename fails (lines 127-130) — if themes.json is unwritable or corrupted, the .catch swallows the error, fs.unlink removes the marker, and the next server restart will not retry the themes update, leaving the rename permanently half-finished with the file renamed but theme references pointing at the old name
- [ ] useGitStatus nested try-catch structure makes the outer error handler unreachable — in useGitStatus.ts lines 66-83, both the status fetch (line 70) and branch fetch (line 77) have inner catch blocks that swallow all errors including non-AbortError network failures; the outer catch at line 80-82 that would call setGitError is dead code; branch fetch failures silently produce an empty branch list with no UI feedback, and a total network failure silently sets isRepo:false instead of showing an error state
- [ ] Plugin sandbox revert-variables and revert-styles handlers accept snapshot data with `as any` casts and no runtime validation — controller.ts lines 213 and 224 pass msg.varSnapshot and msg.styleSnapshot directly to revertVariables/revertStyles without checking the shape of records, createdIds, or mode values; a malformed snapshot (from a stale UI version or corrupted postMessage) would crash the plugin sandbox with an uncaught TypeError deep in the Figma API calls, with no error message sent back to the UI
- [ ] ExportPanel.tsx independently fetches /api/sets in 3 separate locations (lines 260, 536, 611) instead of receiving set data from TokenDataContext which already maintains the set list — the component also has its own stale set-list state that can diverge from the canonical list after set creation/deletion/rename operations performed in other panels
- [ ] Merge Resolver panel into ThemeManager — ResolverPanel.tsx (889 lines) and ThemeManager.tsx (1,741 lines) both manage theme-like behavior with overlapping concepts; resolvers are DTCG v2025.10 modifiers that serve the same user goal as theme dimensions; having them as a separate sub-tab forces users to learn two mental models ("themes" vs "resolvers") and the `convertFromThemes` migration button confirms they're the same concept at different abstraction levels; fold resolver editing into ThemeManager as a "DTCG Resolver" section within each dimension, eliminating the separate sub-tab and reducing the Define tab from 4 sub-tabs to 3
- [ ] Add inline token value editing on double-click in the token tree — TokenList.tsx requires opening the full TokenEditor modal to change any value; for simple edits (changing a color hex, adjusting a dimension, toggling a boolean), this is excessive friction; double-clicking a token value cell should open a compact inline editor (type-appropriate: color picker for colors, number input for dimensions, text for strings) that saves on Enter/blur and cancels on Escape
- [ ] Expose token operations in the command palette — CommandPalette.tsx (814 lines) supports navigation and panel commands but cannot perform token-level operations like rename, duplicate, delete, move-to-group, or extract-to-alias; power users managing hundreds of tokens should be able to hit Cmd+K, type "rename color.brand.500", and start renaming without first finding the token in the tree and right-clicking
- [ ] Unify the three undo/redo systems into a single timeline — users must understand local undo (Cmd+Z, client-side), server operation log (History panel > Recent Operations), and Git commits (History panel > Git) as three separate undo mechanisms with different scopes and behaviors; merge these into a single chronological "Activity" timeline where each entry shows what changed, and one-click rollback works regardless of whether the change was local, server-side, or committed to Git
- [ ] Add a "Publish All" fast path that skips per-target confirmation — PublishPanel.tsx (2,070 lines) requires users to separately compare and confirm Figma Variables, Figma Styles, and Git in sequence; for the common case of "push everything local to Figma", add a single "Publish All" button that shows one combined diff summary and applies all three targets in one confirmation step
- [ ] Add Cmd+A select-all shortcut in token list — multi-select mode (toggled with M key) supports batch operations but has no select-all keyboard shortcut; users must click "Select All" in the toolbar or manually shift-click ranges; Cmd+A should select all visible tokens (respecting active search/filter) when multi-select mode is active, and toggle multi-select mode on if it's off
- [ ] Add "create another" action in CreatePanel — CreatePanel.tsx Single tab clears the form after creating a token but doesn't auto-focus back to the path input; TokenEditor has "Save & Create Another" (Cmd+Shift+Enter) but CreatePanel doesn't; after creating a token, the path field should auto-focus with the parent group path pre-filled so the user can immediately type the next sibling token name
- [ ] Add a "copy as alias reference" action for tokens — users frequently need to copy the alias reference syntax (`{path.to.token}`) to paste into another token's value; the existing copy shortcuts only offer JSON (Cmd+C) and CSS variable (Cmd+Shift+C) formats; add a third copy format that produces the DTCG alias string, accessible via right-click context menu and a keyboard shortcut
- [ ] ConsistencyPanel snap-to-token has no bulk action — each consistency finding must be individually expanded and snapped one at a time; when an audit finds 30 unsnapped colors, users must click 30 times; add a "Snap all N suggestions" bulk action with a confirmation showing the count and a grouped preview of changes, and a "Snap all in category" action per type group (colors, dimensions, typography)
- [ ] Stale generator indicators are not prominent enough — generators have an `isStale` flag when source tokens change but the UI only shows this in the generator list as a subtle indicator; add a persistent banner or badge on the Generators sub-tab itself (e.g., "3 generators stale") and an optional notification when tokens that feed a generator are edited, with a one-click "Regenerate stale" action
- [ ] Server connection setup is buried in Settings — new users must navigate to Settings (gear icon in overflow panel) to enter the server URL and connect; the Welcome/QuickStart modal exists but is only shown once; if the plugin loads without a server connection, show a prominent inline connection prompt on the main Tokens tab instead of requiring users to find Settings
