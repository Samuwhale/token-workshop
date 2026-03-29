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
- [x] Git commit flow has no token-level diff preview — SyncPanel shows file-level changes for git commit but doesn't show which individual tokens changed within those .tokens.json files; users must mentally diff nested JSON to understand what they're committing; showing a token-level added/changed/removed summary per file would match the quality of the variable sync diff UI
- [x] No "navigate to group" from command palette — the command palette token search (`>`) only navigates to individual tokens; power users with deeply nested hierarchies want to jump directly to a group path like `color.brand` and have the tree expand and scroll to that group; add a `group:` qualifier or auto-detect group paths (CommandPalette.tsx token search mode)
- [x] Keyboard-driven multi-select doesn't support Shift+Arrow range selection — pressing 'M' enters multi-select mode but extending the selection requires mouse clicks; Shift+Up/Down from the focused row should extend/shrink the selection range, matching standard tree-view keyboard interaction patterns (TokenList.tsx keyboard handler)
- [x] Server API response shapes are inconsistent across mutation endpoints — some routes return `{ ok: true }`, others `{ created: true, name }`, others `{ dimension }`, and batch routes return `{ updated, operationId }`; this prevents the client from using a single response handler and makes error detection inconsistent; standardize on a consistent envelope shape across all mutation endpoints (packages/server/src/routes/*.ts)
- [x] Token creation form has no per-type value format hints — the value input shows a generic placeholder but doesn't explain what format each type expects; entering a border value, typography object, or shadow array requires prior knowledge of the DTCG spec; add a small "expected format" hint or example below the value input that changes based on the selected type (TokenList.tsx create form ~L3620-3651)
- [x] No way to reorder tokens within a group from the keyboard — tokens can be reordered via drag-and-drop but there's no Alt+Up/Alt+Down keyboard shortcut to move a selected token up or down within its group; this is a standard accessibility and power-user expectation for ordered lists (TokenTreeNode.tsx, TokenList.tsx keyboard handler)

- [x] [HIGH] BatchEditor undo block references three undefined variables — the undo/redo recording block at BatchEditor.tsx ~L357-374 references `succeeded`, `results`, and `patchToken` which don't exist in scope; this is leftover from a refactor that switched to a single batch API call but never updated the undo logic; any successful batch edit will crash at runtime when hitting this code path

- [~] Merge TokenReferences and TokenDependents into a single component — both components share identical interfaces (dependents array, layers scanning, NODE_TYPE_ICONS, formatDiffValue helper) with the only difference being optional generator metadata props; maintaining two nearly-identical ~400-line components doubles the bug surface for what should be one "Token Usages" section in TokenEditor (TokenReferences.tsx, TokenDependents.tsx)
- [~] Rename "Token Flow" sub-tab to "Dependencies" and move it from Define to Apply — TokenFlowPanel is a dependency chain viewer (upstream references + downstream dependents for a single token) but its name and placement alongside Generators suggests it's about token creation pipelines; moving it next to Inspect and Binding Audit better matches its analytical purpose (App.tsx tab config, TokenFlowPanel.tsx)
- [~] Consolidate QuickStartDialog and QuickStartWizard into a single onboarding flow — QuickStartWizard renders QuickStartDialog as a nested overlay inside its own modal, creating double-backdrop z-index issues; the dialog is never used independently outside the wizard so it should be inlined as step 1 rather than being a separate component (QuickStartDialog.tsx, QuickStartWizard.tsx)
- [~] Add "View dependency chain" action from TokenEditor and token context menu — TokenFlowPanel exists but is only reachable by manually switching to the Token Flow tab and searching; add a "Show references" context menu item and TokenEditor button that navigates to TokenFlowPanel with the token path pre-populated (TokenTreeNode.tsx context menu, TokenEditor.tsx, TokenFlowPanel.tsx)
- [~] Publish and Export panels both have "Figma Variables" sections that do opposite things with no labeling distinction — PublishPanel's "Figma Variables" section syncs local tokens bidirectionally with Figma variables while ExportPanel's "Figma Variables" mode reads Figma variables into DTCG JSON; rename to "Sync Figma Variables" and "Extract Figma Variables" respectively so users know which direction data flows (PublishPanel.tsx ~L417, ExportPanel.tsx ~L832)
- [~] ExportPanel "Save to Server" has no preview or collision handling UI — clicking "Save to Server" from the Figma Variables mode either succeeds silently or throws a slug collision error that blocks the entire operation; add a dry-run preview showing what will be created/overwritten and an interactive rename flow for collection name collisions instead of failing completely (ExportPanel.tsx ~L393-456)
- [ ] Add first-run detection with proactive guided setup prompt — currently the guided setup wizard is only discoverable via the empty state (which requires being on Define > Tokens with zero tokens) or buried in the command palette's Help category; on first launch (no localStorage flag), show a lightweight welcome prompt offering "Start guided setup" or "I'll explore on my own" (App.tsx, QuickStartWizard.tsx)
- [ ] SuggestedTokens apply button is only visible on hover with no keyboard shortcut — the "Apply" action for suggested token bindings requires mouse hover to discover and has no Enter/Space keyboard support; add always-visible apply affordance and keyboard activation for accessibility (SuggestedTokens.tsx ~L137-147)
- [ ] PreviewPanel typography template only shows fontSize — the Type Scale preview renders font sizes but ignores fontWeight, lineHeight, letterSpacing, and fontFamily even when those tokens exist; show complete typography combinations to give a realistic preview of the type system (PreviewPanel.tsx ~L311-373)
- [ ] ComparePanel has no copy or export option — ThemeCompare supports CSV/TSV export of comparison data but ComparePanel (used when multi-selecting tokens) has no way to copy or export the comparison; add at minimum a "Copy as table" button for pasting into docs or spreadsheets (ComparePanel.tsx)
- [ ] Three separate history/undo mental models with no unifying UI — users encounter local undo stack (Cmd+Z, 20-action limit, lost on refresh), server operation log (useRecentOperations fetches data but has no rendered UI), and git history/snapshots (HistoryPanel); there's no explanation of how these relate or when to use which; add a unified "Recent Actions" sidebar or panel that surfaces the operation log and connects it to the undo toast (useRecentOperations.ts, UndoToast.tsx, HistoryPanel.tsx)
