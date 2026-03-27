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
- [x] `applyVarDiff` push is fire-and-forget: postMessage `apply-variables` is sent but the function never waits for a response from the plugin — state is cleared and "Variable sync applied" is shown regardless of whether Figma accepted the changes (`SyncPanel.tsx:L219-235`)
- [x] Commit form appears when only untracked (`?`) files are present — `status.isClean` is false for untracked files, so the commit form renders, but clicking "Commit" will fail (nothing staged); should show the form only when there are staged or tracked-modified files, or auto-stage tracked changes (`SyncPanel.tsx:L792`)
- [x] No "Create new branch" UI in SyncPanel — the server's `POST /api/sync/checkout` accepts `create: true` and `createBranch` exists on `gitSync`, but the branch selector only switches between existing branches; there is no way to start a new branch from the plugin (`SyncPanel.tsx:L744-756`, `sync.ts:L138`)
- [x] `applyVarDiff` pull side sends one PATCH per token with `Promise.all` instead of using the batch endpoint — the `POST /api/tokens/:set/batch` route added for ImportPanel is not used here; large token sets will fire many concurrent requests (`SyncPanel.tsx:L223-229`)
- [x] `runReadinessChecks` is never triggered automatically — unlike `computeVarDiff` which runs on mount, the publish readiness section always shows "Readiness unknown" until the user manually clicks "Run checks"; the status bar's readiness dot is always grey on first open (`SyncPanel.tsx:L243`, compare with L182-184)

- [x] PreviewPanel template empty states — "No color tokens found" gives code snippet but no button to switch to Tokens tab; user is left without an action path
- [x] ExportPanel "Clear" vs "Refresh" buttons — both are tiny unlabeled-feeling actions next to each other; consider a single "Reload" that re-reads from Figma (making "Clear" redundant since data is non-destructive)
- [x] ImportPanel styles — "Import from Figma Styles" button style is visually weaker than the Variables button, suggesting it's a secondary option even when it's equally valid

- [HIGH] ExportPanel unreachable — `ExportPanel` is a fully-built 815-line component that is never imported or rendered in `App.tsx`; users have no way to access platform export (CSS/Dart/Swift/Android/JSON) or Figma variable import from the plugin UI (`packages/figma-plugin/src/ui/components/ExportPanel.tsx`)
- [x] Platform selection not persisted between plugin sessions — `ExportPanel` initializes `selected` to `new Set(['css'])` on every mount with no localStorage; users must re-select platforms each time they re-open the plugin (`ExportPanel.tsx:51`)
- [x] Collection name collision when saving Figma variables to server — `collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()` can map two differently-named Figma collections to the same set name (e.g. "My Colors" and "My-Colors" → both "my-colors"), silently overwriting the first set during batch save with no warning (`ExportPanel.tsx:240`)
- [x] Docs page renders alias token values as raw `{reference}` strings — `/docs/:set` serves raw `$value` fields without resolving aliases, so alias tokens display as literal `{some.path}` text instead of resolved values, making the style guide misleading for alias-heavy token sets (`server/routes/docs.ts`, `server/services/token-store.ts`)
- [x] Spacing/dimension tokens with `rem` or `%` units render as near-zero bars in docs — `renderSpacingTokens` uses `parseFloat("1rem")` → `1`, showing a 1px bar for a `1rem` token; the text label is correct but the visual representation is wrong (`server/routes/docs.ts:85-86`)
- [x] Token set key collision silently discards tokens on export — `Object.assign(merged, tokenGroup)` in `exportTokens` overwrites top-level DTCG group keys when two sets share a group name (e.g. both have a `color` group), dropping the first set's tokens with no warning or error (`server/services/style-dict.ts:151-153`)

# Backlog Inbox

Items spotted during UX passes but out of scope for that session.

- [x] SelectionInspector "No tokens applied" state — add a small icon and a "Go to Tokens tab" button so users know exactly where to act (currently just two lines of text with no visual anchor or escape hatch)
- [x] TokenCanvas empty state is very bare ("No tokens to display") — add an icon and a hint about why (e.g. canvas view renders token relationships)
- [x] Silent failure in SelectionInspector binding operations — `remove-binding` and `apply-binding` messages have no error callback, so failures are invisible to the user
- [x] Grid view: when a type filter is active and no color tokens match, distinguish between "no color tokens exist" vs "none match current filter" — the current message conflates both

- [~] `POST /api/export` group filter silently returns empty when path matches nothing — if `group` doesn't exist in any set, `tokenData` becomes `{}` and export runs with empty data producing zero-byte output files with no error or warning (`server/routes/export.ts:48-65`)
- [ ] `POST /api/export` group filter splits on `.` but token segment names can contain literal dots — `group="spacing.1.5"` navigates `spacing → 1 → 5` instead of `spacing → 1.5`, silently returning empty results (`server/routes/export.ts:49`)
- [ ] SSE `/events` onChange callback has no try/catch — if `JSON.stringify(event)` throws or `reply.raw.write()` errors on a broken socket, the uncaught exception propagates up with no cleanup (`server/routes/sse.ts:15-16`)
- [ ] SSE `/events` race condition: a token change event can fire between the `close` event firing and `unsubscribe()` executing, calling `reply.raw.write()` on an already-ended stream (`server/routes/sse.ts:24-28`)
- [ ] `POST /api/sync/push` doesn't check whether a remote is configured before attempting push — git error from missing remote is wrapped in a generic "Failed to push" 500 with no actionable message (`server/routes/sync.ts:65-73`)
- [ ] `POST /api/sync/remote` accepts any string as the remote URL with no format validation — an invalid value is passed directly to git, producing an unhelpful error message wrapped in a generic 500 (`server/routes/sync.ts:104-116`)
- [HIGH] Bulk-rename regex has no ReDoS protection — `isRegex=true` with a catastrophic backtracking pattern (e.g. `(a+)+b`) applied to a large token set can hang the Node.js event loop (`server/services/token-store.ts:803-809`)

- [ ] ExportPanel: "Re-export" button after successful export has no tooltip — unclear that it regenerates from current server state, not just re-downloads
- [ ] ImportPanel: disabled "Read from Figma" button has no tooltip explaining it's always enabled (reads from the currently open file) — users may think they need to do something first
- [ ] ImportPanel: `targetSet` dropdown in styles import shows "Select a set" placeholder but the only way to create a new set is a small "+" button that's easy to miss — consider inline hint text

- [ ] ImportPanel: show progress bar using existing `importProgress` state during token import — long imports feel stuck with only "Importing…" text
- [ ] Grid view empty state: distinguish "no color tokens exist in this set" from "filters hide all color tokens" — current message always says "Grid view shows color tokens as swatches" regardless of cause
- [ ] ExportPanel: "Read Variables from Figma" button has no loading indicator — clicking it gives no immediate feedback

- [ ] `suggestTargetGroup` splits on literal dots in segment names — `TokenGeneratorDialog.tsx:52` uses `sourceTokenPath.split('.')` to compute the parent group; if a segment contains a literal dot (e.g. `spacing.1.5`), it returns `spacing.1` instead of `spacing` as the pre-filled target group, silently producing a wrong path.
- [HIGH] `templateIdForTokenType` fallback returns non-existent template ID — `GraphPanel.tsx:600` returns `'modular-type-scale'` for non-color/dimension tokens but `GRAPH_TEMPLATES` has id `'modular-type'`; `find()` returns `undefined`, `initialTemplate` is set to `null`, and the pending-token-type hint is silently discarded when opening the Graph tab from a token's context menu.
- [ ] No confirmation before deleting a generator in TokenGraph — `TokenGraph.tsx:121-130` fires `DELETE /api/generators/:id` immediately on button click with no confirmation dialog; since DELETE does not remove derived tokens (noted in the route comment at `generators.ts:114`), the user can accidentally orphan an entire generated token group with a single mis-click.
- [ ] Duplicate `targetGroup` values across generators corrupt dependency resolution — `generator-service.ts:225` builds `producerByGroup` with `Map.set(gen.targetGroup, id)`, so if two generators share the same `targetGroup` only the last one is registered as a producer; `runForSourceToken`'s transitive-dependency expansion silently drops the earlier generator, causing wrong execution order or missed re-runs.
- [ ] No way to identify and clean up derived tokens after deleting a generator — `DELETE /api/generators/:id` (`generators.ts:114`) deliberately leaves derived tokens in place; there is no UI to find or bulk-delete tokens that carry `$extensions["com.tokenmanager.generator"].generatorId` pointing to a now-deleted generator, leaving stale orphaned tokens indistinguishable from handcrafted ones.
- [ ] Generator route accepts unknown `type` without input validation — `generators.ts:46` and `generators.ts:78` pass the raw `type` string directly to `generatorService.create()` / `generatorService.preview()` without checking it against the known `GeneratorType` union; an unknown type reaches the service's `default: throw` branch and returns a 500 Internal Server Error instead of a 400 Bad Request with a descriptive message.
- [ ] Multi-brand mode silently skips the semantic mapping dialog — `useGeneratorDialog.ts:290` shows `SemanticMappingDialog` only when `previewTokens.length > 0`; in multi-brand mode `fetchPreview` always clears `previewTokens` to `[]` (line 161), so the semantic alias creation step is never offered to the user even when a color-ramp template with semantic layers was selected.

- [ ] Centralize `normalizeHex` — `AnalyticsPanel.tsx` defines a local `normalizeHex` that could live in `colorUtils.ts` and be reused

- [ ] ImportPanel conflict buttons — "Skip conflicts" / "Overwrite all" labels don't explain whether non-conflicting tokens are still imported; rename to "Skip & import new" / "Overwrite & import all"
- [ ] SyncPanel sync result — after applyVarDiff completes, panel silently resets with no success message; show a brief "Synced N variables" inline confirmation
- [ ] ExportPanel From-Figma empty state — "Connect to server" message is misleading when the actual issue is Figma variables not being loaded; clarify the error text

- [HIGH] `handleCreateToken` silently swallows server errors — `SelectionInspector.tsx:373-391`: when `res.ok` is false (e.g. 409 conflict when a token already exists, 500 on server error), the `createError` state is never set and `creating` resets to `false` with no feedback, leaving the user staring at a blank form with no indication of what went wrong.
- [HIGH] Deep inspect "Go to token" button is permanently invisible — `SelectionInspector.tsx:1005-1007`: the parent `<div>` for each deep-inspect child row is missing the `group` Tailwind class, so `opacity-0 group-hover:opacity-100` on the navigate button never triggers; the button is hidden and unreachable at all times.
- [HIGH] `syncBindings` applies raw `$value` without resolving aliases — `controller.ts:1234`: alias tokens (e.g. `$value: "{color.primary}"`) are passed directly to `applyTokenValue` which treats the string literally, producing a type mismatch that increments `errors`; the user sees "X bindings failed — check token types" when the real fix is that aliases need to be resolved before sync.
- [ ] `syncBindings` with scope `'selection'` only syncs directly selected nodes, not their children — `controller.ts:1183-1186`: selecting a frame with bound child layers and pressing "Sync Selection" silently skips those children; `remapBindings` correctly recurses into descendants for the same scope, creating inconsistent behavior.
- [ ] Bind search is capped at 12 results with no overflow indicator — `SelectionInspector.tsx:679`: `bindCandidates.slice(0, 12)` silently truncates the token list; users with large sets see only 12 candidates with no count shown and no prompt to refine the search query.
- [ ] `openBindFromProp` uses `lastIndexOf('.')` to derive the parent group for pre-filling the bind search — `SelectionInspector.tsx:305`: breaks for segment names containing literal dots (e.g. binding `spacing.1.5` computes parent as `spacing.1` instead of `spacing`); use `nodeParentPath(binding, leafSegment)` from `tokenListUtils.ts` instead.
