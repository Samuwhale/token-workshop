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
- [x] useGroupOperations group rename preview error silently falls through to executing the rename — when the rename-preview fetch fails (useGroupOperations.ts:102-104), the error is only logged to console and the code continues to call executeGroupRename without a confirmation dialog; this means a group rename that has alias dependents can proceed without showing the "N aliases will be updated" confirmation if the preview endpoint is temporarily unreachable, silently updating or breaking aliases across multiple sets; should show an error toast and abort instead of falling through when preview fails

- [x] No redo (Cmd+Y / Cmd+Shift+Z) — the undo stack works via rollback but there is no redo path; once an operation is rolled back, it is gone; users expect redo to work symmetrically with undo; implement a redo stack in useUndo that captures rolled-back operations and re-applies them on demand (useUndo hook, HistoryPanel.tsx, CommandPalette.tsx)
- [x] AnalyticsPanel shows unused tokens but provides no delete action — the unusedTokens list is computed (AnalyticsPanel.tsx ~L422-440) and displayed, but users must manually navigate to each token to delete it; add a "Delete all unused" button (with confirmation) and per-row delete icons to the unused tokens list so the common cleanup workflow doesn't require leaving the Analytics panel
- [~] AnalyticsPanel validation results go stale after fixes are applied without auto-revalidation — resultsStale state exists (AnalyticsPanel.tsx ~L89) and is set when tokens change via SSE, but validation is never automatically re-run after the user fixes an issue; users must manually hit "Validate" again to see current status; add an auto-revalidate after any token mutation that changes validation-relevant data (broken aliases, missing types, circular refs)
- [ ] Token tree has no "collapse all" / "expand all" shortcut — the tree can be expanded one node at a time but there is no way to quickly collapse all expanded nodes or expand all in the current view; power users navigating large trees constantly get lost; add a collapse-all toolbar button (or Cmd+Shift+Left shortcut) and expand-all to match standard tree-view behavior (TokenList.tsx expandedPaths state ~L140)
- [ ] Token tree zoom (drill-into-group) has no breadcrumb navigation — zoomRootPath state exists (TokenList.tsx ~L80) and enables drilling into a group, but the only way back is an unlabeled back affordance; users lose track of where they are; render a breadcrumb trail above the token list when zoomed in (e.g., "tokens > colors > brand") with each segment clickable to jump back to that level
- [ ] ThemeManager has no "fill all coverage gaps" one-click action per dimension — coverage gap detection correctly identifies which tokens are missing per option (ThemeManager.tsx ~L249-287) but auto-fill only works per-option and per-set; users with a theme dimension that has many coverage gaps must click through each option individually; add a "Fill all gaps in dimension" action that runs auto-fill for every option in a single operation
- [ ] BatchEditor silently skips alias tokens during scale operations and only reports the skip count post-apply — when scaling dimension tokens, any token with an alias reference is silently omitted (BatchEditor.tsx ~L146-155) and a count warning appears only after the operation completes; show a pre-apply summary listing the skipped alias tokens so users can decide whether to dereference them first
- [ ] Generator panel has no dry-run preview mode — users must actually run a generator to see what tokens it would create; for generators targeting existing groups this overwrites values without any preview; add a "Preview output" action that shows a diff of what tokens would be created/updated/deleted without committing the change (GraphPanel.tsx ~L200-400, generator run endpoint)
- [ ] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle
- [ ] ExportPanel preview does not update when export filters change — after an export is generated the preview tab shows a file sample, but changing the type filter, path prefix, or platform selection does not refresh it (ExportPanel.tsx ~L287); users must click Export again just to see the effect of filter changes; add a "Refresh preview" button that re-runs the export with current settings and updates the preview without requiring a download
- [ ] Command palette has no "jump to next validation issue" action — fixing validation errors requires switching to the Analytics panel, finding each broken token, and navigating to it manually; add a "Next issue" command (or F8-style keyboard shortcut) that selects and scrolls to the next token with an active lint/validation violation, enabling a fast "fix and advance" workflow without leaving the token tree (CommandPalette.tsx, AnalyticsPanel.tsx lintViolations data)
- [ ] AnalyticsPanel color contrast matrix is capped at 16 tokens with no way to see more — the matrix is limited (AnalyticsPanel.tsx ~L232-236) for performance, but token sets often have 30-50 color tokens; users cannot audit contrast for tokens beyond the cap; add pagination or a "selected pairs only" mode that lets users pick specific tokens to compare rather than always computing the full NxN matrix
