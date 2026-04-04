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

- [~] Server token-store.ts has no unit tests — the largest and most critical service (1000+ lines) handling all token CRUD, alias resolution, cross-set dependencies, file watching, and batch operations has zero test coverage; a single bug here can corrupt all token data (packages/server/src/services/token-store.ts)
- [x] Settings backup/restore excludes per-set view mode, export presets, export path prefix, and analytics suppressions — the import whitelist in storage.ts omits several persisted keys that users would expect to survive a plugin reinstall, creating a silent data loss on restore (packages/figma-plugin/src/ui/shared/storage.ts import whitelist, SettingsPanel.tsx)
- [~] Consolidate duplicated Variable/Style sync code — `useVariableSync` (171 lines) and `useStyleSync` (171 lines) are structurally identical hooks with different property names; `VariableSyncSubPanel` (180 lines) and `StyleSyncSubPanel` (180 lines) are 95%+ identical components; `useFigmaSync` duplicates the token-fetch-filter-resolve pattern between `handleSyncGroup` and `handleSyncGroupStyles` (L65-98 vs L100-134); all six files (~915 lines total) should be consolidated into a parameterized `useSyncEntity` hook and a generic `SyncSubPanel` component, cutting ~450 lines of pure duplication
- [~] `useFigmaSync` and `useDragDrop` hooks lack abort signals and unmount guards — `useFigmaSync` progress message handler (L38-49) doesn't check abort signal before calling setState, and `useDragDrop` has no AbortController for its 6+ `apiFetch` calls (L83, L108, L124, L175, L197, L205); both can trigger React state-update-on-unmounted-component warnings; should follow the per-fetch AbortController pattern already applied to `useGitConflicts`, `useGitDiff`, `useLintConfig`, and `useRecentOperations` (packages/figma-plugin/src/ui/hooks/useFigmaSync.ts, packages/figma-plugin/src/ui/hooks/useDragDrop.ts)
- [ ] Plugin sandbox `fontLoading.ts` cache is poisoned by API errors — `getAvailableFonts()` (L33-38) sets `cachedFonts` to the promise result of `figma.listAvailableFontsAsync()`, but if the API call throws, the caught exception propagates and `cachedFonts` remains `null`; however the real bug is that a concurrent second caller during the first in-flight `await` will start a duplicate API call because `cachedFonts` is still `null` during the await; should cache the Promise itself (not the result) so concurrent callers share the same in-flight request, and clear the cache on rejection so retries work (packages/figma-plugin/src/plugin/fontLoading.ts L27-38)
- [ ] Plugin `variableSync.ts` rollback error handling has inconsistent error-type coercion — Promise rejection `reason` values are interpolated directly into strings via template literals (L158, L163, L178) but `reason` can be any type (Error, string, object, undefined); similarly `revertVariables` (L229-243) pushes formatted errors but `revertStyles` (styleSync.ts L151-186) uses a different sequential try-catch pattern for the same conceptual operation; should normalize error coercion with a shared `toErrorMessage(reason: unknown): string` helper and align the rollback patterns between variable and style sync (packages/figma-plugin/src/plugin/variableSync.ts, packages/figma-plugin/src/plugin/styleSync.ts)
