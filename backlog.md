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

- [x] Generator pipeline cards show no "stale" indicator when the source token has changed since last run — generators have a `sourceToken` path and an `updatedAt` timestamp, but there is no tracking of whether the source token's value has changed since the generator was last run; after a generator runs and its source token is subsequently edited, the card shows no warning that the generated output is now out of date; add a "Needs re-run" badge or yellow border on generator cards when the source token's modification time is newer than the generator's `updatedAt`, with a tooltip explaining why (packages/figma-plugin/src/ui/components/GraphPanel.tsx GeneratorPipelineCard, packages/server/src/services/generator-service.ts)
- [x] Token editor drawer has no keyboard shortcut to navigate to the next/previous token — when reviewing or editing many tokens sequentially, users must close the drawer, click the next token in the list, and wait for the drawer to re-open; add Cmd+] / Cmd+[ (or arrow keys when focus is outside inputs) to advance to the next/previous sibling token in the list without closing the drawer, similar to how Figma's own inspect panel navigates between selected layers (packages/figma-plugin/src/ui/components/TokenList.tsx TokenEditor drawer integration)
- [x] PublishPanel.tsx readiness checks have no timeout for `varSync.readFigmaVariables()` at L164 — if the Figma plugin is unresponsive, `readinessLoading` stays `true` forever with no escape; add a timeout (e.g. 15 s) that sets an error state, matching the pattern established in ExtractTokensPanel
- [x] AnalyticsPanel.tsx contrast matrix uses non-normalized hex values — `colorTokens` (used by the matrix at L899) is built from raw `t.$value` strings without calling `normalizeHex()`, while `allColorTokens` does normalize; 3-char hex values like `#FFF` will cause `hexToLuminance` to return `null` (defaulting to 0 in the sort) and `wcagContrast` to return wrong ratios; fix by normalizing in the `allColors.push()` call at L221
- [x] GraphPanel.tsx handleDuplicate at L806 constructs `targetGroup` as `` `${generator.targetGroup}_copy` `` without checking whether `generator.targetGroup` is defined — if it is `undefined` or `null`, the duplicate gets a literal `targetGroup` of `"undefined_copy"` or `"null_copy"`, creating tokens under an invalid path; add a guard or fall back to the generator name

- [x] [HIGH] Multi-mode cell color editing uses `window.prompt()` which is blocked in Figma plugin sandbox — clicking a color swatch in multi-theme view to edit a color value silently does nothing inside Figma because sandboxed iframes block `prompt()`; fix by replacing the prompt with a hidden `<input type="color">` using the inline color picker trigger pattern already documented in codebase patterns (TokenTreeNode.tsx:68, `MultiModeCell` component)
- [x] [HIGH] `TokenGeneratorDialog` uses `window.confirm()` for its unsaved-changes guard — `window.confirm()` is blocked in Figma plugin sandbox so closing the dialog with edits in progress silently discards them with no warning to the user; replace with an in-app `<ConfirmModal>` using the same pattern as all other destructive confirmations in the app (TokenGeneratorDialog.tsx:229)
- [x] [HIGH] Import panel permanently stores duplicate-path warning text in the token's `$description` field — `if (t._warning) tok.$description = t._warning` at ImportPanel.tsx:806 writes the runtime warning ("Path conflict: multiple tokens share…") as the token's permanent `$description` in the database, overwriting any existing description; the warning should only be shown in the import UI, never stored in token data; remove the field from the POST body or write it to a separate `$extensions` key if a machine-readable flag is needed

- [x] `accessibleColorPair` and `darkModeInversion` generator types show no config editor in the generator dialog — both types appear in the "Advanced" collapsible section of `TokenGeneratorDialog` but selecting either one shows only the settings section title with no inputs below it; `contrastCheck` already has a dedicated `ContrastCheckConfigEditor`, add similar config editors for the other two types exposing their key parameters (`contrastLevel`, `backgroundStep`, `foregroundStep` for accessible pair; `stepName`, `chromaBoost` for dark mode inversion) (TokenGeneratorDialog.tsx:571-579, packages/figma-plugin/src/ui/components/generators/)
- [x] Rollback button in Recent Actions fires immediately with no confirmation — clicking "Rollback" on an operation entry in the History panel calls the rollback API instantly; for operations that touched many tokens (generator runs, bulk renames, set-level changes) this can revert a large amount of work without the user realising the scope; add a `ConfirmModal` showing the operation description and `affectedPaths.length` before executing (RecentActionsSource.tsx:254, useRecentOperations.ts:42)
- [x] No template in GraphPanel gallery for `darkModeInversion` or `accessibleColorPair` generator types — the Generators tab has 5 templates but none surface dark mode inversion or accessible color pair workflows; these are directly useful for teams building accessible dark-mode systems but are completely hidden behind the "Advanced" collapse in the generator dialog; add at least one template (e.g., "Dark mode palette" using `darkModeInversion`) to the `GRAPH_TEMPLATES` array so users browsing the gallery can discover these capabilities (GraphPanel.tsx:38)
- [x] ComparePanel (side-by-side token value diff) is only reachable by entering select mode — there is no "Compare" entry in the token context menu, no keyboard shortcut, and no entry point from the editor; add a "Compare selected…" context menu item that enters select mode with the token pre-selected and opens the compare panel, so users can start a comparison from a right-click without knowing about the hidden select-mode workflow (TokenList.tsx:1893, TokenTreeNode.tsx context menu)
- [x] TokenFlowPanel (dependency graph) has no "Show in Dependencies" shortcut from token context menu or editor — the Dependencies sub-tab shows a token's full reference graph but there is no right-click → "Show dependencies" or "Open in graph" action on a token row or in the editor; add a context menu item and/or an icon button in the editor that navigates to Apply > Dependencies with the current token pre-loaded as the starting node (TokenList.tsx, TokenFlowPanel integration in App.tsx:1981)
- [x] Set tabs have no visual indicator showing which sets are active/enabled/source in the current theme — when theme dimensions are applied, there is no visual distinction between sets that are enabled for the active option vs. sets that are inactive; power users editing theme-scoped tokens need to know at a glance which sets belong to the current theme context; add a small colored dot or subtle highlight on set tabs based on their status in `activeThemes` (App.tsx set tab rendering ~L1130)
- [x] Multi-select toolbar has no "Select all visible" button — in select mode the toolbar shows a count of selected tokens but there is no way to quickly select all currently-displayed leaf tokens in one click; users must click every token individually or use Shift+click, which is slow for bulk operations on a filtered subset; add a "Select all" button beside the count that selects all leaf nodes currently visible in the tree (respecting active search/filter) (TokenList.tsx select-mode toolbar ~L1820)

- [x] [HIGH] PublishPanel "Delete N orphan variables" fix button has no confirmation or preview — the `onFix` callback at PublishPanel.tsx:219 immediately dispatches `delete-orphan-variables` to the Figma plugin with no dialog showing which variable paths will be removed; since Figma variable deletion is irreversible and other design files may reference those variables, a confirmation modal listing the orphan paths is required before the deletion fires

- [x] Alias picker in TokenEditor silently truncates search results to 50 with no indicator — `candidates.slice(0, 50)` at TokenEditor.tsx:75-77 drops all matches beyond 50 without any "showing N of M" message; users with large token sets (e.g. 200 color tokens) searching for an alias target may not find it and have no way to know the list is incomplete; show a "N of M" count and allow the user to refine the search to surface the correct token
- [x] Recent operations are capped at 50 with no "load more" and no total count — `GET /api/operations` hard-caps at 50 entries (operations.ts:9) and returns no total count or hasMore flag; the HistoryPanel cannot indicate how many operations exist beyond what's shown; on a busy workday this means audit history beyond the last 50 server-side operations is inaccessible; return a total count from the API and add a "Load more" control to the panel
- [x] BatchEditor has no keyboard shortcut to submit — clicking "Apply" is the only way to commit batch changes; all other primary-action dialogs in the app support Cmd+Enter to confirm, but BatchEditor.tsx has no keydown handler for the submit action; add Cmd+Enter (or Enter when no text field is focused) to trigger Apply, consistent with the rest of the app
- [x] Set tab order can only be changed via drag-and-drop — there is no keyboard-accessible way to reorder token sets; users on trackpads or keyboard-only workflows must drag tabs to reorder them; add "Move left" and "Move right" actions to the set tab context menu (App.tsx ~L1214) as a non-drag alternative, matching the pattern used for token reordering
- [x] SelectionInspector deep inspect state resets on every panel remount — `deepInspect` is a plain `useState(false)` at SelectionInspector.tsx:186 that is not persisted to localStorage; every time the user switches panels or selects a different layer category, deep inspect silently turns off and they must re-enable it; persist the toggle to localStorage so it survives navigation, consistent with how other inspector toggles are handled
- [x] CommandPalette qualifier hint section shows only 6 of all available qualifiers — `QUERY_QUALIFIERS.filter(...).slice(0, 6)` at CommandPalette.tsx:404 renders an incomplete list; qualifiers like `generator:` and the full range of `has:` values are never shown; users who discover the qualifier system through the palette have no way to know what's available beyond the first 6 hints; either show all qualifiers or add a "more…" link that expands the section
- [~] TokenTableView inline description edits fail silently on error — when the user edits a description cell in the table view and the save request fails, the field reverts to the previous value with no error message or toast; the silent revert gives no indication that the change was lost, leading users to think the edit succeeded; show an error toast or inline error on failure, consistent with how the tree-view editor handles save failures
- [~] SettingsPanel color format preference change has no live preview — selecting a different color output format (hex, oklch, hsl, etc.) in Settings updates localStorage immediately but requires navigating back to the token list to see the effect; add a small "Sample output" block inline in the settings section showing a representative color value formatted in the currently selected format, so users can confirm the format before leaving settings
- [ ] Token create-from-selection (Cmd+T) gives no feedback when a token already exists at the chosen path — if the user picks a path that conflicts with an existing token, the request silently fails or overwrites without warning; add a check before or after the API call that distinguishes "created" from "overwritten" and surfaces a toast or confirmation so the user knows which happened (SelectionInspector.tsx quick-apply flow)
