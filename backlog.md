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

- [x] No token move/copy between sets via context menu — the context menu on a token row offers duplicate, delete, rename, but no "Move to set…" or "Copy to set…" option; users must enter select mode, pick tokens, open batch editor, and choose "Move to set" — a 4-step flow for a single token
- [x] Export ZIP has a hardcoded `tokens.zip` filename and flat structure — ExportPanel.tsx `buildZipBlob` always names the download `tokens.zip` with all files at root; add a configurable filename (defaulting to the set name or "tokens") and an option to nest files by platform folder (e.g., `css/variables.css`)
- [x] Node graph port wiring has no type validation — useNodeGraph.ts `finishWiring()` connects any output port to any input port without checking type compatibility (e.g., color output to number input); add `isCompatiblePort(from, to)` validation with visual feedback on hover
- [x] No keyboard shortcut for "New token" — common actions like create-token require clicking the `+` button; add `N` or `Ctrl+N` shortcut that opens the inline create form at the current scroll position, similar to how `E` triggers inline edit
- [x] Token search qualifier syntax is undiscoverable — qualifiers like `type:color`, `has:alias`, `value:blue` are powerful but users must open the help modal to learn them; add inline placeholder text cycling through examples (e.g., "Search… try type:color") or a small qualifier chip bar below the search input
- [x] Theme "Compare" view is misleading — it shows a single merged resolution result, not a side-by-side diff between theme options; users expecting to compare "light vs dark" see a flat table of resolved values with no way to see what differs between two options; add a true side-by-side comparison mode that highlights value differences across selected theme options
- [~] Generator dialog disables preview entirely for multi-brand configurations — `useGeneratorPreview.ts` line 50 skips preview when `isMultiBrand` is true, so users creating multi-brand generators see zero output until after saving; this is a significant blind spot for the most complex generator type; generate preview for at least the first brand as a representative sample
- [~] Generator overwrite confirmation uses blocking `window.confirm()` — `useGeneratorSave.ts` calls `window.confirm()` with a long unformatted list of file paths when manually-edited tokens are detected; replace with an in-app modal that shows paths in a scrollable monospace list with accept/cancel buttons
- [x] AnalyticsPanel has no empty state when no tokens exist — when `totalTokens === 0`, the entire analytics view renders blank with no guidance; add an empty state message similar to GraphPanel's (icon + explanation + CTA to create or import tokens)
- [~] Multi-select mode is undiscoverable — entering token multi-select requires pressing `m` with no visible button or tooltip indicating this capability; add a visible "Select" toggle button in the token list toolbar and show a selection count bar with batch action buttons when tokens are selected
- [x] 14 of 24 DTCG token types fall back to raw text input — types like `fontWeight`, `strokeStyle`, `boolean`, `percentage`, `fontStyle`, `textDecoration`, and `textTransform` have no dedicated editors despite having well-defined value sets; add dropdown/toggle editors for enumerable types (fontWeight: 100-900, strokeStyle: solid/dashed/dotted, boolean: true/false, textTransform: uppercase/lowercase/capitalize/none) and constrained inputs for numeric types (percentage: slider 0-100)
- [~] Import conflict resolution shows accept/reject toggles but no side-by-side value comparison — `ImportPanel.tsx` conflict view shows current and incoming values separately with accept/reject buttons, but doesn't render them as a clear before/after diff; adopt the same `SyncDiffSummary` pattern used in variable/style sync for visual consistency and clarity
- [~] No "find usages" for tokens — there is no way to discover which other tokens alias a given token, which Figma variables bind to it, or which generators produce it; add a "References" section to the token editor panel showing incoming aliases, variable bindings, and generator sources so users understand the impact of changes before making them
- [~] SSE connection has no event replay on reconnect — if the SSE connection drops and the client reconnects, missed events are lost; the client must do a full data refetch; add a simple event sequence counter so the client can request missed events on reconnect, or at minimum detect staleness and trigger an automatic refresh
- [ ] No batch undo — batch operations (bulk delete, bulk rename, scale values) via BatchEditor execute as individual API calls with no compound undo entry; undoing a batch of 50 token edits requires pressing Ctrl+Z 50 times; record batch operations as a single compound entry in the operation log
- [ ] Alias autocomplete shows no indication when results are truncated — `AliasAutocomplete.tsx` caps results at 24 (MAX_RESULTS) with no message like "24 of 312 tokens shown"; users with large token sets may think matching tokens don't exist when they're just filtered out; show a count and hint to refine the search

- [ ] Export sub-tab duplicates Publish panel's File Export section — ExportPanel.tsx and the "File Export" collapsible section inside PublishPanel.tsx offer identical platform export functionality (same platform list, same API call, same ZIP download); users must guess which one to use; remove the standalone Export sub-tab and keep export only within the Publish workflow, or vice versa
- [ ] Five keyboard shortcuts listed in KeyboardShortcutsModal are not wired — Cmd+C (copy tokens as JSON), Cmd+L (toggle reference mode), Cmd+Enter (save token), Cmd+Shift+Enter (save & create another), and Cmd+Enter in paste modal are documented in the shortcuts help but have no event handlers; either implement the handlers or remove the entries to avoid misleading users
- [ ] Tab number shortcuts (Cmd+1/2/3) reference pre-refactor navigation — App.tsx keydown handler still maps Cmd+1/2/3 to old tab IDs (Tokens/Inspect/Generators) but the app now uses a two-tier system (Define/Apply/Ship with sub-tabs); update shortcuts to match the current navigation structure
- [ ] QuickStart wizard is inaccessible after initial setup — the guided 3-step wizard (QuickStartWizard.tsx) only appears from the EmptyState when zero tokens exist; once tokens are created there is no way to re-run it from settings, help, or command palette; add a "Run guided setup" entry in settings or the command palette
- [ ] Paste import sends one API request per token instead of using batch endpoint — PasteTokensModal.tsx creates tokens individually via POST, causing slow imports for large payloads; the server already has POST /api/tokens/:set/batch with skip/overwrite strategy; use it for a single atomic request instead of N sequential ones
- [ ] No "everything is synced" state in PublishPanel — when Figma variables, styles, and git are all in sync, PublishPanel shows empty collapsible sections with no content; add a clear "All synced" confirmation state with a green checkmark so users know there's nothing to do
- [ ] Figma scope labels in MetadataEditor are raw API names — MetadataEditor.tsx shows scope checkboxes with labels like "FILL_COLOR", "STROKE_FLOAT", "WIDTH_HEIGHT" which are Figma's internal API names; replace with human-readable labels (e.g., "Fill color", "Stroke width", "Width & Height") and add brief descriptions of what each scope controls
- [ ] TokenFlowPanel silently truncates large dependency graphs — TokenFlowPanel.tsx caps references at 20 and dependents at 30 with no indication that results are truncated; tokens in a large design system can easily exceed these limits; show a "+N more" indicator and allow expanding or scrolling to see all dependencies
- [ ] BatchEditor has no bulk metadata operations — BatchEditor.tsx supports type change, value scaling, move, rename, and delete, but cannot bulk-set description, Figma scopes, or extensions across selected tokens; adding bulk description and scope editing would save significant manual work for teams preparing tokens for Figma variable publishing
- [ ] PreviewPanel elements don't link back to token definitions — clicking a color swatch or type scale item in PreviewPanel.tsx copies the CSS variable value but doesn't offer navigation to the source token in the token list; add a "Go to token" action on preview elements so users can quickly edit the token they're previewing
- [ ] ComparePanel feature is undiscoverable — the multi-token comparison view (ComparePanel.tsx) only appears when 2+ tokens are selected, with no UI hint that this capability exists; add a "Compare" button to the token context menu or batch actions toolbar so users can discover side-by-side token comparison
