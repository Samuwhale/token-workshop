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

- [x] Theme dimension terminology is opaque for first-time users — "Add a Layer" button and "dimension" labels don't communicate that these represent theme axes like light/dark or brand variants; rename to "Add Theme Axis" or "Add Variant" and include inline examples (e.g. "e.g. Mode: light, dark") in the create dialog
- [x] Generator creation has no entry point from ThemeManager — when a user creates a theme dimension and wants to generate variant tokens (e.g. dark mode color inversions), they must navigate away to the Generators sub-tab, discover the template picker, and configure from scratch; add a "Generate tokens for this dimension" action directly on theme options that pre-fills the generator dialog with the relevant source set and target
- [x] Publish panel shows no sync status until user manually clicks Compare — there's no passive indicator of whether tokens are in sync with Figma variables/styles; add an auto-check on panel open (or a lightweight badge on the Ship tab) that shows "N changes pending" without requiring user action
- [x] No token clipboard format interop with other design token tools — copy/paste uses internal JSON or CSS variable formats, but designers switching between tools (Tokens Studio, Style Dictionary, Specify) expect to paste tokens in W3C DTCG JSON format; add a "Copy as DTCG JSON" option to the copy menu and support pasting DTCG-formatted JSON from clipboard
- [x] Git workflow in PublishPanel assumes git familiarity — merge conflicts show "ours/theirs" terminology, branch management uses raw git concepts, and commit messages default to empty; for designer-first UX, translate git concepts to design language ("your version / server version"), auto-generate descriptive commit messages from the diff summary, and add a "What does this mean?" expandable for conflict resolution
- [x] Token tree has no visual grouping or section headers for top-level categories — with hundreds of tokens, the flat alphabetical tree makes it hard to scan by domain (colors, spacing, typography); add collapsible category headers based on first path segment with token count badges, or a toggle between flat-tree and category-grouped views
- [x] No way to see all tokens affected by a generator before running it — the generator preview shows output values but not which existing tokens will be overwritten or created; add an impact summary ("Will create N new tokens, overwrite M existing") with expandable diff before the Run action
- [x] Color picker in token editor lacks a way to sample colors from the Figma canvas — the eyedropper message handler exists in the plugin sandbox but there's no visible eyedropper button in the color editor UI; surface the eyedropper as a button next to the color input so designers can pick colors directly from their designs
- [x] No "apply token to selection" from the token list context menu — binding a token to a Figma node requires navigating to the Apply > Inspect tab, selecting the node, finding the property, then searching for the token; add a right-click "Apply to selection" action on any token row that binds it to the currently selected Figma node's most relevant property (fill for colors, width/height for dimensions, etc.)
- [x] ExportPanel has 10 platform exporters bundled in a single 2162-line component with no pluggable architecture — each platform formatter is a local function with platform-specific logic interleaved with shared UI state; extract each platform into a self-contained exporter module with a common interface (`{ id, label, fileExtension, format(tokens, options) }`) so new platforms can be added without touching ExportPanel

- [x] useImportApply.ts is a 360-line monolith managing 12 useState hooks across 5 distinct import workflows (JSON, CSS, Tailwind, Variables, Styles) plus retry/undo — the retry handler has a race condition where rapid clicks bypass the `retrying` guard (state is async-set), and the token-building lambda for variable imports is duplicated verbatim between `handleImportVariables` (L189-195) and the retry failure path (L207-213); decompose into per-workflow sub-hooks sharing a common `useImportProgress` base
- [x] useThemeBulkOps.ts contains four near-identical async mutation handlers (handleSetState, handleBulkSetState, handleBulkSetAllInOption, handleCopyAssignmentsFrom) that each repeat the same optimistic-update/rollback/saving-keys/error-handling boilerplate (~35 lines each) — extract the shared mutation-chain pattern into a generic `enqueueMutation(optimisticUpdate, apiCall, rollback)` helper to eliminate the ~100 lines of duplication
- [x] Core package has divergent hex color parsing between `hexToRgb()` in color-math.ts and `parseHexStr()` in color-parse.ts — `hexToRgb` returns `a?: number` (undefined when no alpha) while `parseHexStr` always returns `alpha: 1`; `hexToRgb` delegates to `expandHex()` for shorthand but callers can't rely on this while `parseHexStr` expands inline; additionally `reapplyAlpha()` in color-modifier.ts hardcodes `result.slice(0,7)` assuming 6-char hex which will break when wide-gamut color strings flow through the modifier pipeline — unify hex parsing and alpha representation across the three files
- [x] Plugin sandbox controller.ts registers `figma.on('selectionchange')` listener (L659) that is never unregistered — the `figma.on('close')` handler (L654) only calls `cancelActiveScan()` but doesn't remove the selectionchange listener, and `_activeScanSignal` persists if the UI crashes mid-scan causing all subsequent scans to immediately abort; add proper cleanup in the close handler for both the listener and stale scan signal
- [x] Server route request body validation is shallow across sync, snapshot, and generator routes — `POST /sync/conflicts/resolve` validates that `resolutions` is an array but not that each element has `{file, choices}` shape (sync.ts L200-204); snapshot label endpoint casts body without checking it's an object (snapshots.ts L11); generator config validators check field presence but not value ranges (e.g. `chromaBoost` is checked for `typeof number` but not clamped to valid range); add structural validation for nested request bodies across these routes
- [x] `buildTokenDiff` in sync.ts (L24-60) uses `any` typed Maps for before/after tokens and the `TokenChange` interface uses `before?: any, after?: any` — this is the only server route file with `any` types outside of test files; type the Maps as `Map<string, DTCGToken>` and the change interface values as `unknown` to maintain the server's otherwise clean type safety

- [x] Generators have no disable/enable toggle — to temporarily stop a generator from auto-running when its source token changes, users must delete it and recreate from scratch; add an `enabled: boolean` flag to generator config with a toggle in the pipeline card header, and skip disabled generators during auto-run cascades in generator-service.ts
- [x] No multi-select for token sets in SetSwitcher — users managing 20+ sets cannot batch-delete, batch-move-to-folder, or batch-rename sets; add checkbox selection in manage mode with a bulk action toolbar (delete selected, move to folder, duplicate selected)
- [x] Token editing always requires the full side panel — double-clicking a token value in the tree should open a lightweight inline editor (popover or row expansion) for quick single-value changes without context-switching to the full editor panel; reserve the full panel for metadata, description, scopes, and extensions editing
- [x] Undo coverage is inconsistent — Cmd+Z works for token deletion and set merge but NOT for normal token value edits, set rename, generator config changes, or theme dimension modifications; users expect Cmd+Z to undo their last action regardless of type; extend pushUndo to cover token value saves in useTokenEditorSave and set rename in useSetRename
- [x] Dependencies sub-tab (Apply > Dependencies / TokenFlowPanel) is disconnected from token editing — when viewing a token's upstream/downstream alias chain, there's no way to edit any of the tokens in the graph or navigate back to the token list with that token selected; add "Edit" and "Go to in tree" actions on each node in the flow visualization
- [x] No "create token here" from token tree context menu — right-clicking a group shows rename/delete/move but not "Create token in this group"; the Create panel must be opened separately and the group path typed manually; add a context menu action that opens the create form with the group pre-filled
- [x] CompareView and ThemeManager Compare mode serve overlapping purposes — CompareView (Define > Tokens toolbar) lets you compare token values across theme options, and ThemeManager's "Compare" mode does the same from the Themes tab; consolidate into one shared component accessible from both locations to avoid maintaining two comparison UIs with subtly different capabilities
- [~] CanvasAuditPanel nests three sub-tabs (Coverage, Consistency, Components) inside the Apply > Canvas Audit sub-tab creating a confusing two-level tab hierarchy — promote the three audit types to top-level sub-tabs under Apply (alongside Inspect and Dependencies), or fold them into the Health panel under Ship where other validation already lives
- [ ] No keyboard shortcut for "Apply token to selection" — the QuickApplyPicker modal exists but is not listed in the keyboard shortcuts modal and has no discoverable global shortcut; power users binding tokens to layers dozens of times per session need a prominent shortcut (e.g. Cmd+Shift+A) that opens the picker pre-filtered by the selected layer's compatible property types
- [ ] History panel has three separate timeline views (git commits, manual snapshots, recent operations) that aren't unified — users must mentally reconstruct the chronological sequence; merge into a single timeline sorted by timestamp with type indicators (git/snapshot/operation icons) and filtering by source type
- [ ] No bulk token type migration — when a project needs to reclassify tokens (e.g., changing `dimension` to `number`), each token must be edited individually; add a "Change type" operation to the batch editor that validates existing values against the target type and shows which tokens need value adjustment before applying
- [ ] Server has no rate limiting on mutation endpoints — rapid-fire requests from a buggy UI loop or external scripting could corrupt token files or overwhelm the file system; add basic request-rate throttling on POST/PATCH/DELETE token endpoints in the Fastify server

- [ ] Import flow set name inputs have no client-side validation — ImportVariablesView and ImportStylesFooter allow empty strings, spaces-only, and special characters in set name inputs with no inline error; the user only discovers the problem when the server rejects the import, and disabled import buttons show no explanation of why they are disabled (violates: error prevention, help users recognize and recover from errors)
- [ ] PropertyRow inline bind list lacks ARIA listbox semantics — QuickApplyPicker correctly uses role="listbox" with role="option" and aria-selected on candidates, but the functionally identical inline bind list in PropertyRow (line 514) and DeepInspectSection use plain divs and buttons with no list semantics, making the same interaction pattern inconsistent for screen readers (violates: consistency, accessibility)
- [ ] Import conflict strategy buttons ("Import & overwrite" / "Import & merge" / "Import & keep existing") have no inline explanation of what each strategy does — merge vs overwrite vs skip are ambiguous for designers unfamiliar with data merge concepts; a one-line description under each button or a tooltip would reduce cognitive load (violates: recognition over recall, help and documentation)
- [ ] ExtractTokensPanel creation loop continues after server errors — handleCreate (line 162) iterates all selected tokens sequentially but the try/catch wraps the entire loop, so a single failure aborts all remaining tokens; however there is no partial-success UI showing which tokens were created before the error, leaving the user unsure what state they are in (violates: visibility of system status, error recovery)
- [ ] Stepper number input buttons in ValueEditors.tsx (lines 263-278) have tabIndex={-1} and aria-hidden SVG icons but no aria-label on the buttons themselves — while skipping them in tab order is reasonable for a compound spinbutton, the buttons are still mouse-clickable interactive elements that screen readers can encounter via touch exploration and they announce nothing meaningful (violates: accessibility)
- [ ] "Checking existing tokens..." text in ImportVariablesFooter (line 34) shows no spinner or loading indicator, unlike every other async waiting state in the plugin which uses the Spinner component — this is the only async status check in the import flow that relies on text alone, making the UI feel unresponsive during the check (violates: visibility of system status, consistency)
