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

### QoL

### UX

---

## Sync

### Bugs

### UX

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### UX

---

## Import

### Bugs

### UX

---

## Token Generation & Graph Editor

### Bugs

### UX

---

## Token Editor

### QoL

---

## Settings & Data Management

### QoL

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

- [x] [HIGH] `varCorrelationIdRef` and `varReadResolveRef` are shared between `computeVarDiff` and `runReadinessChecks` — if both are called concurrently (auto-run on mount + manual click), the second call overwrites the shared ref and the first promise never resolves, causing a silent hang or timeout (`SyncPanel.tsx:L68-69, L243-258`)
- [x] [HIGH] ExportPanel unreachable — `ExportPanel` is a fully-built 815-line component that is never imported or rendered in `App.tsx`; users have no way to access platform export (CSS/Dart/Swift/Android/JSON) or Figma variable import from the plugin UI (`packages/figma-plugin/src/ui/components/ExportPanel.tsx`)

- [x] [HIGH] Bulk-rename regex has no ReDoS protection — `isRegex=true` with a catastrophic backtracking pattern (e.g. `(a+)+b`) applied to a large token set can hang the Node.js event loop (`server/services/token-store.ts:803-809`)
- [x] [HIGH] `templateIdForTokenType` fallback returns non-existent template ID — `GraphPanel.tsx:600` returns `'modular-type-scale'` for non-color/dimension tokens but `GRAPH_TEMPLATES` has id `'modular-type'`; `find()` returns `undefined`, `initialTemplate` is set to `null`, and the pending-token-type hint is silently discarded when opening the Graph tab from a token's context menu.
- [x] [HIGH] `handleCreateToken` silently swallows server errors — `SelectionInspector.tsx:373-391`: when `res.ok` is false (e.g. 409 conflict when a token already exists, 500 on server error), the `createError` state is never set and `creating` resets to `false` with no feedback, leaving the user staring at a blank form with no indication of what went wrong.
- [x] [HIGH] Deep inspect "Go to token" button is permanently invisible — `SelectionInspector.tsx:1005-1007`: the parent `<div>` for each deep-inspect child row is missing the `group` Tailwind class, so `opacity-0 group-hover:opacity-100` on the navigate button never triggers; the button is hidden and unreachable at all times.
- [~] [HIGH] `syncBindings` applies raw `$value` without resolving aliases — `controller.ts:1234`: alias tokens (e.g. `$value: "{color.primary}"`) are passed directly to `applyTokenValue` which treats the string literally, producing a type mismatch that increments `errors`; the user sees "X bindings failed — check token types" when the real fix is that aliases need to be resolved before sync.
- [ ] Consolidate duplicate `ThemeOption`/`ThemeDimension` types — defined identically in `useThemeSwitcher.ts`, `ThemeCompare.tsx`, and `ThemeManager.tsx`; consumers should import from one place
- [x] [HIGH] ThemeManager `executeDeleteDimension` and `executeDeleteOption` don't check `res.ok` — server rejection (404/500) is silently ignored while optimistic local state update removes the dimension/option from the UI; `fetchDimensions()` eventually restores it but user gets no error feedback (`ThemeManager.tsx:252-260, 297-310`)
- [x] [HIGH] ThemeManager `handleSetState` doesn't check `res.ok` — a server-rejected set state toggle (e.g. 400 from invalid status) appears to succeed because `fetch` doesn't throw on HTTP errors; the catch block only handles network failures, not HTTP error responses (`ThemeManager.tsx:326-337`)
- [x] [HIGH] `deleteToken` emits no SSE change event — `createToken`, `updateToken`, and `batchUpsertTokens` all call `this.emit()` but `deleteToken` (token-store.ts:483-492) does not, so SSE-connected clients are never notified when a token is deleted
- [~] [HIGH] `deleteTokensByGeneratorId` emits no SSE change event — after bulk-deleting generator-tagged tokens (token-store.ts:511-534), no `this.emit()` call is made, so clients won't refresh after generator output is cleaned up
- [~] [HIGH] `moveToken` silently overwrites target — `moveToken` (token-store.ts:785) calls `setTokenAtPath` without checking if a token already exists at that path in the target set; if one does, it is silently overwritten with no error or warning
- [ ] [HIGH] `bulkRename` mutates in-memory tree before `beginBatch`/`saveSet` — token-store.ts:879-884 applies `setTokenAtPath`/`deleteTokenAtPath` before L886 `beginBatch()` and L888 `saveSet()`; if `saveSet` throws, the in-memory tree is mutated but the disk file still has old paths, leaving the store in an inconsistent state
- [ ] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).

- [ ] No copy/paste for tokens (Cmd+C/V) — users can paste via a dedicated modal (Cmd+Shift+V) but there's no way to copy selected tokens as JSON to clipboard; common "duplicate across sets" workflow requires the Move dialog instead of copy-paste
- [ ] Inline editing limited to color/boolean — string, dimension, and number tokens require opening the full editor panel to change values; inline click-to-edit for simple scalar types would save a round-trip to the editor
- [ ] Arrow left/right don't expand/collapse groups — when a group row is focused via keyboard, left/right arrows do nothing; they should collapse/expand the group (standard tree keyboard pattern)
- [ ] Search resets on set switch — filter/search text is lost when switching between sets; users working across multiple sets must re-type their search each time
- [ ] No "Create as alias" fast path — creating an alias token requires: open editor, toggle alias mode, type reference path, save; a direct "Create Alias" action or right-click "Alias to this token" would cut this to 1-2 steps
- [ ] Context menu has no letter-key accelerators — right-click menu shows 12+ items navigable only by arrow keys; adding letter-key access (d=delete, r=rename, c=copy path) would speed up power users
- [ ] Generators show no preview before commit — users configure a color scale or type scale but can't see what tokens will be created until they confirm; a live preview of generated output would prevent trial-and-error
- [ ] Validation-fix-revalidate loop is fully manual — after fixing a validation issue, users must manually switch back to Analytics and re-trigger validation; no auto-revalidation or "recheck this issue" action
- [ ] Selection Inspector create-and-bind requires tab switch — when binding a token that doesn't exist yet, users must leave Inspect tab, create token in Tokens tab, return to Inspect, re-bind; an inline "Create & Bind" flow would eliminate this context switch
- [ ] Remap bindings has no token autocomplete — the remap panel requires typing exact token paths manually with no search/autocomplete, making it error-prone for large token sets
- [ ] Export has no batch copy or download — exporting to multiple platforms requires toggling each one individually, then expanding each file and clicking "Copy" one at a time; no "Copy All" or download-as-zip
- [ ] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow
