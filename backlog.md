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
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [~] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle

- [!] Manual snapshot restore has no concurrency guard and leaks journal on error — `manual-snapshot.ts:restore()` (L204-237) writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; additionally, if `tokenStore.restoreSnapshot()` throws mid-loop, the journal is left on disk and startup recovery will re-replay partially-applied sets; needs a mutex (same promise-chain pattern as TokenStore/GitSync) and a try/finally around the loop to clean up the journal on error

- [x] TokenTreeNode.tsx is 2044 lines with 25 useState calls and defines ~15 non-memoized handler functions that create new closures on every render — handleApplyToSelection (L442) performs expensive token resolution including alias traversal on every render (not wrapped in useCallback or gated behind user interaction); the component renders once per visible token in a potentially 1000+ item virtualized list, so these per-render allocations multiply; additionally the component mixes rendering logic for leaf tokens, group headers, inline editors, context menus, drag handles, and binding indicators in a single function body with no sub-component extraction — this makes it impossible to memoize individual concerns and means any state change (e.g., hovering a different row) re-runs all handler definitions for every visible row (TokenTreeNode.tsx)

- [x] useThemeCompare hook is orphaned — only imported by ThemeManager.tsx but the equivalent functionality now lives in ThemeCompare.tsx component via comparisonUtils; remove the hook and any dead references to reduce maintenance surface (packages/figma-plugin/src/ui/hooks/useThemeCompare.ts)
- [x] PreviewPanel template system is disconnected from actual token data — the 6 hardcoded templates (Colors, Type Scale, Buttons, Forms, Card, Effects) render static CSS-variable-based layouts but don't adapt to what token types actually exist in the workspace; if a user has only color and spacing tokens, they still see all 6 templates including irrelevant ones like Forms; filter or auto-select templates based on available token types (PreviewPanel.tsx TEMPLATES array ~L24)
- [x] No token search from the Inspect panel — when inspecting a Figma selection, users see bound tokens and unbound properties but have no way to search for a token to bind without switching to the Define tab; add an inline token search/filter within the Inspect panel's unbound property rows so users can find and bind tokens without losing their inspection context (SelectionInspector.tsx, QuickApplyPicker.tsx)
- [x] ExportPanel has no "export diff since last export" mode — every export generates the full token set; for CI/CD workflows and incremental handoff, users need to export only tokens that changed since a reference point (last commit, last export, or specific snapshot); add a "Changes only" toggle that filters the export to added/modified tokens using the git diff or operation log (ExportPanel.tsx, sync.ts diff endpoints)
- [x] LintConfigPanel has no per-set or per-group rule scoping — all lint rules apply globally across all sets with identical settings; power users managing brand-specific sets (e.g., "brand-a" strict, "internal" permissive) cannot configure different rule severity per set or exclude specific token path patterns from specific rules; add optional scope filters to each rule configuration (LintConfigPanel.tsx, lint.ts service)
- [~] No keyboard navigation between token tree nodes — the token list supports mouse interaction, drag-drop, and context menus, but arrow-key navigation through the tree (up/down to move between siblings, right to expand, left to collapse, Enter to edit) is not implemented; this is a standard tree-view accessibility pattern and a major productivity gap for keyboard-heavy users (TokenList.tsx, TokenTreeNode.tsx, TokenTreeContext.tsx)
- [~] ThemeManager "Auto-fill" feature is buried and unnamed — the auto-fill capability (filling token gaps across theme options) is hidden inside the coverage analysis section with no command palette entry, no keyboard shortcut, and no mention in the guided setup; add a command palette entry "Auto-fill theme gaps" and surface it as a suggested action when coverage analysis detects gaps (ThemeManager.tsx auto-fill section, App.tsx command palette)
- [~] No unified "token health" dashboard — lint violations, canvas coverage gaps, stale generators, broken aliases, and unused tokens are each discoverable through separate panels (Validation, Canvas Audit, Generators, Token Flow); a single health summary showing all actionable issues in one place would eliminate checking 4+ panels to understand overall token quality; surface as a status bar widget or command palette summary (AnalyticsPanel.tsx, HeatmapPanel.tsx, GeneratorPipelineCard.tsx staleness, TokenFlowPanel.tsx)
- [ ] Generator step override UX requires API knowledge — overriding individual steps in a generator (e.g., pinning a specific color in a ramp) requires knowing the step name and using the override API endpoints; the GeneratorPipelineCard shows steps but doesn't offer inline click-to-override on individual generated values; add click-to-pin on each step's preview swatch/value in the pipeline card (GeneratorPipelineCard.tsx step rendering, generators.ts override endpoints)
- [ ] Token-path-to-URL encoding expression `.split('.').map(encodeURIComponent).join('/')` is duplicated 38 times across 20 files (useTokenCrud 7x, AnalyticsPanel 5x, TokenList 3x, TokenEditor 3x, PropertyRow 2x, and 11 more) — extract a shared `tokenPathToUrlSegment(path)` utility into `shared/utils.ts` to eliminate the duplication and ensure any future encoding changes (e.g., handling segments with dots) apply everywhere (grep for the pattern to find all sites)
- [ ] bulkRename's circular-reference check runs against stale flatTokens during a batch — inside withBatch, rebuildFlatTokens is deferred until endBatch(), so checkCircularReferences at L1708-1712 queries pre-rename token values from the Map; a rename that creates a circular alias chain (A→B renamed such that B→A) passes the check because it sees old paths; move the circular check to after endBatch or build a temporary merged view for validation (packages/server/src/services/token-store.ts L1705-1712)
- [ ] GitSync.applyDiffChoices does not coordinate with TokenStore's file watcher when checking out remote files — `git checkout origin/branch -- file` writes to disk, the chokidar watcher fires (no write-guard set for these paths), and TokenStore reloads the file into memory while GitSync is still iterating; then `git add` stages whatever the watcher loaded, which may differ from what was checked out if another write happened in between; applyDiffChoices should call tokenStore._startWriteGuard for each pulled file before checkout and reload explicitly after all checkouts complete (packages/server/src/services/git-sync.ts L752-773)
- [ ] UI fetch hooks have inconsistent abort/timeout patterns creating hang and race risks — useGeneratorPreview has no timeout on its fetch (can hang indefinitely), useResolvers has no abort signal at all, useTokenSyncBase pull operations use Promise.all with no signal, while useTokens and useLint properly use AbortSignal.any with 5s timeout and disconnect signal; additionally useTokenDataLoading's fetchAllTokensFlatWithSets has no abort signal and relies solely on a generation counter to discard stale responses; standardize by extracting a createFetchSignal(disconnectSignal?, timeoutMs?) factory and using it in all ~15 data-fetching hooks (hooks/useGeneratorPreview.ts L137, useResolvers.ts L50, useTokenSyncBase.ts L213, useTokenDataLoading.ts L32)
