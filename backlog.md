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

- [ ] App.tsx god component — ~2000-line component with 40+ useState declarations; should be decomposed into feature modules
- [ ] TokenList 30+ props — strong signal for context/state management extraction (`figma-plugin/TokenList.tsx:33-61`)
- [ ] TokenGeneratorDialog 800+ lines — handles 7+ generator types in one component; should be split (`figma-plugin/TokenGeneratorDialog.tsx`)
- [ ] CSS injection via token values in docs.ts — style attribute built with `escapeHtml` but not `escapeCssValue`; CSS injection possible via adversarial token values (`server/routes/docs.ts:70-71`)
- [ ] 15+ scattered localStorage keys — no centralized persistence utility; keys are spread across components without a single source of truth

- [ ] Active set tab not persisted — switching between token sets is not remembered across plugin re-opens; user always lands on the first tab (`figma-plugin/App.tsx`)
- [ ] No bulk multi-select in token list — shift-click or ctrl-click to select a range of tokens for batch operations is missing; users must use the batch editor's own selection model which is separate from the token list (`figma-plugin/TokenList.tsx`)
- [ ] No quick-copy of token path from list — right-clicking a token has no "Copy path" or "Copy value" option; users must open the editor and manually select the path text (`figma-plugin/TokenList.tsx` context menu)
- [ ] No diff preview before push to Figma — pushing tokens to Figma applies changes immediately with no preview of what will change (added/removed/modified variables); a confirmation diff would prevent accidental overwrites (`figma-plugin/controller.ts`)
- [ ] Push-to-Figma errors show raw messages — when sync fails, the raw controller error is shown without a user-friendly explanation or suggested action (`figma-plugin/App.tsx` sync error handling)
- [ ] No pull-from-Figma action — sync is push-only; there is no way to import variable values from an existing Figma collection back into token files, blocking round-tripping (`figma-plugin/ImportPanel.tsx`, `figma-plugin/controller.ts`)
- [ ] Generator output not previewed before applying — the token generator writes tokens immediately with no preview step showing the generated values before commit (`figma-plugin/TokenGeneratorDialog.tsx`)
- [ ] No way to edit generator seed values after creation — once a generator is saved, seed values (base color, scale ratio, etc.) cannot be changed; users must delete and recreate (`figma-plugin/TokenGeneratorDialog.tsx`)
- [ ] Lint results have no severity levels — all lint findings are treated equally with no warning vs error distinction, making it hard to prioritize (`server/lint.ts`, `figma-plugin/AnalyticsPanel.tsx`)
- [ ] No way to suppress specific lint warnings — lint findings cannot be dismissed or suppressed per-item; every run shows the same findings even for intentional patterns (`server/lint.ts`)
- [ ] Server connection status not visible in plugin header — there is no persistent indicator showing whether the local server is reachable; users only discover connectivity issues when an action fails (`figma-plugin/App.tsx`)
- [ ] No backup/export-all as ZIP — the export panel has format options but no "export all sets as a ZIP archive" for full backup or handoff (`figma-plugin/ExportPanel.tsx`, `server/routes/export.ts`)
- [ ] Selection inspector empty state missing — the selection inspector shows nothing when no Figma node is selected; a prompt like "Select a layer to inspect token bindings" would reduce confusion
- [ ] Token editor does not auto-focus first field — opening the token editor requires a manual click to start typing; the name or value field should auto-focus on open (`figma-plugin/TokenEditor.tsx`)
- [ ] Settings page has no reset-to-defaults — there is no way to reset all settings to their default values without manually clearing each field

- [HIGH] `varCorrelationIdRef` and `varReadResolveRef` are shared between `computeVarDiff` and `runReadinessChecks` — if both are called concurrently (auto-run on mount + manual click), the second call overwrites the shared ref and the first promise never resolves, causing a silent hang or timeout (`SyncPanel.tsx:L68-69, L243-258`)
- [ ] Branch selector in SyncPanel triggers git checkout immediately on change with no confirmation — accidentally clicking a different branch in the `<select>` fires `doAction('checkout', ...)` instantly, with no undo and no warning about unsaved state (`SyncPanel.tsx:L748`)
- [ ] `applyVarDiff` push is fire-and-forget: postMessage `apply-variables` is sent but the function never waits for a response from the plugin — state is cleared and "Variable sync applied" is shown regardless of whether Figma accepted the changes (`SyncPanel.tsx:L219-235`)
- [ ] Commit form appears when only untracked (`?`) files are present — `status.isClean` is false for untracked files, so the commit form renders, but clicking "Commit" will fail (nothing staged); should show the form only when there are staged or tracked-modified files, or auto-stage tracked changes (`SyncPanel.tsx:L792`)
- [ ] No "Create new branch" UI in SyncPanel — the server's `POST /api/sync/checkout` accepts `create: true` and `createBranch` exists on `gitSync`, but the branch selector only switches between existing branches; there is no way to start a new branch from the plugin (`SyncPanel.tsx:L744-756`, `sync.ts:L138`)
- [ ] `applyVarDiff` pull side sends one PATCH per token with `Promise.all` instead of using the batch endpoint — the `POST /api/tokens/:set/batch` route added for ImportPanel is not used here; large token sets will fire many concurrent requests (`SyncPanel.tsx:L223-229`)
- [ ] `runReadinessChecks` is never triggered automatically — unlike `computeVarDiff` which runs on mount, the publish readiness section always shows "Readiness unknown" until the user manually clicks "Run checks"; the status bar's readiness dot is always grey on first open (`SyncPanel.tsx:L243`, compare with L182-184)

- [ ] PreviewPanel template empty states — "No color tokens found" gives code snippet but no button to switch to Tokens tab; user is left without an action path
- [ ] ExportPanel "Clear" vs "Refresh" buttons — both are tiny unlabeled-feeling actions next to each other; consider a single "Reload" that re-reads from Figma (making "Clear" redundant since data is non-destructive)
- [ ] ImportPanel styles — "Import from Figma Styles" button style is visually weaker than the Variables button, suggesting it's a secondary option even when it's equally valid

- [HIGH] ExportPanel unreachable — `ExportPanel` is a fully-built 815-line component that is never imported or rendered in `App.tsx`; users have no way to access platform export (CSS/Dart/Swift/Android/JSON) or Figma variable import from the plugin UI (`packages/figma-plugin/src/ui/components/ExportPanel.tsx`)
- [ ] Platform selection not persisted between plugin sessions — `ExportPanel` initializes `selected` to `new Set(['css'])` on every mount with no localStorage; users must re-select platforms each time they re-open the plugin (`ExportPanel.tsx:51`)
- [ ] Collection name collision when saving Figma variables to server — `collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()` can map two differently-named Figma collections to the same set name (e.g. "My Colors" and "My-Colors" → both "my-colors"), silently overwriting the first set during batch save with no warning (`ExportPanel.tsx:240`)
- [ ] Docs page renders alias token values as raw `{reference}` strings — `/docs/:set` serves raw `$value` fields without resolving aliases, so alias tokens display as literal `{some.path}` text instead of resolved values, making the style guide misleading for alias-heavy token sets (`server/routes/docs.ts`, `server/services/token-store.ts`)
- [ ] Spacing/dimension tokens with `rem` or `%` units render as near-zero bars in docs — `renderSpacingTokens` uses `parseFloat("1rem")` → `1`, showing a 1px bar for a `1rem` token; the text label is correct but the visual representation is wrong (`server/routes/docs.ts:85-86`)
- [ ] Token set key collision silently discards tokens on export — `Object.assign(merged, tokenGroup)` in `exportTokens` overwrites top-level DTCG group keys when two sets share a group name (e.g. both have a `color` group), dropping the first set's tokens with no warning or error (`server/services/style-dict.ts:151-153`)

# Backlog Inbox

Items spotted during UX passes but out of scope for that session.

- [ ] SelectionInspector "No tokens applied" state — add a small icon and a "Go to Tokens tab" button so users know exactly where to act (currently just two lines of text with no visual anchor or escape hatch)
- [ ] TokenCanvas empty state is very bare ("No tokens to display") — add an icon and a hint about why (e.g. canvas view renders token relationships)
- [ ] Silent failure in SelectionInspector binding operations — `remove-binding` and `apply-binding` messages have no error callback, so failures are invisible to the user
- [ ] Grid view: when a type filter is active and no color tokens match, distinguish between "no color tokens exist" vs "none match current filter" — the current message conflates both

- [ ] `POST /api/export` group filter silently returns empty when path matches nothing — if `group` doesn't exist in any set, `tokenData` becomes `{}` and export runs with empty data producing zero-byte output files with no error or warning (`server/routes/export.ts:48-65`)
- [ ] `POST /api/export` group filter splits on `.` but token segment names can contain literal dots — `group="spacing.1.5"` navigates `spacing → 1 → 5` instead of `spacing → 1.5`, silently returning empty results (`server/routes/export.ts:49`)
- [ ] SSE `/events` onChange callback has no try/catch — if `JSON.stringify(event)` throws or `reply.raw.write()` errors on a broken socket, the uncaught exception propagates up with no cleanup (`server/routes/sse.ts:15-16`)
- [ ] SSE `/events` race condition: a token change event can fire between the `close` event firing and `unsubscribe()` executing, calling `reply.raw.write()` on an already-ended stream (`server/routes/sse.ts:24-28`)
- [ ] `POST /api/sync/push` doesn't check whether a remote is configured before attempting push — git error from missing remote is wrapped in a generic "Failed to push" 500 with no actionable message (`server/routes/sync.ts:65-73`)
- [ ] `POST /api/sync/remote` accepts any string as the remote URL with no format validation — an invalid value is passed directly to git, producing an unhelpful error message wrapped in a generic 500 (`server/routes/sync.ts:104-116`)
- [HIGH] Bulk-rename regex has no ReDoS protection — `isRegex=true` with a catastrophic backtracking pattern (e.g. `(a+)+b`) applied to a large token set can hang the Node.js event loop (`server/services/token-store.ts:803-809`)
