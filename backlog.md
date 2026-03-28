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

- [~] Color modifiers (lighten, darken, mix, alpha) only available in alias mode — ColorModifiersEditor is gated on `aliasMode && reference.startsWith('{')`, so users can't apply parametric adjustments to direct color values; this forces an awkward workflow of first creating a base token, then aliasing it, just to use modifiers
- [~] No inline quick-edit for simple token values — every edit requires opening the full TokenEditor panel (3+ clicks: click row → edit field → save); double-click on a token value in the tree view should open an inline input for rapid tweaks to colors, dimensions, and strings without leaving context
- [~] Theme coverage computation runs uncached O(dimensions × options × tokens × ref_depth) on every GET — `themes.ts` lines 302-371 recomputes coverage from scratch on each request with no caching layer; large theme matrices with hundreds of tokens will produce noticeable latency on every ThemeManager panel open

- [~] `UNIT_CONVERSIONS` percentage conversions are identity functions in `ValueEditors.tsx` — converting between `%` and `px`/`rem`/`em` uses `v => v` (lines 238-243), meaning 50% → 50px; these need proper context-aware conversion or should be disabled/warned since percentage conversion requires a reference value
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

- [ ] `styleSync.ts` re-fetches ALL Figma styles from scratch for every single token — `applyPaintStyle`, `applyGradientPaintStyle`, `applyTextStyle`, and `applyEffectStyle` each call `figma.getLocalPaintStylesAsync()` / `figma.getLocalTextStylesAsync()` / `figma.getLocalEffectStylesAsync()` per token; for 100 tokens this means 100 async round-trips to the Figma API instead of caching the style lists once upfront; additionally, the entire file uses `any` for all token parameters (lines 4, 33, 47, 73, 107, 119) defeating type checking on this critical mutation path (`packages/figma-plugin/src/plugin/styleSync.ts`)
- [ ] App.tsx keyboard shortcuts effect (line 633) has empty `[]` dependency array, creating stale closures over `navigateTo`, `setTriggerCreateToken`, and `setShowQuickApply` — shortcuts like Cmd+T (navigate + create token) and Cmd+1/2/3 (tab switch) use the initial-render `navigateTo` function which captures stale `activeTopTab`/`activeSubTab` state; should use a stable callback ref pattern (`packages/figma-plugin/src/ui/App.tsx` ~L632-666)
- [ ] App.tsx `useEffect` dependency `tokens.length > 0` (line 608) is a boolean expression, not a reactive value — the scan-token-usage message is only sent when the boolean flips from `false` to `true` (0→N tokens), but never re-fires when tokens are added/removed after the initial load (e.g. 5→10 tokens); should use `tokens.length` directly so usage counts refresh when the token set changes (`packages/figma-plugin/src/ui/App.tsx` ~L604-608)
- [ ] TokenTableView description edit is a no-op — `commitEdit` (line 132) passes `node.$value` (the unchanged token value) instead of `editValue` (the user's edited description text) to `onInlineSave`, so all description edits in the table view are silently discarded; the code even has a comment acknowledging the intent but the implementation doesn't follow through (`packages/figma-plugin/src/ui/components/TokenTableView.tsx` ~L125-133)
- [ ] Server-side JSON files loaded without runtime validation — `resolver-store.ts` `loadFile` (line 249) casts `JSON.parse(content) as ResolverFile` with no shape validation, and `generator-routes.ts` uses `as unknown as GeneratorConfig` casts extensively (lines ~50-115) instead of runtime validation; invalid data from hand-edited or corrupted files silently enters the system and causes crashes later during resolution/execution; both should use a validation function (like `validateTokenBody` in tokens.ts) before accepting parsed JSON (`packages/server/src/services/resolver-store.ts` ~L244, `packages/server/src/routes/generators.ts`)
- [ ] Generator `runForSourceToken` silently skips generators that are already running (line 356 `if (this.runningGenerators.has(genId)) continue`) — when rapid token edits trigger overlapping calls, the second invocation sees the generator as "running" and skips it entirely without queuing a re-run; the skipped generator never processes the latest token value, leaving stale generated tokens; needs a "dirty" flag or re-run queue so that when a generator finishes, it checks if it was requested again during execution (`packages/server/src/services/generator-service.ts` ~L354-356)

- [ ] **Bug**: `Cannot access 'fetchConflicts' before initialization` — TDZ error, likely a circular dependency or hoisted reference before declaration
- [ ] **Bug**: `Cannot access 'flattenTokens' before initialization` — TDZ error, likely a circular dependency or hoisted reference before declaration
