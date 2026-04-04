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
- [x] No keyboard navigation between token tree nodes — the token list supports mouse interaction, drag-drop, and context menus, but arrow-key navigation through the tree (up/down to move between siblings, right to expand, left to collapse, Enter to edit) is not implemented; this is a standard tree-view accessibility pattern and a major productivity gap for keyboard-heavy users (TokenList.tsx, TokenTreeNode.tsx, TokenTreeContext.tsx)
- [x] ThemeManager "Auto-fill" feature is buried and unnamed — the auto-fill capability (filling token gaps across theme options) is hidden inside the coverage analysis section with no command palette entry, no keyboard shortcut, and no mention in the guided setup; add a command palette entry "Auto-fill theme gaps" and surface it as a suggested action when coverage analysis detects gaps (ThemeManager.tsx auto-fill section, App.tsx command palette)
- [x] No unified "token health" dashboard — lint violations, canvas coverage gaps, stale generators, broken aliases, and unused tokens are each discoverable through separate panels (Validation, Canvas Audit, Generators, Token Flow); a single health summary showing all actionable issues in one place would eliminate checking 4+ panels to understand overall token quality; surface as a status bar widget or command palette summary (AnalyticsPanel.tsx, HeatmapPanel.tsx, GeneratorPipelineCard.tsx staleness, TokenFlowPanel.tsx)
- [x] [HIGH] Plugin revert functions delete created variables/styles even when restores fail — in variableSync.ts revertVariables (L160-173) and styleSync.ts revertStyles (L151-180), the deletion phase proceeds unconditionally after Promise.allSettled restores; if restores fail (API timeout, permission error, font loading failure), created variables/styles are still deleted, causing unrecoverable data loss; add a guard that skips deletions when any restore rejects
- [x] Generator step override UX requires API knowledge — overriding individual steps in a generator (e.g., pinning a specific color in a ramp) requires knowing the step name and using the override API endpoints; the GeneratorPipelineCard shows steps but doesn't offer inline click-to-override on individual generated values; add click-to-pin on each step's preview swatch/value in the pipeline card (GeneratorPipelineCard.tsx step rendering, generators.ts override endpoints)
- [x] Token-path-to-URL encoding expression `.split('.').map(encodeURIComponent).join('/')` is duplicated 38 times across 20 files (useTokenCrud 7x, AnalyticsPanel 5x, TokenList 3x, TokenEditor 3x, PropertyRow 2x, and 11 more) — extract a shared `tokenPathToUrlSegment(path)` utility into `shared/utils.ts` to eliminate the duplication and ensure any future encoding changes (e.g., handling segments with dots) apply everywhere (grep for the pattern to find all sites)
- [x] bulkRename's circular-reference check runs against stale flatTokens during a batch — inside withBatch, rebuildFlatTokens is deferred until endBatch(), so checkCircularReferences at L1708-1712 queries pre-rename token values from the Map; a rename that creates a circular alias chain (A→B renamed such that B→A) passes the check because it sees old paths; move the circular check to after endBatch or build a temporary merged view for validation (packages/server/src/services/token-store.ts L1705-1712)
- [x] GitSync.applyDiffChoices does not coordinate with TokenStore's file watcher when checking out remote files — `git checkout origin/branch -- file` writes to disk, the chokidar watcher fires (no write-guard set for these paths), and TokenStore reloads the file into memory while GitSync is still iterating; then `git add` stages whatever the watcher loaded, which may differ from what was checked out if another write happened in between; applyDiffChoices should call tokenStore._startWriteGuard for each pulled file before checkout and reload explicitly after all checkouts complete (packages/server/src/services/git-sync.ts L752-773)
- [x] UI fetch hooks have inconsistent abort/timeout patterns creating hang and race risks — useGeneratorPreview has no timeout on its fetch (can hang indefinitely), useResolvers has no abort signal at all, useTokenSyncBase pull operations use Promise.all with no signal, while useTokens and useLint properly use AbortSignal.any with 5s timeout and disconnect signal; additionally useTokenDataLoading's fetchAllTokensFlatWithSets has no abort signal and relies solely on a generation counter to discard stale responses; standardize by extracting a createFetchSignal(disconnectSignal?, timeoutMs?) factory and using it in all ~15 data-fetching hooks (hooks/useGeneratorPreview.ts L137, useResolvers.ts L50, useTokenSyncBase.ts L213, useTokenDataLoading.ts L32)
- [~] HistoryPanel.tsx is a 2358-line monolith with 69 useState calls across 4 independent source views (timeline, git commits, commit compare, snapshots) that share a single error state — SnapshotsSource single-compare and pair-compare both write to the same `error` state causing cross-contamination; snapshot API calls have no AbortController so rapid comparisons race; the change-list-grouped-by-set rendering pattern is copy-pasted across 3 locations (~L1318, ~L1688, ~L1996); decompose into separate source components with isolated state and extract a shared ChangesBySetList component
- [x] Server-side validation gaps allow invalid state to persist until runtime failure — (1) operation-log.ts rollback (L333-337) has a TOCTOU race: concurrent rollback requests both read `entry.rolledBack === false` before either sets it to true, causing double-execution of structural rollback steps; the lock is only acquired at `pushAndPersist` at the end, not at the start; (2) generator-service.ts create/update (L508) does not call `buildDependencyOrder()` to validate for circular generator dependencies, so cycles are only detected at runtime when `runForSourceToken` fires; (3) git-sync.ts resolveConflicts (L373-392) validates provided region indices but does not enforce that ALL conflict regions have choices, allowing partial resolution that leaves merge markers in staged files
- [x] Core package has scattered type safety issues that undermine the resolver pipeline — dtcg-resolver.ts L230 uses an unsafe `as` cast that narrows ResolvedToken to a 4-field object, silently dropping $description and $extensions from the resolved map; types.ts L256 defines ResolverSource as `ResolverRef | Record<string, unknown>` which accepts any object instead of the correct `DTCGGroup`; validator.ts uses 7+ redundant `as Record<string, unknown>` casts after type guard checks that already narrow the type; color-parse.ts exports cssColorString (L596) which is a no-op identity function not re-exported from index.ts (dead code); consolidate by tightening the ResolverSource type, removing the resolver cast, cleaning up validator casts, and removing dead exports

- [x] Resolver modifier inputs and active resolver are not persisted between sessions — useResolvers stores activeResolver and resolverInput in React state only, so switching tabs or closing the plugin loses all modifier selections; theme selections are persisted to localStorage + Figma clientStorage via useThemeSwitcher but resolvers get no equivalent treatment; persist active resolver name and modifier input values to localStorage and restore on mount (useResolvers.ts, ResolverPanel.tsx)
- [~] No "recent tokens" section in QuickApplyPicker or PropertyRow inline bind panel — every time a user opens the token picker to bind a property, the search starts completely blank; power users binding the same token across dozens of layers must re-type the same search each time; add a "Recently used" section (last 5-10 bound tokens from localStorage) above the search results in both QuickApplyPicker.tsx and PropertyRow.tsx inline bind UI
- [~] useFigmaSync hook appears to be a legacy/parallel sync path unused by PublishPanel — PublishPanel uses useVariableSync + useStyleSync + useGitSync, but useFigmaSync.ts (213 LOC) implements a separate group-level sync + scope assignment flow; if PublishPanel doesn't consume it, it's dead code that confuses understanding of the sync architecture; verify whether anything still imports useFigmaSync and remove or consolidate if orphaned (useFigmaSync.ts, PublishPanel.tsx)
- [ ] No batch value editing for multi-selected tokens — users can multi-select tokens (M key) and bulk delete or move them, but cannot edit a shared field (value, description, $type) across the selection; this is the single biggest productivity gap for power users managing large token systems; add a "Edit N selected" action that opens a batch editor for common fields like $type, $description, or a value formula (e.g., "multiply all by 1.5" for dimension tokens) (TokenList.tsx, tokenListTypes.ts, useTokenCrud.ts)
- [ ] PublishPanel "Publish All" silently downgrades to "Publish without Git" when merge conflicts exist — the button label changes subtly but there's no toast, banner, or modal explaining why Git was skipped; users may think their tokens were pushed to Git when they weren't; show an explicit notification after Publish All completes explaining that Git sync was skipped due to unresolved merge conflicts, with a link to the Git section (PublishPanel.tsx ~L publish-all orchestration)
- [ ] Move/Copy token to set dialogs do not check for name conflicts in the target set — the dialog lets you pick a target set and confirms immediately, but if the target already has a token at the same path, it silently overwrites; add a conflict preview (showing existing vs incoming value) and let users choose overwrite/skip/rename before proceeding (TokenList.tsx move/copy dialog handlers, useTokenCrud.ts)
- [ ] Analytics panel and Health panel both run token validation independently with no shared cache — HealthPanel fetches lint violations and cross-set validation on mount/refresh, and AnalyticsPanel runs its own auto-revalidation 2s after token changes; neither shares results with the other, so switching between them triggers redundant server round-trips; consider a shared validation cache (e.g., in a context or hook) that both panels read from, with a single invalidation trigger (HealthPanel.tsx, AnalyticsPanel.tsx)
- [ ] GitSubPanel merge conflict UI shows only 4 lines per conflict region — for non-trivial conflicts (multi-token JSON changes), 4 lines is too little context to understand what's different; the "ours" vs "theirs" labels don't clarify which is local vs remote; expand default visible lines to 8-10, add "(local)" / "(remote)" labels next to "ours" / "theirs", and add a "Show full context" toggle per conflict region (GitSubPanel.tsx conflict rendering)
- [ ] SelectionInspector has propFilter/propFilterMode state declared but no filter UI rendered — the state exists at the top of the component but the corresponding input/toggle is never shown to users; either implement the property filter UI (useful when inspecting layers with many properties) or remove the dead state to reduce confusion (SelectionInspector.tsx ~L208-209)
- [ ] ExportPanel "changes only" mode is hidden behind a small checkbox with no discoverability — this powerful feature (export only git-tracked modified/added tokens) is easy to miss; surface it as a toggle pill next to the export button or as a prominent option in the export flow, and add a brief explanation of what "changes" means (since last commit vs uncommitted) (ExportPanel.tsx changes-only UI)
- [ ] No "unbind all properties" quick action in SelectionInspector — users can unbind one property at a time via hover X button, and there's a "clear all bindings" action, but there's no middle ground like "unbind all color properties" or "unbind all layout properties" for targeted cleanup; add per-category "unbind all" buttons in the property group headers (SelectionInspector.tsx property group rendering)
