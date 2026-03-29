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

- [x] No "find usages" for tokens — there is no way to discover which other tokens alias a given token, which Figma variables bind to it, or which generators produce it; add a "References" section to the token editor panel showing incoming aliases, variable bindings, and generator sources so users understand the impact of changes before making them

- [x] BatchEditor has no bulk metadata operations — BatchEditor.tsx supports type change, value scaling, move, rename, and delete, but cannot bulk-set description, Figma scopes, or extensions across selected tokens; adding bulk description and scope editing would save significant manual work for teams preparing tokens for Figma variable publishing
- [x] PreviewPanel elements don't link back to token definitions — clicking a color swatch or type scale item in PreviewPanel.tsx copies the CSS variable value but doesn't offer navigation to the source token in the token list; add a "Go to token" action on preview elements so users can quickly edit the token they're previewing
- [x] ComparePanel feature is undiscoverable — the multi-token comparison view (ComparePanel.tsx) only appears when 2+ tokens are selected, with no UI hint that this capability exists; add a "Compare" button to the token context menu or batch actions toolbar so users can discover side-by-side token comparison
- [x] HistoryPanel and PublishPanel duplicate Section component, formatRelativeTime, ColorSwatch, statusColor/statusLabel/summarizeChanges helpers, and ChangeSummaryBadges — HistoryPanel.tsx L21-103 and PublishPanel.tsx L43-77 contain near-identical implementations of Section (collapsible wrapper) and formatRelativeTime (date formatting), plus HistoryPanel has statusColor, statusLabel, summarizeChanges, formatTokenValue, ColorSwatch, ChangeSummaryBadges that are also used/duplicated in PublishPanel's SyncDiffSummary and GitPreviewModal; extract these into a shared UI utility module (e.g., `shared/changeHelpers.tsx`) to eliminate ~150 lines of duplication
- [~] 95 bare `catch {}` blocks across 33 UI files silently swallow errors — TokenList.tsx alone has 14 empty catch blocks (localStorage reads, API calls, JSON parsing); hooks like useGitConflicts.ts L47, useGitStatus.ts L58, useLintConfig.ts (3 instances), and useSetTabs.ts (2 instances) catch and discard errors with no logging or user feedback; audit all 95 `catch {}` occurrences and add at minimum console.warn for debugging, and toast/inline error state for user-facing operations like API calls and sync actions
- [~] useVariableSync and useStyleSync share ~80% identical sync logic — both hooks implement the same pattern: fetch flat tokens, build local/figma maps, compute diff rows, filter push/pull, execute batch sync with progress tracking, and handle errors; the core diff-compute and batch-execute logic (~150 lines each) is nearly identical between useVariableSync.ts L77-183 and useStyleSync.ts L96-207; extract a shared `useTokenSyncBase` hook or utility that handles diff computation, push/pull separation, and progress tracking, with type-specific callbacks for the actual Figma API calls

- [x] Free-text search does not match token description content — `searchTokens` in `packages/server/src/services/token-store.ts` L936-938 only matches against path and leaf name (`lp.includes(qLower) || ln.includes(qLower)`); tokens with useful descriptions (e.g. "spacing used for card padding") cannot be found by description text; add description matching to the free-text search path, and consider adding a `desc:` qualifier for targeted description search
- [~] Themes view has two separate entry points for Resolvers creating navigation confusion — App.tsx L2007 exposes a standalone "Resolvers" tab alongside "Manage" and "Compare", while ThemeManager already embeds ResolverPanel inside its "advanced mode" toggle (App.tsx L8 comment: "ResolverPanel is now embedded inside ThemeManager's advanced mode"); users encounter the same resolver UI from two different paths with no guidance; remove the standalone "Resolvers" tab and keep only the ThemeManager-embedded version, or remove the embedded version and keep only the standalone tab
- [~] Heatmap scan is always limited to the current Figma page — `packages/figma-plugin/src/plugin/heatmapScanning.ts` L96 always walks `figma.currentPage.children` with no scope parameter; the consistency scanner (`consistencyScanner.ts` L49-55) already supports `scope: 'selection' | 'page'` as a pattern to follow; add "Scan all pages" and "Scan selection" scope options to HeatmapPanel so users working in multi-page files can see token coverage across the whole document
- [~] Export panel has no preview of generated output — ExportPanel.tsx provides platform export (CSS variables, JSON, Tailwind config, etc.) but users must download the ZIP to see what the output looks like; add a live preview pane that renders the generated file content for the selected platform before download, similar to how the generator dialog shows a preview of tokens before saving
- [~] No per-token history view — HistoryPanel.tsx shows full git commit and snapshot history but there is no way to filter by a specific token path to answer "what changed with `color.brand.primary` over time"; add a per-token history mode reachable from the token context menu ("View history") that filters the history timeline to only commits/snapshots that touched the selected token
- [ ] Generator badge on derived tokens is not actionable — TokenTreeNode.tsx L1177-1192 shows a generator-name badge on derived tokens (tooltip: "Generated by X") but the badge has no click handler; clicking it should navigate to the Generators tab and open the generator's edit dialog, giving users a fast path from generated token → its source generator for editing parameters or regenerating
- [ ] No way to filter the token list by generator — users can see which generator produced a token via the badge but cannot filter the list to show only tokens from a specific generator (e.g. "show all tokens from color-ramp-brand"); add a `generator:name` search qualifier that `filterTokenNodes` can evaluate against `derivedTokenPaths`, enabling focused review and bulk-editing of a generator's output
- [ ] PublishPanel requires three separate "Apply" actions to fully sync to Figma and git — users who regularly push all changes (variables + styles + git commit) must click Apply in three independent sections; add a "Publish all" summary action button that checks all three sections for pending changes and applies them in sequence with a single confirmation, reducing a common 6-click flow to 2 clicks
