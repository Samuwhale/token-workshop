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

- [x] No import from CSS custom properties or Tailwind config — only DTCG JSON and Figma Variables/Styles are supported as import sources; add parsers for CSS `--custom-property` declarations and Tailwind `theme` config objects to support migrations from code-first workflows
- [x] No import conflict resolution UI — importing tokens that overlap with existing ones shows a skip/overwrite strategy picker but no per-token preview; add a merge conflict view showing each overlapping token's current vs. incoming value with per-token accept/reject (like git merge tools)
- [x] No visual node-based generator editor — generators are configured via form dialogs with dropdowns and number inputs; add a node-graph editor (like Tokens Studio's Graph Engine or Blender shader nodes) where users connect source tokens to transform nodes (lighten, darken, scale, mix, contrast-check) to output tokens — makes complex generation logic visible and composable
- [x] No generator preview before committing — running a generator immediately creates/overwrites tokens; add a dry-run preview showing the tokens that would be created with their values, diffs against existing tokens, and a confirm/cancel step
- [x] No wide-gamut color support — color picker and value storage are limited to sRGB hex; add support for Display P3, OKLCh, and other CSS Color Module 4 color spaces as specified in DTCG v2025.10 — show a gamut indicator when a color exceeds sRGB and provide a fallback swatch
- [x] No live typography preview in the editor — TypographyEditor shows form fields for font-family, size, weight, line-height, etc. but no rendered text sample; add a preview block showing "The quick brown fox" (or user-configurable sample text) rendered with the current values, updating in real-time as properties change
- [x] No expression/formula builder with autocomplete — formula mode (`fx`) accepts expressions like `{spacing.base} * 2` but provides no syntax help; add autocomplete for token references inside formulas, operator hints, live evaluation preview showing the computed result, and error highlighting for invalid expressions
- [x] No DTCG v2025.10 resolver support — theme variations require separate token sets per brand/mode combination, causing file proliferation; implement DTCG resolver config so a single resolver file contextually applies overrides, reducing the set management overhead and aligning with the new spec
- [x] No $extends token inheritance — composite tokens (typography, shadow) must duplicate all properties even when only one differs from a base; support DTCG $extends so component tokens can inherit from and override specific properties of parent tokens

- [x] Graph tab crashes — `graphScrollRef is not defined`; reference error causes the graph view to fail on render

- [x] TokenList delete has no user-facing error feedback — catch block only logs to console, user sees token disappear optimistically even if server rejects the delete
- [~] SyncPanel "Delete orphan variables" has no retry mechanism — if plugin doesn't respond within timeout, user must manually re-run the full readiness check
