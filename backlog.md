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

- [x] `n` keyboard shortcut to open new-token form — when the token list has focus and no input is active, pressing `n` should open the create form with the currently focused group path pre-filled as the path prefix

### UX

- [x] Rename remap preview — rename confirmation dialog shows dependent count but not which tokens will be updated; add a scrollable list of affected token paths so users can verify before confirming (`TokenList.tsx:2085-2090`)
- [x] Inline lint violation indicator on token rows — violations currently only surface in AnalyticsPanel or behind the issues-only filter toggle; each violating row should show a subtle warning icon inline so problems are visible while browsing normally, not just when explicitly filtering (`TokenList.tsx`, `lintViolations` prop)
- [x] `onNavigateToAlias` should scroll virtual list to highlighted row — clicking an alias `{path}` ref sets `highlightedToken` but doesn't scroll the virtual list viewport to make the highlighted row visible; row can be off-screen with no indication of where it is (`TokenList.tsx`, virtual scroll logic)
- [x] Move token to group via drag-and-drop — moving a token to a different group currently requires manually editing its path; token rows should be draggable onto group header rows as a drop target, distinct from the existing select-mode drag-to-reorder (`TokenList.tsx`)

---

## Theme Management

### Bugs

- [x] `DimensionsStore` re-created on every themes API call — re-reads `$themes.json` from disk per request (`server/routes/themes.ts:51,72,94,112,141,169`)

### QoL

### UX

- [x] Theme dimension switcher: use segmented controls instead of dropdowns — dimensions with ≤5 options should render as inline pill/radio buttons so all options are visible at a glance without clicking; fall back to dropdown only for 6+ options (`App.tsx:1770-1814`)
- [x] Collapse theme switcher bar to a badge at narrow plugin widths — the dimensions row wraps to multiple lines at small widths (≤360px), consuming 3+ rows of vertical space; collapse to a single "Light · Brand A" badge that expands on click (`App.tsx:1772-1827`)

---

## Sync

### Bugs

- [x] File watcher fires on the server's own writes, causing redundant `loadSet` + `rebuildFlatTokens` + double SSE events (`server/token-store.ts:85-117`)
- [x] `applyDiffChoices` pushes the entire repo when any single file is marked 'push' — semantic mismatch with per-file UI (`server/git-sync.ts:132-135`)
- [x] SyncPanel `computeVarDiff` reads `'variables-read'` messages with no correlation ID — can collide with ImportPanel/ExportPanel reading variables simultaneously (`figma-plugin/SyncPanel.tsx:135-145`)

### UX

- [x] Last-synced timestamp in Publish tab — no visual indication of when the last git push/pull occurred; show "Last synced: 3 min ago" or a static ISO timestamp below the Publish header so users can gauge staleness at a glance

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

- [x] Click-to-navigate from analytics violations to the offending token — violation and duplicate entries in AnalyticsPanel are informational only; clicking one should close the panel, switch to Tokens tab, navigate to the set containing the token, and highlight the row (`figma-plugin/AnalyticsPanel.tsx`)

---

## Selection Inspector & Property Binding

### UX

---

## Import

### Bugs

- [x] ImportPanel `executeImport` sends tokens one at a time in a sequential `for` loop — N HTTP requests for N tokens (`figma-plugin/ImportPanel.tsx:279-297`)

### UX

- [x] Auto-navigate to imported set after successful import — after `executeImport` completes, close the Import panel and switch to the Tokens tab with the target set active; currently leaves the user on the Import panel with no indication of what was added (`figma-plugin/ImportPanel.tsx`)

---

## Token Generation & Graph Editor

### Bugs

- [x] `contrastCheck` generator type missing from `computeResultsWithValue` switch — will throw "Unknown generator type" for multi-brand contrast check generators (`server/generator-service.ts:408-481`)
- [~] `contrastLevel` and `levels` config fields defined in generator types but never read by the engine — always hardcodes AA 4.5 threshold (`core/generator-types.ts:165,219`, `core/generator-engine.ts:291,393`)
- [x] `getGeneratorTypeLabel` missing `'contrastCheck'` case — returns `undefined` in GraphPanel UI (`figma-plugin/GraphPanel.tsx:171-181`)

### UX

- [x] Generators tab empty state guidance — when no generators exist the list is blank; replace with a descriptive empty state explaining what generators produce (color scales, contrast pairs, spacing scales, semantic aliases) and a primary CTA to add the first generator (`figma-plugin/GraphPanel.tsx`)

---

## Token Editor

### QoL

- [~] Show alias resolution chain on hover — when a token's value is an alias `{path.to.ref}`, hovering the alias chip in the editor should show a popover with the full resolution chain (e.g. `brand.primary → palette.blue.500 → #0070f3`) rather than only the terminal resolved value (`figma-plugin/TokenEditor.tsx`)

---

## Settings & Data Management

### QoL

- [ ] Settings server URL field: surface "Press Enter to connect" affordance — the field accepts Enter to trigger a connection attempt but there's no visible hint; a small helper text below the input reduces confusion for first-time setup (`App.tsx:1884-1890`)

---

## Code Quality

### Redundancy & Duplication

- [ ] `computeResults` and `computeResultsWithValue` are near-identical 200-line switch statements — should resolve source value first then call one shared switch (`server/generator-service.ts:401-483 vs 486-599`)
- [ ] `hexToHsl` duplicated in TokenCanvas.tsx when it already exists in `colorUtils.ts` (`figma-plugin/TokenCanvas.tsx:18-33`)
- [ ] `flattenTokensObj` re-implemented in App.tsx despite `flattenTokenGroup` from `@tokenmanager/core` (`figma-plugin/App.tsx:859-871`)
- [ ] `flattenForVarDiff` in SyncPanel is yet another flatten implementation (`figma-plugin/SyncPanel.tsx:42-57`)
- [ ] `countLeafNodes` duplicated between `useTokens.ts:132-143` and AnalyticsPanel
- [ ] `toLinear` / `wcagLuminance` duplicated between `color-math.ts` and `generator-engine.ts:275` — new closure allocated per call
- [ ] `formatValue` redefined locally in ExportPanel.tsx shadowing the one from `tokenListUtils.ts` (`figma-plugin/ExportPanel.tsx:305-309`)
- [ ] `FlatToken` interface in docs.ts duplicates core types — will drift (`server/routes/docs.ts:21-26`)
- [ ] `stableStringify` exported from `colorUtils.ts` — JSON serialization utility doesn't belong in a color math module

### Performance

- [ ] `useTokens.refreshTokens` fetches full token payload for every set just to count leaf nodes — server should provide counts in `/api/sets` response (`figma-plugin/useTokens.ts:52-67`)
- [ ] Controller `findVariable` loads ALL local Figma variables to find one, called once per token in `applyVariables` — should cache variable list (`figma-plugin/controller.ts:1076-1079`)
- [ ] ExportPanel `handleSaveToServer` saves each variable sequentially with separate HTTP requests (`figma-plugin/ExportPanel.tsx:250-293`)
- [ ] Color map reinitialized O(n) on every single-token `resolve()` call — wasteful for single lookups (`core/resolver.ts:80-84`)
- [ ] `rebuildFlatTokens` called multiple times per batch operation without batching in `replaceSetTokens`, `renameGroup`, `moveGroup`, `bulkRename` (`server/token-store.ts`)
- [ ] AnalyticsPanel fetches all sets' tokens in parallel with no `AbortController` — setState on unmounted component if user switches tabs (`figma-plugin/AnalyticsPanel.tsx:201-264`)
- [ ] AliasAutocomplete `entries` recomputed every render without `useMemo` — expensive for large token sets (`figma-plugin/AliasAutocomplete.tsx`)
- [ ] `LintConfigStore.load()` returns shallow reference to cached config — callers can corrupt the cache (`server/lint.ts:63-72`)
- [ ] `validateAllTokens` hardcodes `depth > 3` instead of reading from lint config (`server/lint.ts:338`)

### Correctness & Safety

- [ ] Pervasive `as any` casts in generator-service.ts, generators route, sets route, tokens route, and controller.ts — bypasses type safety across the plugin boundary
- [ ] `REFERENCE_GLOBAL_REGEX` is a module-level stateful regex with `/g` flag — latent `.lastIndex` hazard if anyone uses `.test()` or `.exec()` directly (`core/constants.ts:118`)
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
