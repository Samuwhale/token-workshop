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
- [~] Generator editor has no "preview diff" before regenerating — TokenGeneratorDialog.tsx applies generator changes immediately on save; for generators that produce dozens of tokens (e.g. an 11-step color ramp), there's no way to see what will change before committing; adding a "Preview changes" step that shows a diff of current vs. proposed token values would prevent accidental overwrites and give users confidence to experiment with generator settings
- [ ] Bulk create tab only supports a flat text-area format — CreatePanel.tsx BulkTab accepts a path:value text format but doesn't support pasting a DTCG JSON group structure, which is the most common format users would copy from another tool or documentation; the bulk tab should detect and parse nested DTCG JSON input in addition to the flat format
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
