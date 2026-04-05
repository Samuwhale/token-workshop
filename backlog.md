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
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion

- [x] SelectionInspector property filter resets on every selection change — filter text and mode (bound/unbound/colors/dimensions) are cleared whenever the Figma selection updates; users working through multiple similar layers must re-type the same filter each time
- [x] ConsistencyPanel has no "apply all" for suggestions — each consistency suggestion must be applied one node at a time; when a suggestion matches 20+ layers there is no batch-apply action, making systematic cleanup tedious
- [x] HeatmapPanel shows coverage problems but offers no remediation path — red/yellow nodes are listed with their missing bindings but there is no "bind token" or "extract and bind" action inline; users must switch to SelectionInspector, find the node, and bind manually
- [x] [HIGH] Inline popover edits bypass undo stack — InlineValuePopover.tsx saves composite token changes (shadow, typography, border, gradient, transition) directly via onSave without calling pushUndo, making these edits irreversible unless the user opens the full TokenEditor; all other edit paths go through undo
- [x] No undo operation grouping — rapid sequential edits (e.g., renaming 5 tokens in a row, or batch editor sub-operations) each create separate undo entries in useUndo.ts; undoing a logical batch requires pressing Cmd+Z multiple times with no way to undo the group as one action
- [x] SettingsPanel is a single unstructured scroll — all settings (UI preferences, export defaults, lint config, undo limits, danger zone) live in one long panel with no tabs, sections, or search; finding a specific setting requires scrolling through the entire list
- [x] Token rename does not propagate to Figma variable names — renaming a token via the server API updates alias references and file paths but does not update the corresponding Figma variable's name; over time variable names drift from token paths, creating confusion during sync
- [x] DeepInspectSection cannot select child layers in the canvas — clicking a nested layer row in deep inspect mode shows its bindings but provides no way to select that layer in Figma for further inspection; the discovery loop ("see binding → inspect layer") is broken
- [x] CreatePanel does not allow setting description or metadata during creation — users must first create the token, then open the editor to add description, scopes, or extensions; this two-step workflow is friction for teams that require descriptions on all tokens (especially with the require-description lint rule enabled)
- [x] No import merge preview — ImportPanel's conflict detection shows that conflicts exist but not a side-by-side diff of local vs. incoming values; users must decide skip/overwrite/merge without seeing what will actually change per token

- [x] Consolidate duplicate lock classes: TokenLock and PromiseChainLock are identical promise-chain mutex implementations — TokenLock (packages/server/src/services/token-lock.ts) is used by token-store.ts and resolver-store.ts while PromiseChainLock (packages/server/src/utils/promise-chain-lock.ts) is used by 5 other services; one should be removed and all consumers unified on the other
- [x] 7 Style Dictionary exporters (css, scss, less, dart, ios-swift, android, json, typescript) duplicate the same ~20-line build-read-return boilerplate — each creates a StyleDictionary instance with one platform config, calls buildAllPlatforms, reads the output file, and returns it; extract a shared `buildWithStyleDictionary(ctx, platformKey, transformGroup, destination, format, sourceFile?)` helper in exporters/utils.ts and reduce each exporter to a 3-line config object
- [x] ConnectionContext bundles stable state (connected, serverUrl, checking) with frequently-changing sync state (syncProgress, syncResult) in a single useMemo context value — every sync progress message re-creates the context object and triggers re-renders in all 20+ consumers that only need connection status; split into ConnectionContext (stable) and SyncContext (sync-specific) or use separate useMemo values
- [x] Server routes have inconsistent top-level error handling — GET /api/sets (sets.ts:10) has no try-catch and will crash with an unhandled rejection if tokenStore.getSets() throws, while adjacent routes like GET /api/sets/:name properly wrap in try-catch + handleRouteError; audit all route handlers and ensure every one either uses try-catch + handleRouteError or a Fastify-level error hook
- [x] parseInt-based query parameter parsing uses `|| defaultValue` fallback which treats 0 as falsy — `parseInt(limit, 10) || 200` in tokens.ts:96 and operations.ts:10-11,30-31 returns the default when a client sends `?limit=0` or `?offset=0`; replace with `isNaN(parsed) ? default : parsed` pattern across all paginated endpoints
- [x] generator-service.ts silently swallows all token resolution and set-fetch errors via `.catch(() => null)` / `.catch(() => ({}))` at 6+ call sites (lines 652, 702, 732, 773, 822) — if resolution fails due to a real error (not just missing token), generators silently produce incorrect/empty output with no log entry; distinguish "not found" from "error" and log warnings for unexpected failures
- [x] Bulk create tab shows no success feedback — after creating N tokens via the bulk tab in CreatePanel.tsx, the form silently resets with no toast, no count of succeeded vs failed, and no per-row error indicators; the single-create tab correctly shows a success toast
- [x] No "Create & Open in Editor" action — after creating a token in CreatePanel, users must manually locate it in the token tree to edit metadata, scopes, or extensions; adding a "Create & Edit" button or auto-opening the editor after creation would eliminate this extra navigation step
- [x] Merge Apply > Components into Apply > Canvas Analysis — ComponentCoveragePanel scans components for hardcoded values (same concern as HeatmapPanel's layer binding coverage); both answer "what isn't tokenized?" and having them as separate sub-tabs splits a single workflow across two places; folding component coverage into CanvasAnalysisPanel as a third tab alongside Coverage and Suggestions would reduce navigation surface
- [x] Token search qualifiers are undiscoverable — powerful structured search (type:color, has:alias, has:unused, value:rgb, generator:colorRamp) is only accessible via ">" prefix in the command palette; the main token list search bar gives no hint about available qualifiers, so most users will never find them
- [x] Publish panel has no "Compare All" action — users must independently click Compare in the Variables accordion, then Compare in Styles, then check Git status; a single "Compare All" button that runs all three in parallel would save clicks and give a unified pre-publish overview
- [x] QuickStartWizard skips server connection and first set creation — the onboarding wizard jumps straight to generator templates, assuming the server is already connected and a token set exists; new users who haven't connected yet get no guided setup for these prerequisites
- [x] Undo/Redo keyboard shortcuts are not wired up — ⌘Z and ⌘⇧Z appear in the keyboard shortcuts modal (shortcutRegistry.ts) but are marked displayOnly with no handlers; pressing them does nothing, which is confusing since the undo system exists and works via the command palette and UI buttons
- [x] No batch keyboard shortcuts for multi-selected tokens — pressing M toggles multi-select mode but there are no keyboard shortcuts for common batch actions (delete, copy to set, move to set) on the selected tokens; users must right-click for the context menu
- [x] Resolver panel is accessible from two disconnected entry points — ResolverPanel is a standalone sub-tab (Define > Themes > DTCG Resolver via ⌘⇧R) and ThemeManager has an "advanced mode" toggle that embeds the same ResolverContent component; neither location mentions the other, so users may configure resolvers in one place and not find their work in the other
- [x] Dependencies sub-tab is only useful for a specific token but has no token pre-selected — Apply > Dependencies (TokenFlowPanel) shows alias chains for a single token, but opening the tab with no token selected shows an empty state; this flow would be more discoverable as an action from the token context menu or editor ("Show dependencies") rather than a standalone tab users must navigate to and then search for a token

- [x] Command palette token action buttons (Path, {ref}, Val, CSS, Dup, Ren, Mov, Del) are all `tabIndex={-1}` and mouse-only — keyboard users who navigate to a token with arrow keys cannot access any of these 8 actions; additionally the "Del" button fires `onDeleteToken` immediately with no confirmation dialog, and all copy actions (Path, {ref}, Val, CSS) close the palette without showing any "Copied" feedback, so the user can't tell the copy worked (violates: keyboard accessibility, destructive action safety, system status visibility)
- [~] Command palette qualifier help panel and autocomplete completions use `onMouseDown` + `tabIndex={-1}` exclusively — all filter syntax examples, qualifier chips, and autocomplete value buttons are unreachable via keyboard, meaning the structured token search feature (type:, has:, path:, value:, etc.) is effectively mouse-only despite being a power-user feature (violates: keyboard accessibility)
- [ ] HistoryPanel async operations swallow errors — `handleSaveSnapshot` has `try/finally` with no `catch` block so a failed save silently resets the UI as if it succeeded, and `handleRollback` similarly has no error state so a failed rollback just clears the loading spinner with no error message; additionally, successful snapshot saves show no toast or confirmation, just collapsing the input field — the user cannot distinguish success from a swallowed failure (violates: system status visibility, error prevention)
- [ ] GraphPanel result toasts (runAllResult, runStaleResult, runAllError, runStaleError) persist indefinitely until manually dismissed via a tiny 8×8 close button — there is no auto-dismiss timeout, and they stack vertically consuming space below the toolbar; meanwhile the "Re-run stale" button appears with a yellow warning style when generators are stale but provides no explanation of what "stale" means or what changed in the source tokens, requiring users to already understand generator dependency tracking (violates: system status visibility, help and documentation)
- [ ] Import conflict resolver presents three strategy buttons (Overwrite / Merge / Keep existing) with one-line explanations that use token-system jargon ("Value updated · description & extensions kept") — users unfamiliar with DTCG structure cannot make an informed choice, and the conflict detail list truncates at 60 items with "and N more…" and no way to expand, so users with large imports cannot review all conflicts before choosing a strategy (violates: recognition over recall, user control and freedom)
- [ ] Import token preview list (ImportTokenListView) has no search or text filter for individual tokens — if importing 100+ tokens, users must scroll through the entire list or use the coarse type-filter pills to find specific tokens; also, alias targets are shown only in HTML `title` tooltips (hover-only, invisible to keyboard/touch users), making it hard to understand token dependency relationships at a glance (violates: flexibility and efficiency of use, recognition over recall)
