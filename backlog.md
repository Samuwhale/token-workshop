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

- [x] Three separate history/undo mental models with no unifying UI — users encounter local undo stack (Cmd+Z, 20-action limit, lost on refresh), server operation log (useRecentOperations fetches data but has no rendered UI), and git history/snapshots (HistoryPanel); there's no explanation of how these relate or when to use which; add a unified "Recent Actions" sidebar or panel that surfaces the operation log and connects it to the undo toast (useRecentOperations.ts, UndoToast.tsx, HistoryPanel.tsx)

- [x] [HIGH] Operation log has major coverage gaps and dead rollback code — 7 destructive server endpoints (group move/duplicate/reorder/create, group metadata update, single token move/copy) skip operationLog.record() making them impossible to undo; separately, rollbackStructural() and invertMetadata() at operation-log.ts:314-387 reference an undefined OperationMetadata type and non-existent entry.metadata field — dead code from an incomplete refactor that should be completed or removed (packages/server/src/routes/tokens.ts lines 88-159, 178, 488, 508; packages/server/src/services/operation-log.ts lines 314-387)
- [x] [HIGH] CommandPalette keyboard navigation fires wrong command in grouped (no-query) view — flatList used for ArrowDown/Enter is built from filteredCommands, but the section view highlights using sectionFlatItems.indexOf() which prepends Recent commands in different order; pressing Enter activates a different command than the one visually highlighted (packages/figma-plugin/src/ui/components/CommandPalette.tsx lines 263-271, 344-348, 543-544)

- [x] Server token route handlers have TOCTOU races between existence checks and mutations — getToken-then-createToken at tokens.ts:600-616 allows concurrent creates for the same path; snapshot captures (before/after) around group rename, batch move, and delete are taken outside any critical section so concurrent requests interleave between snapshot and mutation; the withLock protects individual store operations but not the multi-step route handler sequences (packages/server/src/routes/tokens.ts)
- [x] variableSync rollback is fragile: sequential failures silently leave partial Figma state and collection cleanup is O(n²) — rollback iterates variableSnapshots sequentially with individual try/catch that logs errors but continues, reporting success to the UI even when partial; collection cleanup at lines 146-154 re-fetches all collections AND all variables per iteration instead of fetching once; should use Promise.allSettled and report partial-rollback status to UI (packages/figma-plugin/src/plugin/variableSync.ts lines 119-154)

- [~] PublishPanel is a 2316-line monolith mixing three unrelated workflows — Variable sync, Style sync, and Git operations serve different user goals but are crammed into one scrollable panel with collapsible sections; decompose into three focused sub-panels (or sub-tabs within Ship > Publish) so users don't scroll past Git conflict resolution to find Figma sync (PublishPanel.tsx)
- [~] Variable push to Figma is fire-and-forget with no success or failure feedback — useVariableSync sends a postMessage to push variables but never reports whether the operation succeeded or how many were updated, unlike Style sync which returns detailed result metrics; users have no way to know if their push worked (useVariableSync.ts ~L60-70, PublishPanel.tsx)
- [~] SelectionInspector has no property-level filter — users inspecting complex layers with 20+ properties can't filter to "only unbound", "only colors", or search for a specific property name; they must scroll through everything to find what they need (SelectionInspector.tsx, PropertyRow.tsx)
- [~] Snapshot restore doesn't create an undo slot — restoring a git commit returns an operationId and creates a Cmd+Z undo slot, but snapshot restore calls the API directly without creating one, so "Revert to saved" cannot be undone; both should use the same pattern (HistoryPanel.tsx ~L832 vs ~L347-364)
- [~] PublishPanel "Publish all" flow silently skips merge conflicts — the sequential publish-all (Variables → Styles → Git commit) at lines 108-128 doesn't check for or handle merge conflicts before committing; if conflicts exist the git step fails with no clear error, breaking the one-click publish promise (PublishPanel.tsx ~L108-128)
- [~] ImportPanel Figma Variables mode silently overwrites without conflict UI — JSON/CSS/Tailwind imports show a full conflict resolution picker, but importing from Figma Variables uses strategy 'overwrite' directly with no preview or per-token accept/reject; this is inconsistent and risks silently clobbering hand-edited tokens (ImportPanel.tsx ~L592-637)
- [ ] OverflowPanel type has 5 dead values — 'heatmap', 'analytics', 'themes', 'theme-compare', and 'export' exist in the OverflowPanel union type but no rendering branch handles them; they're leftover from before these features became sub-tabs; remove from the type and any code that references them (App.tsx L230)
- [ ] No shared loading spinner component — each component (TokenList, ConfirmModal, PublishPanel, HeatmapPanel) implements its own spinner with different markup, sizes, and animation styles; extract a shared Spinner component for visual consistency across the plugin (scattered across 6+ components)
- [ ] ThemeManager coverage gap "Manual" items have no action — the coverage panel separates "Fillable" (auto-fill) from "Manual" fixes but Manual items just list missing tokens with no "Create missing token" button; users must leave ThemeManager, navigate to token creation, create the token, come back, and re-check coverage (ThemeManager.tsx ~L1580-1686)
- [ ] Style sync value previews are text-only with no color swatches — Variable sync diff rows show inline color swatch previews (DiffSwatch component) but Style sync diff rows only show truncated text like "Inter 18" via summarizeStyleValue(); add swatches for color styles and richer typography previews for consistency between the two sync sections (PublishPanel.tsx, useStyleSync.ts ~L9-23)
- [ ] TokenUsages component has no empty state — when a token has zero dependents and zero layer bindings, TokenUsages renders nothing instead of showing a helpful "No usages found" message; this leaves a blank section in TokenEditor that looks like a loading bug (TokenUsages.tsx ~L73-120)
