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
- [~] [HIGH] Generator rollback is inconsistent and can leave token state corrupted — single-brand path (generator-service.ts:744) silently swallows rollback errors via `.catch()` that only logs, so the caller never learns token state is inconsistent; multi-brand path (generator-service.ts:835) throws inside `.catch()` which exits the `for` loop over `preRunSnapshots` early, leaving remaining sets un-rolled-back; both paths should use `Promise.allSettled` over all affected sets and report aggregate failure
- [ ] No saved filter presets for the token list — users with large token sets who repeatedly use combinations like "type:color has:unused" or "type:dimension has:duplicate" must re-type these each time; add named filter presets that persist and are accessible from a dropdown next to the search bar
- [ ] Bulk create tab does not infer token type per row — the single-create tab auto-detects type from the path (e.g., "colors.primary" infers color) but the bulk tab requires manually selecting a type for each row; apply the same path-based type inference to each bulk row's name field
- [ ] "Simple mode" auto-activates with no explanation — when totalTokenCount < 200 and sets exist, the UI silently merges all sets into a type-grouped view and hides the set switcher; there is no banner explaining what happened or how to switch to advanced mode, which will confuse users who expect to see their set structure
- [ ] No cross-set token search in the token list — the search bar and structured qualifiers (type:, has:, value:, etc.) only search within the active set; users managing tokens across 10+ sets have no way to find a token globally without using the command palette's ">" mode or the server search endpoint
- [ ] ThemeManager coverage matrix and compare panel are powerful but hidden below the fold — the coverage matrix (showing which theme options have gaps) and the compare panel (side-by-side theme option diff) are rendered after the dimension grid and require scrolling past all dimensions to reach; surfacing them as tabs or a collapsible top section would make them more discoverable
- [ ] No token value history or changelog per token — the HistoryPanel shows operation-level and commit-level history but there is no way to see the edit history of a single token's value over time; the server has token-history endpoint but the UI only surfaces it in the timeline view, not from the token editor or context menu
- [ ] Lint rules are limited to 5 hardcoded checks — LintConfigPanel offers no-raw-color, require-description, path-pattern, max-alias-depth, and no-duplicate-values; common design system rules like "no hardcoded dimensions" (matching no-raw-color but for dimensions), "require-alias-for-semantic-tokens", or "enforce-token-type-consistency" are missing; consider making the lint rule system extensible or adding more built-in rules
- [ ] Color contrast matrix in HealthPanel does not surface actionable fixes — it shows WCAG AA/AAA pass/fail for color pairs but offers no suggestion for what the nearest compliant color would be; adding a "suggested fix" column (nearest color that passes the threshold) would close the loop from detection to resolution
- [ ] ExportPanel.tsx is 2423 lines combining format selection, platform configuration, preset management, CSV/ZIP generation, and diff/changes-only filtering into a single component — extract platform-specific config editors, preset CRUD, and export format logic into sub-components/hooks (similar to the HealthPanel extraction that went from 1813→670 lines)
- [ ] ThemeManager.tsx has two near-identical toggle bar blocks (~L503 and ~L554) for switching between simple/advanced mode — the blocks share the same structure (label, shortcut badge, chevron) but are maintained separately; extract a shared `ModeToggleBar` component to eliminate the duplication and prevent future drift
- [ ] `packages/core/src/dtcg-resolver.ts:205` casts `dtcgToken.$value` to `Token['$value']` without any validation — malformed values (wrong shape for type, circular structures, NaN) silently propagate through the resolver and surface as cryptic errors in downstream consumers like generators or the UI; add validation at the merge boundary where external DTCG files enter the system
- [ ] `packages/core/src/generator-engine.ts:162` silently defaults `baseExponent` to 0 when `baseStep` name doesn't match any step definition — a misconfigured generator (typo in step name) produces wrong scaling values with no warning or error; should throw a descriptive validation error so generator config problems are caught at creation/edit time, not at run time via wrong output
- [ ] `manual-snapshot.ts:321` quarantined sets (those exceeding MAX_RECOVERY_RETRIES) are skipped via `continue` but never added to `journal.completedSets` — on every subsequent server restart, recovery re-attempts the quarantined set, hits the retry limit again, and logs the same error forever; the set should be added to completedSets (or a separate quarantine list) so the journal can eventually be cleaned up
