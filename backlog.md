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

- [x] PublishPanel "Publish All" silently downgrades to "Publish without Git" when merge conflicts exist — the button label changes subtly but there's no toast, banner, or modal explaining why Git was skipped; users may think their tokens were pushed to Git when they weren't; show an explicit notification after Publish All completes explaining that Git sync was skipped due to unresolved merge conflicts, with a link to the Git section (PublishPanel.tsx ~L publish-all orchestration)
- [x] Move/Copy token to set dialogs do not check for name conflicts in the target set — the dialog lets you pick a target set and confirms immediately, but if the target already has a token at the same path, it silently overwrites; add a conflict preview (showing existing vs incoming value) and let users choose overwrite/skip/rename before proceeding (TokenList.tsx move/copy dialog handlers, useTokenCrud.ts)
- [x] Analytics panel and Health panel both run token validation independently with no shared cache — HealthPanel fetches lint violations and cross-set validation on mount/refresh, and AnalyticsPanel runs its own auto-revalidation 2s after token changes; neither shares results with the other, so switching between them triggers redundant server round-trips; consider a shared validation cache (e.g., in a context or hook) that both panels read from, with a single invalidation trigger (HealthPanel.tsx, AnalyticsPanel.tsx)
- [x] GitSubPanel merge conflict UI shows only 4 lines per conflict region — for non-trivial conflicts (multi-token JSON changes), 4 lines is too little context to understand what's different; the "ours" vs "theirs" labels don't clarify which is local vs remote; expand default visible lines to 8-10, add "(local)" / "(remote)" labels next to "ours" / "theirs", and add a "Show full context" toggle per conflict region (GitSubPanel.tsx conflict rendering)
- [x] [HIGH] Generator auto-run fires outside the token lock causing race conditions with route handlers — `tokenStore.onChange` in `index.ts:95` calls `generatorService.runForSourceToken()` without acquiring `tokenLock.withLock()`, while all route handlers (tokens.ts, sets.ts, etc.) hold the lock during mutations; concurrent generator writes and route handler writes can corrupt token state and produce inconsistent operation-log snapshots
- [x] SelectionInspector has propFilter/propFilterMode state declared but no filter UI rendered — the state exists at the top of the component but the corresponding input/toggle is never shown to users; either implement the property filter UI (useful when inspecting layers with many properties) or remove the dead state to reduce confusion (SelectionInspector.tsx ~L208-209)
- [x] ExportPanel "changes only" mode is hidden behind a small checkbox with no discoverability — this powerful feature (export only git-tracked modified/added tokens) is easy to miss; surface it as a toggle pill next to the export button or as a prominent option in the export flow, and add a brief explanation of what "changes" means (since last commit vs uncommitted) (ExportPanel.tsx changes-only UI)
- [x] No "unbind all properties" quick action in SelectionInspector — users can unbind one property at a time via hover X button, and there's a "clear all bindings" action, but there's no middle ground like "unbind all color properties" or "unbind all layout properties" for targeted cleanup; add per-category "unbind all" buttons in the property group headers (SelectionInspector.tsx property group rendering)
- [x] Plugin MESSAGE_SCHEMA is missing `resolvedValue` validation for 3 message types (`apply-to-selection`, `batch-bind-heatmap-nodes`, `apply-to-nodes`) — the schema at `controller.ts:70,87,94` doesn't check for `resolvedValue`, but the handlers at lines 224, 332, 381 pass `msg.resolvedValue` to `applyTokenValue()` which has no null guard and will crash on the typography branch (line 102+) when `resolvedValue` is undefined
- [x] `isNetworkError()` in `apiFetch.ts:24` classifies ALL TypeErrors as network errors, triggering false `markDisconnected()` calls across 10+ hooks — if a `.then()` callback throws a TypeError from an unexpected response shape (e.g., property access on null), the UI shows "server disconnected" and enters reconnect mode even though the server is healthy; should narrow to only TypeErrors from `fetch()` itself
- [x] Server token routes in `tokens.ts` accept path-operation parameters (oldGroupPath, newGroupPath, targetSet, etc.) from request bodies without validation before passing to service methods — at least 12 route handlers destructure and forward body properties directly (lines 96, 127, 165, 199, 228, 259, 288, 322, 353, 392, 431, 472); while services have some internal guards, missing route-level validation means malformed input (empty strings, paths with invalid characters) propagates deeper than necessary and produces confusing error messages instead of clean 400 responses
- [~] App.tsx is a 3461-line orchestrator with 44 custom hooks and 104 hook call sites all in one component — every state change from any hook re-renders App and triggers re-evaluation of all 44 hooks' memoizations; should be decomposed into feature-area context providers (TokensProvider, SyncProvider, InspectProvider, etc.) so state changes in one domain don't cascade through unrelated domains

- [~] Import flow has no merge/conflict preview — importing into an existing token set silently overwrites matching paths with no diff preview or skip/overwrite/rename choice per token; users can accidentally lose manual edits when re-importing from Figma Variables or a JSON file (ImportPanel.tsx)
- [~] Quick-create token form only offers 13 of 26 supported token types — types like `composition`, `cubicBezier`, `transition`, `letterSpacing`, `lineHeight`, `percentage`, `textDecoration`, `textTransform`, and `asset` are only accessible through the full editor; users who want to quickly create an easing token or a transition must open the full editor and change the type there (TokenList.tsx quick-create dropdown ~L3603-3616)
- [ ] No cancellation for long-running plugin scans — operations like `scan-canvas-heatmap`, `scan-component-coverage`, `scan-consistency`, and `scan-token-usage` can run for many seconds on large Figma files but have no cancel button or timeout; the user must wait for completion or close and reopen the plugin (controller.ts scan handlers)
- [ ] ThemeManager "Base" vs "Override" set terminology is technical and unexplained inline — users must understand a priority-based merging model to correctly assign sets to theme options, but the only explanation is tooltip text on hover; an inline teaching moment or visual stacking diagram when first assigning sets would prevent common misconfiguration (ThemeManager.tsx set assignment ~L1640-1660)
- [ ] Export presets are localStorage-only and not included in settings backup/restore — users who save named export configurations (platform + filter + CSS selector combos) lose them on plugin reinstall or browser clear; presets should either be included in the settings export/import flow or persisted server-side alongside token data (ExportPanel.tsx presets, SettingsPanel.tsx export/import)
- [ ] No progress reporting for `search-layers`, `syncBindings`, `remapBindings`, or `applyToNodes` plugin operations — these can process hundreds of nodes silently with no progress bar or count; on large pages this looks like the plugin has frozen (controller.ts, selectionHandling.ts)
- [ ] Multi-mode Figma Variable export to non-DTCG platforms loses mode variants — exporting to CSS, Tailwind, SCSS, or Swift only outputs the default mode; other modes (e.g., Dark, Dense) are silently dropped; at minimum, export one file per mode or offer a mode selector in the export UI (ExportPanel.tsx Figma Variables export flow)
- [ ] PreviewPanel has no loading indicator while resolving CSS custom property slots — switching templates or changing tokens causes a visible stutter with no spinner or skeleton state; other panels (Export, Publish) use spinners consistently but PreviewPanel has none (PreviewPanel.tsx)
- [ ] `useSyncBindings` and `useWindowResize` are defined inline in App.tsx instead of extracted to hooks/ — these 160+ lines of hook logic in the 3,481-line App.tsx contribute to its size and make the hooks undiscoverable for reuse; extract them to the hooks/ directory following the pattern of all other custom hooks (App.tsx inline hook definitions)
- [ ] Server token-store.ts has no unit tests — the largest and most critical service (1000+ lines) handling all token CRUD, alias resolution, cross-set dependencies, file watching, and batch operations has zero test coverage; a single bug here can corrupt all token data (packages/server/src/services/token-store.ts)
- [ ] Settings backup/restore excludes per-set view mode, export presets, export path prefix, and analytics suppressions — the import whitelist in storage.ts omits several persisted keys that users would expect to survive a plugin reinstall, creating a silent data loss on restore (packages/figma-plugin/src/ui/shared/storage.ts import whitelist, SettingsPanel.tsx)
- [ ] ThemeManager coverage gaps are only visible after manually expanding each dimension's coverage section — users with 5+ dimensions must click into each one to discover missing token coverage; the global "X gaps can be auto-filled" banner exists but only after gaps are computed on expansion; show a per-dimension gap count badge on the collapsed card header so problems are visible at a glance (ThemeManager.tsx dimension cards)
