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

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
- [x] [HIGH] TokenGroupNode memo comparator is incomplete and allows stale renders — the custom areEqual function at TokenTreeNode.tsx:759 only checks 5 of 11+ props (missing `isSelected`, `lintViolations`, `showFullPath`, `skipChildren`, `chainExpanded`, `multiModeValues`), AND the parent passes `lintViolations.filter(v => v.path === child.path)` at line 754 which creates a new array every render, so even if the comparator checked it, reference equality would always fail; fix the comparator and memoize/stabilize the filtered lintViolations
- [x] No "Publish only variables" or "Publish only styles" in the Publish All flow — PublishPanel's orchestrated publish (publishAllStep) always runs variables, styles, and git in sequence; users who only changed colors and want to sync variables must either use the individual accordion or run the full pipeline including git operations they don't need
- [x] Gradient editor has no visual builder — GradientEditor (ValueEditors.tsx ~L1378) renders gradient stops as raw form fields (position stepper + color hex input) with no draggable gradient bar, no visual stop reorder, and no live gradient preview strip; the linear-gradient CSS preview exists but is non-interactive
- [ ] No inline alias editing for simple token types — MultiModeCell inline editing (TokenTreeNode.tsx ~L30-171) checks `!isAlias` at line 49 and skips alias tokens entirely; users must open the full editor to change what an alias points to, even for simple redirects like `{color.blue.500}` → `{color.blue.600}`
- [ ] Publish sync compare always fetches all tokens for the active set — SyncSubPanel has no pre-compare filter (e.g., "compare only color tokens" or "compare only this collection"); for large token sets with hundreds of variables, the full diff is noisy and slow, making it hard to review specific areas of change
- [ ] Option tabs in ThemeManager overflow without scroll indicators or dropdown fallback — dimensions with 15+ options render a horizontal scrollable list (ThemeManager.tsx ~L1020-1087) with no visible scroll arrows, no "more" dropdown, and no indication that tabs exist beyond the visible area; users may not realize additional options are available
- [ ] No "extract to alias" action in token context menu — to refactor a literal value into a shared token + alias, users must: create a new token, copy the value, save it, then edit the original to reference the new token; a single "Extract to alias" context menu action would automate this common refactoring pattern
- [ ] BatchEditor lacks sub-property targeting for composite tokens — batch color adjustments (lighten, darken, hue rotate) only work on color-type tokens; there's no way to batch-adjust the color sub-property of all shadow tokens or the fontSize sub-property of all typography tokens, forcing per-token edits for systematic changes
- [ ] Server API response format is inconsistent across list endpoints — `/api/operations` returns `{ operations, total, hasMore }`, `/api/tokens/search` returns `{ results, total }`, `/api/sync/log` returns `{ commits, hasMore }`; standardize to a common pagination envelope like `{ data, total, hasMore, limit, offset }` so the UI can use a single fetch-and-paginate helper
- [ ] ExportPanel has 41 useState calls and 8+ duplicate localStorage persistence useEffects — extract a `usePersistedState(key, initial)` hook or `usePersistentExportConfig` to replace the repeated `useState` + `useEffect(() => lsSet(KEY, val), [val])` pattern (each of the 8 storage keys has its own dedicated 3-line effect), and group related state (diff state, preset state, platform config) into domain hooks to reduce the 41 hooks to a manageable number
- [ ] Server has 5 independent promise-chain mutex implementations with subtly different error semantics — `operation-log.ts:106`, `git-sync.ts:222`, `manual-snapshot.ts:64`, `themes.ts:68`, and `generator-service.ts:112` each implement `lockChain = next.then/catch(...)` inline; some swallow errors with `.catch(() => {})`, others use `.then(() => {}, () => {})`; extract a shared `PromiseChainLock` utility class and replace all 5 usages
- [ ] Plugin sandbox variableSync rollback is all-or-nothing for the deletion phase — at variableSync.ts:192-225, if ANY single variable property restore fails (e.g., just the `scopes` setter on one variable), the entire deletion phase is skipped for ALL created variables, leaving orphan variables in the document; the logic should skip deletion only for the specific variables whose restore failed, not abandon cleanup for all created variables and collections
- [ ] Duplicate composition-token resolution logic in TokenTreeNode — lines ~1056-1080 (`handleApplyToSelection`) and ~1160-1183 (`handleContextMenuApply`) contain identical 24-line blocks that resolve composite token sub-values by iterating properties and calling `resolveReference`; extract to a shared `resolveCompositeForApply(node, allTokensFlat)` helper in tokenListHelpers.tsx
- [ ] Server resolver-store silently returns empty list on directory read errors — `resolver-store.ts:280-283` catches all `fs.readdir` errors with an empty `catch { return; }`, so permission errors, missing directories, or filesystem failures silently produce an empty resolver list with no log output; add structured logging so users can diagnose why resolvers aren't loading
