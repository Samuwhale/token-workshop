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
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion

- [ ] No saved filter presets for the token list — users with large token sets who repeatedly use combinations like "type:color has:unused" or "type:dimension has:duplicate" must re-type these each time; add named filter presets that persist and are accessible from a dropdown next to the search bar
- [ ] Bulk create tab does not infer token type per row — the single-create tab auto-detects type from the path (e.g., "colors.primary" infers color) but the bulk tab requires manually selecting a type for each row; apply the same path-based type inference to each bulk row's name field
- [ ] "Simple mode" auto-activates with no explanation — when totalTokenCount < 200 and sets exist, the UI silently merges all sets into a type-grouped view and hides the set switcher; there is no banner explaining what happened or how to switch to advanced mode, which will confuse users who expect to see their set structure
- [ ] No cross-set token search in the token list — the search bar and structured qualifiers (type:, has:, value:, etc.) only search within the active set; users managing tokens across 10+ sets have no way to find a token globally without using the command palette's ">" mode or the server search endpoint
- [ ] ThemeManager coverage matrix and compare panel are powerful but hidden below the fold — the coverage matrix (showing which theme options have gaps) and the compare panel (side-by-side theme option diff) are rendered after the dimension grid and require scrolling past all dimensions to reach; surfacing them as tabs or a collapsible top section would make them more discoverable
- [ ] No token value history or changelog per token — the HistoryPanel shows operation-level and commit-level history but there is no way to see the edit history of a single token's value over time; the server has token-history endpoint but the UI only surfaces it in the timeline view, not from the token editor or context menu
- [ ] Lint rules are limited to 5 hardcoded checks — LintConfigPanel offers no-raw-color, require-description, path-pattern, max-alias-depth, and no-duplicate-values; common design system rules like "no hardcoded dimensions" (matching no-raw-color but for dimensions), "require-alias-for-semantic-tokens", or "enforce-token-type-consistency" are missing; consider making the lint rule system extensible or adding more built-in rules
- [ ] Color contrast matrix in HealthPanel does not surface actionable fixes — it shows WCAG AA/AAA pass/fail for color pairs but offers no suggestion for what the nearest compliant color would be; adding a "suggested fix" column (nearest color that passes the threshold) would close the loop from detection to resolution
