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

- [ ] No "Publish only variables" or "Publish only styles" in the Publish All flow — PublishPanel's orchestrated publish (publishAllStep) always runs variables, styles, and git in sequence; users who only changed colors and want to sync variables must either use the individual accordion or run the full pipeline including git operations they don't need
- [ ] Gradient editor has no visual builder — GradientEditor (ValueEditors.tsx ~L1378) renders gradient stops as raw form fields (position stepper + color hex input) with no draggable gradient bar, no visual stop reorder, and no live gradient preview strip; the linear-gradient CSS preview exists but is non-interactive
- [ ] No inline alias editing for simple token types — MultiModeCell inline editing (TokenTreeNode.tsx ~L30-171) checks `!isAlias` at line 49 and skips alias tokens entirely; users must open the full editor to change what an alias points to, even for simple redirects like `{color.blue.500}` → `{color.blue.600}`
- [ ] Publish sync compare always fetches all tokens for the active set — SyncSubPanel has no pre-compare filter (e.g., "compare only color tokens" or "compare only this collection"); for large token sets with hundreds of variables, the full diff is noisy and slow, making it hard to review specific areas of change
- [ ] Option tabs in ThemeManager overflow without scroll indicators or dropdown fallback — dimensions with 15+ options render a horizontal scrollable list (ThemeManager.tsx ~L1020-1087) with no visible scroll arrows, no "more" dropdown, and no indication that tabs exist beyond the visible area; users may not realize additional options are available
- [ ] No "extract to alias" action in token context menu — to refactor a literal value into a shared token + alias, users must: create a new token, copy the value, save it, then edit the original to reference the new token; a single "Extract to alias" context menu action would automate this common refactoring pattern
- [ ] BatchEditor lacks sub-property targeting for composite tokens — batch color adjustments (lighten, darken, hue rotate) only work on color-type tokens; there's no way to batch-adjust the color sub-property of all shadow tokens or the fontSize sub-property of all typography tokens, forcing per-token edits for systematic changes
- [ ] Server API response format is inconsistent across list endpoints — `/api/operations` returns `{ operations, total, hasMore }`, `/api/tokens/search` returns `{ results, total }`, `/api/sync/log` returns `{ commits, hasMore }`; standardize to a common pagination envelope like `{ data, total, hasMore, limit, offset }` so the UI can use a single fetch-and-paginate helper
