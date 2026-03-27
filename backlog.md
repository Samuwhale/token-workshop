# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be triaged at the end of each iteration:

- `- [HIGH] item title…` or `- [P0] item title…` — inserted before the first `[ ]` item (picked next by the agent).
- All other items are appended to the bottom.

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

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### UX

---

## Import

### Bugs

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### QoL

---

## Settings & Data Management

### QoL

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

- [HIGH] `varCorrelationIdRef` and `varReadResolveRef` are shared between `computeVarDiff` and `runReadinessChecks` — if both are called concurrently (auto-run on mount + manual click), the second call overwrites the shared ref and the first promise never resolves, causing a silent hang or timeout (`SyncPanel.tsx:L68-69, L243-258`)

- [HIGH] ExportPanel unreachable — `ExportPanel` is a fully-built 815-line component that is never imported or rendered in `App.tsx`; users have no way to access platform export (CSS/Dart/Swift/Android/JSON) or Figma variable import from the plugin UI (`packages/figma-plugin/src/ui/components/ExportPanel.tsx`)

# Backlog Inbox

Items spotted during UX passes but out of scope for that session.

- [x] `POST /api/sync/push` doesn't check whether a remote is configured before attempting push — git error from missing remote is wrapped in a generic "Failed to push" 500 with no actionable message (`server/routes/sync.ts:65-73`)
- [x] `POST /api/sync/remote` accepts any string as the remote URL with no format validation — an invalid value is passed directly to git, producing an unhelpful error message wrapped in a generic 500 (`server/routes/sync.ts:104-116`)
- [HIGH] Bulk-rename regex has no ReDoS protection — `isRegex=true` with a catastrophic backtracking pattern (e.g. `(a+)+b`) applied to a large token set can hang the Node.js event loop (`server/services/token-store.ts:803-809`)

- [x] ExportPanel: "Re-export" button after successful export has no tooltip — unclear that it regenerates from current server state, not just re-downloads
- [x] ImportPanel: disabled "Read from Figma" button has no tooltip explaining it's always enabled (reads from the currently open file) — users may think they need to do something first
- [x] ImportPanel: `targetSet` dropdown in styles import shows "Select a set" placeholder but the only way to create a new set is a small "+" button that's easy to miss — consider inline hint text

- [x] ImportPanel: show progress bar using existing `importProgress` state during token import — long imports feel stuck with only "Importing…" text
- [x] Grid view empty state: distinguish "no color tokens exist in this set" from "filters hide all color tokens" — current message always says "Grid view shows color tokens as swatches" regardless of cause
- [x] ExportPanel: "Read Variables from Figma" button has no loading indicator — clicking it gives no immediate feedback

- [x] `suggestTargetGroup` splits on literal dots in segment names — `TokenGeneratorDialog.tsx:52` uses `sourceTokenPath.split('.')` to compute the parent group; if a segment contains a literal dot (e.g. `spacing.1.5`), it returns `spacing.1` instead of `spacing` as the pre-filled target group, silently producing a wrong path.
- [HIGH] `templateIdForTokenType` fallback returns non-existent template ID — `GraphPanel.tsx:600` returns `'modular-type-scale'` for non-color/dimension tokens but `GRAPH_TEMPLATES` has id `'modular-type'`; `find()` returns `undefined`, `initialTemplate` is set to `null`, and the pending-token-type hint is silently discarded when opening the Graph tab from a token's context menu.
- [x] No confirmation before deleting a generator in TokenGraph — `TokenGraph.tsx:121-130` fires `DELETE /api/generators/:id` immediately on button click with no confirmation dialog; since DELETE does not remove derived tokens (noted in the route comment at `generators.ts:114`), the user can accidentally orphan an entire generated token group with a single mis-click.
- [x] Duplicate `targetGroup` values across generators corrupt dependency resolution — `generator-service.ts:225` builds `producerByGroup` with `Map.set(gen.targetGroup, id)`, so if two generators share the same `targetGroup` only the last one is registered as a producer; `runForSourceToken`'s transitive-dependency expansion silently drops the earlier generator, causing wrong execution order or missed re-runs.
- [x] No way to identify and clean up derived tokens after deleting a generator — `DELETE /api/generators/:id` (`generators.ts:114`) deliberately leaves derived tokens in place; there is no UI to find or bulk-delete tokens that carry `$extensions["com.tokenmanager.generator"].generatorId` pointing to a now-deleted generator, leaving stale orphaned tokens indistinguishable from handcrafted ones.
- [x] Generator route accepts unknown `type` without input validation — `generators.ts:46` and `generators.ts:78` pass the raw `type` string directly to `generatorService.create()` / `generatorService.preview()` without checking it against the known `GeneratorType` union; an unknown type reaches the service's `default: throw` branch and returns a 500 Internal Server Error instead of a 400 Bad Request with a descriptive message.
- [x] Multi-brand mode silently skips the semantic mapping dialog — `useGeneratorDialog.ts:290` shows `SemanticMappingDialog` only when `previewTokens.length > 0`; in multi-brand mode `fetchPreview` always clears `previewTokens` to `[]` (line 161), so the semantic alias creation step is never offered to the user even when a color-ramp template with semantic layers was selected.

- [x] Centralize `normalizeHex` — `AnalyticsPanel.tsx` defines a local `normalizeHex` that could live in `colorUtils.ts` and be reused

- [x] ImportPanel conflict buttons — "Skip conflicts" / "Overwrite all" labels don't explain whether non-conflicting tokens are still imported; rename to "Skip & import new" / "Overwrite & import all"
- [x] SyncPanel sync result — after applyVarDiff completes, panel silently resets with no success message; show a brief "Synced N variables" inline confirmation
- [x] ExportPanel From-Figma empty state — "Connect to server" message is misleading when the actual issue is Figma variables not being loaded; clarify the error text

- [HIGH] `handleCreateToken` silently swallows server errors — `SelectionInspector.tsx:373-391`: when `res.ok` is false (e.g. 409 conflict when a token already exists, 500 on server error), the `createError` state is never set and `creating` resets to `false` with no feedback, leaving the user staring at a blank form with no indication of what went wrong.
- [HIGH] Deep inspect "Go to token" button is permanently invisible — `SelectionInspector.tsx:1005-1007`: the parent `<div>` for each deep-inspect child row is missing the `group` Tailwind class, so `opacity-0 group-hover:opacity-100` on the navigate button never triggers; the button is hidden and unreachable at all times.
- [HIGH] `syncBindings` applies raw `$value` without resolving aliases — `controller.ts:1234`: alias tokens (e.g. `$value: "{color.primary}"`) are passed directly to `applyTokenValue` which treats the string literally, producing a type mismatch that increments `errors`; the user sees "X bindings failed — check token types" when the real fix is that aliases need to be resolved before sync.
- [ ] `syncBindings` with scope `'selection'` only syncs directly selected nodes, not their children — `controller.ts:1183-1186`: selecting a frame with bound child layers and pressing "Sync Selection" silently skips those children; `remapBindings` correctly recurses into descendants for the same scope, creating inconsistent behavior.
- [ ] Bind search is capped at 12 results with no overflow indicator — `SelectionInspector.tsx:679`: `bindCandidates.slice(0, 12)` silently truncates the token list; users with large sets see only 12 candidates with no count shown and no prompt to refine the search query.
- [ ] `openBindFromProp` uses `lastIndexOf('.')` to derive the parent group for pre-filling the bind search — `SelectionInspector.tsx:305`: breaks for segment names containing literal dots (e.g. binding `spacing.1.5` computes parent as `spacing.1` instead of `spacing`); use `nodeParentPath(binding, leafSegment)` from `tokenListUtils.ts` instead.

- [ ] TokenList: delete fails silently — if DELETE request fails the token is already removed from the UI; no error is shown and the stale state persists until next refresh
- [ ] ImportPanel: unhandled fetch failure when loading set list — `.catch(() => {})` means the set dropdown silently shows nothing if the API is unreachable
- [ ] PublishPanel: generic "An unexpected error occurred" errors give no context about which operation failed or why — include the HTTP status or operation name
- [ ] SyncPanel: readiness check timeout has no user messaging — if plugin fails to respond the spinner runs indefinitely with no "try reloading" hint

- [ ] ImportPanel: `handleImportVariables` sends individual POST requests per token (L249-260) instead of using the batch endpoint — causes N+1 network round-trips for large Figma files; styles/JSON import already uses `/api/tokens/:set/batch` (L337-344)
- [ ] ImportPanel: `$description` and `$scopes` read from Figma variables (controller.ts L509-510) are never included in the import POST body (L253) — imported tokens silently lose their descriptions and scoping metadata
- [ ] ImportPanel: `commitNewSet` (L304) performs no validation on the new set name — invalid characters or empty-after-trim names are sent directly to the server; should validate against the set name regex before committing
- [ ] ImportPanel: `readFigmaStyles` only reads the first paint from multi-fill styles (controller.ts L527) — gradient fills and multi-paint styles are silently converted to only their first solid fill, with no indication to the user that data was lost
- [ ] ImportPanel: `handleImportVariables` individual token failures (L254 `.catch(() => null)`) only increment a counter — user sees "3 failed" but has no way to know which tokens failed or why; consider collecting failed paths and showing them in the success message
- [ ] ImportPanel: `styles-read` message handler (L116) has no correlationId check — if user clicks "Read Styles" twice quickly, a stale response from the first read could be consumed by the second, potentially showing outdated data; `variables-read` already has correlationId protection (L96)

- [ ] Remove unnecessary exports from hook files — `UseGeneratorsResult`, `UseGeneratorDialogParams`, `UseGeneratorDialogReturn`, `TokenGraphProps`, `QuickStartDialogProps`, `ParsedToken`, `parseInput`, `HeatmapNode` are exported but only used internally
- [ ] Consolidate duplicate `ThemeOption`/`ThemeDimension` types — defined identically in `useThemeSwitcher.ts`, `ThemeCompare.tsx`, and `ThemeManager.tsx`; consumers should import from one place
- [ ] Remove unused `updateServerUrl` from `useServerConnection` return — returned from hook but never destructured by any caller
- [ ] Remove unnecessary `rgbToHsl` export in `colorUtils.ts` — only used internally by `hexToHsl` in the same file
- [ ] Remove unused `allSets` param from `UseGeneratorDialogParams` — accepted in interface but never read by hook body

- [HIGH] ThemeManager `executeDeleteDimension` and `executeDeleteOption` don't check `res.ok` — server rejection (404/500) is silently ignored while optimistic local state update removes the dimension/option from the UI; `fetchDimensions()` eventually restores it but user gets no error feedback (`ThemeManager.tsx:252-260, 297-310`)
- [HIGH] ThemeManager `handleSetState` doesn't check `res.ok` — a server-rejected set state toggle (e.g. 400 from invalid status) appears to succeed because `fetch` doesn't throw on HTTP errors; the catch block only handles network failures, not HTTP error responses (`ThemeManager.tsx:326-337`)
- [ ] ThemeManager `handleDrop` (set reorder) doesn't check `res.ok` — after drag-and-drop reordering, the POST to save new order silently fails on server error; local state is already updated optimistically with no rollback (`ThemeManager.tsx:376-384`)
- [ ] ThemeCompare path display uses `diff.path.split('.')` to extract parent/leaf segments — breaks for tokens with dots in segment names (e.g. `spacing.1.5` shows parent `spacing.1` and leaf `5` instead of parent `spacing` and leaf `1.5`); should use `nodeParentPath`/`formatDisplayPath` from tokenListUtils (`ThemeCompare.tsx:230-232`)
- [ ] `useThemeSwitcher` stale active-theme cleanup uses `setActiveThemesState` instead of `setActiveThemes` — removed dimensions are cleaned from React state but persist in localStorage and Figma clientStorage, causing phantom theme selections to reappear on next load (`useThemeSwitcher.ts:53-60`)
- [ ] `useThemeSwitcher` theme fetch failure is silently swallowed by `.catch(() => {})` — if `/api/themes` returns an error or the server is temporarily unreachable, dimensions silently remain empty with no user-visible error message or retry affordance (`useThemeSwitcher.ts:63`)
