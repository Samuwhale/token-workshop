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
- [!] GraphPanel has no inline output preview before saving a generator — creating a generator requires configuring it, saving, then navigating to TokenList or TokenFlowPanel to see the output; this breaks the authoring feedback loop; add a live "Preview output" section within GraphPanel that renders the first N generated tokens in real time as parameters change, before the generator is saved (GraphPanel.tsx ~L400 lines, no preview section)
- [!] No "Copy resolved value" action on token detail — TokenDetailPreview copies the token path to clipboard, but there is no way to copy the resolved value (e.g. `#FF5733`) without manually reading it from the preview swatch; add a copy-value button alongside the existing copy-path button, especially useful for tokens with deeply-nested alias chains where the resolved value is not immediately obvious (TokenTreeNode.tsx, TokenEditor preview area)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)
- [x] No keyboard shortcut to quickly duplicate a selected token — duplicating a token requires: right-click → "More" submenu (if it exists) or manual create with the same type, then re-enter all fields; a `Cmd+D` shortcut on a selected token row that creates a copy with the name suffixed "-copy" and opens it for renaming would match standard tool behavior and save several clicks for tasks like creating a dark-mode variant of an existing token (TokenTreeNode.tsx context menu, useTokenTree keyboard handler)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)
- [x] Theme dimension set-status labels are confusing non-standard terminology — ThemeManager uses "Foundation"/"Override"/"Not included" as labels for set states (STATE_LABELS at ThemeManager.tsx:10-14) which don't match the API terms (source/enabled/disabled) or standard DTCG terminology; users must read the tooltip to understand the stacking model; rename to clearer terms like "Base"/"Override"/"Excluded" or add visible inline help explaining the layer priority
- [x] Token creation form doesn't remember last-used group — creating multiple tokens in the same group (e.g., adding `color.brand.secondary` after `color.brand.primary`) requires re-selecting the group each time; the create form should default to the group of the previously created token when using "Save & New" (⇧↵) to reduce repetitive input
- [~] Git commit flow has no token-level diff preview — SyncPanel shows file-level changes for git commit but doesn't show which individual tokens changed within those .tokens.json files; users must mentally diff nested JSON to understand what they're committing; showing a token-level added/changed/removed summary per file would match the quality of the variable sync diff UI
- [~] No "navigate to group" from command palette — the command palette token search (`>`) only navigates to individual tokens; power users with deeply nested hierarchies want to jump directly to a group path like `color.brand` and have the tree expand and scroll to that group; add a `group:` qualifier or auto-detect group paths (CommandPalette.tsx token search mode)
- [~] Keyboard-driven multi-select doesn't support Shift+Arrow range selection — pressing 'M' enters multi-select mode but extending the selection requires mouse clicks; Shift+Up/Down from the focused row should extend/shrink the selection range, matching standard tree-view keyboard interaction patterns (TokenList.tsx keyboard handler)
- [~] Server API response shapes are inconsistent across mutation endpoints — some routes return `{ ok: true }`, others `{ created: true, name }`, others `{ dimension }`, and batch routes return `{ updated, operationId }`; this prevents the client from using a single response handler and makes error detection inconsistent; standardize on a consistent envelope shape across all mutation endpoints (packages/server/src/routes/*.ts)
- [x] Token creation form has no per-type value format hints — the value input shows a generic placeholder but doesn't explain what format each type expects; entering a border value, typography object, or shadow array requires prior knowledge of the DTCG spec; add a small "expected format" hint or example below the value input that changes based on the selected type (TokenList.tsx create form ~L3620-3651)
- [~] No way to reorder tokens within a group from the keyboard — tokens can be reordered via drag-and-drop but there's no Alt+Up/Alt+Down keyboard shortcut to move a selected token up or down within its group; this is a standard accessibility and power-user expectation for ordered lists (TokenTreeNode.tsx, TokenList.tsx keyboard handler)
