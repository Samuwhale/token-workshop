# Backlog Archive
Completed items removed from backlog.md to keep it lean.

## Archived 2026-03-27 (25 items)
- [x] Async side effects inside React setState updaters in useUndo — `slot.restore()` / `slot.redo()` could fire multiple times under StrictMode/Concurrent Mode (`figma-plugin/useUndo.ts:33-34,49-50`)
- [x] ThemeManager useEffect missing `onDimensionsChange` in dependency array — uses stale callback if parent re-renders (`figma-plugin/ThemeManager.tsx:61`)
- [x] Hide set precedence hint bar until drag starts — "← lower precedence · drag to reorder · higher precedence →" is always visible whenever there are 2+ sets; only show it during an active drag (or fade it in on first hover and dismiss after a few seconds) to reduce visual noise (`App.tsx:1612-1615`)
- [x] Persist preview split-view panel ratio to localStorage — the split ratio resets to default on every reload (`App.tsx`, `showPreviewSplit` state)
- [x] Search match count per set — when filtering/searching tokens, set tabs only show static total count; should show filtered match count (e.g. "3 / 47") so users know which set to look in (`App.tsx:1657-1658`)
- [x] Rename "Graph" tab to "Generators" — the current label doesn't communicate purpose to new users; the tab hosts generator templates and the pipeline dependency view, not a graph of token relationships (`App.tsx:132-136`)
- [x] Publish tab dirty indicator — show a small dot badge on the Publish tab when there are uncommitted local git changes, matching the pattern VS Code uses for modified editor tabs; gives users a heads-up without switching to the tab
- [x] "···" theme-manage button needs accessible label/tooltip — the ellipsis button in the theme switcher bar (`App.tsx:1819-1825`) has no `title` or `aria-label`; at minimum add `title="Manage theme dimensions"`
- [x] Keyboard shortcut discovery — add a "Keyboard shortcuts…" entry to the Cmd+K command palette that lists all registered shortcuts; currently they're completely undiscoverable unless the user already knows them
- [x] Group-level "+" button hardcodes type to `'color'` — should infer type from children/siblings in the group (e.g. if all children are `dimension`, default to `dimension`) (`TokenList.tsx:2801`)
- [x] `evalExpr` `**` operator has wrong precedence — `2 * 3 ** 4` evaluates to 1296 instead of 162 (`core/eval-expr.ts:47-51`). `parsePow` is a no-op; `^` is tokenized but never parsed
- [x] `lighten`/`darken` color modifiers silently swallow invalid hex input while `mix` throws — inconsistent error handling (`core/color-modifier.ts:25,32`)
- [x] `wcagLuminance` returns 0 for invalid input instead of erroring — causes incorrect contrast ratios (`core/generator-engine.ts:274`)
- [x] `clearAll` on token-store doesn't call `rebuildFlatTokens`/`rebuildResolver` — stale resolver persists until next file write (`server/token-store.ts:231-241`)
- [x] `updateAliasRefs` misses aliases referencing the group itself (not a child) because `oldPrefix` always has a trailing dot (`server/token-store.ts:443`)
- [x] `createToken` for a new set triggers 3 rebuilds: createSet + saveSet + watcher (`server/token-store.ts:297-310`)
- [x] Missing `return` after error `reply.send()` in sets.ts PATCH handlers and export.ts — could cause "reply already sent" (`server/routes/sets.ts:60,83`, `server/routes/export.ts:34`)
- [x] `deleteTokenAtPath` leaves empty parent group objects `{}` in the JSON file (`server/token-store.ts:760-773`)
- [x] ImportPanel conflict check only looks at top-level keys, misses nested token paths (`figma-plugin/ImportPanel.tsx:321-324`)
- [x] `enrichFormulaExtension` identity-comparison always evaluates to `true`, causing every formula update to overwrite `$extensions` even when unchanged (`server/token-store.ts:321`)
- [x] Composite token sub-property references — typography, shadow, and border editors only accept hard-coded values per sub-property; each field should also accept alias syntax `{path.to.token}` with autocomplete, matching DTCG spec for partial references (`TokenEditor.tsx:1255-1391`)
- [x] Math expressions in token values — `evalExpr` exists but is only exposed in Custom Scale generator formulas; regular token value inputs should support expressions like `{spacing.base} * 2` with live resolution preview (`core/eval-expr.ts`, `TokenEditor.tsx`)
- [x] Copy token path to clipboard on row hover — show a copy icon on hover in token list rows so users can quickly grab the dotted path; currently requires opening the editor or switching to JSON view (`TokenList.tsx`)
- [x] Copy resolved value to clipboard — add a one-click copy affordance on the value preview chip in list rows; useful for extracting values into code without opening the editor
- [x] Empty search → offer "Create token" shortcut — when a search returns zero results, show a hint button "No tokens found — create '{query}'?" to streamline the search-then-create workflow (`TokenList.tsx`)

## Archived 2026-03-27 (25 items)
- [x] `n` keyboard shortcut to open new-token form — when the token list has focus and no input is active, pressing `n` should open the create form with the currently focused group path pre-filled as the path prefix
- [x] Rename remap preview — rename confirmation dialog shows dependent count but not which tokens will be updated; add a scrollable list of affected token paths so users can verify before confirming (`TokenList.tsx:2085-2090`)
- [x] Inline lint violation indicator on token rows — violations currently only surface in AnalyticsPanel or behind the issues-only filter toggle; each violating row should show a subtle warning icon inline so problems are visible while browsing normally, not just when explicitly filtering (`TokenList.tsx`, `lintViolations` prop)
- [x] `onNavigateToAlias` should scroll virtual list to highlighted row — clicking an alias `{path}` ref sets `highlightedToken` but doesn't scroll the virtual list viewport to make the highlighted row visible; row can be off-screen with no indication of where it is (`TokenList.tsx`, virtual scroll logic)
- [x] Move token to group via drag-and-drop — moving a token to a different group currently requires manually editing its path; token rows should be draggable onto group header rows as a drop target, distinct from the existing select-mode drag-to-reorder (`TokenList.tsx`)
- [x] `DimensionsStore` re-created on every themes API call — re-reads `$themes.json` from disk per request (`server/routes/themes.ts:51,72,94,112,141,169`)
- [x] Theme dimension switcher: use segmented controls instead of dropdowns — dimensions with ≤5 options should render as inline pill/radio buttons so all options are visible at a glance without clicking; fall back to dropdown only for 6+ options (`App.tsx:1770-1814`)
- [x] Collapse theme switcher bar to a badge at narrow plugin widths — the dimensions row wraps to multiple lines at small widths (≤360px), consuming 3+ rows of vertical space; collapse to a single "Light · Brand A" badge that expands on click (`App.tsx:1772-1827`)
- [x] File watcher fires on the server's own writes, causing redundant `loadSet` + `rebuildFlatTokens` + double SSE events (`server/token-store.ts:85-117`)
- [x] `applyDiffChoices` pushes the entire repo when any single file is marked 'push' — semantic mismatch with per-file UI (`server/git-sync.ts:132-135`)
- [x] SyncPanel `computeVarDiff` reads `'variables-read'` messages with no correlation ID — can collide with ImportPanel/ExportPanel reading variables simultaneously (`figma-plugin/SyncPanel.tsx:135-145`)
- [x] Last-synced timestamp in Publish tab — no visual indication of when the last git push/pull occurred; show "Last synced: 3 min ago" or a static ISO timestamp below the Publish header so users can gauge staleness at a glance
- [x] Click-to-navigate from analytics violations to the offending token — violation and duplicate entries in AnalyticsPanel are informational only; clicking one should close the panel, switch to Tokens tab, navigate to the set containing the token, and highlight the row (`figma-plugin/AnalyticsPanel.tsx`)
- [x] ImportPanel `executeImport` sends tokens one at a time in a sequential `for` loop — N HTTP requests for N tokens (`figma-plugin/ImportPanel.tsx:279-297`)
- [x] Auto-navigate to imported set after successful import — after `executeImport` completes, close the Import panel and switch to the Tokens tab with the target set active; currently leaves the user on the Import panel with no indication of what was added (`figma-plugin/ImportPanel.tsx`)
- [x] `contrastCheck` generator type missing from `computeResultsWithValue` switch — will throw "Unknown generator type" for multi-brand contrast check generators (`server/generator-service.ts:408-481`)
- [x] `contrastLevel` and `levels` config fields defined in generator types but never read by the engine — always hardcodes AA 4.5 threshold (`core/generator-types.ts:165,219`, `core/generator-engine.ts:291,393`)
- [x] `getGeneratorTypeLabel` missing `'contrastCheck'` case — returns `undefined` in GraphPanel UI (`figma-plugin/GraphPanel.tsx:171-181`)
- [x] Generators tab empty state guidance — when no generators exist the list is blank; replace with a descriptive empty state explaining what generators produce (color scales, contrast pairs, spacing scales, semantic aliases) and a primary CTA to add the first generator (`figma-plugin/GraphPanel.tsx`)
- [x] Show alias resolution chain on hover — when a token's value is an alias `{path.to.ref}`, hovering the alias chip in the editor should show a popover with the full resolution chain (e.g. `brand.primary → palette.blue.500 → #0070f3`) rather than only the terminal resolved value (`figma-plugin/TokenEditor.tsx`)
- [x] Settings server URL field: surface "Press Enter to connect" affordance — the field accepts Enter to trigger a connection attempt but there's no visible hint; a small helper text below the input reduces confusion for first-time setup (`App.tsx:1884-1890`)
- [x] `computeResults` and `computeResultsWithValue` are near-identical 200-line switch statements — should resolve source value first then call one shared switch (`server/generator-service.ts:401-483 vs 486-599`)
- [x] `hexToHsl` duplicated in TokenCanvas.tsx when it already exists in `colorUtils.ts` (`figma-plugin/TokenCanvas.tsx:18-33`)
- [x] `flattenTokensObj` re-implemented in App.tsx despite `flattenTokenGroup` from `@tokenmanager/core` (`figma-plugin/App.tsx:859-871`)
- [x] `flattenForVarDiff` in SyncPanel is yet another flatten implementation (`figma-plugin/SyncPanel.tsx:42-57`)

## Archived 2026-03-27 (22 items)
- [x] `countLeafNodes` duplicated between `useTokens.ts:132-143` and AnalyticsPanel
- [x] `toLinear` / `wcagLuminance` duplicated between `color-math.ts` and `generator-engine.ts:275` — new closure allocated per call
- [x] `formatValue` redefined locally in ExportPanel.tsx shadowing the one from `tokenListUtils.ts` (`figma-plugin/ExportPanel.tsx:305-309`)
- [x] `FlatToken` interface in docs.ts duplicates core types — will drift (`server/routes/docs.ts:21-26`)
- [x] `stableStringify` exported from `colorUtils.ts` — JSON serialization utility doesn't belong in a color math module
- [x] `useTokens.refreshTokens` fetches full token payload for every set just to count leaf nodes — server should provide counts in `/api/sets` response (`figma-plugin/useTokens.ts:52-67`)
- [x] Controller `findVariable` loads ALL local Figma variables to find one, called once per token in `applyVariables` — should cache variable list (`figma-plugin/controller.ts:1076-1079`)
- [x] ExportPanel `handleSaveToServer` saves each variable sequentially with separate HTTP requests (`figma-plugin/ExportPanel.tsx:250-293`)
- [x] Color map reinitialized O(n) on every single-token `resolve()` call — wasteful for single lookups (`core/resolver.ts:80-84`)
- [x] `rebuildFlatTokens` called multiple times per batch operation without batching in `replaceSetTokens`, `renameGroup`, `moveGroup`, `bulkRename` (`server/token-store.ts`)
- [x] AnalyticsPanel fetches all sets' tokens in parallel with no `AbortController` — setState on unmounted component if user switches tabs (`figma-plugin/AnalyticsPanel.tsx:201-264`)
- [x] AliasAutocomplete `entries` recomputed every render without `useMemo` — expensive for large token sets (`figma-plugin/AliasAutocomplete.tsx`)
- [x] `LintConfigStore.load()` returns shallow reference to cached config — callers can corrupt the cache (`server/lint.ts:63-72`)
- [x] `validateAllTokens` hardcodes `depth > 3` instead of reading from lint config (`server/lint.ts:338`)
- [x] Pervasive `as any` casts in generator-service.ts, generators route, sets route, tokens route, and controller.ts — bypasses type safety across the plugin boundary
- [x] `REFERENCE_GLOBAL_REGEX` is a module-level stateful regex with `/g` flag — latent `.lastIndex` hazard if anyone uses `.test()` or `.exec()` directly (`core/constants.ts:118`)
- [x] App.tsx is a ~2000-line god component with 40+ useState declarations — should be decomposed into feature modules
- [x] TokenList accepts 30+ props — strong signal for context/state management extraction (`figma-plugin/TokenList.tsx:33-61`)
- [x] TokenGeneratorDialog is ~800+ lines handling 7+ generator types in one component (`figma-plugin/TokenGeneratorDialog.tsx`)
- [x] `docs.ts` style attribute built with `escapeHtml` but not `escapeCssValue` — CSS injection possible via adversarial token values (`server/routes/docs.ts:70-71`)
- [x] 15+ distinct localStorage keys scattered across components without centralized persistence utility
- [x] Per-mode token value editing — there is no way to set different `$value`s for the same token across different modes; mode-aware editing is a core DTCG use-case (e.g. light/dark, brand-A/brand-B) and should be surfaced in the token edit UI alongside the current single-value field
