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

- [~] Move lint rule configuration from SettingsPanel into the Validation panel (AnalyticsPanel) — SettingsPanel.tsx L503-575 embeds full lint rule toggles, severity selectors, and pattern inputs via LintConfigPanel, but users must navigate to Settings to configure rules then to Ship > Validation to see violations; co-locating rule configuration with violation results in a single panel lets users iterate on rules and see impact immediately
- [~] Find-and-replace has no preview of skipped conflicts and no progress during bulk rename — useFindReplace.ts shows matched tokens but tokens that would conflict with existing paths are silently marked "will be skipped" with no summary count; during execution (`frBusy=true`) there is no progress indicator for large sets; the 30s timeout (L8) triggers a misleading "cancelled" error instead of "timed out"
- [~] Heatmap and consistency scanner results are silently capped with no indication — heatmapScanning.ts caps results at 100 untokenized components (L43), 300 heatmap nodes (L187), and 200 usage layers (L261) via `.slice()` with no UI indication that results were truncated; users with large pages think compliance is higher than it actually is; show "300 of N shown" badges and allow expanding or paginating
- [~] Rename/move token has no impact preview showing affected aliases — `POST /api/tokens/:set/tokens/rename` has `updateAliases` flag but no preview endpoint showing which tokens would be updated; users can't assess the blast radius of a rename before committing; add a preview/dry-run mode that returns the list of aliases that would be rewritten
- [~] Consistency scanner has quadratic time complexity on large pages — consistencyScanner.ts iterates all tokens for each scanned node (O(nodes * tokens)); for a page with 5,000 nodes and 1,000 tokens this causes multi-second hangs; build a reverse index (value -> token path) upfront to reduce to O(nodes * log(tokens))
- [ ] No backup/restore for plugin settings — SettingsPanel has 40+ localStorage keys across UI preferences, export config, navigation state, lint rules, and per-set sort/filter; there is no "Export settings" / "Import settings" action to transfer configuration between machines or recover after clearing browser data; add a JSON export/import for user-configurable settings
