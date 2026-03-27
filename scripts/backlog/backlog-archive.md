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
