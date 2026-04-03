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

- [~] Merge the HistoryPanel's three sub-tabs into a unified change timeline — "Recent Actions", "Git Commits", and "Snapshots" serve the same user goal (understand what changed and recover from mistakes) but exist as three disconnected views with different mental models; users must know which tab to check depending on how a change was made; replace the three-tab layout with a single chronological timeline that interleaves all three event types with visual type labels, while keeping the existing rollback and checkout actions per entry (HistoryPanel.tsx ~L177)
- [~] useGroupOperations group rename preview error silently falls through to executing the rename — when the rename-preview fetch fails (useGroupOperations.ts:102-104), the error is only logged to console and the code continues to call executeGroupRename without a confirmation dialog; this means a group rename that has alias dependents can proceed without showing the "N aliases will be updated" confirmation if the preview endpoint is temporarily unreachable, silently updating or breaking aliases across multiple sets; should show an error toast and abort instead of falling through when preview fails
