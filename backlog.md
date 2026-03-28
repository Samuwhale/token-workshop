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

- [x] "Last used token type" stored in sessionStorage resets when plugin window closes — move to localStorage or Figma clientStorage so it persists across sessions
- [x] Toast auto-dismiss too fast for errors — 3s auto-dismiss doesn't give enough time to read sync/import failure details; increase to 5–8s for error toasts, or make them persist until manually dismissed
- [x] Keyboard shortcut discoverability is poor — shortcuts only visible via a dedicated modal (`?`); add inline hint text on buttons and menu items (e.g. "Save ⌘↵") so users learn shortcuts in context

### UX

- [x] No onboarding or first-run experience — empty state shows "No tokens yet" with no guidance; add a first-run flow: "Import from Figma Variables" as primary CTA, "Start from template" using generator presets (Material, Tailwind), "Paste existing tokens" for migrations, and a brief walkthrough of the token → theme → publish workflow
- [x] Tab structure doesn't match user mental model — current Tokens/Inspect/Graph/Publish tabs split related concerns; restructure around workflow: Define (tokens + themes + generators), Apply (inspect + heatmap + binding), Ship (publish + export + git + validation readiness checklist), with Settings/Themes as secondary panels
- [x] Developer-facing copy leaks into designer UI — terms like "DTCG", "alias", "$extensions", "$value", "source/enabled" are implementation details; audit all user-facing labels (e.g. "Alias" → "Reference", "Source" → "Base layer", "Enabled" → "Override") and keep DTCG terms only in export/developer views

---

## Token Management

### Bugs

- [x] `alert()` used for error feedback in token move operations — jarring, unthemed, blocks the UI thread; replace with inline error state or toast matching the existing error banner pattern
- [x] Hardcoded Tailwind colors in TokenList (`text-orange-500`, `bg-orange-500`, `text-red-500`) and TokenTreeNode (`ring-red-500`) bypass the CSS variable system; replace with `var(--color-figma-warning)` / `var(--color-figma-error)` equivalents
- [~] Flat token map silently shadows tokens when two sets define the same path — `rebuildFlatTokens` last-write-wins; `getAllFlatTokens`, `resolveToken`, `getDependents`, and search only see one version, so delete-safety checks miss cross-set references
- [x] `inferType` heuristic misclassifies composite tokens — a composition with a `blur` key becomes shadow, `width`+`color` becomes border; confusing when `$type` is omitted

### QoL

- [x] Search qualifiers are undiscoverable — powerful query system (type:color, has:alias, value:#ff0000) has no autocomplete, cheat sheet, or inline hint; add a "?" icon showing available qualifiers or structured filter chips that generate the query (like GitHub issue filters)
- [x] No visual diff when editing token values — no "before → after" preview; show the current resolved value alongside the edit field, especially for complex types like typography and shadows
- [x] No hover preview on alias tokens — hovering `{color.primary}` in the token list doesn't show the resolved value; users must enter edit mode to see what an alias resolves to
- [x] No token count badge on set tabs — you have to open a set to discover how many tokens it contains; show a count in the tab label
- [x] Color swatches too small in token list — at 11px text, color preview dots are hard to distinguish between similar shades; increase swatch size or show hex on hover
- [~] No "Duplicate token" in context menu — creating a variant requires re-entering all values; add a Duplicate action that copies value/type/description with a `-copy` suffix
- [~] Search doesn't highlight matched substrings — filtering narrows the list but doesn't visually mark which part of the path or value matched, making it unclear why a result appeared
- [~] No breadcrumb trail for deep token trees — once expanded 4+ levels, users lose spatial context; show a sticky breadcrumb (e.g. `colors › brand › primary`) when scrolled deep into a group
- [ ] No drag-to-reorder tokens within the same group — tokens can be dragged between groups but sort order within a group is not user-controllable
- [ ] No bulk delete in multi-select mode — multi-select supports batch edit but not batch delete; removing a deprecated set of tokens requires deleting one at a time

### UX

- [ ] No visual token previews in the token list — rows show text-only value representations; add inline previews per type: color swatches, proportional bars for spacing, "Aa" samples for typography, shadow previews, border line segments — this is table-stakes (both Tokens Studio and Figma native do this)
- [ ] No "token in use" indicator in the token list — no visual signal for which tokens are bound to Figma layers; add a subtle usage dot or count on token rows so users can distinguish active tokens from orphans without visiting Analytics
- [ ] Set/file abstraction creates unnecessary cognitive load — users must understand sets (JSON files), folders, and theme activation before making design decisions; for simple use cases (< 200 tokens), auto-organize by type and hide the file abstraction, exposing sets as an advanced organizational tool
- [ ] No read-only token preview panel — selecting a token forces edit mode to inspect values, risking accidental changes; add a lightweight preview on single-click, reserve edit for double-click or explicit action
- [ ] No per-token usage/documentation view — no way to see where a specific token is used across the design file (which components, pages, layers) without running a full heatmap scan; add a "Used by" panel per token showing bound layers and dependent tokens in one place
- [ ] No token lifecycle states — all tokens are immediately live with no way to mark them as "draft", "published", or "deprecated"; for multi-team usage, add lifecycle badges and optionally hide deprecated tokens from bind pickers
- [ ] No spreadsheet/table view for tokens — the tree view is good for hierarchy but poor for scanning and bulk editing; add an alternative flat table view (like Tokens Studio) with sortable columns for Name, Type, Value, Resolved Value, Description, and inline cell editing for simple types — toggle between tree and table via a view switcher
- [ ] No inline editing in the token list — every edit requires opening the full TokenEditor panel; add dual-mode editing: single-click to preview, Enter/double-click for inline editing of simple values (color hex, dimension number, boolean toggle) directly in the tree row, Space or expand arrow to open the full editor for complex types (typography, shadow, composition)
- [ ] No interactive token dependency graph — the Graph tab shows generators but there's no way to visualize the alias/reference graph; add a "Token Flow" view (like Tokens Studio): select a token and see an interactive node graph showing what it references and what references it, with resolved values per theme option — clicking a node navigates to that token
- [ ] No token scoping to limit where tokens can be applied — any token can be bound to any property; add scoping (like Figma variable scoping) so color tokens only appear in fill/stroke pickers, spacing tokens only in padding/gap, etc. — reduces noise in bind pickers and prevents misuse
- [ ] No "create token from Figma selection" flow — users must manually read values from selected layers and re-enter them; add "Extract tokens from selection" that reads fill colors, font properties, dimensions, shadows, borders from selected layers and pre-populates a batch token creation form with suggested names based on the layer/component context
- [ ] No token pinning or favorites — frequently-used tokens (e.g. brand primary, base spacing) require searching or navigating every time; add a star/pin action on tokens with a "Pinned" section at the top of the token list or a quick-access palette (Cmd+P style) that prioritizes pinned tokens
- [ ] No smart token name suggestions — users must invent names from scratch; when creating a token, suggest names based on: the token type (color → "color/"), the value (blue hex → "blue"), sibling patterns in the same group (if siblings are 100/200/300, suggest the next scale step), and the Figma layer name if created from selection
- [ ] No token comparison mode — no way to compare two or more tokens side-by-side to check consistency; add a "Compare" action in multi-select: show selected tokens in a side-by-side panel with aligned properties, highlighting differences — useful for auditing scale consistency (e.g., are spacing-4 and spacing-6 actually 16px and 24px?)
- [ ] Batch token creation limited to JSON paste — PasteTokensModal only accepts DTCG JSON; add support for tabular input (CSV, TSV, or a spreadsheet-style grid) where each row is name/type/value, and for importing from CSS custom properties (`--color-primary: #ff0000`) and Tailwind config objects — lower the barrier for migrations from other systems
- [ ] No contextual token suggestions during property binding — when binding a token to a Figma property, the picker shows all tokens; rank and surface tokens most likely to match: same type as the property, tokens with similar resolved values, tokens frequently bound to the same property type, and tokens used on sibling layers in the same component

---

## Theme Management

### Bugs

- [ ] ThemeManager bulk set-status context menu has no ARIA `role="menu"` or `role="menuitem"` — screen readers won't announce it as a menu; add proper roles and focus management matching the TokenList context menu pattern
- [ ] No loading/saving indicator when toggling set state (Off/Base/On) — optimistic update fires but if the network is slow there's zero feedback that the save is in progress; add a subtle spinner or opacity change during the API call
- [ ] Theme cache returns mutable reference — `load()` returns the cache object directly; route handlers that mutate it (push, filter) change the cached copy in-place, so if `save()` throws the cache is left in an inconsistent state (mutated but not persisted)
- [ ] Theme option name trimmed inconsistently with lookup — `name.trim()` is used for storage but `findIndex` searches with the untrimmed name; `" light "` won't match existing `"light"`, creating duplicates

### QoL

- [ ] ThemeManager fetches all token sets on mount to compute coverage gaps — with many sets or large token files this creates a waterfall of requests and memory pressure; move coverage computation server-side or lazy-load per-option on expand
- [ ] ThemeManager calls full `fetchDimensions()` after every mutation (create, rename, delete, reorder, toggle) — redundant after the optimistic update already applied; only re-fetch on error rollback or debounce the re-fetch
- [ ] ThemeManager empty state could be more scannable — single paragraph at 10px explaining dimensions; break into structured examples with clickable quick-start dimension names (e.g. "Color Mode", "Brand", "Density")
- [ ] "Off / Base / On" theme set states are confusing — the three-state toggle (disabled/source/enabled) is cryptic; rename to "Not included" / "Foundation" / "Override", add inline help tooltip, and show a visual stack diagram explaining the layering model
- [ ] Theme Compare lacks actionable output — you can see diffs between theme options but can't fix gaps directly from the compare view; add inline "create missing token" and "edit value" actions so users don't have to navigate away

### UX

- [ ] Theme switcher is buried and hard to discover — dimension buttons only appear if themes exist, and ThemeManager is behind overflow menu; show an empty-state prompt on the Tokens tab: "Set up themes to manage light/dark mode, brands, and more" linking directly to ThemeManager
- [ ] ThemeManager is the most complex and least intuitive screen — the matrix of dimensions × options × sets × states doesn't help users build a mental model; redesign around a visual stacking model: dimensions as layers in a stack (top overrides bottom), options as tabs per layer, sets shown with "base" vs "override" clearly distinguished, plus a live preview showing "with these settings, token X resolves to Y"
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

- [x] TokenList has no "recently edited" or "recently created" view — after creating tokens across multiple groups, there's no way to see what you just touched without remembering paths; useful during long editing sessions
- [x] PasteTokensModal doesn't validate token path segments — pasted paths with spaces, special characters, or reserved `$` prefixes pass through parsing without error and fail silently on the server
- [x] No quickstart wizard that chains token generation → semantic mapping → theme setup — EmptyState offers these as separate actions; a guided flow ("Step 1: generate primitives, Step 2: create semantics, Step 3: set up themes") would reduce the learning curve for new users
- [x] Circular alias references are not prevented at token creation time — the server accepts `{a}` pointing to `{b}` pointing to `{a}`; only detected later by the resolver or lint rules, by which point the user may have built more tokens on top of the broken chain
- [x] No server-side token search endpoint — the client must fetch all tokens across all sets and filter in-memory; with 1000+ tokens across 10+ sets, initial load is slow and search can't leverage indexes

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
