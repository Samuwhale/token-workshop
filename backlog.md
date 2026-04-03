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

- [~] ThemeManager dimension list has no search/filter UI despite the state existing — dimSearch state and a ref are declared in ThemeManager.tsx (~L138-139) but the search input is never rendered; users with many theme dimensions cannot filter by name or coverage status; implement the search input using the existing state and add a "show only dimensions with gaps" toggle

- [x] [HIGH] TokenStore batchUpsertTokens never triggers rebuildFlatTokens — after a batch import the flat token cache and resolver go stale because nothing inside the batch calls rebuildFlatTokens() and the write guard suppresses the file watcher; compare with batchDeleteTokens which correctly rebuilds after endBatch(); broader issue: rebuildFlatTokens is called 41 times across token-store.ts with three inconsistent patterns (inside batch try+catch where it just defers, after endBatch, or missing entirely) making every new batch method error-prone; should centralize into a withBatch(fn) helper (token-store.ts:738-769 for the bug, 181-213 for the batch mechanism)
- [x] PublishPanel orphan deletion has a retry race condition and all publish modal confirmations silently swallow async errors — executeOrphanDeletion (PublishPanel.tsx ~L235-269) creates a new correlationId per retry attempt but old promise handlers in orphansPendingRef are not invalidated, so a late response from a timed-out attempt can resolve with stale data; separately, all three modal types in PublishModals.tsx (~L207, ~L408, ~L580) use `try { await onConfirm() } finally { setBusy(false) }` which never surfaces errors to the user — the modal clears loading state and the user gets no feedback that the operation failed

- [~] Command palette has no destructive or batch actions — delete token, bulk delete, export, and show dependents are all available server-side (POST /api/tokens/:set/bulk-delete, GET /api/tokens/:set/dependents/*, POST /api/export) but have no command palette entries; users must navigate to the token tree context menu for every destructive operation (CommandPalette.tsx ~L75-86, tokens.ts ~L807, ~L487)
- [~] No Shift+Click range selection or Ctrl/Cmd+A in multi-select mode — selecting multiple tokens requires clicking each checkbox individually; the tree supports multi-select via checkboxes but has no range selection (Shift+Click first and last) or select-all shortcut, which are standard in every tree/list UI (TokenTreeNode.tsx ~L1044-1049, TokenList.tsx)
- [~] Token editor loses unsaved changes silently when the panel closes — switching sets, clicking another token, or navigating away discards in-progress edits with only a "discard changes?" confirm if isDirty is set; there is no draft auto-save to sessionStorage or recovery mechanism if the user accidentally closes the panel (TokenEditor.tsx ~L938-939, App.tsx ~L520)
- [ ] Drag-and-drop only supports single-token moves — useDragDrop tracks a single dragSource and validates all sources are siblings (line 171-174), so users cannot select multiple tokens across groups and drag them together; the server's POST /api/tokens/:set/batch-move endpoint supports batch moves but the UI never calls it for drag operations (useDragDrop.ts ~L28, ~L59-157)
- [ ] ThemeManager auto-fill gives no preview of what will be created — the "Fill gaps" action shows an approval modal but doesn't indicate how many tokens will be created, in which set, or whether existing values will be skipped vs. overwritten; the strategy is hardcoded to 'skip' but users can't see or change this (ThemeManager.tsx ~L814-835, ~L2122-2130)
- [ ] PublishPanel readiness checks show pass/fail without guided remediation — users see that "scopes" or "descriptions" checks failed but have no indication of priority (scopes are blocking, descriptions are optional) and no step-by-step workflow; fix labels only appear on hover over failed checks (PublishPanel.tsx ~L316-388, ~L369)
- [ ] Set metadata (description, Figma collection, Figma mode) only accessible via context menu — users must right-click a set tab to discover "Edit set info"; there's no visible affordance in SetSwitcher manage mode or in the token list header, making it effectively invisible to new users (App.tsx ~L2521-2579, SetSwitcher.tsx)
- [ ] ExportPanel silently switches from Platforms mode to Figma Variables mode when server disconnects — the mode auto-switch at line 554-557 happens without notification; users lose their selected export configuration and have no explanation of why the mode changed or how to get back (ExportPanel.tsx ~L552-557)
- [ ] Tab key in inline token editing closes the edit instead of moving to the next token — pressing Tab in an inline value edit field should advance focus to the next token's value (matching spreadsheet behavior), but currently it just blurs and exits edit mode; this forces users to click each token individually for sequential edits (TokenTreeNode.tsx MultiModeCell ~L92-110)
- [ ] Find & Replace doesn't warn when replacements would break alias references — the regex-based find/replace shows a preview of path changes but doesn't check whether any renamed paths are referenced as alias targets by other tokens; breaking aliases silently creates dangling references that only surface later as validation errors (TokenListModals.tsx ~L818-820)
