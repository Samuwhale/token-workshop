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

- [x] Move single token to a different set — individual tokens can only be moved between groups (by editing the path prefix); there is no action to move a token to an entirely different set, even though group-level move exists (`server/routes/tokens.ts`, `TokenList.tsx` context menu)

- [x] Duplicate single token — only groups can be duplicated (with `-copy` suffix); there is no way to duplicate an individual token row to a new path, which is a common workflow when creating similar tokens (`TokenList.tsx` context menu)

- [x] Undo/redo for token edits — `useUndo` exists and works for generator edits but token create/edit/delete/rename operations are not undoable; a user who accidentally deletes or renames a token has no recovery path short of git (`figma-plugin/useUndo.ts`, `TokenList.tsx`)

- [x] Delete non-empty group — the group context menu only allows deleting empty groups; deleting a group with tokens inside requires deleting each token individually or editing the JSON file directly; should offer "Delete group and all contained tokens" with a confirmation showing the count (`TokenList.tsx` group context menu)

- [x] Broken alias reference warning in editor — the token editor accepts any `{path}` string without validating whether it resolves; broken references are only surfaced in AnalyticsPanel/lint, not at the point of entry; editor should show an inline warning "Reference does not resolve" when the typed path doesn't match any token (`figma-plugin/TokenEditor.tsx`, alias input)

- [ ] Circular alias reference detection — creating a cycle (token A references B which references A) is not caught at edit time; the resolver silently returns unresolved and lint picks it up later; the editor should detect and block cycles immediately (`core/resolver.ts`, `figma-plugin/TokenEditor.tsx`)

- [ ] Selective export by set or group — `POST /api/export` always exports every token across all sets; there is no way to export a single set or a subtree of tokens; this is a basic workflow when sharing only part of a design system with a team (`server/routes/export.ts`, `figma-plugin/ExportPanel.tsx`)

- [ ] Token ordering within a group — tokens within a group are rendered in whatever order they appear in the JSON file; there is no way to reorder them via the UI, making it hard to control the visual hierarchy of a group (e.g. putting `default` before `hover` before `active`) (`TokenList.tsx`, `server/token-store.ts`)

- [ ] Group $type and $description editing — DTCG allows groups to carry `$type` (inherited by all children) and `$description`; there is no UI to set or edit these on a group, so inherited types must be manually maintained on every leaf token instead (`TokenList.tsx` group header, `server/routes/tokens.ts`)

- [ ] Cross-set token search — the search/filter bar only operates on the active set tab; searching across all sets simultaneously is a basic workflow (e.g. "find every token named `primary`") and currently requires switching tabs manually (`TokenList.tsx:525`, `App.tsx:231`)

- [ ] DTCG JSON file import — importing tokens requires either Figma variables/styles or pasting raw JSON into the hidden JSON editor view; there is no explicit "Import from file" action with file picker or drag-and-drop for `.json` files, making the import path non-obvious (`figma-plugin/ImportPanel.tsx:136-156`)

- [ ] Figma collection name is hardcoded to `'TokenManager'` — all token sets sync into a single Figma variable collection named `'TokenManager'`; users cannot configure which collection a set maps to, meaning they cannot maintain separate collections for e.g. primitives vs semantics vs component tokens (`figma-plugin/controller.ts:7`)

- [ ] Figma variable mode creation during sync — when pushing tokens to Figma, the controller always uses the existing first mode (`collection.modes[0].modeId`) and never creates new modes; users must manually pre-create modes in Figma before syncing multi-mode token sets, which breaks the push-to-Figma workflow for new projects (`figma-plugin/controller.ts:132-152`)

- [ ] Bulk token operations beyond the current three — the batch editor only supports: add description, apply opacity (colors), scale values (dimensions/numbers); missing bulk operations for common tasks: move selection to a different set, rename by find/replace within selection, change `$type` across selection (`figma-plugin/BatchEditor.tsx:47-170`)

- [ ] Arbitrary `$extensions` view and edit — the token editor only exposes `tokenmanager.colorModifier` and `com.figma.scopes`; all other extension data on a token is invisible and uneditable via UI, making it impossible to manage custom tooling extensions without editing the JSON file directly (`figma-plugin/TokenEditor.tsx:154-156`)

- [ ] AnalyticsPanel fetch AbortController — fetches all sets' tokens in parallel with no AbortController; setState on unmounted component if user switches tabs (`figma-plugin/AnalyticsPanel.tsx:201-264`)
- [ ] AliasAutocomplete entries not memoized — `entries` recomputed every render without `useMemo`; expensive for large token sets (`figma-plugin/AliasAutocomplete.tsx`)
- [ ] LintConfigStore shallow cache reference — `LintConfigStore.load()` returns shallow reference to cached config; callers can corrupt the cache (`server/lint.ts:63-72`)
- [ ] `validateAllTokens` hardcodes depth > 3 — should read limit from lint config instead of hardcoding (`server/lint.ts:338`)
- [ ] Pervasive `as any` casts in generator-service and routes — bypasses type safety across the plugin boundary (`generator-service.ts`, `generators route`, `sets route`, `tokens route`, `controller.ts`)
- [ ] REFERENCE_GLOBAL_REGEX module-level stateful regex — `/g` flag creates a latent `.lastIndex` hazard if `.test()` or `.exec()` are used directly (`core/constants.ts:118`)
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
