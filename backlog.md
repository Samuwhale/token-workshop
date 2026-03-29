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

- [~] No cross-theme token comparison view — there is no way to see how a single token (e.g. `color.action.primary`) resolves across all theme options simultaneously; users must manually switch themes in ThemeManager and note each value; add a "Compare across themes" action on the token context menu that opens a panel showing the resolved value per theme option in a table (TokenList.tsx context menu, new panel component)
- [~] No "move to set" or "copy to set" action for tokens and groups — moving a token or group to a different set requires deleting it from the source set and recreating it in the destination; the group context menu has no "Move to set…" or "Copy to set…" action; add both to the group and token context menus, backed by a POST `/api/tokens/:set/groups/*/move` server endpoint (TokenTreeNode.tsx context menu, packages/server/src/routes/tokens.ts)
- [ ] ThemeManager auto-fill has no preview step — clicking "Auto-fill" immediately creates alias tokens across sets with no summary of what will be created (how many tokens, in which sets, with what values); this is a potentially large write with no confirmation; show a modal listing the pending changes before executing, with a confirm/cancel choice (packages/figma-plugin/src/ui/components/ThemeManager.tsx auto-fill handler)
- [ ] ExportPanel set-filter has no select-all / deselect-all shortcut — users with 10+ sets must click each checkbox individually to include or exclude sets; add "Select all" / "Deselect all" links next to the set filter section header (packages/figma-plugin/src/ui/components/ExportPanel.tsx set selection section)
- [ ] HeatmapPanel status indicators have no legend or tooltips — the green/yellow/red binding-coverage dots have no in-UI explanation; new users cannot tell what each color means without reading the source code; add a compact legend below the summary stats row, or tooltips on the status icons (packages/figma-plugin/src/ui/components/HeatmapPanel.tsx)
- [ ] TypeScaleGenerator specimen preview clamps display to 9–52px, hiding large tokens — the live text preview applies `Math.min(52, Math.max(9, value))` so tokens above `display-xl` (64px+) all look the same size; users can't visually distinguish large heading tiers; remove the clamp or scale the specimen container proportionally so the true size ratio is visible (packages/figma-plugin/src/ui/components/generators/TypeScaleGenerator.tsx ~L145-146)
- [ ] Token search API has no pagination — `GET /api/tokens/search` truncates at 1000 results with no `offset` parameter; the client shows a "refine your query" message but there is no way to page through a large result set; add `limit` and `offset` query params to the search endpoint and a "Load more" button in any search result UI that shows a truncation indicator (packages/server/src/routes/tokens.ts ~L29, packages/figma-plugin/src/ui/components/CommandPalette.tsx)
