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

- [x] Generalize variable/style/scope sync into a parameterized abstraction — useFigmaSync.ts declares multiple useState hooks tripling the same (pending/applying/progress/error) pattern for variables, styles, and scopes; PublishPanel.tsx duplicates near-identical builder functions for var vs style diff rows (buildVarFigmaMap ↔ buildStyleFigmaMap, buildVarLocalOnlyRow ↔ buildStyleLocalOnlyRow, etc., differing only in field names); consolidating into parameterized factories and a single state-per-flow record type would halve the sync code
- [x] AbortError detection pattern duplicated ~70 times across hooks with inconsistent variants — `if (err instanceof Error && err.name === 'AbortError') return` appears across 33+ files; some use the unsafe `(err as Error).name === 'AbortError'` without instanceof check; extract a shared `isAbortError(err): boolean` utility and replace all call sites

### Performance

- [x] ExportPanel live preview re-runs all format generators on every settings change without debounce — changing a single toggle synchronously rebuilds the full ZIP and all preview strings; for large token sets this causes visible jank; debounce the preview rebuild by ~250ms (ExportPanel.tsx)

### Correctness & Safety

- [x] Manual snapshot restore has no concurrency guard — `manual-snapshot.ts:restore()` writes a restore journal then iterates sets, but two concurrent restore calls can interleave journal writes and corrupt state; needs a mutex (same promise-chain pattern as TokenStore/GitSync)
- [~] Server resolver routes accept unvalidated request bodies and token rename routes skip path validation — POST /resolvers, POST /resolvers/from-themes, and PUT /resolvers/:name cast request.body directly to ResolverFile without validating required fields; token rename-preview endpoints (tokens.ts) check query params for truthiness but skip isValidTokenPath() validation that all other path-accepting endpoints use

### Accessibility

### Maintainability

- [ ] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click (TokenTreeNode.tsx group context menu)

- [ ] Inconsistent destructive-action safety across panels — ThemeManager confirms dimension delete (ConfirmModal at ThemeManager.tsx:2365) but silently deletes options (ThemeManager.tsx:1726→700); SnapshotsSource deletes snapshots with no confirmation at all (SnapshotsSource.tsx:213-226); AnalyticsPanel deletes individual unused tokens without confirmation (AnalyticsPanel.tsx:557-568) while bulk delete has inline confirm; the safety level a user gets depends on which panel they're in rather than the severity of the action (violates: consistency, error prevention)
- [ ] SelectionInspector binding operations give no visible feedback — handleRemoveBinding (SelectionInspector.tsx:396), handleUnbindAllInGroup (:404), and handleClearAllBindings (:439) all fire postMessage to the plugin but show no toast, spinner, or inline confirmation to the user; the only signal is the undo slot pushed silently to the undo stack, so a user clearing all bindings on a complex component has no way to tell if the action succeeded without manually re-inspecting each property (violates: visibility of system status)
- [ ] ResolverPanel edit and delete icon buttons use title-only with no aria-label — the pencil edit button (ResolverPanel.tsx:583-592) and X delete button (:594-602) set `title="Edit resolver"` / `title="Delete resolver"` but have no `aria-label`, making them invisible to screen readers; this also applies broadly: the agent audit found ~117 icon-only buttons across 50 component files with neither aria-label nor title, concentrated in AnalyticsPanel, ExportPanel, BatchEditor, Collapsible, and CreatePanel (violates: accessibility)
- [ ] Import conflict resolution cycling behavior is opaque — the per-token decision button in ImportConflictResolver.tsx (lines 148-170) cycles through accept→merge→reject→accept on each click, but there is no visible affordance explaining this order or what the current state means; users must click repeatedly to discover the three states and learn the cycle direction, and there is no way to jump directly to a specific decision without cycling past unwanted options (violates: recognition over recall, user control)
- [ ] No success feedback after ThemeManager and ResolverPanel mutations — creating a theme dimension, adding an option, renaming, or saving a resolver edit all complete silently with only the list refreshing as implicit feedback (ThemeManager create dimension ~L2217, add option ~L1551; ResolverPanel save edit ~L281); contrast with set management operations (useSetRename, useSetDelete, useSetDuplicate) which all show explicit success toasts; a user performing multiple quick edits in ThemeManager can't tell which ones succeeded vs. were silently dropped (violates: visibility of system status, consistency)
- [ ] Import panel lacks Escape key handling and keyboard shortcuts for bulk actions — ImportPanel.tsx, ImportSourceSelector.tsx, and ImportConflictResolver.tsx have no onKeyDown handlers for Escape to go back or cancel; the conflict resolver's bulk action buttons (Accept all, Merge all, Reject all at ImportConflictResolver.tsx:72-89) have no keyboard shortcuts; and the per-token cycling button has no keyboard alternative to clicking (violates: flexibility and efficiency of use, accessibility)
