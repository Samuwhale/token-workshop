# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by backlog.sh each iteration -->

---

## App Shell & Navigation

### Bugs

- [x] [HIGH] No aria-live regions for toast notifications — SuccessToast, UndoToast, and error toasts appear visually but are not announced to screen readers; adding `aria-live="polite"` or `role="status"` to toast containers would make the plugin accessible

### QoL

- [~] Client URL encoding inconsistency — many handlers still use raw `${setName}/${tokenPath}` (no encodeURIComponent) for DELETE and other requests; if set names can contain `/`, these URLs would be misparsed

### UX

- [~] CommandPalette: No "Copy token value" action for token search results — the token search mode (">") offers "Go to token" and "Copy CSS var" but not "Copy raw value", which is the most common reason to search for a token

---

## Token Management

### Bugs

- [x] [HIGH] TokenResolver `dfsStack` is not cleaned up on error — if `dfsResolve` throws, `this.dfsStack.pop()` is never reached, leaving stale entries that corrupt cycle detection in subsequent `resolve()` calls within the same resolver instance
- [~] `updateAliasRefs` does not handle formula strings — the alias-reference updater only checks for exact `{oldPath}` and prefix `{oldPath.` patterns, but formula strings like `"{spacing.base} * 2"` contain embedded refs that won't be matched, so renaming a group used in formulas leaves broken references
- [ ] `resolveAllAliases` in the plugin does not recurse into composite token sub-properties — composite tokens (typography, shadow, border) with individually aliased sub-properties (e.g. `fontSize: "{type.base}"`) are not resolved, so the theme preview shows raw `{ref}` strings instead of values

### QoL

- [ ] TokenList: Multi-select mode has no keyboard shortcut to enter/exit — the select mode toggle is a small icon button (M) mentioned in the tooltip but not documented in KeyboardShortcutsModal, and there is no Escape-to-exit-select-mode handler
- [ ] BatchEditor: No confirmation before bulk type change — changing the type of many tokens at once can break alias references and downstream consumers, but the batch editor applies it immediately with no warning or preview of affected tokens

### UX

---

## Theme Management

### Bugs

- [ ] `themedAllTokensFlat` drops tokens outside themed sets — `useThemeSwitcher` builds `merged` from only the sets referenced by active theme options; tokens in sets not assigned to any dimension are silently excluded from the themed view, rather than being included as a base layer

### QoL

- [ ] ThemeManager: No rename option for theme options — dimensions can be renamed but individual options (e.g. "Light", "Dark") cannot be renamed once created; users must delete and recreate them, losing all set assignments
- [ ] ThemeManager: No search or filter for sets within a theme option — when a project has 10+ sets, the set matrix in each theme option becomes a long unfiltered list with no way to find a specific set quickly

### UX

- [ ] ThemeCompare: No search or path filter — the diff view shows all differing tokens but provides no text search to find a specific token path, making it hard to locate a particular difference in large theme comparisons
- [ ] ThemeCompare: No export or copy of diff results — users can see which tokens differ between two theme options but cannot copy or export the comparison, making it hard to share with teammates or create tickets from it

---

## Sync

### Bugs

- [ ] `deleteOrphanVariables` only checks the default "TokenManager" collection — tokens synced to custom collection names (via `collectionMap`) will never be identified as orphans and can't be cleaned up
- [ ] `applyTextStyle` does not call `loadFontAsync` before setting font properties — Figma will throw if the font is not already loaded; the `applyTokenValue` path correctly loads fonts, but the style-creation path does not
- [ ] Git sync `commit` always stages all files with `git add .` — stages ALL untracked/modified files in the token directory (including non-token files) even when the user only changed a single token; no way to commit selectively

### QoL

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

---

## Import

### Bugs

- [x] [HIGH] ImportPanel: Handler for `styles-read` message does not clear `pendingSourceRef` before processing — if the Figma plugin sends multiple `styles-read` responses (e.g. due to a race condition), the second response will be ignored
- [ ] ImportPanel: `conflictPaths` state is not cleared when changing the target set — old conflict list persists with the new set
- [ ] ImportPanel: `readTimeoutRef` is not cleared in cleanup when component unmounts — timer continues running in the background
- [ ] ImportPanel: Styles read timeout does not have a `startReadTimeout()` call — variables read has a 15-second timeout but styles read does not, so if Figma hangs, the UI never recovers
- [ ] ImportPanel: Figma Styles and JSON readers normalize paths identically — if a variable and style share a name like `color/primary`, they map to the same `color.primary` token path, creating silent conflicts

### QoL

- [ ] ImportPanel: 15-second timeout for reading Figma variables is too strict — for large files with 200+ variables on slower systems, extend to 30-45 seconds or make configurable
- [ ] ImportPanel: No validation that new set names don't conflict with existing sets — user can type an existing set name with no warning about override behavior

### UX

- [ ] ImportPanel: No visual distinction between disabled and enabled modes — checkboxes and text both fade to 40% opacity, making it hard to scan which modes are active

---

## Token Generation & Graph Editor

### Bugs

- [ ] useGenerators GeneratorType union is missing server-supported types — the UI hook defines `GeneratorType` with only 8 types (missing `accessibleColorPair`, `darkModeInversion`, `responsiveScale`), so `computeDerivedPaths` silently returns empty arrays for those generators

### UX

---

## Token Editor

### QoL

- [x] No Cmd+S / Ctrl+S to save — the editor requires clicking the save button; a keyboard shortcut is the most basic expectation
- [x] No conflict detection for concurrent edits — if a token is modified on the server while the editor is open, saving silently overwrites the server version
- [x] Circular-reference error doesn't identify the cycle — the error says "circular reference detected" but doesn't name which tokens form the loop
- [x] Type change has no impact warning — changing a token's type could break downstream references but the confirmation doesn't indicate how many dependents will be affected
- [ ] No keyboard shortcut to toggle alias mode — switching between direct value and alias reference requires clicking the toggle button; a shortcut (e.g. Cmd+L) would speed up the most common editor workflow

---

## Settings & Data Management

### QoL

- [x] DELETE /data endpoint has no server-side confirmation gate — a single accidental API call permanently deletes all token sets and themes
- [x] SyncPanel.tsx is dead code (1167 lines) — exported but never imported; appears superseded by PublishPanel; should be removed
- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

- [ ] ExportPanel: No loading indicator during platform export — the `handleExport` call sets `exporting` state but the UI does not show a spinner or progress message while waiting for the server response

---

## Code Quality

### Redundancy & Duplication

- [x] Identical fetch-and-error pattern duplicated across 10+ call sites — the `fetch → check res.ok → catch → show error` sequence is copy-pasted; extract a shared `apiFetch` utility
- [x] `err instanceof Error ? err.message : 'An unexpected error occurred'` repeated 20+ times — extract to a `getErrorMessage(err)` helper
- [ ] ExportPanel: Duplicate PLATFORMS constant — the same `PLATFORMS` array is defined identically in both `ExportPanel.tsx` and `PublishPanel.tsx`; should be extracted to a shared constant to avoid drift

### Performance

- [x] Generator auto-run errors (triggered on token updates via SSE) are swallowed with `console.warn` — users have no way to discover why a generator didn't re-execute after editing a source token
- [x] `flattenLeafNodes` recomputed multiple times per render without memoization — recursive O(n) walk called at 4+ sites in TokenList on every render cycle
- [x] Duplicate-value detection rebuilds via JSON.stringify on every token change — O(n²) with no debounce; significant for sets above ~5 k tokens
- [ ] Theme dimensions store reads `$themes.json` from disk on every GET request — `createDimensionsStore` has no in-memory cache; each `load()` call re-reads and re-parses the file

### Correctness & Safety

- [x] DELETE /api/sets/:name does not check if generators reference this set as `targetSet` before allowing deletion — leaves orphaned generators that error on next run
- [x] Token rename operations don't update theme dimension sets that reference the old token path — can silently break theme configurations
- [x] ValuePreview renders an empty 5×5 div for unresolved aliases instead of a warning icon or placeholder — users don't know the token failed to resolve
- [x] ValuePreview shadow preview only renders a single shadow even if the token value is an array — multi-shadow tokens are visually misrepresented
- [x] PreviewPanel color palette skips alias tokens entirely — only raw hex values are shown, so derived/aliased colors are invisible in the palette view

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [x] [HIGH] Build-time "Cannot access 'X' before initialization" TDZ errors — minifier can hoist declarations into a temporal dead zone when circular imports or re-export patterns exist; audit circular dependencies with `madge --circular` and break cycles
- [ ] Export route merges all sets into one namespace with silent overwrites — `deepMergeInto` merges all requested sets into a single flat object, so if two sets define the same token path, the second silently overwrites the first with no warning

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [ ] No token search highlighting — filtering tokens by name narrows the list but doesn't highlight the matching substring in results, making it hard to spot the exact match in large sets
- [ ] No "duplicate token" or "create sibling" action — creating a variant of an existing token requires manually entering the full path from scratch instead of forking from the current token
- [ ] Batch editor find-and-replace has no regex support — only literal string matching is available, so common refactors like renaming `spacing.*` to `dimension.*` require manual work per token
- [ ] Batch editor operations show no preview of affected tokens — scaling dimensions, changing types, or find-replacing paths execute immediately with no "these N tokens will change from X to Y" dry-run
- [ ] Token delete does not warn about dependent tokens — deleting a token that other tokens alias silently breaks downstream references; the server should block or warn like it does for set deletion
- [ ] No color contrast checker in ColorPicker — editing a color token has no inline WCAG AA/AAA pass/fail indicator against common backgrounds, forcing users to check contrast separately
- [ ] No color harmony suggestions in ColorPicker — no complementary, triadic, or analogous color suggestions when editing a color token, making systematic palette design harder
- [ ] CommandPalette token search capped at 100 results with no pagination — users with 500+ tokens can't find matches beyond the cap, and there's no indication results were truncated
- [ ] CommandPalette token results don't show which set a token belongs to — when the same path exists in multiple sets, users can't distinguish between them in search results
- [ ] ThemeManager has no search/filter for token sets — configuring dimension options with 50+ sets requires scrolling through the entire list with no way to filter by name
- [ ] No "expand all / collapse all" keyboard shortcut in token tree — users manually expanding/collapsing hundreds of nested groups have no fast path; only individual toggle is available
- [ ] ExportPanel has no output preview — exporting to CSS/Dart/Swift generates a zip but users can't preview the actual generated code before downloading
- [ ] No custom export path or selector template — all CSS exports use `:root` selector with no option for scoped output like `.light { --color: ... }` or custom folder structures
- [ ] HeatmapPanel has no export or reporting — users can't export binding coverage as CSV/JSON or share a "200/1000 layers bound (20%)" summary with stakeholders
- [ ] HeatmapPanel "select all red" action has no follow-up workflow — selecting unbound layers has no batch "bind all to token X" or "create tokens for these" next step
