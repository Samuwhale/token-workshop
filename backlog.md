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

- [!] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle (e.g., "include descriptions") synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by 250ms, matching the pattern already used in search inputs across the app (ExportPanel.tsx ~L500-1000)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [x] Generator pipeline cards show no "stale" indicator when the source token has changed since last run — generators have a `sourceToken` path and an `updatedAt` timestamp, but there is no tracking of whether the source token's value has changed since the generator was last run; after a generator runs and its source token is subsequently edited, the card shows no warning that the generated output is now out of date; add a "Needs re-run" badge or yellow border on generator cards when the source token's modification time is newer than the generator's `updatedAt`, with a tooltip explaining why (packages/figma-plugin/src/ui/components/GraphPanel.tsx GeneratorPipelineCard, packages/server/src/services/generator-service.ts)
- [~] Token editor drawer has no keyboard shortcut to navigate to the next/previous token — when reviewing or editing many tokens sequentially, users must close the drawer, click the next token in the list, and wait for the drawer to re-open; add Cmd+] / Cmd+[ (or arrow keys when focus is outside inputs) to advance to the next/previous sibling token in the list without closing the drawer, similar to how Figma's own inspect panel navigates between selected layers (packages/figma-plugin/src/ui/components/TokenList.tsx TokenEditor drawer integration)
- [x] PublishPanel.tsx readiness checks have no timeout for `varSync.readFigmaVariables()` at L164 — if the Figma plugin is unresponsive, `readinessLoading` stays `true` forever with no escape; add a timeout (e.g. 15 s) that sets an error state, matching the pattern established in ExtractTokensPanel
- [x] AnalyticsPanel.tsx contrast matrix uses non-normalized hex values — `colorTokens` (used by the matrix at L899) is built from raw `t.$value` strings without calling `normalizeHex()`, while `allColorTokens` does normalize; 3-char hex values like `#FFF` will cause `hexToLuminance` to return `null` (defaulting to 0 in the sort) and `wcagContrast` to return wrong ratios; fix by normalizing in the `allColors.push()` call at L221
- [x] GraphPanel.tsx handleDuplicate at L806 constructs `targetGroup` as `` `${generator.targetGroup}_copy` `` without checking whether `generator.targetGroup` is defined — if it is `undefined` or `null`, the duplicate gets a literal `targetGroup` of `"undefined_copy"` or `"null_copy"`, creating tokens under an invalid path; add a guard or fall back to the generator name
