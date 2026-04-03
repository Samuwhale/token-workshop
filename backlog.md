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

- [x] No "Extract and Bind Unbound" fast-path in SelectionInspector — users inspecting a layer with many unbound properties must create tokens one-by-one; add a batch action that extracts all unbound properties as tokens and binds them in one step
- [x] Token search qualifiers in the command palette (type:color, has:ref, path:brand, value:#, has:description, has:generated) are documented only in a collapsible hint inside the palette — they should be listed in the keyboard shortcuts modal and help docs
- [x] No combined preview before Publish All — the Publish All button triggers variable sync, style sync, and git commit sequentially without first showing a unified summary of all changes across the three channels
- [x] Contrast matrix in AnalyticsPanel has no filtering by token group or sorting by failure severity — with 100+ color tokens the matrix becomes unwieldy and finding the worst WCAG violations requires scanning every cell
- [x] No keyboard shortcut to jump directly to token search mode — users must first open command palette (Cmd+K) then type the ">" prefix; a dedicated shortcut like Cmd+Shift+F would save a step for the most common power-user action

- [~] Inconsistent async cleanup across UI hooks — useGenerators.ts, useTokens.ts, useFigmaSync.ts, and useGeneratorPreview.ts lack proper AbortController cleanup and setState-after-unmount guards, while sibling hooks (useLint.ts, useThemeSwitcher.ts, useResolvers.ts) implement the correct pattern; this causes potential setState-on-unmounted-component warnings and stale closure bugs across all async data-fetching hooks; standardize all hooks to check `signal.aborted` before any setState in finally/then blocks and clean up abort refs consistently
- [x] styleSync.ts writes `setPluginData('tokenPath', token.path)` unconditionally even when paint/gradient value parsing fails — in `applyPaintStyle` (L131) if `parseColor` returns null, the style's visual is unchanged but metadata claims it's bound to the token; in `applyGradientPaintStyle` (L158) if fewer than 2 gradient stops parse successfully, the style isn't updated but metadata is still written; this creates ghost bindings where Figma styles appear linked to tokens without reflecting their values
- [~] SettingsPanel `handleApplyImport` writes arbitrary keys to localStorage without validating against an allowed-key whitelist, then auto-reloads the page after 800ms — a crafted export file can inject any localStorage key (not just settings prefixed keys), potentially corrupting app state or overwriting unrelated data; should validate imported keys against the known `STORAGE_KEYS` and `STORAGE_PREFIXES` before writing (SettingsPanel.tsx L315-325)
- [~] generator-service.ts has multiple error-handling gaps that can lose data or mislead users — `updateBulkTokenPaths` silently returns count=0 when regex compilation fails instead of reporting the error (L260); `executeGenerator` clears `generatorErrors` before subsequent `clearNonLockedOverrides` runs, so if that secondary operation fails the error is lost (L598 vs L635); `executeGeneratorMultiBrand` swallows rollback errors with `.catch(() => {})` leaving partial state on failure (L762); all three patterns should propagate errors to callers
- [ ] ExportPanel `figmaLoadingTimeoutRef` timeout (10s) has no cleanup on component unmount — if the user navigates away from ExportPanel while waiting for a Figma response, the timeout fires and calls `setFigmaLoading(false)` and `setError(...)` on the unmounted component; the ref is cleared on re-entry (L312-314) but not in a useEffect cleanup; additionally the sets-fetch useEffect (L240-247) has no AbortController so in-flight requests complete and setState after unmount (ExportPanel.tsx L308-321)

- [ ] ComparePanel line 319 dead ternary renders nothing — `{key === 'fontFamily' || key === 'color' ? null : null}` should render inline color swatches or font previews for those property keys in the side-by-side comparison table, instead of being a no-op (ComparePanel.tsx L319)
- [ ] Lint rule labels duplicated with inconsistent wording across three locations — LintConfigPanel RULE_DEFS says "Raw color values" while AnalyticsPanel RULE_LABELS says "Raw color value"; "Require description" vs "Missing description"; max-alias-depth rule is missing entirely from AnalyticsPanel; extract a shared RULE_REGISTRY constant used by both panels and the server (LintConfigPanel.tsx L18-46, AnalyticsPanel.tsx L43-54, server lint.ts)
- [ ] Generator save flow requires up to 3 sequential confirmation dialogs (preview confirmation → overwrite warning → semantic mapping interception) — consolidate into a single unified preview-and-confirm step that shows overwrites and semantic mapping options together, reducing back-and-forth for the most common generator workflow (useGeneratorSave.ts, TokenGeneratorDialog.tsx)
- [ ] CrossThemeComparePanel and ThemeCompare show missing/differing tokens but offer no "create missing" or "fill gap" bulk action — users must manually navigate to the token editor for each gap; add a "Create missing overrides" button that batch-creates alias tokens for gaps shown in the comparison view (CrossThemeComparePanel.tsx, ThemeCompare.tsx)
- [ ] HistoryPanel mixes three recovery mechanisms (git commits, manual snapshots, server operation log) in one timeline with different undo semantics and no explanation of which applies when — users cannot tell whether to use Rollback, Restore, or git Revert for their situation; add contextual labels or a brief inline legend explaining the three mechanisms and when each is appropriate (HistoryPanel.tsx)
- [ ] ImportPanel is 2133 lines with 49 useState calls — the conflict resolution UI, source selection, progress tracking, and results display should be decomposed into focused sub-components with shared context, similar to the TokenList extraction pattern; the current monolith makes every change risky and forces new contributors to understand the entire file to modify one flow (ImportPanel.tsx)
- [ ] GraphPanel is an 1820-line monolith with 6 template definitions hardcoded inline (~200 lines of template data) — extract templates to a separate `graph-templates.ts` config file and decompose the canvas, node editor, and template picker into sub-components; the current structure makes adding new templates or modifying canvas behavior unnecessarily coupled (GraphPanel.tsx L38-200+)
- [ ] Generator dependency chain failures are silent — if Generator A fails, Generator B (which sources from A's output) is silently skipped during topological execution with no UI indication of why B didn't run; surface a "blocked by failed dependency" status on downstream generators so users can diagnose chain failures (generator-service.ts topological sort ~L504-565, GeneratorPanel UI)
- [ ] ResolverPanel template creation auto-detects light/dark/foundation sets via fragile substring matching (`toLowerCase().includes('light')`) that silently picks wrong sets if naming doesn't match expectations — should show the detected set assignments to the user for confirmation before creating the resolver, rather than silently guessing (ResolverPanel.tsx L143-147)
- [ ] No manual snapshot-to-snapshot diff — users can only compare a snapshot against current state; comparing two arbitrary snapshots (e.g., "state before my refactor" vs "state after") requires restoring one then comparing, which is destructive; add a snapshot-to-snapshot comparison endpoint and UI (manual-snapshot.ts, HistoryPanel.tsx)
- [ ] Variable/style sync operations (handleSyncGroup, handleSyncGroupStyles) have no progress reporting — users see a spinner with no indication of how many tokens have been processed or how many remain; only scope application has batch progress; add progress callbacks for the main sync flows (useFigmaSync.ts, SyncPanel.tsx)
