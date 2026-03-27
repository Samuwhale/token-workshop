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

- [x] `countLeafNodes` duplicated between `useTokens.ts:132-143` and AnalyticsPanel
- [x] `toLinear` / `wcagLuminance` duplicated between `color-math.ts` and `generator-engine.ts:275` — new closure allocated per call
- [x] `formatValue` redefined locally in ExportPanel.tsx shadowing the one from `tokenListUtils.ts` (`figma-plugin/ExportPanel.tsx:305-309`)
- [x] `FlatToken` interface in docs.ts duplicates core types — will drift (`server/routes/docs.ts:21-26`)
- [x] `stableStringify` exported from `colorUtils.ts` — JSON serialization utility doesn't belong in a color math module

### Performance

- [x] `useTokens.refreshTokens` fetches full token payload for every set just to count leaf nodes — server should provide counts in `/api/sets` response (`figma-plugin/useTokens.ts:52-67`)
- [x] Controller `findVariable` loads ALL local Figma variables to find one, called once per token in `applyVariables` — should cache variable list (`figma-plugin/controller.ts:1076-1079`)
- [x] ExportPanel `handleSaveToServer` saves each variable sequentially with separate HTTP requests (`figma-plugin/ExportPanel.tsx:250-293`)
- [x] Color map reinitialized O(n) on every single-token `resolve()` call — wasteful for single lookups (`core/resolver.ts:80-84`)
- [ ] `rebuildFlatTokens` called multiple times per batch operation without batching in `replaceSetTokens`, `renameGroup`, `moveGroup`, `bulkRename` (`server/token-store.ts`)
- [x] AnalyticsPanel fetches all sets' tokens in parallel with no `AbortController` — setState on unmounted component if user switches tabs (`figma-plugin/AnalyticsPanel.tsx:201-264`)
- [x] AliasAutocomplete `entries` recomputed every render without `useMemo` — expensive for large token sets (`figma-plugin/AliasAutocomplete.tsx`)
- [x] `LintConfigStore.load()` returns shallow reference to cached config — callers can corrupt the cache (`server/lint.ts:63-72`)
- [x] `validateAllTokens` hardcodes `depth > 3` instead of reading from lint config (`server/lint.ts:338`)

### Correctness & Safety

- [~] Pervasive `as any` casts in generator-service.ts, generators route, sets route, tokens route, and controller.ts — bypasses type safety across the plugin boundary
- [x] `REFERENCE_GLOBAL_REGEX` is a module-level stateful regex with `/g` flag — latent `.lastIndex` hazard if anyone uses `.test()` or `.exec()` directly (`core/constants.ts:118`)
- [ ] App.tsx is a ~2000-line god component with 40+ useState declarations — should be decomposed into feature modules
- [ ] TokenList accepts 30+ props — strong signal for context/state management extraction (`figma-plugin/TokenList.tsx:33-61`)
- [ ] TokenGeneratorDialog is ~800+ lines handling 7+ generator types in one component (`figma-plugin/TokenGeneratorDialog.tsx`)
- [ ] `docs.ts` style attribute built with `escapeHtml` but not `escapeCssValue` — CSS injection possible via adversarial token values (`server/routes/docs.ts:70-71`)
- [ ] 15+ distinct localStorage keys scattered across components without centralized persistence utility

- [ ] Per-mode token value editing — there is no way to set different `$value`s for the same token across different modes; mode-aware editing is a core DTCG use-case (e.g. light/dark, brand-A/brand-B) and should be surfaced in the token edit UI alongside the current single-value field

- [ ] Move single token to a different set — individual tokens can only be moved between groups (by editing the path prefix); there is no action to move a token to an entirely different set, even though group-level move exists (`server/routes/tokens.ts`, `TokenList.tsx` context menu)

- [ ] Duplicate single token — only groups can be duplicated (with `-copy` suffix); there is no way to duplicate an individual token row to a new path, which is a common workflow when creating similar tokens (`TokenList.tsx` context menu)

- [ ] Undo/redo for token edits — `useUndo` exists and works for generator edits but token create/edit/delete/rename operations are not undoable; a user who accidentally deletes or renames a token has no recovery path short of git (`figma-plugin/useUndo.ts`, `TokenList.tsx`)

- [ ] Delete non-empty group — the group context menu only allows deleting empty groups; deleting a group with tokens inside requires deleting each token individually or editing the JSON file directly; should offer "Delete group and all contained tokens" with a confirmation showing the count (`TokenList.tsx` group context menu)

- [ ] Broken alias reference warning in editor — the token editor accepts any `{path}` string without validating whether it resolves; broken references are only surfaced in AnalyticsPanel/lint, not at the point of entry; editor should show an inline warning "Reference does not resolve" when the typed path doesn't match any token (`figma-plugin/TokenEditor.tsx`, alias input)

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
