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

- [x] `git-sync.ts` conflict parser skips `>>>>>>>` marker with unchecked `i++` (~line 45) — if the closing marker is the last line in the file and is malformed or missing, the parser silently produces incomplete conflict data

- [x] Rename conflict detection: warn when renaming a token that is referenced by aliases — show a list of dependent tokens and offer "Auto-update all aliases" so users don't silently break their token graph when refactoring paths
- [~] Generator output overwrite warning: highlight tokens that will be overwritten (not newly created) in the generator preview with an "update" badge, so users can see they are about to replace hand-tuned values before confirming
- [x] Git sync diff preview before push — add a "Preview changes" button that fetches the pending diff and shows before/after values per changed token without committing, so users can catch accidental deletions before they propagate to the repo
- [x] [HIGH] `controller.ts` `searchLayers` is called at line 121 but never imported — the function is exported from `selectionHandling.ts` but missing from the import list at line 7; this causes a ReferenceError crash whenever a user triggers layer search from the UI, silently killing the plugin message handler
- [x] [HIGH] `useGitSync.ts` TDZ crash — `fetchConflicts` (declared at line 95) is referenced in the `useEffect` dependency array at line 87 and called at line 85, both before its `const` declaration; this is a Temporal Dead Zone violation that crashes the component on mount, breaking the entire Git sync panel
- [x] Variable/style sync dry run — add a "Preview sync" button next to Apply in the variable and style sync sections of PublishPanel that shows adds/updates/deletes without writing to Figma, mirroring how git diff works
- [~] SelectionInspector "apply to other layers" fast path — after binding a token to one property, show a toast with "Apply to N other selected layers with the same property" so users can bind the same token to a whole multi-selection in one click instead of repeating per layer
- [x] SelectionInspector binding failure feedback — binding a token currently posts to the plugin sandbox with no response; add a round-trip confirmation so the inspector shows an inline error if the binding fails (invalid token type for the property, node locked, etc.)
- [~] ThemeManager coverage gap "auto-fill from source" — the coverage view already highlights tokens missing in a theme option; add an "Auto-fill from source" action per uncovered token (and a "Fill all" bulk button) that copies the source-set value into the option as a new override token
- [~] Analytics panel bulk "promote duplicates to alias" — when the duplicate-values view shows N tokens with the same raw value, add a "Promote to alias" button that creates a single canonical token and converts all duplicates to aliases pointing to it, reducing N tokens to 1+N aliases in one action
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

- [ ] `useTableCreate.handleCreateAll` partial batch creation leaves tokens without undo — when a mid-batch row fails (e.g., 3rd of 5 rows returns 4xx), the already-created rows are never added to the undo slot since the function returns early before the `onPushUndo` call at the end; users cannot undo the partially-created tokens (`packages/figma-plugin/src/ui/hooks/useTableCreate.ts` ~L130)
- [ ] `ThemeValuesSection.handleSave` in `TokenEditor.tsx` has no `.ok` check and no catch block — the inline theme-value PATCH request (~L210) awaits `fetch()` but never checks `res.ok` and has no `catch`; HTTP errors (4xx/5xx, network failures) are silently swallowed and the edit state is cleared as if the save succeeded, with no feedback to the user
- [ ] `useSetDelete.handleDeleteSet` swallows server errors silently — the `catch` block (~L46) handles `TypeError` for network errors but does nothing with `ApiError` thrown by `apiFetch` on non-2xx responses (e.g., 409 when the set is blocked by a generator); the confirmation dialog is dismissed with no error message, leaving the user unaware the delete was rejected
- [ ] `useFindReplace.handleFindReplace` calls `res.json()` before `res.ok` check (~L85) — if the server returns a non-JSON error body on failure, the `res.json()` call throws and the `catch` block reports a generic network error instead of the actual server error message; should call `res.json().catch(()=>({}))` defensively before checking `res.ok`
- [ ] `consistencyScanner.ts` re-duplicates `hexToRgb` color conversion already in `plugin/colorUtils.ts` — the scanner defines its own `hexToRgb255` (line ~38) alongside a `colorDist` function; `colorUtils.ts` already has `rgbToHex` and related helpers; the scanner only imports `rgbToHex` and `parseDimValue` from colorUtils but not the inverse, causing a third independent hex-parsing implementation across the plugin sandbox (`packages/figma-plugin/src/plugin/consistencyScanner.ts` ~L38, compare to `packages/figma-plugin/src/plugin/colorUtils.ts`)
- [ ] `controller.ts` has ~20 async message handlers without try-catch (lines 19, 54, 57, 60, 64, 67, 70, 73, 76, 79, 88, 91, 94, 97, 102, 106, 109, 112, 115, 124, 133, 140) — only 3 handlers (`apply-styles`, `read-variables`, `read-styles`) have error handling; when any unprotected handler throws, the UI hangs indefinitely waiting for a response that never arrives; wrap all async cases in try-catch with a generic error postMessage back to UI
- [ ] Color math duplicated across 4 locations — `hexToRgb`/`rgbToLab`/`colorDeltaE`/`toLinear`/`fromLinear` are independently reimplemented in `@tokenmanager/core` (`color-math.ts` + `color-parse.ts` both define `toLinear`/`fromLinear`), `server/lint.ts` (lines 106-134), `ui/shared/colorUtils.ts` (lines 27-134, 295-300), and `plugin/consistencyScanner.ts` (lines 35-55); consolidate into `@tokenmanager/core` exports and use a single shared implementation — the server and scanner can import from core directly, and `colorUtils.ts` should delegate to core instead of reimplementing
- [ ] `fetchAllTokensFlat` and `fetchAllTokensFlatWithSets` in `useTokens.ts` silently drop individual set-fetch failures — `Promise.all` map returns `null` on error (lines 137, 167) with no notification to the caller; unlike `refreshTokens` which calls `onNetworkError`, these functions silently return incomplete data used by variable sync, style sync, and the main App refresh; callers have no way to know that some sets failed to load
- [ ] Generator auto-run from `tokenStore.onChange` (index.ts:70-79) has no concurrency guard — `runForSourceToken` is fire-and-forget with only `.catch()`, so rapid token edits can trigger multiple overlapping generator executions writing to the same target set simultaneously; `beginBatch`/`endBatch` in `executeGeneratorMultiBrand` (generator-service.ts:534) only serializes within a single run, not across concurrent runs; needs a per-generator mutex or queue
