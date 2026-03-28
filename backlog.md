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

- [x] [HIGH] Token mutation routes lack concurrency protection — all 15+ mutating endpoints in tokens.ts and all 6 in sets.ts read-modify-write token files without any locking, while themes.ts correctly uses a promise-chain mutex (`withLock`); concurrent requests (e.g. batch upsert during a generator run, or two browser tabs) can interleave and silently lose writes
- [x] Color math duplicated across 4 locations — `hexToRgb`/`rgbToLab`/`colorDeltaE`/`toLinear`/`fromLinear` are independently reimplemented in `@tokenmanager/core` (`color-math.ts` + `color-parse.ts` both define `toLinear`/`fromLinear`), `server/lint.ts` (lines 106-134), `ui/shared/colorUtils.ts` (lines 27-134, 295-300), and `plugin/consistencyScanner.ts` (lines 35-55); consolidate into `@tokenmanager/core` exports and use a single shared implementation — the server and scanner can import from core directly, and `colorUtils.ts` should delegate to core instead of reimplementing
- [x] Generator auto-run from `tokenStore.onChange` (index.ts:70-79) has no concurrency guard — `runForSourceToken` is fire-and-forget with only `.catch()`, so rapid token edits can trigger multiple overlapping generator executions writing to the same target set simultaneously; `beginBatch`/`endBatch` in `executeGeneratorMultiBrand` (generator-service.ts:534) only serializes within a single run, not across concurrent runs; needs a per-generator mutex or queue

- [x] `styleSync.ts` re-fetches ALL Figma styles from scratch for every single token — `applyPaintStyle`, `applyGradientPaintStyle`, `applyTextStyle`, and `applyEffectStyle` each call `figma.getLocalPaintStylesAsync()` / `figma.getLocalTextStylesAsync()` / `figma.getLocalEffectStylesAsync()` per token; for 100 tokens this means 100 async round-trips to the Figma API instead of caching the style lists once upfront; additionally, the entire file uses `any` for all token parameters (lines 4, 33, 47, 73, 107, 119) defeating type checking on this critical mutation path (`packages/figma-plugin/src/plugin/styleSync.ts`)
- [x] App.tsx keyboard shortcuts effect (line 633) has empty `[]` dependency array, creating stale closures over `navigateTo`, `setTriggerCreateToken`, and `setShowQuickApply` — shortcuts like Cmd+T (navigate + create token) and Cmd+1/2/3 (tab switch) use the initial-render `navigateTo` function which captures stale `activeTopTab`/`activeSubTab` state; should use a stable callback ref pattern (`packages/figma-plugin/src/ui/App.tsx` ~L632-666)
- [x] App.tsx `useEffect` dependency `tokens.length > 0` (line 608) is a boolean expression, not a reactive value — the scan-token-usage message is only sent when the boolean flips from `false` to `true` (0→N tokens), but never re-fires when tokens are added/removed after the initial load (e.g. 5→10 tokens); should use `tokens.length` directly so usage counts refresh when the token set changes (`packages/figma-plugin/src/ui/App.tsx` ~L604-608)
- [x] TokenTableView description edit is a no-op — `commitEdit` (line 132) passes `node.$value` (the unchanged token value) instead of `editValue` (the user's edited description text) to `onInlineSave`, so all description edits in the table view are silently discarded; the code even has a comment acknowledging the intent but the implementation doesn't follow through (`packages/figma-plugin/src/ui/components/TokenTableView.tsx` ~L125-133)
- [x] Server-side JSON files loaded without runtime validation — `resolver-store.ts` `loadFile` (line 249) casts `JSON.parse(content) as ResolverFile` with no shape validation, and `generator-routes.ts` uses `as unknown as GeneratorConfig` casts extensively (lines ~50-115) instead of runtime validation; invalid data from hand-edited or corrupted files silently enters the system and causes crashes later during resolution/execution; both should use a validation function (like `validateTokenBody` in tokens.ts) before accepting parsed JSON (`packages/server/src/services/resolver-store.ts` ~L244, `packages/server/src/routes/generators.ts`)
- [x] Generator `runForSourceToken` silently skips generators that are already running (line 356 `if (this.runningGenerators.has(genId)) continue`) — when rapid token edits trigger overlapping calls, the second invocation sees the generator as "running" and skips it entirely without queuing a re-run; the skipped generator never processes the latest token value, leaving stale generated tokens; needs a "dirty" flag or re-run queue so that when a generator finishes, it checks if it was requested again during execution (`packages/server/src/services/generator-service.ts` ~L354-356)

- [x] **Bug**: `Cannot access 'fetchConflicts' before initialization` — TDZ error, likely a circular dependency or hoisted reference before declaration
- [x] **Bug**: `Cannot access 'flattenTokens' before initialization` — TDZ error, likely a circular dependency or hoisted reference before declaration
- [x] styleSync.ts re-fetches entire Figma style list for every token — `applyPaintStyle`, `applyTextStyle`, `applyEffectStyle`, and `applyGradientPaintStyle` each call `figma.getLocalPaintStylesAsync()` / `getLocalTextStylesAsync()` / `getLocalEffectStylesAsync()` at the top of every invocation; for a 100-token batch this means 100 round-trips instead of 1 — fetch once in `applyStyles` and pass as a parameter (`styleSync.ts` ~L34–108)
- [x] useStyleSync.ts race condition: single resolve ref instead of correlation map — `styleReadResolveRef` is overwritten on concurrent `computeStyleDiff` calls, so the earlier call's promise resolves with the later call's data; `useVariableSync` already uses a `Map<correlationId, resolver>` — adopt the same pattern (`useStyleSync.ts` ~L46,96)
- [x] useUndo.ts failed undo permanently loses the undo slot — `setPast(next)` removes the slot from the stack before `slot.restore()` is awaited; if the restore fails (network error, server 500), the slot is gone and the user can never retry — move the stack update to after a successful restore (`useUndo.ts` ~L39–48)
- [~] Fragile network-error detection breaks disconnect banner on Firefox — `useSetDelete`, `useSetRename`, and several other hooks detect disconnects via `err instanceof TypeError || err.message.includes('Failed to fetch')`; `'Failed to fetch'` is Chrome-only — Firefox emits `'NetworkError when attempting to fetch resource'` — `useTokens.ts:98` already has the correct multi-string check but the hooks don't follow it, so `markDisconnected` never fires on Firefox (`useSetDelete.ts` ~L51, `useSetRename.ts` ~L68)
- [~] HTTP error responses silently treated as success in multiple mutation paths — `ThemeValuesSection.handleSave` in `TokenEditor.tsx` clears edit state and calls `onRefresh` even on 4xx/5xx; `handleApplyGroupScopes` in `useFigmaSync.ts` discards all response objects in `Promise.all` batch without `.ok` checks; `useSetDelete.ts` only catches `TypeError`, not `ApiError` on server-side rejections — all three need `res.ok` guards and visible error feedback (`TokenEditor.tsx` ~L214, `useFigmaSync.ts` ~L129, `useSetDelete.ts` ~L50)

- [~] `ThemeManager.tsx` mutation chain silently swallows task errors — `mutationChainRef.current = next.catch(() => {})` at lines 752 and 795 discards all errors from `handleSetState` and `handleBulkSetState` tasks; when a queued mutation fails (network error, server 500), the error disappears and subsequent tasks continue executing against potentially inconsistent state; the `task` functions do have internal try-catch that calls `setError()`, but if `setError` itself throws or the try-catch misses an edge case, the chain eats it; additionally `fetchDimensions` (line 122) has no AbortController, so rapid serverUrl changes or component remounts fire concurrent fetches that race to call `setDimensions`
- [~] `useDragDrop.ts` multi-token move partial failure leaves tokens moved without undo — `handleDropOnGroup` (lines 64-86) moves tokens one-by-one in a loop; if the Nth token's rename fails, it returns early at line 84 without ever reaching the undo setup at line 88; tokens 1..N-1 are already moved on the server but `onPushUndo` is never called, so the user cannot undo the partial move; similarly the undo/redo callbacks (lines 96-115) don't check individual rename responses — if one fails mid-batch the rest continue silently, leaving tokens in an inconsistent state
- [~] `ImportPanel.tsx` missing `FileReader.onerror` handler causes indefinite hang — `processJsonFile` (line 290) and `processCSSFile` (line 323) both attach `reader.onload` but never set `reader.onerror`; if the file read fails (corrupt file, permission issue, user cancels), `onload` never fires and the import panel stays in its loading state indefinitely with no error message; should set `reader.onerror = () => { setLoading(false); setError('Failed to read file'); }`
- [~] `useSetMergeSplit.ts` merge creates undo slot even on partial failure — `handleConfirmMerge` (lines 112-181) fires all token writes via `Promise.all` and pushes an undo slot (line 165) regardless of how many failed; the undo `restore` callback replaces the entire target set with a pre-merge snapshot (line 168-172), which would discard tokens from write operations that DID succeed; also `handleConfirmSplit` undo (line 247-263) uses `Promise.allSettled` to delete created sets but only `console.warn`s failures — if deletion fails the user sees "undo succeeded" but split sets still exist
- [ ] Server routes rely on error message string matching for HTTP status codes — across `tokens.ts`, `themes.ts`, and `sync.ts`, error handlers use patterns like `if (msg.includes('not found')) reply.status(404)` and `if (msg.includes('already exists')) reply.status(409)` to determine HTTP status codes; this is fragile — any internal change to error message wording silently breaks status code mapping; should define typed error classes (e.g. `NotFoundError`, `ConflictError`) with `statusCode` properties and throw those from services, letting a shared error handler map them to HTTP responses (`packages/server/src/routes/tokens.ts`, `themes.ts`, `sync.ts`)
- [ ] ~170 raw `fetch()` calls across 37 UI files bypass the shared `apiFetch` utility — each reimplements its own error handling (or omits it); hotspots are TokenList.tsx (40 calls), ThemeManager.tsx (21 calls), useSetMergeSplit.ts (12 calls), and useGitSync.ts (9 calls); migrating to `apiFetch` would consolidate error handling, enable global timeout/retry, and eliminate dozens of per-call `res.ok` checks
- [ ] Server-side token value comparisons use `JSON.stringify` (non-deterministic key order) instead of `stableStringify` — affects snapshot diff (manual-snapshot.ts:164-165), sync diff (sync.ts:224-225, 323, 499-500), and generator conflict detection (generator-service.ts:292); composite token values (typography, shadow, border objects) with identical content but different key order will be reported as false-positive diffs or missed as false negatives
- [ ] manual-snapshot.ts `diff()` reconstructs current state with only `$value`/`$type` (line 151) but `save()` captures `$value`/`$type`/`$description`/`$extensions` (lines 79-84) — description and extension changes between snapshot and current state are silently ignored in diffs, and the `JSON.stringify` comparison on `$value` means composite token diffs are unreliable (see previous item)
- [ ] useSetMergeSplit.ts merge/split undo callbacks use raw `fetch` with no error handling — `handleConfirmMerge` undo (line 168) silently fires a PUT with no `.ok` check, and `handleConfirmSplit` undo (lines 248-261) uses `Promise.allSettled` but only `console.warn`s failures without surfacing them to the user; a failed undo leaves the user believing tokens were restored when they weren't
