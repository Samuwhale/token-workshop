# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: anything that makes this the best plugin — from atomic fixes to full overhauls. No users yet, no backwards compat needed. -->
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

### QoL

### UX

---

## Sync

### Bugs

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

### QoL

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### Bugs

### QoL

---

## Settings & Data Management

### Bugs

### QoL

- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).

### Accessibility

### Maintainability

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [~] **Token create form: type-specific value field placeholders and hints** — the value field shows no placeholder text that tells the user what format is expected for each type. Add contextual placeholder text per type (e.g., `#hex or oklch(...)` for color, `16px / 1rem` for dimension, `400 / bold` for fontWeight). This is especially valuable for users unfamiliar with DTCG value formats.

- [x] "Did you mean this token?" nudge: when a designer pastes/eyedrops a raw value that's within a small delta of an existing token, suggest the token inline — make the systemized path easier than the unsystemized path
- [x] Missing ASSET token type validation in core validator.ts — the `ASSET` type is defined in constants.ts but has no validation case in the validator's switch statement, so invalid ASSET token values pass validation silently
- [x] Unsafe `as unknown as { dir: string }` cast in server resolvers.ts line 44 — bypasses type safety to access the private `dir` property of `ResolverStore`; a public getter or constructor param would be safer and survive refactors
- [x] VersionHistoryPanel has no revert/restore actions — the panel shows commit diffs with added/modified/removed badges but is purely informational; add a "Restore this version" button per commit and a "Restore this token" action per changed token row, wiring into the existing operation-log rollback API
- [x] ImportPanel conflict resolution has no search or filter — when importing 50+ tokens with conflicts, users must scroll through every conflict row; add a search field and type/status filter (new/overwrite/skip) to the conflict list so users can quickly find and resolve specific conflicts
- [x] ExportPanel has no SCSS, LESS, or TypeScript export formats — only CSS, Dart, iOS Swift, Android, and JSON are supported; add SCSS variables (`$token-name`), LESS variables (`@token-name`), and TypeScript const exports (`export const tokenName = ...`) to cover common frontend toolchain needs
- [~] FontFamily value editor is a plain text input with no font discovery — users must type font names from memory; add a searchable dropdown populated from system/web fonts (or at minimum the fonts used in the current Figma file) with a live text preview rendered in each candidate font
- [x] Asset token editor has no file upload or preview — the AssetEditor is a bare URL input with no way to upload an image, preview the current URL, or validate that the URL resolves; add an image preview below the input and a drag-and-drop upload area that stores the asset (or encodes as data URI)
- [~] QuickStart wizard has no skip option for individual steps — experienced users who already have primitives must still click through the "Generate Primitives" step to reach theme setup; add a "Skip" button on each step and a step indicator that allows jumping to any step directly
- [~] Token binding in SelectionInspector has no undo — binding a token to a Figma property is immediate and irreversible (no undo toast appears), while "Clear all bindings" does support undo; add undo support for individual bind operations so users can experiment with token assignments safely
- [ ] CommandPalette token search mode has no "copy path" action — the token results show "Val" (copy value) and "CSS" (copy CSS variable) buttons but no way to copy the dot-notation token path itself (e.g. `colors.brand.500`); add a "Path" copy button since paths are needed for alias references and documentation
- [ ] ThemeManager dimension/option search — when a theme has many dimensions (e.g. brand × mode × density × viewport), there's no way to search or filter dimensions or their options; add a search/filter input at the top of the ThemeManager panel
- [ ] PublishPanel conflict resolution has no "Accept all" or bulk action — when syncing surfaces many conflicts, each row requires individual Push/Pull/Skip selection; add "Accept all as Push" / "Accept all as Pull" bulk actions similar to ImportPanel's "Accept all" / "Reject all" buttons
- [ ] `BatchEditor.tsx` renamePreview creates `new RegExp(findText)` inside `.filter()` on every element (~line 236) instead of reusing the already-memoized `parsedRegex` — wasteful for large token sets
- [ ] `useStyleSync.ts` pullRows `Promise.all` never checks `res.ok` on individual fetch responses (~line 152) — a 4xx/5xx from a single token PATCH silently succeeds, leaving the UI out of sync with the server
- [ ] `ThemeManager.tsx` set-fetch loop silently swallows all errors (~line 153) — if a set fails to load, coverage calculations are silently incomplete with no user feedback
- [ ] `ThemeCompare.tsx` and `ExportPanel.tsx` clipboard writes are fire-and-forget — `navigator.clipboard.writeText()` is not awaited and has no `.catch()`, so the "Copied!" feedback shows even if clipboard access is denied
- [ ] `fontLoading.ts` font cache is never invalidated — `cachedFonts` is set once on first call and never cleared, so fonts installed during a plugin session are invisible to weight resolution
- [ ] `useFindReplace.ts` bulk-rename fetch has no abort signal or timeout (~line 86) — a slow server response hangs the UI indefinitely with no way to cancel
- [ ] `useSetDuplicate.ts` silently returns on HTTP errors (~lines 32, 42) — if fetching the source set or creating the duplicate fails with 4xx/5xx, the user gets no error feedback and the operation appears to do nothing
- [ ] `TokenEditor.tsx` repeats identical `as any` cast for `baseValue` four times (~lines 882-893) — `extendsPath ? (allTokensFlat[extendsPath]?.$value as any) : undefined` should be extracted to a typed variable to remove the casts and the duplication
- [ ] `PublishPanel.tsx` retry loop catches all errors as timeout retries (~line 198-200) — non-timeout errors (e.g. malformed message, plugin crash) are silently retried instead of surfaced, masking real failures
- [ ] `git-sync.ts` conflict parser skips `>>>>>>>` marker with unchecked `i++` (~line 45) — if the closing marker is the last line in the file and is malformed or missing, the parser silently produces incomplete conflict data
- [ ] `useGeneratorDialog.ts` fetch for existing set tokens silently swallows errors (~line 247) — `.catch(() => {})` means generator sync proceeds with empty existing tokens, potentially overwriting real values
- [ ] `buildTsv` in `ThemeCompare.tsx` has `filteredDiffs` in its useCallback dependency array (~line 175) but never references it in the function body (the data comes via the `rows` parameter) — unnecessary re-creation on every filter change

- [ ] Rename conflict detection: warn when renaming a token that is referenced by aliases — show a list of dependent tokens and offer "Auto-update all aliases" so users don't silently break their token graph when refactoring paths
- [ ] Generator output overwrite warning: highlight tokens that will be overwritten (not newly created) in the generator preview with an "update" badge, so users can see they are about to replace hand-tuned values before confirming
- [ ] Git sync diff preview before push — add a "Preview changes" button that fetches the pending diff and shows before/after values per changed token without committing, so users can catch accidental deletions before they propagate to the repo
- [ ] Variable/style sync dry run — add a "Preview sync" button next to Apply in the variable and style sync sections of PublishPanel that shows adds/updates/deletes without writing to Figma, mirroring how git diff works
- [ ] SelectionInspector "apply to other layers" fast path — after binding a token to one property, show a toast with "Apply to N other selected layers with the same property" so users can bind the same token to a whole multi-selection in one click instead of repeating per layer
- [ ] SelectionInspector binding failure feedback — binding a token currently posts to the plugin sandbox with no response; add a round-trip confirmation so the inspector shows an inline error if the binding fails (invalid token type for the property, node locked, etc.)
- [ ] ThemeManager coverage gap "auto-fill from source" — the coverage view already highlights tokens missing in a theme option; add an "Auto-fill from source" action per uncovered token (and a "Fill all" bulk button) that copies the source-set value into the option as a new override token
- [ ] Analytics panel bulk "promote duplicates to alias" — when the duplicate-values view shows N tokens with the same raw value, add a "Promote to alias" button that creates a single canonical token and converts all duplicates to aliases pointing to it, reducing N tokens to 1+N aliases in one action
- [ ] Batch editor live regex match preview — when the batch rename pattern field contains a valid regex, show a live preview table of "original path → new path" for all matching tokens before the user clicks Apply, so accidental over-broad patterns are caught before they land
- [ ] Interactive generator preview — color ramp and type scale generators currently require changing numeric inputs and re-running to see adjustments; add a draggable curve handle (for color ramp lightness/chroma arc) and a live staircase handle (for type scale ratio) so visual tuning happens without multiple generate-and-inspect cycles
- [ ] ResolverPanel contextual help and starter templates — the empty state explains what resolvers are but offers no "Learn more" link, no example, and no "Create from template" action; add a light/dark-mode preset template and a short inline explanation of when to use resolvers vs. themes
- [ ] CommandPalette structured search qualifiers — token search in the command palette (prefixed with `>`) only does substring matching; bring over the `type:color`, `alias:{path}`, and `has:ref` qualifiers from TokenList search so power users get the same filter expressiveness in the palette
- [ ] 10 token types have no value editor — cubicBezier, transition, fontStyle, lineHeight, letterSpacing, percentage, link, textDecoration, textTransform, and custom all fall through silently in `TokenEditor.tsx`; users who create these token types see an empty editor with no way to set values through the UI
- [ ] TokenTableView has no virtual scrolling — unlike the tree view which uses virtualization, the table view renders all leaf tokens in the DOM at once; sets with 500+ tokens will cause visible lag and high memory usage
- [ ] Operation log (undo history) is in-memory only and lost on server restart — `OperationLog` stores entries in a plain array with `MAX_ENTRIES=50`; restarting the server wipes all undo history with no way to recover recent operations
- [ ] Composition token editor is a raw key-value text input with no structure — the CompositionEditor renders generic text fields for each property instead of type-aware sub-editors (color picker for fill, dimension stepper for padding, etc.); no validation that values match expected types, no preview of the composed result
- [ ] Color modifiers (lighten, darken, mix, alpha) only available in alias mode — ColorModifiersEditor is gated on `aliasMode && reference.startsWith('{')`, so users can't apply parametric adjustments to direct color values; this forces an awkward workflow of first creating a base token, then aliasing it, just to use modifiers
- [ ] ThemeManager allows concurrent mutations without debounce or disable — `handleSetState` and `handleBulkSetState` can be triggered multiple times in rapid succession while previous requests are in-flight; optimistic UI updates interleave with server responses, potentially leaving the UI in an inconsistent state
- [ ] Multiple hooks use `Promise.all()` for batch server writes with no partial-failure handling — `useSetMergeSplit` (merge), `useStyleSync` (apply diff), and `useVariableSync` (apply diff) all reject on first failure, leaving tokens partially written with no rollback and no indication of which items succeeded
- [ ] Git sync diff silently returns empty on error — `git-sync.ts` lines 326-329 use `.catch(() => '')` for both local and remote diff commands; if the remote is unreachable or the ref is invalid, the caller sees "no changes" instead of an error, giving false confidence before a push
- [ ] No inline quick-edit for simple token values — every edit requires opening the full TokenEditor panel (3+ clicks: click row → edit field → save); double-click on a token value in the tree view should open an inline input for rapid tweaks to colors, dimensions, and strings without leaving context
- [ ] Theme coverage computation runs uncached O(dimensions × options × tokens × ref_depth) on every GET — `themes.ts` lines 302-371 recomputes coverage from scratch on each request with no caching layer; large theme matrices with hundreds of tokens will produce noticeable latency on every ThemeManager panel open

- [ ] `UNIT_CONVERSIONS` percentage conversions are identity functions in `ValueEditors.tsx` — converting between `%` and `px`/`rem`/`em` uses `v => v` (lines 238-243), meaning 50% → 50px; these need proper context-aware conversion or should be disabled/warned since percentage conversion requires a reference value
- [ ] `runContrastCheckGenerator` in `generator-engine.ts` never validates `bgLum` — `wcagLuminance(backgroundHex)` at line 470 can return `null` for invalid hex, but unlike `runAccessibleColorPairGenerator` (which throws), this generator silently produces `ratio ?? 1` (line 487), giving misleading contrast values of "1" instead of surfacing the invalid background
- [ ] `eval-expr.ts` substitutes `0` for variables with `undefined` values — line 119 uses `vars[match] ?? 0`, so if a generator formula references a variable whose runtime value is `undefined` (e.g. a missing step property), the formula silently evaluates with 0 instead of throwing, producing incorrect token values with no warning
- [ ] `token-tree-utils.ts` uses `any` for all tree traversal parameters — every function (`walkAliasValues`, `walkLeafTokens`, `collectGroupLeafTokens`, `getObjectAtPath`, `setGroupAtPath`, etc.) uses `any` instead of `TokenGroup` or generic types, defeating TypeScript's ability to catch misuse across the server
- [ ] `renameSet` in `token-store.ts` leaks write guards on themes update failure — if the outer catch at line 609 re-throws (themes read succeeded but mutation/other step failed), write guards started at lines 578-579 are never cleaned up; they'll suppress watcher events for up to 30 seconds, hiding any concurrent file changes to the renamed paths
- [ ] `runValidate` in `AnalyticsPanel.tsx` silently ignores non-ok HTTP responses — line 116 checks `if (res.ok)` but does nothing on failure; the finally block sets loading to false and the user sees no error message, no stale results cleared, just a completed-but-empty validation run
- [ ] `handleDelete` in `ResolverPanel.tsx` swallows all errors silently — the catch block at line 102-104 does nothing (comment says "Error handled by hook" but the hook's error state isn't surfaced), so a failed delete closes the confirmation modal with no feedback to the user
- [ ] `HeatmapPanel.tsx` export functions revoke blob URL before download may complete — `exportCSV` and `exportJSON` (lines 124-148) call `URL.revokeObjectURL(url)` synchronously after `a.click()`, but some browsers process the click asynchronously; the download may receive a revoked URL; should revoke after a short delay or use the `download` event
- [ ] `VersionHistoryPanel.tsx` renders `detail.changes` without validating the response shape — the detail view (line ~255+) assumes `detail.changes` is a valid array after fetching; if the server returns malformed JSON or the endpoint changes, the component will crash instead of showing an error state
- [ ] `generator-routes.ts` uses `as unknown as GeneratorConfig` casts extensively (lines ~50-115) instead of proper runtime validation — invalid generator configs from client requests bypass TypeScript and get persisted to disk, potentially producing corrupt generator files that crash on next load
- [ ] `selectionHandling.ts` uses `as any` to access Figma typography value properties — lines 485-493 cast `lineHeight` and `fontSize` to `any` to read `.unit` and `.value` instead of using Figma's typed `LetterSpacing`/`LineHeight` interfaces, masking potential type mismatches if the Figma API changes
- [ ] TokenTableView description edit silently discarded — `commitEdit` at TokenTableView.tsx:132 passes `node.$value` (the existing token value) instead of the edited description text `raw`, making all table-view description edits no-ops that send the old value back to the server
- [ ] Plugin controller.ts ~15 async message handlers lack try-catch — handlers for `apply-to-selection`, `get-selection`, `remove-binding`, `scan-token-usage`, and ~11 others are bare `await` calls with no error handling; if the async function throws, the plugin crashes silently and the UI hangs indefinitely waiting for a response that never comes
- [ ] variableSync.ts rollback only restores values, not names or scopes — the snapshot at line 56 captures only `valuesByMode`, so on failure the rollback restores variable values but leaves mutated names (if renamed) and scope overrides (line 81) in their post-mutation state, creating an inconsistent Figma file
- [ ] useFigmaSync `handleSyncGroupStyles` omits `setName` from token payload (line 70) — `handleSyncGroup` (line 51) includes `setName` for collection routing but the styles equivalent doesn't, so `applyStyles` can't route tokens to the correct style namespace in multi-set projects
- [ ] Duplicate color-distance math in server lint.ts (lines 106-134) vs `@tokenmanager/core` — `hexToRgb`, `rgbToLab`, and `colorDeltaE` are reimplemented locally when `hexToLab` is already exported from core; consolidating prevents divergence and removes ~30 lines of redundant code
