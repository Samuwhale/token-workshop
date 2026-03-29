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
- [x] useVariableSync and useStyleSync share ~80% identical sync logic — both hooks implement the same pattern: fetch flat tokens, build local/figma maps, compute diff rows, filter push/pull, execute batch sync with progress tracking, and handle errors; the core diff-compute and batch-execute logic (~150 lines each) is nearly identical between useVariableSync.ts L77-183 and useStyleSync.ts L96-207; extract a shared `useTokenSyncBase` hook or utility that handles diff computation, push/pull separation, and progress tracking, with type-specific callbacks for the actual Figma API calls

- [x] Free-text search does not match token description content — `searchTokens` in `packages/server/src/services/token-store.ts` L936-938 only matches against path and leaf name (`lp.includes(qLower) || ln.includes(qLower)`); tokens with useful descriptions (e.g. "spacing used for card padding") cannot be found by description text; add description matching to the free-text search path, and consider adding a `desc:` qualifier for targeted description search
- [x] Themes view has two separate entry points for Resolvers creating navigation confusion — App.tsx L2007 exposes a standalone "Resolvers" tab alongside "Manage" and "Compare", while ThemeManager already embeds ResolverPanel inside its "advanced mode" toggle (App.tsx L8 comment: "ResolverPanel is now embedded inside ThemeManager's advanced mode"); users encounter the same resolver UI from two different paths with no guidance; remove the standalone "Resolvers" tab and keep only the ThemeManager-embedded version, or remove the embedded version and keep only the standalone tab
- [x] Heatmap scan is always limited to the current Figma page — `packages/figma-plugin/src/plugin/heatmapScanning.ts` L96 always walks `figma.currentPage.children` with no scope parameter; the consistency scanner (`consistencyScanner.ts` L49-55) already supports `scope: 'selection' | 'page'` as a pattern to follow; add "Scan all pages" and "Scan selection" scope options to HeatmapPanel so users working in multi-page files can see token coverage across the whole document
- [x] Export panel has no preview of generated output — ExportPanel.tsx provides platform export (CSS variables, JSON, Tailwind config, etc.) but users must download the ZIP to see what the output looks like; add a live preview pane that renders the generated file content for the selected platform before download, similar to how the generator dialog shows a preview of tokens before saving
- [~] No per-token history view — HistoryPanel.tsx shows full git commit and snapshot history but there is no way to filter by a specific token path to answer "what changed with `color.brand.primary` over time"; add a per-token history mode reachable from the token context menu ("View history") that filters the history timeline to only commits/snapshots that touched the selected token
- [~] Generator badge on derived tokens is not actionable — TokenTreeNode.tsx L1177-1192 shows a generator-name badge on derived tokens (tooltip: "Generated by X") but the badge has no click handler; clicking it should navigate to the Generators tab and open the generator's edit dialog, giving users a fast path from generated token → its source generator for editing parameters or regenerating
- [~] No way to filter the token list by generator — users can see which generator produced a token via the badge but cannot filter the list to show only tokens from a specific generator (e.g. "show all tokens from color-ramp-brand"); add a `generator:name` search qualifier that `filterTokenNodes` can evaluate against `derivedTokenPaths`, enabling focused review and bulk-editing of a generator's output
- [~] PublishPanel requires three separate "Apply" actions to fully sync to Figma and git — users who regularly push all changes (variables + styles + git commit) must click Apply in three independent sections; add a "Publish all" summary action button that checks all three sections for pending changes and applies them in sequence with a single confirmation, reducing a common 6-click flow to 2 clicks

- [~] [HIGH] themes.ts routes double-log operations and reference undeclared `beforeDims` — `withThemeLock()` (L111-135) already records an operation log entry, but 7 of 9 mutation routes (create/rename/delete dimension, upsert/rename/reorder/delete option) call `operationLog.record()` again after `withThemeLock` returns, doubling every theme operation in the log; worse, these second calls reference `beforeDims` which is only declared inside the reorder-dimensions route (L224), so all other routes throw ReferenceError at runtime — caught by the surrounding try/catch, returning 500 to the client even though the mutation already succeeded inside the lock, causing client to believe the operation failed while state was actually changed

- [~] Batch token mutation routes have no partial-failure rollback — `tokens.ts` batch-rename (L280-283), batch-move (L322-325), and batch-update (L240-242) all loop through items sequentially calling `renameToken`/`moveToken`/`updateToken` with no rollback if an iteration throws midway; the `before` snapshot is captured once upfront but if e.g. the 5th of 10 renames fails, the first 4 are already persisted to disk with no undo, and the operation log records neither a complete success nor the partial state, leaving the token set in an inconsistent state that the user can't undo via the operations panel
- [ ] Plugin sandbox controller.ts lacks message property validation before dispatch — `controller.ts` switch-cases directly destructure message properties (L80: `msg.tokenPath`, `msg.tokenType`; L116: `msg.tokenMap`; L139: `msg.width`/`msg.height`; L181: `msg.nodeIds`) with no checks that these properties exist or have correct types; a malformed message (e.g., `msg.width` as string) causes silent misbehaviour or plugin crashes, and `figma.ui.resize(msg.width, msg.height)` will throw if values are non-numeric; add a validation layer or type guards at the controller entry point rather than trusting every message shape
- [ ] core color-parse.ts uses non-null assertions on nullable `parseRawNum()` creating silent wrong-value bugs — L434-436 (rgb), L463 (oklch %), L472 (oklab %) use `parseRawNum(...)!` but `parseRawNum` returns `null` for unparseable strings; in JS `null / 255` evaluates to `0` (not NaN), so an unparseable rgb channel silently becomes 0 instead of returning null to indicate parse failure; the oklch case is worse: `parseRawNum(...)! / 100` yields 0, then `L === null` check at L466 passes (0 !== null), returning `{coords: [0, C, H]}` — a valid-looking but wrong color; replace all `!` assertions with explicit null checks before division
- [ ] resolver.ts `$extends` merge is type-unsafe and silently drops inheritance for non-object values — L307-316 only merge when both base and override are non-null non-array objects; if a composite token (typography, shadow) overrides a single sub-property via `$value: { fontSize: "18px" }` but the base resolved to a primitive (e.g., due to a resolution error), the entire base is silently discarded instead of producing an error; conversely, if the override is a primitive string but extends a composite base, the base is silently dropped; add type-matching validation between base and extending token's `$type` to catch these mismatches during resolution rather than producing silently wrong output
