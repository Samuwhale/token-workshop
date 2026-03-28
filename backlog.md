# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
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

- [x] No loading/saving indicator when toggling set state (Off/Base/On) — optimistic update fires but if the network is slow there's zero feedback that the save is in progress; add a subtle spinner or opacity change during the API call
- [x] Theme cache returns mutable reference — `load()` returns the cache object directly; route handlers that mutate it (push, filter) change the cached copy in-place, so if `save()` throws the cache is left in an inconsistent state (mutated but not persisted)
- [x] Theme option name trimmed inconsistently with lookup — `name.trim()` is used for storage but `findIndex` searches with the untrimmed name; `" light "` won't match existing `"light"`, creating duplicates

### QoL

- [~] ThemeManager fetches all token sets on mount to compute coverage gaps — with many sets or large token files this creates a waterfall of requests and memory pressure; move coverage computation server-side or lazy-load per-option on expand
- [x] ThemeManager calls full `fetchDimensions()` after every mutation (create, rename, delete, reorder, toggle) — redundant after the optimistic update already applied; only re-fetch on error rollback or debounce the re-fetch
- [x] ThemeManager empty state could be more scannable — single paragraph at 10px explaining dimensions; break into structured examples with clickable quick-start dimension names (e.g. "Color Mode", "Brand", "Density")
- [x] "Off / Base / On" theme set states are confusing — the three-state toggle (disabled/source/enabled) is cryptic; rename to "Not included" / "Foundation" / "Override", add inline help tooltip, and show a visual stack diagram explaining the layering model
- [~] Theme Compare lacks actionable output — you can see diffs between theme options but can't fix gaps directly from the compare view; add inline "create missing token" and "edit value" actions so users don't have to navigate away

### UX

- [~] Theme switcher is buried and hard to discover — dimension buttons only appear if themes exist, and ThemeManager is behind overflow menu; show an empty-state prompt on the Tokens tab: "Set up themes to manage light/dark mode, brands, and more" linking directly to ThemeManager
- [~] ThemeManager is the most complex and least intuitive screen — the matrix of dimensions × options × sets × states doesn't help users build a mental model; redesign around a visual stacking model: dimensions as layers in a stack (top overrides bottom), options as tabs per layer, sets shown with "base" vs "override" clearly distinguished, plus a live preview showing "with these settings, token X resolves to Y"
- [ ] Tokens and themes are edited in completely separate interfaces — unlike Figma's native variables where mode values are columns next to each other, TokenManager requires global theme switching to see one value at a time; add an optional multi-mode column view to the token list showing resolved values per theme option side-by-side, with inline editing that auto-routes changes to the correct override set

---

## Sync

### Bugs

- [ ] `convertFromFigmaValue` crashes on undefined COLOR values — when a variable has no value set for a mode, `valuesByMode[modeId]` is `undefined`; calling `rgbToHex(undefined)` throws TypeError; needs a null guard before conversion
- [ ] `convertToFigmaValue` returns NaN for non-numeric strings — for number/fontWeight/percentage types, `parseFloat(value)` on a non-numeric string returns NaN, which is passed to `variable.setValueForMode()` and throws in the Figma API
- [ ] Variable snapshots shallow-copy `valuesByMode` — COLOR variable values are objects (`{r,g,b,a}`); if Figma returns the same reference and it later mutates, the snapshot won't preserve the original; needs deep copy for rollback safety
- [ ] Git sync branch names not validated against flag injection — `checkout` and `createBranch` pass user-supplied names directly to simple-git; a name like `--orphan` could be interpreted as a flag

### QoL

- [ ] No visual diff for Figma variable publish — the Variables section shows added/modified/unchanged counts but no side-by-side preview of old vs. new values with color swatches; users can't visually verify what will change before applying

### UX

- [ ] No in-plugin Git merge conflict resolution — `git pull` can create merge conflicts in `.tokens.json` files, but there's no conflict resolver UI; users must switch to a code editor to fix JSON conflicts
- [ ] No visual version history or changelog — beyond raw `git log`, there's no timeline of token changes with before/after value diffs; useful for reviewing what changed between design reviews or releases

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

- [ ] `parseDimValue` returns 0 for string dimensions — DTCG dimension tokens like `"16px"` or `"1.5rem"` hit neither the `number` nor `object` branch, so all string dimensions silently become 0 when applied to layers
- [ ] `applyTextStyle` modifies text style properties without loading font — when `fontFamily` is falsy the font-loading block is skipped, but `fontSize`/`lineHeight`/`letterSpacing` are still set on the style, which throws if the font isn't loaded
- [ ] Opacity percentage values silently clamped to 1.0 — DTCG allows opacity as 0–100 percentage; a token with value `50` (meaning 50%) is clamped to 1.0 (fully opaque) because there's no unit-awareness for opacity
- [ ] `lineHeight` handled inconsistently — numeric values are treated as multipliers and converted to percent (`val * 100`), but `{unit: '%', value: 150}` is silently ignored; also, unitless-as-percent interpretation may be wrong for systems where unitless means pixels
- [ ] Missing error handling in controller for `apply-styles` and `read-styles` — these message handlers await without try/catch; errors are unhandled and the UI receives no feedback (contrast with `read-variables` which has proper error handling)

### QoL

- [ ] No "apply and advance" flow in Inspect — after binding a token to a property, there's no shortcut to jump to the next unbound property or next layer; binding 20 properties across layers is 20 separate manual workflows
- [ ] Inspect tab can't search or filter layers — no way to find layers by name, type, or component; users must click around the Figma canvas to locate layers they want to bind tokens to

### UX

- [ ] Inspect tab has no quick-bind flow — binding requires select layer → find property → click bind → search token → apply (4+ steps); add a fast path: select layer(s) in Figma → hover token in list → see preview on canvas → click to apply; also consider drag-from-list-to-property and click-token-to-auto-bind-matching-property

---

## Import

### Bugs

### QoL

### UX

---

## Token Generation & Graph Editor

### Bugs

- [ ] Generator silently returns empty array on invalid hex — `runColorRampGenerator`, `runAccessibleColorPairGenerator`, and `runDarkModeInversionGenerator` return `[]` when `hexToLab()` fails; caller cannot distinguish "generation failed" from "produced zero tokens"
- [ ] Generator overwrite detection is broken — `useGeneratorDialog` calls `flattenTokenGroup()` which returns a `Map`, but the result is used with bracket notation (`existingSetTokens[path]`) which always returns `undefined` on a Map; `overwrittenEntries` is always empty
- [ ] `CustomScaleConfig.outputType` is typed `string` instead of `TokenType` — any arbitrary string can be passed, producing tokens with an invalid `$type`; propagates to `GeneratedTokenResult.type`
- [ ] Unvalidated cast of color modifiers from `$extensions` — `modifiers as ColorModifierOp[]` casts without validation; malformed `$extensions.tokenmanager.colorModifier` data (missing `type` or `amount`) causes cryptic runtime errors

### UX

- [ ] Generators are powerful but disconnected from the token list — generated tokens only show their generator link via $extensions metadata; add a "Generated by [Color Ramp]" badge on tokens in the list, warn before overwriting manually-edited generated tokens on re-run, and allow "detaching" a token from its generator

---

## Token Editor

### Bugs

- [ ] Stale `handleSave` closure in keyboard shortcut effect — the `useEffect` for Cmd+S references `handleSave` via closure but omits it from the dependency array; when the user presses Cmd+S, a stale version may submit outdated values for path, type, reference, scopes, modifiers, etc.
- [ ] UndoToast `{shiftKey}` not interpolated — in the redo tooltip, `{shiftKey}` is inside a template literal without `${}`, rendering as the literal string `{shiftKey}Z` instead of the actual key symbol

### QoL

- [ ] Color picker is hex-only at first glance — no format toggle (Hex/RGB/HSL), no recent colors strip, no "from existing token" shortcut; add format selector, recent colors, and a quick-reference picker

---

## Settings & Data Management

### Bugs

- [ ] Set rename is not atomic — comment says "atomic (same filesystem, so fs.rename is atomic)" but code uses `fs.writeFile` then `fs.unlink`; if the process crashes between steps, both files exist on disk and the next startup loads both
- [ ] Theme load-modify-save races on concurrent requests — every mutation route does `load()` → modify → `save()` with no locking; two concurrent requests (e.g., two browser tabs adding options) can race and the second save overwrites the first's changes

### QoL

- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing
- [ ] No undo for destructive operations beyond toast — bulk delete, group rename, and generator runs have confirmation modals but no rollback; implement undo for all write operations via server-side operation log, or at minimum show "last 5 operations" with rollback in the command palette

### UX

---

## Code Quality

### Redundancy & Duplication

- [ ] Shadow-to-Figma-effect mapping duplicated — nearly identical conversion logic in `styleSync.ts` (`applyEffectStyle`) and `selectionHandling.ts` (`applyTokenValue` shadow case); extract to a shared helper
- [ ] `describeError` helper duplicated in 3 hook files — identical function in `useGitSync.ts`, `useStyleSync.ts`, and `useVariableSync.ts`; move to `shared/utils.ts` alongside existing `getErrorMessage`
- [ ] `SET_NAME_RE` regex duplicated — same validation regex defined in both `useSetRename.ts` and `App.tsx`; if the rule changes, both must be updated
- [ ] Node collection logic duplicated in `selectionHandling.ts` — `remapBindings` and `syncBindings` have nearly identical scope-based node collection (selection vs page); extract to shared helper

### Performance

- [ ] `resolveStyleForWeight` calls `listAvailableFontsAsync` on every invocation — during a sync processing many typography tokens, this makes redundant API calls; the font list should be cached per plugin session
- [ ] `refreshTokens` double-fires on initial load — `refreshTokens` depends on `activeSet`, and calls `setActiveSet(current)` which changes `activeSet`, which re-triggers the effect; generation counter prevents stale display but the fetch fires twice

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [ ] Missing imports in `token-store.ts` — `parseReference`, `makeReferenceGlobalRegex`, and `TokenNode` are used but not imported from `@tokenmanager/core`; `isSafeRegex` is re-exported but not imported for local use; these cause compilation failures or silently disable features like circular reference detection
- [ ] Missing export `validateStepName` in `generator-service.ts` — imported from `@tokenmanager/core` but doesn't exist as an export from that module
- [ ] Resolver inconsistent color map initialization — `resolve(path)` creates a fresh color map without seeding already-resolved tokens, unlike `resolveAll()` which seeds them; this creates a latent gap in cycle detection for incrementally-added tokens
- [ ] CORS origin includes string `'null'` — allows requests from sandboxed iframes, data: URLs, and redirects; if intentional for the Figma plugin iframe, add a comment; otherwise remove
- [ ] TokenList `handleListKeyDown` has stale closure — `selectedPaths` and `displayedLeafNodes` are missing from the `useCallback` dependency array; Cmd+C copies stale selection
- [ ] Multiple fetch calls in TokenList with no error handling — `handleRenameGroup`, `executeTokenRename`, `handleDropOnGroup`, `handleDuplicateGroup`, `handleInlineSave` don't check `res.ok` or catch network errors; failed operations push undo slots and refresh as if they succeeded
- [ ] `useSetMergeSplit` silently swallows all errors — multiple `catch {}` blocks with `// ignore`; network errors, server errors, and JSON parse errors all vanish with no user feedback
- [ ] `useSetMetadata` silently swallows save errors — `handleSaveMetadata` catches all errors with `// best-effort; close modal regardless`; user gets no feedback that their changes failed
- [ ] `useGitSync` mutates ref inside `setState` updater — `setSelectedFiles(prev => ...)` mutates `knownFilesRef.current` inside the updater function; updater functions should be pure; will be replayed incorrectly in StrictMode

### Accessibility

- [ ] Token badge text contrast fails WCAG AA — several badge colors (`#95a5a6` shadow, `#00cec9` duration, `#00b894` asset, `#1abc9c` number) have < 4.5:1 contrast ratio against the `#2c2c2c` dark background; lighten these text colors to meet AA minimum
- [ ] Icon-only buttons in TokenTreeNode missing `aria-label` — move up/down, create sibling, and other icon buttons have `title` but no `aria-label`; screen readers announce these as unlabeled buttons
- [ ] Interactive targets below 24px in both token and theme pages — ThemeManager reorder arrows (~12x10px), TokenTreeNode action buttons (~18x18px), view mode toggles (~20px tall); increase minimum padding to `p-1.5` for 24px+ targets
- [ ] No `<label>` or `aria-label` on form inputs — dimension name, option name, set filter, and search inputs rely solely on placeholder text which disappears on focus; add `aria-label` to all inputs
- [ ] No `aria-live` regions for dynamic status messages — copy feedback, apply result, delete error, and ThemeManager error banner appear dynamically but aren't announced by screen readers; wrap in `aria-live="polite"`
- [ ] Coverage gap scrollable list in ThemeManager has no keyboard navigation — the `max-h-32 overflow-y-auto` container traps keyboard focus; add `tabIndex={0}` or ensure inner buttons receive focus naturally
- [ ] Minimum text size of 9px used for secondary content across both pages — borderline legible even on high-DPI; audit all `text-[9px]` usage and bump to 10px where space allows

### Maintainability

- [ ] TokenList is 1600+ lines with 40+ useState hooks — high re-render surface and hard to reason about; extract related state into custom hooks (`useTokenCreate`, `useFindReplace`, `useDragDrop`)
- [ ] TokenTreeNode has 47 props and is 1200+ lines — the deeply-passed prop set is a strong signal for a React context; many props are forwarded recursively unchanged
- [ ] `handleCreate` and `handleCreateAndNew` are near-identical — ~90% shared logic (validation, API call, undo setup) with only the post-success action differing; should be a single function with a parameter
- [ ] `DEFAULT_WEIGHT_STYLES` in `fontLoading.ts` is defined but never used — `weightToFontStyleFallback` serves the same purpose and is the one actually called

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [ ] No import from CSS custom properties or Tailwind config — only DTCG JSON and Figma Variables/Styles are supported as import sources; add parsers for CSS `--custom-property` declarations and Tailwind `theme` config objects to support migrations from code-first workflows
- [ ] No import conflict resolution UI — importing tokens that overlap with existing ones shows a skip/overwrite strategy picker but no per-token preview; add a merge conflict view showing each overlapping token's current vs. incoming value with per-token accept/reject (like git merge tools)
- [ ] No visual node-based generator editor — generators are configured via form dialogs with dropdowns and number inputs; add a node-graph editor (like Tokens Studio's Graph Engine or Blender shader nodes) where users connect source tokens to transform nodes (lighten, darken, scale, mix, contrast-check) to output tokens — makes complex generation logic visible and composable
- [ ] No generator preview before committing — running a generator immediately creates/overwrites tokens; add a dry-run preview showing the tokens that would be created with their values, diffs against existing tokens, and a confirm/cancel step
- [ ] No wide-gamut color support — color picker and value storage are limited to sRGB hex; add support for Display P3, OKLCh, and other CSS Color Module 4 color spaces as specified in DTCG v2025.10 — show a gamut indicator when a color exceeds sRGB and provide a fallback swatch
- [ ] No live typography preview in the editor — TypographyEditor shows form fields for font-family, size, weight, line-height, etc. but no rendered text sample; add a preview block showing "The quick brown fox" (or user-configurable sample text) rendered with the current values, updating in real-time as properties change
- [ ] No expression/formula builder with autocomplete — formula mode (`fx`) accepts expressions like `{spacing.base} * 2` but provides no syntax help; add autocomplete for token references inside formulas, operator hints, live evaluation preview showing the computed result, and error highlighting for invalid expressions
- [ ] No DTCG v2025.10 resolver support — theme variations require separate token sets per brand/mode combination, causing file proliferation; implement DTCG resolver config so a single resolver file contextually applies overrides, reducing the set management overhead and aligning with the new spec
- [ ] No $extends token inheritance — composite tokens (typography, shadow) must duplicate all properties even when only one differs from a base; support DTCG $extends so component tokens can inherit from and override specific properties of parent tokens

- [ ] Graph tab crashes — `graphScrollRef is not defined`; reference error causes the graph view to fail on render
