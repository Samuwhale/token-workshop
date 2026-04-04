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
