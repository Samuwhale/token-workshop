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

- [x] Variable/style sync operations (handleSyncGroup, handleSyncGroupStyles) have no progress reporting — users see a spinner with no indication of how many tokens have been processed or how many remain; only scope application has batch progress; add progress callbacks for the main sync flows (useFigmaSync.ts, SyncPanel.tsx)
- [x] Server routes use two incompatible error handling patterns — 27 routes use inline `reply.status(500).send({ error, detail })` while 70 routes use `handleRouteError(reply, err)` from `errors.ts`; the inline pattern loses typed HTTP errors (NotFoundError→404, ConflictError→409, BadRequestError→400) and always returns 500 even for client errors; worst offenders are sync.ts (12 inline), sets.ts (4 inline), tokens.ts (5 inline), and themes.ts (2 inline); all inline `reply.status(500)` catches should be replaced with `handleRouteError` to get correct status codes and consistent response shape (all route files under packages/server/src/routes/)
- [x] Plugin sandbox functions silently return success on Figma API failures — `scanTokenVariableBindings` (variableSync.ts L375) catches all errors and posts empty `variables: []` to UI, making it impossible to distinguish "no bindings" from "API failed"; `readFigmaVariables` (variableSync.ts L196) has the same pattern; `heatmapScanning.ts` has 5 catch blocks (L47, L60, L188, L205, L264) that post generic error messages without the original error details; `consistencyScanner.ts` L396 catches and returns partial results without indicating the scan was incomplete; these should distinguish API failures from empty results and surface actionable error information to the UI
- [x] TokenStore.saveSet has no per-set write serialization — 38 call sites do `await this.saveSet(name)` but saveSet (token-store.ts L1812-1821) has no guard against concurrent calls for the same set; two route handlers that modify different tokens in the same set can interleave: both read the in-memory set, both modify it, both call saveSet — since saveSet reads `this.sets.get(name)` synchronously before the async `fs.writeFile`, the second caller's write includes both changes, but if the first caller's `fs.rename` completes after the second's, the first caller's version (missing the second change) wins on disk; the write-guard only suppresses watcher events, it doesn't serialize writes
- [x] Core resolver `collectReferences` silently adds undefined to reference set on malformed formula — resolver.ts L237 uses regex match group `m[1]` from `makeReferenceGlobalRegex()` without null-checking the capture group; if a formula contains a malformed reference like `{.}` or `{}`, the regex matches but `m[1]` is undefined, adding `undefined` to the references Set which propagates through dependency graph construction and can cause "Cannot read properties of undefined" errors during resolution; additionally dtcg-resolver.ts L203-204 casts `dtcgToken.$value as Token['$value']` and `dtcgToken.$type as TokenType | undefined` without validation, losing type safety at the DTCG-to-internal boundary (packages/core/src/resolver.ts, packages/core/src/dtcg-resolver.ts)
- [x] EmptyState overwhelms with 8+ buttons and no progressive disclosure — the "Or start with" section lists every import source simultaneously, creating decision paralysis for new users; group by familiarity (e.g., "From Figma" / "From file" / "From scratch") and collapse less-common sources behind a "More options" toggle (EmptyState.tsx)
- [x] No cross-set token move — moving a token from Set A to Set B requires deleting and recreating it, losing operation history; add a "Move to set…" action in the token context menu that atomically creates in the target set and removes from the source, updating alias references across all sets (TokenTreeNode.tsx context menu, server tokens.ts/sets.ts)
- [x] Theme dimension set-status legend missing — the source/enabled/disabled status uses colored dots (blue/green/gray) with no in-UI explanation; new users must guess the meaning; add a small inline legend or tooltip on the dot headers explaining the three states and their resolution priority (ThemeManager.tsx set assignment grid)
- [x] Generator stale indicators not surfaced — the server computes an `isStale` flag when a generator's source token value has changed since last execution, but the UI never displays this; show a "stale" badge on generator cards and offer a one-click "Re-run stale generators" bulk action (GeneratorPanel.tsx, useGenerators.ts)
- [x] Snapshot save input has no default name — creating a manual snapshot requires typing a name from scratch every time; pre-populate with a contextual default like "Snapshot YYYY-MM-DD HH:mm" or "Before [last operation]" to reduce friction for quick save-points (HistoryPanel.tsx snapshot save form)
- [x] PublishPanel has no "undo last sync" affordance — after applying a variable or style sync, there's no way to reverse it without manually toggling each token back; add a "Revert last sync" action that restores the pre-sync Figma state using the snapshot captured before sync (SyncPanel.tsx / useFigmaSync.ts)
- [x] Multi-brand generator mode is hidden and mode-switching loses state — the multi-brand toggle is buried in "Advanced options" and switching between single/multi-brand mode clears the source token binding, forcing re-selection; make multi-brand a visible toggle that preserves the source binding when switching modes (TokenGeneratorDialog.tsx)
- [x] Semantic mapping only previewable after generator save — template semantic layers (e.g., action.default→500) are defined but only shown in a post-save dialog; users can't preview or customize the semantic token mapping during template selection, before committing to a generator; show semantic mapping preview inline in the template card or as a step before save (GraphPanel.tsx templates, SemanticMappingDialog.tsx)
- [x] No lint rule presets — LintConfigPanel requires toggling each rule individually with no way to apply a bundle; add preset configurations like "Strict" (all rules on, low thresholds), "Recommended" (common rules), and "Permissive" (structural rules only) as one-click starting points (LintConfigPanel.tsx)
- [x] Full token refresh after every set operation — creating, deleting, renaming, or duplicating a set triggers `refreshTokens()` which re-fetches the entire token tree across all sets; for workspaces with many sets this causes visible latency; use incremental updates (add/remove/rename the affected set in local state) instead of full refetch (App.tsx set CRUD callbacks ~L607-650, useTokens.ts)

- [x] App.tsx is a 3378-line monolith with 46 useState calls — state for compare panels, graph navigation, analytics, history, token flow, settings, and validation all lives in one component function; every state change (e.g., toggling a compare mode) re-renders the entire plugin UI; extract domain-specific state groups into context providers or composite hooks (e.g., useCompareState for the 6 compare-related useState calls, useAnalyticsState for the 4 analytics-related calls, useGraphState for the 3 graph-related calls) to reduce re-render scope and make the component navigable (App.tsx ~L282-658)
- [~] UI data-fetching hooks lack abort signals and error feedback — of ~15 hooks that call apiFetch, only 4 pass abort signals; useGitConflicts, useRecentOperations, useResolvers, useGitDiff, useLintConfig, and useThemeBulkOps all fire fetch calls that cannot be cancelled on component unmount or server disconnect, causing state-update-on-unmounted-component warnings; additionally useTokenDataLoading catches fetch errors but has no error state — it logs to console and sets loading=false so users see an empty token list with no failure indication; fetchAllTokensFlat and fetchAllTokensFlatWithSets in useTokens.ts are 80% duplicated code (both fetch /api/sets then Promise.allSettled over each set) differing only in per-set tracking — a single parameterized function would eliminate the duplication and ensure bug fixes apply to both paths (hooks/*.ts, useTokens.ts L136-210)
- [~] GeneratorService errors are in-memory only and executeGenerator has a concurrent-mutation window — generatorErrors Map is never persisted to disk; a server restart loses all error tracking (including cascade-blocked status), so the UI shows generators as healthy when they last failed; separately, executeGenerator (generator-service.ts L589-626) re-reads this.generators.get(id) after awaiting token resolution and spreads it with lastRunAt, but this re-read+spread+save sequence is not atomic — a concurrent update() call (which writes to the same Map entry) between the re-read at L612 and the save at L619 will have its changes silently overwritten when saveGenerators persists the stale spread (packages/server/src/services/generator-service.ts)
- [ ] TokenTreeNode.tsx is 2044 lines with 25 useState calls and defines ~15 non-memoized handler functions that create new closures on every render — handleApplyToSelection (L442) performs expensive token resolution including alias traversal on every render (not wrapped in useCallback or gated behind user interaction); the component renders once per visible token in a potentially 1000+ item virtualized list, so these per-render allocations multiply; additionally the component mixes rendering logic for leaf tokens, group headers, inline editors, context menus, drag handles, and binding indicators in a single function body with no sub-component extraction — this makes it impossible to memoize individual concerns and means any state change (e.g., hovering a different row) re-runs all handler definitions for every visible row (TokenTreeNode.tsx)

- [ ] Consolidate AnalyticsPanel's "Stats" tab into the token list toolbar — the per-type/per-set token count stats are a passive read-only summary that doesn't warrant its own sub-tab under Ship > Validation; surface these counts as a collapsible row above the token list or as a quick stat popover, and let the Validation sub-tab focus solely on lint violations, contrast, and duplicates (AnalyticsPanel.tsx stats tab, TokenList.tsx toolbar)
- [ ] Merge AnalyticsPanel's "Duplicates" tab into the lint rule system — duplicate-value detection is conceptually a lint rule (no-duplicate-values already exists in lint.ts) but results are displayed in a separate tab with its own scan flow rather than as lint violations; unify by making the duplicates tab read from lint violations filtered by rule ID, eliminating the parallel scan/fetch/display code (AnalyticsPanel.tsx duplicates tab, lint.ts no-duplicate-values rule)
- [ ] useThemeCompare hook is orphaned — only imported by ThemeManager.tsx but the equivalent functionality now lives in ThemeCompare.tsx component via comparisonUtils; remove the hook and any dead references to reduce maintenance surface (packages/figma-plugin/src/ui/hooks/useThemeCompare.ts)
- [ ] No token value clipboard paste into editor — the token editor requires manually typing or picking values; users should be able to paste a hex color, dimension string, or JSON object directly into the value field and have it auto-parsed into the correct DTCG structure; the PasteTokensModal handles bulk paste but there's no quick single-value paste flow for editing an existing token (TokenEditor.tsx value input, ValueEditors.tsx)
- [ ] PreviewPanel template system is disconnected from actual token data — the 6 hardcoded templates (Colors, Type Scale, Buttons, Forms, Card, Effects) render static CSS-variable-based layouts but don't adapt to what token types actually exist in the workspace; if a user has only color and spacing tokens, they still see all 6 templates including irrelevant ones like Forms; filter or auto-select templates based on available token types (PreviewPanel.tsx TEMPLATES array ~L24)
- [ ] No token search from the Inspect panel — when inspecting a Figma selection, users see bound tokens and unbound properties but have no way to search for a token to bind without switching to the Define tab; add an inline token search/filter within the Inspect panel's unbound property rows so users can find and bind tokens without losing their inspection context (SelectionInspector.tsx, QuickApplyPicker.tsx)
- [ ] ExportPanel has no "export diff since last export" mode — every export generates the full token set; for CI/CD workflows and incremental handoff, users need to export only tokens that changed since a reference point (last commit, last export, or specific snapshot); add a "Changes only" toggle that filters the export to added/modified tokens using the git diff or operation log (ExportPanel.tsx, sync.ts diff endpoints)
- [ ] LintConfigPanel has no per-set or per-group rule scoping — all lint rules apply globally across all sets with identical settings; power users managing brand-specific sets (e.g., "brand-a" strict, "internal" permissive) cannot configure different rule severity per set or exclude specific token path patterns from specific rules; add optional scope filters to each rule configuration (LintConfigPanel.tsx, lint.ts service)
- [ ] No keyboard navigation between token tree nodes — the token list supports mouse interaction, drag-drop, and context menus, but arrow-key navigation through the tree (up/down to move between siblings, right to expand, left to collapse, Enter to edit) is not implemented; this is a standard tree-view accessibility pattern and a major productivity gap for keyboard-heavy users (TokenList.tsx, TokenTreeNode.tsx, TokenTreeContext.tsx)
- [ ] ThemeManager "Auto-fill" feature is buried and unnamed — the auto-fill capability (filling token gaps across theme options) is hidden inside the coverage analysis section with no command palette entry, no keyboard shortcut, and no mention in the guided setup; add a command palette entry "Auto-fill theme gaps" and surface it as a suggested action when coverage analysis detects gaps (ThemeManager.tsx auto-fill section, App.tsx command palette)
- [ ] No unified "token health" dashboard — lint violations, canvas coverage gaps, stale generators, broken aliases, and unused tokens are each discoverable through separate panels (Validation, Canvas Audit, Generators, Token Flow); a single health summary showing all actionable issues in one place would eliminate checking 4+ panels to understand overall token quality; surface as a status bar widget or command palette summary (AnalyticsPanel.tsx, HeatmapPanel.tsx, GeneratorPipelineCard.tsx staleness, TokenFlowPanel.tsx)
- [ ] Generator step override UX requires API knowledge — overriding individual steps in a generator (e.g., pinning a specific color in a ramp) requires knowing the step name and using the override API endpoints; the GeneratorPipelineCard shows steps but doesn't offer inline click-to-override on individual generated values; add click-to-pin on each step's preview swatch/value in the pipeline card (GeneratorPipelineCard.tsx step rendering, generators.ts override endpoints)
