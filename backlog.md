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
- [!] GraphPanel has no inline output preview before saving a generator — creating a generator requires configuring it, saving, then navigating to TokenList or TokenFlowPanel to see the output; this breaks the authoring feedback loop; add a live "Preview output" section within GraphPanel that renders the first N generated tokens in real time as parameters change, before the generator is saved (GraphPanel.tsx ~L400 lines, no preview section)
- [!] No "Copy resolved value" action on token detail — TokenDetailPreview copies the token path to clipboard, but there is no way to copy the resolved value (e.g. `#FF5733`) without manually reading it from the preview swatch; add a copy-value button alongside the existing copy-path button, especially useful for tokens with deeply-nested alias chains where the resolved value is not immediately obvious (TokenTreeNode.tsx, TokenEditor preview area)
- [!] ResolverPanel is undiscoverable — it only appears inside ThemeManager behind an "Advanced" toggle; users who create themes and later want to configure DTCG resolvers have no indication this panel exists from any navigation path; either surface Resolvers as a dedicated sub-tab under Define (alongside Themes, Generators) or add a visible "Resolvers" link in the ThemeManager header that doesn't require toggling Advanced mode first (ResolverPanel.tsx, App.tsx tab structure)

- [!] No "Select all in group" action on group context menu — in multi-select mode, selecting all tokens in a group requires clicking each one individually; the group context menu should offer "Select children" to select all leaf tokens under the group in one click, matching standard tree-view selection behavior (TokenTreeNode.tsx group context menu ~L626-793)

- [~] Three separate history/undo mental models with no unifying UI — users encounter local undo stack (Cmd+Z, 20-action limit, lost on refresh), server operation log (useRecentOperations fetches data but has no rendered UI), and git history/snapshots (HistoryPanel); there's no explanation of how these relate or when to use which; add a unified "Recent Actions" sidebar or panel that surfaces the operation log and connects it to the undo toast (useRecentOperations.ts, UndoToast.tsx, HistoryPanel.tsx)

- [~] [HIGH] Operation log has major coverage gaps and dead rollback code — 7 destructive server endpoints (group move/duplicate/reorder/create, group metadata update, single token move/copy) skip operationLog.record() making them impossible to undo; separately, rollbackStructural() and invertMetadata() at operation-log.ts:314-387 reference an undefined OperationMetadata type and non-existent entry.metadata field — dead code from an incomplete refactor that should be completed or removed (packages/server/src/routes/tokens.ts lines 88-159, 178, 488, 508; packages/server/src/services/operation-log.ts lines 314-387)
- [x] [HIGH] CommandPalette keyboard navigation fires wrong command in grouped (no-query) view — flatList used for ArrowDown/Enter is built from filteredCommands, but the section view highlights using sectionFlatItems.indexOf() which prepends Recent commands in different order; pressing Enter activates a different command than the one visually highlighted (packages/figma-plugin/src/ui/components/CommandPalette.tsx lines 263-271, 344-348, 543-544)

- [~] Server token route handlers have TOCTOU races between existence checks and mutations — getToken-then-createToken at tokens.ts:600-616 allows concurrent creates for the same path; snapshot captures (before/after) around group rename, batch move, and delete are taken outside any critical section so concurrent requests interleave between snapshot and mutation; the withLock protects individual store operations but not the multi-step route handler sequences (packages/server/src/routes/tokens.ts)
- [~] variableSync rollback is fragile: sequential failures silently leave partial Figma state and collection cleanup is O(n²) — rollback iterates variableSnapshots sequentially with individual try/catch that logs errors but continues, reporting success to the UI even when partial; collection cleanup at lines 146-154 re-fetches all collections AND all variables per iteration instead of fetching once; should use Promise.allSettled and report partial-rollback status to UI (packages/figma-plugin/src/plugin/variableSync.ts lines 119-154)
