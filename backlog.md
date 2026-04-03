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

- [~] No "Extract and Bind Unbound" fast-path in SelectionInspector — users inspecting a layer with many unbound properties must create tokens one-by-one; add a batch action that extracts all unbound properties as tokens and binds them in one step
- [~] Token search qualifiers in the command palette (type:color, has:ref, path:brand, value:#, has:description, has:generated) are documented only in a collapsible hint inside the palette — they should be listed in the keyboard shortcuts modal and help docs
- [ ] No combined preview before Publish All — the Publish All button triggers variable sync, style sync, and git commit sequentially without first showing a unified summary of all changes across the three channels
- [ ] Contrast matrix in AnalyticsPanel has no filtering by token group or sorting by failure severity — with 100+ color tokens the matrix becomes unwieldy and finding the worst WCAG violations requires scanning every cell
- [ ] No keyboard shortcut to jump directly to token search mode — users must first open command palette (Cmd+K) then type the ">" prefix; a dedicated shortcut like Cmd+Shift+F would save a step for the most common power-user action

- [ ] Inconsistent async cleanup across UI hooks — useGenerators.ts, useTokens.ts, useFigmaSync.ts, and useGeneratorPreview.ts lack proper AbortController cleanup and setState-after-unmount guards, while sibling hooks (useLint.ts, useThemeSwitcher.ts, useResolvers.ts) implement the correct pattern; this causes potential setState-on-unmounted-component warnings and stale closure bugs across all async data-fetching hooks; standardize all hooks to check `signal.aborted` before any setState in finally/then blocks and clean up abort refs consistently
- [ ] styleSync.ts writes `setPluginData('tokenPath', token.path)` unconditionally even when paint/gradient value parsing fails — in `applyPaintStyle` (L131) if `parseColor` returns null, the style's visual is unchanged but metadata claims it's bound to the token; in `applyGradientPaintStyle` (L158) if fewer than 2 gradient stops parse successfully, the style isn't updated but metadata is still written; this creates ghost bindings where Figma styles appear linked to tokens without reflecting their values
- [ ] SettingsPanel `handleApplyImport` writes arbitrary keys to localStorage without validating against an allowed-key whitelist, then auto-reloads the page after 800ms — a crafted export file can inject any localStorage key (not just settings prefixed keys), potentially corrupting app state or overwriting unrelated data; should validate imported keys against the known `STORAGE_KEYS` and `STORAGE_PREFIXES` before writing (SettingsPanel.tsx L315-325)
- [ ] generator-service.ts has multiple error-handling gaps that can lose data or mislead users — `updateBulkTokenPaths` silently returns count=0 when regex compilation fails instead of reporting the error (L260); `executeGenerator` clears `generatorErrors` before subsequent `clearNonLockedOverrides` runs, so if that secondary operation fails the error is lost (L598 vs L635); `executeGeneratorMultiBrand` swallows rollback errors with `.catch(() => {})` leaving partial state on failure (L762); all three patterns should propagate errors to callers
- [ ] ExportPanel `figmaLoadingTimeoutRef` timeout (10s) has no cleanup on component unmount — if the user navigates away from ExportPanel while waiting for a Figma response, the timeout fires and calls `setFigmaLoading(false)` and `setError(...)` on the unmounted component; the ref is cleared on re-entry (L312-314) but not in a useEffect cleanup; additionally the sets-fetch useEffect (L240-247) has no AbortController so in-flight requests complete and setState after unmount (ExportPanel.tsx L308-321)
