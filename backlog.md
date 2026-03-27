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

### QoL

---

## Settings & Data Management

### QoL

- [~] Git commit allows submit with empty message — the commit form doesn't disable the button when the message field is blank
- [!] No publish dry-run — no way to preview what a Git push or Figma variable publish will change before executing

### UX

- [x] ExportPanel: No loading indicator during platform export — the `handleExport` call sets `exporting` state but the UI does not show a spinner or progress message while waiting for the server response

---

## Code Quality

### Redundancy & Duplication

- [x] ExportPanel: Duplicate PLATFORMS constant — the same `PLATFORMS` array is defined identically in both `ExportPanel.tsx` and `PublishPanel.tsx`; should be extracted to a shared constant to avoid drift

### Performance

- [~] Theme dimensions store reads `$themes.json` from disk on every GET request — `createDimensionsStore` has no in-memory cache; each `load()` call re-reads and re-parses the file

### Correctness & Safety

- [!] Cannot access 'Wr' before initialization — runtime error, likely a circular dependency or hoisting issue with a minified identifier; needs source-map / unminified stack trace to locate the declaration. Once fixed, audit the codebase for similar initialization-order issues (other circular deps, `let`/`const` accessed before declaration across module boundaries).
- [~] Export route merges all sets into one namespace with silent overwrites — `deepMergeInto` merges all requested sets into a single flat object, so if two sets define the same token path, the second silently overwrites the first with no warning

- [~] Deep Inspect mode has no keyboard shortcut — toggling deep inspection requires clicking a small button; a keyboard shortcut would streamline the inspect workflow

- [~] No token search highlighting — filtering tokens by name narrows the list but doesn't highlight the matching substring in results, making it hard to spot the exact match in large sets
- [~] No "duplicate token" or "create sibling" action — creating a variant of an existing token requires manually entering the full path from scratch instead of forking from the current token
- [ ] Batch editor find-and-replace has no regex support — only literal string matching is available, so common refactors like renaming `spacing.*` to `dimension.*` require manual work per token
- [ ] Batch editor operations show no preview of affected tokens — scaling dimensions, changing types, or find-replacing paths execute immediately with no "these N tokens will change from X to Y" dry-run
- [ ] Token delete does not warn about dependent tokens — deleting a token that other tokens alias silently breaks downstream references; the server should block or warn like it does for set deletion
- [ ] No color contrast checker in ColorPicker — editing a color token has no inline WCAG AA/AAA pass/fail indicator against common backgrounds, forcing users to check contrast separately
- [ ] No color harmony suggestions in ColorPicker — no complementary, triadic, or analogous color suggestions when editing a color token, making systematic palette design harder
- [ ] CommandPalette token search capped at 100 results with no pagination — users with 500+ tokens can't find matches beyond the cap, and there's no indication results were truncated
- [ ] CommandPalette token results don't show which set a token belongs to — when the same path exists in multiple sets, users can't distinguish between them in search results
- [ ] ThemeManager has no search/filter for token sets — configuring dimension options with 50+ sets requires scrolling through the entire list with no way to filter by name
- [ ] No "expand all / collapse all" keyboard shortcut in token tree — users manually expanding/collapsing hundreds of nested groups have no fast path; only individual toggle is available
- [ ] ExportPanel has no output preview — exporting to CSS/Dart/Swift generates a zip but users can't preview the actual generated code before downloading
- [ ] No custom export path or selector template — all CSS exports use `:root` selector with no option for scoped output like `.light { --color: ... }` or custom folder structures
- [ ] HeatmapPanel has no export or reporting — users can't export binding coverage as CSV/JSON or share a "200/1000 layers bound (20%)" summary with stakeholders
- [ ] HeatmapPanel "select all red" action has no follow-up workflow — selecting unbound layers has no batch "bind all to token X" or "create tokens for these" next step
