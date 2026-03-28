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
- [x] No undo for destructive operations beyond toast — bulk delete, group rename, and generator runs have confirmation modals but no rollback; implement undo for all write operations via server-side operation log, or at minimum show "last 5 operations" with rollback in the command palette

### UX

---

## Code Quality

### Redundancy & Duplication

### Performance

- [x] `refreshTokens` double-fires on initial load — `refreshTokens` depends on `activeSet`, and calls `setActiveSet(current)` which changes `activeSet`, which re-triggers the effect; generation counter prevents stale display but the fetch fires twice

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [x] Missing imports in `token-store.ts` — `parseReference`, `makeReferenceGlobalRegex`, and `TokenNode` are used but not imported from `@tokenmanager/core`; `isSafeRegex` is re-exported but not imported for local use; these cause compilation failures or silently disable features like circular reference detection
- [x] Resolver inconsistent color map initialization — `resolve(path)` creates a fresh color map without seeding already-resolved tokens, unlike `resolveAll()` which seeds them; this creates a latent gap in cycle detection for incrementally-added tokens
- [x] CORS origin includes string `'null'` — allows requests from sandboxed iframes, data: URLs, and redirects; if intentional for the Figma plugin iframe, add a comment; otherwise remove
- [~] TokenList `handleListKeyDown` has stale closure — `selectedPaths` and `displayedLeafNodes` are missing from the `useCallback` dependency array; Cmd+C copies stale selection
- [x] Multiple fetch calls in TokenList with no error handling — `handleRenameGroup`, `executeTokenRename`, `handleDropOnGroup`, `handleDuplicateGroup`, `handleInlineSave` don't check `res.ok` or catch network errors; failed operations push undo slots and refresh as if they succeeded
- [~] `useSetMergeSplit` silently swallows all errors — multiple `catch {}` blocks with `// ignore`; network errors, server errors, and JSON parse errors all vanish with no user feedback
- [~] `useSetMetadata` silently swallows save errors — `handleSaveMetadata` catches all errors with `// best-effort; close modal regardless`; user gets no feedback that their changes failed
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

- [ ] TokenList delete has no user-facing error feedback — catch block only logs to console, user sees token disappear optimistically even if server rejects the delete
- [ ] SyncPanel "Delete orphan variables" has no retry mechanism — if plugin doesn't respond within timeout, user must manually re-run the full readiness check
