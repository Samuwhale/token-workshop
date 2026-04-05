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
- [x] [HIGH] Generator rollback is inconsistent and can leave token state corrupted — single-brand path (generator-service.ts:744) silently swallows rollback errors via `.catch()` that only logs, so the caller never learns token state is inconsistent; multi-brand path (generator-service.ts:835) throws inside `.catch()` which exits the `for` loop over `preRunSnapshots` early, leaving remaining sets un-rolled-back; both paths should use `Promise.allSettled` over all affected sets and report aggregate failure
- [x] No saved filter presets for the token list — users with large token sets who repeatedly use combinations like "type:color has:unused" or "type:dimension has:duplicate" must re-type these each time; add named filter presets that persist and are accessible from a dropdown next to the search bar
- [x] Bulk create tab does not infer token type per row — the single-create tab auto-detects type from the path (e.g., "colors.primary" infers color) but the bulk tab requires manually selecting a type for each row; apply the same path-based type inference to each bulk row's name field
- [x] "Simple mode" auto-activates with no explanation — when totalTokenCount < 200 and sets exist, the UI silently merges all sets into a type-grouped view and hides the set switcher; there is no banner explaining what happened or how to switch to advanced mode, which will confuse users who expect to see their set structure
- [x] No cross-set token search in the token list — the search bar and structured qualifiers (type:, has:, value:, etc.) only search within the active set; users managing tokens across 10+ sets have no way to find a token globally without using the command palette's ">" mode or the server search endpoint
- [x] ThemeManager coverage matrix and compare panel are powerful but hidden below the fold — the coverage matrix (showing which theme options have gaps) and the compare panel (side-by-side theme option diff) are rendered after the dimension grid and require scrolling past all dimensions to reach; surfacing them as tabs or a collapsible top section would make them more discoverable
- [x] No token value history or changelog per token — the HistoryPanel shows operation-level and commit-level history but there is no way to see the edit history of a single token's value over time; the server has token-history endpoint but the UI only surfaces it in the timeline view, not from the token editor or context menu
- [~] [HIGH] Inline token edit silently discards invalid values — when `parseInlineValue` returns null in TokenTreeNode, Enter keeps the editor open with no error message and Tab moves to the next token dropping the edit entirely; user gets zero feedback about what went wrong (TokenTreeNode.tsx ~L1155, ~L1168) (violates: system status visibility, error prevention)
- [ ] Lint rules are limited to 5 hardcoded checks — LintConfigPanel offers no-raw-color, require-description, path-pattern, max-alias-depth, and no-duplicate-values; common design system rules like "no hardcoded dimensions" (matching no-raw-color but for dimensions), "require-alias-for-semantic-tokens", or "enforce-token-type-consistency" are missing; consider making the lint rule system extensible or adding more built-in rules
- [ ] Color contrast matrix in HealthPanel does not surface actionable fixes — it shows WCAG AA/AAA pass/fail for color pairs but offers no suggestion for what the nearest compliant color would be; adding a "suggested fix" column (nearest color that passes the threshold) would close the loop from detection to resolution
- [ ] ExportPanel.tsx is 2423 lines combining format selection, platform configuration, preset management, CSV/ZIP generation, and diff/changes-only filtering into a single component — extract platform-specific config editors, preset CRUD, and export format logic into sub-components/hooks (similar to the HealthPanel extraction that went from 1813→670 lines)
- [ ] ThemeManager.tsx has two near-identical toggle bar blocks (~L503 and ~L554) for switching between simple/advanced mode — the blocks share the same structure (label, shortcut badge, chevron) but are maintained separately; extract a shared `ModeToggleBar` component to eliminate the duplication and prevent future drift
- [ ] `packages/core/src/dtcg-resolver.ts:205` casts `dtcgToken.$value` to `Token['$value']` without any validation — malformed values (wrong shape for type, circular structures, NaN) silently propagate through the resolver and surface as cryptic errors in downstream consumers like generators or the UI; add validation at the merge boundary where external DTCG files enter the system
- [ ] `packages/core/src/generator-engine.ts:162` silently defaults `baseExponent` to 0 when `baseStep` name doesn't match any step definition — a misconfigured generator (typo in step name) produces wrong scaling values with no warning or error; should throw a descriptive validation error so generator config problems are caught at creation/edit time, not at run time via wrong output
- [ ] `manual-snapshot.ts:321` quarantined sets (those exceeding MAX_RECOVERY_RETRIES) are skipped via `continue` but never added to `journal.completedSets` — on every subsequent server restart, recovery re-attempts the quarantined set, hits the retry limit again, and logs the same error forever; the set should be added to completedSets (or a separate quarantine list) so the journal can eventually be cleaned up

- [ ] Consolidate canvas analysis panels — HeatmapPanel, ConsistencyPanel, and ComponentCoveragePanel exist both as standalone imports and as tabs inside CanvasAnalysisPanel; the standalone versions are dead weight since the CanvasAnalysisPanel wrapper is the only one rendered in PanelRouter; remove the standalone routing paths and unify scope state management (currently three separate ScanScopeSelector instances)
- [ ] WelcomePrompt has no re-entry path — once dismissed via "I'll explore on my own", the `FIRST_RUN_DONE` localStorage flag is set permanently with no way to re-trigger the guided setup from Settings or the command palette; add a "Restart guided setup" action somewhere discoverable
- [ ] Token context menu missing "Go to definition" for aliases — right-clicking an alias token has 21 actions but no "Jump to referenced token" shortcut; users who want to navigate an alias chain must manually search for the target path; add a "Go to definition" action that selects and scrolls to the aliased token
- [ ] Batch editor silently skips alias tokens during numeric transforms — when applying multiply/divide/add/subtract to selected tokens, tokens with alias values (e.g., `{spacing.base}`) are skipped without any feedback; show a count of skipped tokens after the operation completes so users know some selections weren't affected
- [ ] CreatePanel "token already exists" error has no navigation link — when creating a token with a path that already exists, the validation message says "edit it instead" but there's no clickable link or action to jump to that existing token in the editor; add a "Go to token" button inline with the error
- [ ] PasteTokensModal lacks "overwrite all conflicts" shortcut — when pasting 50+ tokens where many conflict with existing tokens, each conflict must be toggled individually; add a "Select all conflicting" / "Deselect all conflicting" toggle to reduce clicks
- [ ] No "duplicate set as theme override" workflow — duplicating a set copies all tokens verbatim, but when creating theme variants (e.g., dark mode from light mode) users want to create an override set pre-linked to a theme dimension option containing only the tokens they intend to change; add a "Create override set from…" flow that connects set creation with theme configuration
- [ ] TokenTableView is a second token view with significantly fewer capabilities than the tree view — it has no context menu, no inline popover editing for complex types, no drag-and-drop, no multi-select batch operations, and no pinning; either invest in making it feature-complete or remove it in favor of the tree view which already supports flat display via search/filter
- [ ] No lightweight "find references" for tokens — the context menu has "Open in dependency graph" which navigates away to a separate panel, but there's no inline way to see "which tokens alias this one?" without leaving the current view; add a quick popover or expandable section showing reverse references directly in the token list row
- [ ] HealthPanel lacks a summary score or prioritized issue list — it aggregates 5+ sub-panels (lint, duplicates, contrast, lightness, unused, coverage) but users must expand each section manually to discover problems; add a top-level health summary with the most urgent issues listed first so the panel is useful at a glance
- [ ] No keyboard shortcut for quick set switching — the SetSwitcher is a modal triggered by clicking; power users managing 10+ sets need a Cmd+Shift+S or similar hotkey to pop the set switcher without reaching for the mouse, similar to how IDEs switch between files with Cmd+P
- [ ] ThemeManager hover-only actions are not discoverable — dimension reorder grips, delete buttons, and option management buttons only appear on hover; first-time users have no visual hint these actions exist; add persistent but subtle affordances (e.g., faint icons) or an onboarding tooltip the first time the theme panel is opened
- [ ] Clear all bindings in SelectionInspector fires without confirmation — `handleClearAllBindings` immediately removes every property binding on the selected layer(s) with no confirmation dialog; while undo exists, this bulk destructive action is a single click away from the sync controls bar (SelectionInspector.tsx ~L447) (violates: error prevention)
- [ ] Inconsistent success feedback across mutation operations — CreatePanel and ExportPanel dispatch toasts on success, but ThemeManager dimension/option CRUD and ResolverPanel create/edit/delete show no success indication; users must infer success from list UI updates, creating uncertainty about whether the server operation completed (violates: system status visibility, consistency)
- [ ] Hover-only action buttons are invisible to keyboard users across many panels — ResolverPanel, ThemeManager, HistoryPanel, ExportPanel, SetSwitcher, CompareView, and others use `opacity-0 group-hover:opacity-100` without the `group-focus-within:opacity-100` variant that TokenTreeNode and TokenList correctly use; keyboard-only users cannot see edit/delete/action buttons at all (violates: keyboard accessibility, consistency)
- [ ] Incomplete ARIA relationships in interactive panels — PropertyRow token search has `aria-autocomplete="list"` but no `aria-controls`/`aria-activedescendant` linking input to the candidates listbox; ExportPanel preview file tabs are plain buttons without `role="tab"`/`aria-selected`/`role="tablist"` while SettingsPanel implements these correctly; MetadataEditor icon-only remove buttons have `title` but no `aria-label` despite `aria-hidden` SVG children (violates: accessibility, consistency)
