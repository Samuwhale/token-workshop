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
- [~] No keyboard shortcut for "New token" — common actions like create-token require clicking the `+` button; add `N` or `Ctrl+N` shortcut that opens the inline create form at the current scroll position, similar to how `E` triggers inline edit
- [~] Token search qualifier syntax is undiscoverable — qualifiers like `type:color`, `has:alias`, `value:blue` are powerful but users must open the help modal to learn them; add inline placeholder text cycling through examples (e.g., "Search… try type:color") or a small qualifier chip bar below the search input
- [~] Theme "Compare" view is misleading — it shows a single merged resolution result, not a side-by-side diff between theme options; users expecting to compare "light vs dark" see a flat table of resolved values with no way to see what differs between two options; add a true side-by-side comparison mode that highlights value differences across selected theme options
- [~] Generator dialog disables preview entirely for multi-brand configurations — `useGeneratorPreview.ts` line 50 skips preview when `isMultiBrand` is true, so users creating multi-brand generators see zero output until after saving; this is a significant blind spot for the most complex generator type; generate preview for at least the first brand as a representative sample
- [~] Generator overwrite confirmation uses blocking `window.confirm()` — `useGeneratorSave.ts` calls `window.confirm()` with a long unformatted list of file paths when manually-edited tokens are detected; replace with an in-app modal that shows paths in a scrollable monospace list with accept/cancel buttons
- [ ] AnalyticsPanel has no empty state when no tokens exist — when `totalTokens === 0`, the entire analytics view renders blank with no guidance; add an empty state message similar to GraphPanel's (icon + explanation + CTA to create or import tokens)
- [ ] Multi-select mode is undiscoverable — entering token multi-select requires pressing `m` with no visible button or tooltip indicating this capability; add a visible "Select" toggle button in the token list toolbar and show a selection count bar with batch action buttons when tokens are selected
- [ ] 14 of 24 DTCG token types fall back to raw text input — types like `fontWeight`, `strokeStyle`, `boolean`, `percentage`, `fontStyle`, `textDecoration`, and `textTransform` have no dedicated editors despite having well-defined value sets; add dropdown/toggle editors for enumerable types (fontWeight: 100-900, strokeStyle: solid/dashed/dotted, boolean: true/false, textTransform: uppercase/lowercase/capitalize/none) and constrained inputs for numeric types (percentage: slider 0-100)
- [ ] Import conflict resolution shows accept/reject toggles but no side-by-side value comparison — `ImportPanel.tsx` conflict view shows current and incoming values separately with accept/reject buttons, but doesn't render them as a clear before/after diff; adopt the same `SyncDiffSummary` pattern used in variable/style sync for visual consistency and clarity
- [ ] No "find usages" for tokens — there is no way to discover which other tokens alias a given token, which Figma variables bind to it, or which generators produce it; add a "References" section to the token editor panel showing incoming aliases, variable bindings, and generator sources so users understand the impact of changes before making them
- [ ] SSE connection has no event replay on reconnect — if the SSE connection drops and the client reconnects, missed events are lost; the client must do a full data refetch; add a simple event sequence counter so the client can request missed events on reconnect, or at minimum detect staleness and trigger an automatic refresh
- [ ] No batch undo — batch operations (bulk delete, bulk rename, scale values) via BatchEditor execute as individual API calls with no compound undo entry; undoing a batch of 50 token edits requires pressing Ctrl+Z 50 times; record batch operations as a single compound entry in the operation log
- [ ] Alias autocomplete shows no indication when results are truncated — `AliasAutocomplete.tsx` caps results at 24 (MAX_RESULTS) with no message like "24 of 312 tokens shown"; users with large token sets may think matching tokens don't exist when they're just filtered out; show a count and hint to refine the search
