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

- [~] Server routes rely on error message string matching for HTTP status codes — across `tokens.ts`, `themes.ts`, and `sync.ts`, error handlers use patterns like `if (msg.includes('not found')) reply.status(404)` and `if (msg.includes('already exists')) reply.status(409)` to determine HTTP status codes; this is fragile — any internal change to error message wording silently breaks status code mapping; should define typed error classes (e.g. `NotFoundError`, `ConflictError`) with `statusCode` properties and throw those from services, letting a shared error handler map them to HTTP responses (`packages/server/src/routes/tokens.ts`, `themes.ts`, `sync.ts`)
- [~] ~170 raw `fetch()` calls across 37 UI files bypass the shared `apiFetch` utility — each reimplements its own error handling (or omits it); hotspots are TokenList.tsx (40 calls), ThemeManager.tsx (21 calls), useSetMergeSplit.ts (12 calls), and useGitSync.ts (9 calls); migrating to `apiFetch` would consolidate error handling, enable global timeout/retry, and eliminate dozens of per-call `res.ok` checks

- [~] Duplicate Figma plugin message-promise pattern across useStyleSync, useVariableSync, and useFigmaSync — each hook independently implements correlationId tracking, pendingRef maps, timeout+Promise wrappers, and message event listeners for roundtrip plugin communication; should extract a shared `useFigmaMessage(type, responseType, timeout)` hook that returns a `send(payload): Promise<response>` function, eliminating ~100 lines of boilerplate and ensuring consistent timeout/error handling
- [~] Plugin sandbox duplicate batched node traversal in heatmapScanning.ts and consistencyScanner.ts — both files implement nearly identical stack-based tree walks over `figma.currentPage.children` with `VISUAL_TYPES` filtering, `ChildrenMixin` casting, BATCH_SIZE=200 yield-to-main-thread pattern, and `walkCount` tracking; extract into a shared `walkVisualNodes(roots, opts)` async generator in a plugin utility file
- [~] bulkRename in token-store.ts does not validate for circular alias references after rename — a rename like `a→b` when `b` already aliases `{a}` (now `{b}`) creates a self-referencing cycle; the method checks for path collisions but never calls the existing circular-reference detection (`detectCircularRefs`) on the post-rename state; also, the revert logic (L1269-1272) only restores tokens in the renamed set but not the alias reference updates across other sets (L1252-1263), leaving cross-set aliases corrupted on failure
- [~] useGeneratorDialog.ts (463 lines, 20+ state vars, 21+ callbacks) and useGitSync.ts (317 lines, 17+ state vars) are oversized hooks mixing unrelated concerns — useGeneratorDialog handles config management, preview fetching with debounce/abort, existing token comparison, overwrite detection, semantic mapping, save logic, and undo; useGitSync handles status polling, conflict detection, merge resolution, diff computation, file selection, and token previews; each should be decomposed into 2-3 focused hooks to reduce re-render blast radius and make individual behaviors testable
- [x] variableSync.ts rollback snapshot is incomplete — when snapshotting existing Figma variables before mutation (L62-70), only `valuesByMode`, `name`, `scopes`, and two `pluginData` keys are captured; `description` and `hiddenFromPublishing` are omitted, so if the rollback path fires after a partial failure, those properties are lost; the rollback loop (around L130+) should restore all mutable Variable properties
- [~] git-sync.ts applyDiffChoices silently swallows checkout and commit failures — L420-421 catches per-file `git checkout origin/branch -- file` failures with `console.warn` and continues, meaning the user sees success even though some files weren't pulled; L425-428 catches commit failures the same way, so a failed pull-commit is invisible; push path (L435-438) has the same pattern; these should propagate partial-failure info to the caller so the UI can report which files failed
