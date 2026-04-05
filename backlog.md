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
- [x] [HIGH] TokenGroupNode memo comparator is incomplete and allows stale renders — the custom areEqual function at TokenTreeNode.tsx:759 only checks 5 of 11+ props (missing `isSelected`, `lintViolations`, `showFullPath`, `skipChildren`, `chainExpanded`, `multiModeValues`), AND the parent passes `lintViolations.filter(v => v.path === child.path)` at line 754 which creates a new array every render, so even if the comparator checked it, reference equality would always fail; fix the comparator and memoize/stabilize the filtered lintViolations
- [x] No "Publish only variables" or "Publish only styles" in the Publish All flow — PublishPanel's orchestrated publish (publishAllStep) always runs variables, styles, and git in sequence; users who only changed colors and want to sync variables must either use the individual accordion or run the full pipeline including git operations they don't need
- [x] Gradient editor has no visual builder — GradientEditor (ValueEditors.tsx ~L1378) renders gradient stops as raw form fields (position stepper + color hex input) with no draggable gradient bar, no visual stop reorder, and no live gradient preview strip; the linear-gradient CSS preview exists but is non-interactive
- [x] No inline alias editing for simple token types — MultiModeCell inline editing (TokenTreeNode.tsx ~L30-171) checks `!isAlias` at line 49 and skips alias tokens entirely; users must open the full editor to change what an alias points to, even for simple redirects like `{color.blue.500}` → `{color.blue.600}`
- [x] Publish sync compare always fetches all tokens for the active set — SyncSubPanel has no pre-compare filter (e.g., "compare only color tokens" or "compare only this collection"); for large token sets with hundreds of variables, the full diff is noisy and slow, making it hard to review specific areas of change
- [x] Option tabs in ThemeManager overflow without scroll indicators or dropdown fallback — dimensions with 15+ options render a horizontal scrollable list (ThemeManager.tsx ~L1020-1087) with no visible scroll arrows, no "more" dropdown, and no indication that tabs exist beyond the visible area; users may not realize additional options are available
- [x] No "extract to alias" action in token context menu — to refactor a literal value into a shared token + alias, users must: create a new token, copy the value, save it, then edit the original to reference the new token; a single "Extract to alias" context menu action would automate this common refactoring pattern
- [x] BatchEditor lacks sub-property targeting for composite tokens — batch color adjustments (lighten, darken, hue rotate) only work on color-type tokens; there's no way to batch-adjust the color sub-property of all shadow tokens or the fontSize sub-property of all typography tokens, forcing per-token edits for systematic changes
- [x] Server API response format is inconsistent across list endpoints — `/api/operations` returns `{ operations, total, hasMore }`, `/api/tokens/search` returns `{ results, total }`, `/api/sync/log` returns `{ commits, hasMore }`; standardize to a common pagination envelope like `{ data, total, hasMore, limit, offset }` so the UI can use a single fetch-and-paginate helper
- [x] ExportPanel has 41 useState calls and 8+ duplicate localStorage persistence useEffects — extract a `usePersistedState(key, initial)` hook or `usePersistentExportConfig` to replace the repeated `useState` + `useEffect(() => lsSet(KEY, val), [val])` pattern (each of the 8 storage keys has its own dedicated 3-line effect), and group related state (diff state, preset state, platform config) into domain hooks to reduce the 41 hooks to a manageable number
- [x] Server has 5 independent promise-chain mutex implementations with subtly different error semantics — `operation-log.ts:106`, `git-sync.ts:222`, `manual-snapshot.ts:64`, `themes.ts:68`, and `generator-service.ts:112` each implement `lockChain = next.then/catch(...)` inline; some swallow errors with `.catch(() => {})`, others use `.then(() => {}, () => {})`; extract a shared `PromiseChainLock` utility class and replace all 5 usages
- [x] Plugin sandbox variableSync rollback is all-or-nothing for the deletion phase — at variableSync.ts:192-225, if ANY single variable property restore fails (e.g., just the `scopes` setter on one variable), the entire deletion phase is skipped for ALL created variables, leaving orphan variables in the document; the logic should skip deletion only for the specific variables whose restore failed, not abandon cleanup for all created variables and collections
- [x] Duplicate composition-token resolution logic in TokenTreeNode — lines ~1056-1080 (`handleApplyToSelection`) and ~1160-1183 (`handleContextMenuApply`) contain identical 24-line blocks that resolve composite token sub-values by iterating properties and calling `resolveReference`; extract to a shared `resolveCompositeForApply(node, allTokensFlat)` helper in tokenListHelpers.tsx
- [x] Server resolver-store silently returns empty list on directory read errors — `resolver-store.ts:280-283` catches all `fs.readdir` errors with an empty `catch { return; }`, so permission errors, missing directories, or filesystem failures silently produce an empty resolver list with no log output; add structured logging so users can diagnose why resolvers aren't loading

- [x] Split ValueEditors.tsx (2,479 lines, 15+ editor components) into individual files — ColorEditor, TypographyEditor, ShadowEditor, DimensionEditor, etc. are all crammed into one file alongside color-math utilities; splitting would make each editor independently testable and navigable
- [x] No hover tooltip showing token description, type, and resolved value for simple tokens — alias chains show on hover but simple color/dimension tokens have no quick-info tooltip; users must right-click or open the editor to see metadata like description or type
- [x] Add skeleton/shimmer loading states for panels during initial data fetch — currently panels show either a full spinner or nothing while loading; no progressive content placeholders exist anywhere in the UI, making load times feel unresponsive
- [x] Import operations do not support undo — token creation, deletion, renaming, batch edits, and even drag-drop all push to the undo stack, but importing tokens (from file, Figma variables, or paste) cannot be undone; a large accidental import requires manual cleanup
- [x] No cross-set drag-and-drop for tokens — tokens can be dragged to reorder within a set or moved between groups, but dragging a token from one set tab to another is not supported; users must use the "Move to set" context menu action instead
- [x] Token tree has no depth indicator or condensed view for deeply nested groups — at 5+ nesting levels the indentation pushes content off-screen with no horizontal scroll affordance, no breadcrumb trail, and no option to collapse intermediate levels
- [x] No "recently used tokens" list or quick-access favorites — pinned tokens exist per-set but there is no cross-set "recent" list or starred/favorites concept; power users managing hundreds of tokens have no way to quickly return to tokens they were just editing
- [x] Keyboard shortcut for "Apply token to selection" is missing — the most common Figma workflow action (bind a token to the selected layer) is only accessible via context menu (V accelerator inside the menu); it should have a direct global shortcut
- [x] Publish readiness checks go stale silently after token edits — when tokens change after checks were run, results are marked "outdated" but no auto-recheck occurs; users must manually click "Re-check" and may unknowingly publish with stale validation
- [x] No platform export preview — exporting to CSS/Swift/Android/Dart runs immediately without showing users what will be generated; only server-save has a preview step; users should be able to see generated code before downloading
- [x] Token usage tracking does not include theme/resolver assignment — "Where is this token used?" shows Figma layer bindings, variable bindings, and alias dependents, but not which theme options or resolver configurations include the token; tokens may appear "unused" when they are critical to a theme
- [x] No centralized keyboard shortcut registry — shortcuts are scattered across 19+ files with individual addEventListener calls; there is no conflict detection, no single list of all shortcuts, and no way to discover or customize bindings; a central registry (similar to STORAGE_KEYS for localStorage) would unify registration, enable a "keyboard shortcuts" reference panel, and prevent accidental conflicts

- [x] Token row hover action buttons are invisible to keyboard users — TokenTreeNode.tsx:1883 uses `hidden group-hover:flex` without `group-focus-within` (unlike the group-level actions at line 500 which correctly use both `group-hover/group:flex group-focus-within/group:flex`), so keyboard users who Tab/arrow to a token row cannot see or reach Edit, Pin, Copy, Move, or More Actions buttons; the inconsistency between group and token rows compounds the issue (violates: keyboard accessibility, consistency)
- [x] Token context menu lacks arrow-key navigation — the group-level context menu (TokenTreeNode.tsx:309) calls `handleMenuArrowKeys(e, menuEl)` for Up/Down/Home/End keyboard navigation, but the token-level context menu (TokenTreeNode.tsx:972-983) only handles Escape and accelerator letters with no arrow-key support at all; keyboard users must Tab through 20+ menu items instead of arrowing through them (violates: consistency, keyboard accessibility)
- [x] Inconsistent success feedback across operations — CreatePanel token creation (line 506-535), generator creation (useGeneratorSave.ts:174), theme option deletion (useThemeOptions.ts:232-273), and theme dimension deletion (useThemeDimensionsCrud.ts:230-273) complete silently with no toast or confirmation; by contrast ExportPanel shows a toast for every action and TokenEditor shows "Token saved" toasts; users performing repeated create-edit cycles cannot tell if operations succeeded without checking the tree (violates: system status visibility, consistency)
- [x] PreviewPanel color swatches and value labels are clickable divs/spans without button semantics — ColorSwatch (PreviewPanel.tsx:610-614) and GradientSwatch (PreviewPanel.tsx:659-663) use `<div onClick>` and `<span onClick>` for copy-to-clipboard interactions without `role="button"`, `tabIndex="0"`, or `onKeyDown` handlers; keyboard users cannot activate these elements and screen readers do not announce them as interactive (violates: keyboard accessibility, semantic HTML)
- [x] PreviewPanel and TokenList have hover-only buttons unreachable by keyboard — the navigate-to-token button on color/gradient swatches (PreviewPanel.tsx:622-631, 671-680) uses `opacity-0 group-hover:opacity-100` without `group-focus-within:opacity-100`; same issue at TokenList breadcrumb collapse (line 3354) and navigate buttons (line 4042); these actions exist but are completely undiscoverable and unusable via keyboard (violates: keyboard accessibility, discoverability)
- [x] SettingsPanel has no loading or success feedback for import/export — settings import (SettingsPanel.tsx:314-394) shows no spinner during JSON parsing and no success toast after applying; settings export is fully silent with no confirmation; compared to ExportPanel and ImportPanel which have comprehensive loading/success/error states, SettingsPanel feels incomplete (violates: system status visibility, consistency)

- [x] TokenFlowPanel dependency nodes are not navigable — clicking an upstream or downstream node in the dependency graph (TokenFlowPanel.tsx) doesn't re-center the flow on that token; users must manually search for the next token to trace a chain, breaking the browsing experience for deep alias hierarchies
- [~] No preview before snapshot restore or operation rollback — HistoryPanel's "Restore" and "Rollback" actions (SnapshotsSource.tsx, useRecentOperations.ts) execute immediately with no diff preview showing what tokens will change; for large snapshots this is a blind, high-risk action
- [ ] Reading Figma gradient styles is lossy — readFigmaStyles in styleSync.ts reduces multi-stop gradients to first-stop color on import; gradient data is silently discarded, meaning round-tripping gradient tokens through Figma styles loses the design intent
- [ ] SelectionInspector property filter resets on every selection change — filter text and mode (bound/unbound/colors/dimensions) are cleared whenever the Figma selection updates; users working through multiple similar layers must re-type the same filter each time
- [ ] ConsistencyPanel has no "apply all" for suggestions — each consistency suggestion must be applied one node at a time; when a suggestion matches 20+ layers there is no batch-apply action, making systematic cleanup tedious
- [ ] HeatmapPanel shows coverage problems but offers no remediation path — red/yellow nodes are listed with their missing bindings but there is no "bind token" or "extract and bind" action inline; users must switch to SelectionInspector, find the node, and bind manually
- [ ] No undo operation grouping — rapid sequential edits (e.g., renaming 5 tokens in a row, or batch editor sub-operations) each create separate undo entries in useUndo.ts; undoing a logical batch requires pressing Cmd+Z multiple times with no way to undo the group as one action
- [ ] SettingsPanel is a single unstructured scroll — all settings (UI preferences, export defaults, lint config, undo limits, danger zone) live in one long panel with no tabs, sections, or search; finding a specific setting requires scrolling through the entire list
- [ ] Token rename does not propagate to Figma variable names — renaming a token via the server API updates alias references and file paths but does not update the corresponding Figma variable's name; over time variable names drift from token paths, creating confusion during sync
- [ ] DeepInspectSection cannot select child layers in the canvas — clicking a nested layer row in deep inspect mode shows its bindings but provides no way to select that layer in Figma for further inspection; the discovery loop ("see binding → inspect layer") is broken
- [ ] CreatePanel does not allow setting description or metadata during creation — users must first create the token, then open the editor to add description, scopes, or extensions; this two-step workflow is friction for teams that require descriptions on all tokens (especially with the require-description lint rule enabled)
- [ ] No import merge preview — ImportPanel's conflict detection shows that conflicts exist but not a side-by-side diff of local vs. incoming values; users must decide skip/overwrite/merge without seeing what will actually change per token
