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

- [x] No cross-theme token comparison view — there is no way to see how a single token (e.g. `color.action.primary`) resolves across all theme options simultaneously; users must manually switch themes in ThemeManager and note each value; add a "Compare across themes" action on the token context menu that opens a panel showing the resolved value per theme option in a table (TokenList.tsx context menu, new panel component)
- [~] No "move to set" or "copy to set" action for tokens and groups — moving a token or group to a different set requires deleting it from the source set and recreating it in the destination; the group context menu has no "Move to set…" or "Copy to set…" action; add both to the group and token context menus, backed by a POST `/api/tokens/:set/groups/*/move` server endpoint (TokenTreeNode.tsx context menu, packages/server/src/routes/tokens.ts)
- [x] [HIGH] Generator CRUD operations silently discard structural state on rollback — `generator-create`, `generator-delete`, and `generator-update` routes record before/after token snapshots but add no `rollbackSteps`; the `RollbackStep` union type has no generator actions and `RollbackContext.generatorService` only exposes `updateSetName()`; rolling back a `generator-delete` restores the generated tokens but permanently destroys the generator config (users lose the source settings and can never re-run it), while rolling back a `generator-create` leaves an orphaned generator record whose target tokens have been removed; fix: add `delete-generator` and `create-generator` to `RollbackStep`, expose `delete`/`create` on `RollbackContext.generatorService`, and add the inverse rollbackStep to each of the three routes (packages/server/src/routes/generators.ts ~L348, ~L473, ~L520; packages/server/src/services/operation-log.ts)
- [~] [HIGH] TokenList.tsx has 5 async handlers with missing or incomplete error handling — `handleMoveTokenInGroup` has no try/catch so a network error leaves the "Reordering…" spinner permanently stuck until page reload; `handleConfirmPromote` uses `try { await Promise.all } finally {}` with no catch, so partial alias-promotion failures are silently discarded with some tokens converted and others not (data inconsistency, no user feedback); `handleConfirmMoveGroup` and `handleDuplicateToken` both have `try { await } finally { clearLoading() }` but post-finally state resets (`setMovingGroup(null)`, `onRefresh()`) never run on error so the move dialog stays open and the tree never refreshes; `handleUpdateGroupMeta` has no try/catch at all so a failed PATCH silently leaves the UI out of sync; fix all five by wrapping in proper try/catch/finally blocks and surfacing an error toast or inline message on failure (packages/figma-plugin/src/ui/components/TokenList.tsx ~L896, ~L1437, ~L1518, ~L1563, ~L2066)
- [~] ThemeManager auto-fill has no preview step — clicking "Auto-fill" immediately creates alias tokens across sets with no summary of what will be created (how many tokens, in which sets, with what values); this is a potentially large write with no confirmation; show a modal listing the pending changes before executing, with a confirm/cancel choice (packages/figma-plugin/src/ui/components/ThemeManager.tsx auto-fill handler)
- [ ] ExportPanel set-filter has no select-all / deselect-all shortcut — users with 10+ sets must click each checkbox individually to include or exclude sets; add "Select all" / "Deselect all" links next to the set filter section header (packages/figma-plugin/src/ui/components/ExportPanel.tsx set selection section)
- [ ] HeatmapPanel status indicators have no legend or tooltips — the green/yellow/red binding-coverage dots have no in-UI explanation; new users cannot tell what each color means without reading the source code; add a compact legend below the summary stats row, or tooltips on the status icons (packages/figma-plugin/src/ui/components/HeatmapPanel.tsx)
- [ ] TypeScaleGenerator specimen preview clamps display to 9–52px, hiding large tokens — the live text preview applies `Math.min(52, Math.max(9, value))` so tokens above `display-xl` (64px+) all look the same size; users can't visually distinguish large heading tiers; remove the clamp or scale the specimen container proportionally so the true size ratio is visible (packages/figma-plugin/src/ui/components/generators/TypeScaleGenerator.tsx ~L145-146)
- [ ] Token search API has no pagination — `GET /api/tokens/search` truncates at 1000 results with no `offset` parameter; the client shows a "refine your query" message but there is no way to page through a large result set; add `limit` and `offset` query params to the search endpoint and a "Load more" button in any search result UI that shows a truncation indicator (packages/server/src/routes/tokens.ts ~L29, packages/figma-plugin/src/ui/components/CommandPalette.tsx)
- [ ] GraphPanel GeneratorPipelineCard uses raw `fetch()` for all three generator actions — `handleRerun`, `handleDuplicate`, and `handleDelete` call raw `fetch()` instead of `apiFetch()`; raw fetch does not throw on 4xx/5xx responses so server errors (rate limits, 404, 500) are silently swallowed and only console.error'd; users get no feedback when generator operations fail (e.g. re-run fails because the generator was externally deleted, or duplicate fails because the target group already exists); replace all three with `apiFetch` and surface errors via an error state shown in the card (packages/figma-plugin/src/ui/components/GraphPanel.tsx ~L776, ~L798, ~L814)
- [ ] `$themes.json` and operation log use non-atomic writes — `createDimensionsStore().save()` in `themes.ts:53` and `token-store.ts:607` (inside `renameSet`) both call `fs.writeFile()` directly on `$themes.json` instead of the atomic `.tmp + fs.rename()` pattern required for crash safety; `OperationLog.persist()` in `operation-log.ts:90` does the same for the undo log; a server crash mid-write silently corrupts these files, permanently breaking theme config or destroying undo history; fix: apply the same `writeFile(tmp) → rename(tmp, final)` pattern used by `generator-service.ts:117` to all three write sites
- [ ] Multiple server route handlers lack try/catch and return unstructured 500s on async errors — `DELETE /resolvers/:name` (`resolvers.ts:125`) calls `resolverStore.delete()` and `operationLog.record()` with no try/catch; `POST /snapshots` (`snapshots.ts:9`) has no try/catch around the snapshot save; `DELETE /generators/:id` (`generators.ts:538`) has no try/catch inside `withLock`; `GET /generators` and `GET /generators/:id` (`generators.ts:318, 443`) are bare async handlers; when these throw, Fastify's default error handler returns `{"statusCode":500,"error":"Internal Server Error","message":"..."}` instead of the project's `{error, detail}` shape, breaking any client code that parses the error field; add try/catch with `handleRouteError` to each
- [ ] HistoryPanel has no filtering or search — the operation log is a flat chronological list with no way to filter by type (token-create, generator-delete, theme-update, etc.) or search by token path; power users accumulating hundreds of operations can't quickly locate the operation they want to roll back; add a type filter dropdown and a path search input above the list (packages/figma-plugin/src/ui/components/HistoryPanel.tsx)
- [ ] ConsistencyPanel Scan misses all typography properties — the scan covers fill, stroke, cornerRadius, spacing, and opacity but ignores fontFamily, fontSize, fontWeight, lineHeight, and letterSpacing; text-heavy UIs produce zero snap-to-token suggestions for typography tokens, which are often the most inconsistent; extend `PROPERTY_LABELS` and the scan message handler to include these Figma text properties (packages/figma-plugin/src/ui/components/ConsistencyPanel.tsx, packages/figma-plugin/src/plugin/controller.ts)
- [ ] TokenFlowPanel hard-codes 20-source / 30-dependent display limits with no "show more" — for alias-heavy token systems the dependency graph silently truncates; users can't see the full chain even though the data is available server-side; replace the slice with a "Show all N" expandable row, matching the existing expand pattern used in other list sections (packages/figma-plugin/src/ui/components/TokenFlowPanel.tsx ~L267-268)
- [ ] OpIcon in RecentActionsSource renders every operation as a dot — the switch statement checks for bare strings `'create'`, `'delete'`, `'rename'`, `'update'` but the server's operation log emits compound type strings like `'token-create'`, `'token-update'`, `'group-rename'`, `'group-delete'`, `'generator-create'`, `'bulk-rename'`; every case falls through to `default` so all history entries render as a gray dot regardless of type; fix the switch cases to match actual server type strings, or use `includes`/`startsWith` matching (packages/figma-plugin/src/ui/components/RecentActionsSource.tsx ~L22-45)
- [ ] ExportPanel error handler captures stale `figmaLoading` in a closure — the `useEffect` at ~L174 re-registers the plugin message listener whenever `figmaLoading` changes; the error branch reads `if (msg.type === 'error' && figmaLoading)` from the captured closure, but when the 10s timeout fires first and sets `figmaLoading` back to `false`, the listener that stays attached has `figmaLoading === false` baked in and silently drops any late-arriving error messages; use a mutable ref (`figmaLoadingRef.current`) for the condition check instead of the captured state value so the check always reflects the current state (packages/figma-plugin/src/ui/components/ExportPanel.tsx ~L174-201)
- [ ] Extract TokenList's async CRUD handlers into domain-specific custom hooks — `TokenList.tsx` is ~4,100 lines and contains 20+ useEffect hooks, 15+ useCallbacks, and 30+ useState calls for unrelated domains: drag/drop, virtual scrolling, JSON editor, variable diff, alias chain expansion, multi-mode resolution, find/replace, token promotion, group CRUD, token CRUD, cross-set search, export, and keyboard shortcuts; the missing-try/catch bugs (see item above) are a direct symptom of cognitive overload from co-locating all of this state; extract at minimum `useGroupOperations` (move, rename, update-meta, reorder, duplicate), `useTokenPromotion` (promote-to-alias flow, promote dialog state), and `useTokenCrud` (create, rename, delete, duplicate token handlers) as custom hooks following the pattern already used for `useTokenTree`; each hook should own its own error state and expose it for rendering in the parent (packages/figma-plugin/src/ui/components/TokenList.tsx)
