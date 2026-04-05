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
