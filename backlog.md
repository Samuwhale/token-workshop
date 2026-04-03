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


- [x] [HIGH] Color picker recent colors silently strip alpha channel — `const color = hex.slice(0, 7)` at ColorPicker.tsx:54 always discards the last two hex chars (alpha) when storing a color to the recent-colors history; tokens with transparency (8-char `#RRGGBBAA`) will have their alpha silently lost the next time the user picks that color from the recents swatch row

- [x] TokenList view mode (tree / table / JSON editor) is not persisted per set — `viewMode` is a plain `useState('tree')` at TokenList.tsx:441 with no localStorage backing; switching sets or returning from another tab resets the view to tree even when the user was working in table or JSON editor view; persist per-set in localStorage using the same `STORAGE_KEY` pattern as `tokenSort` and `tokenTypeFilter`
- [x] Dependent tokens in TokenEditor are displayed as an unclickable count — TokenEditor.tsx:1038 shows "N dependent tokens reference this token and may break" as static text only; users who want to understand the blast radius of a change must close the editor and search manually; expand into a clickable list (collapsible if long) that navigates to each dependent token, matching the pattern used for the "Show references" button
- [x] AliasAutocomplete shows raw `{alias}` value for candidate tokens that are themselves aliases — AliasAutocomplete.tsx:118-133 renders `entry.$value` directly; when the candidate token is itself a reference (e.g. `{color.palette.500}`), the preview shows another placeholder rather than the final resolved color or value; for multi-hop chains this makes it impossible to know what value you are actually picking; show the resolved final value (walking the chain via `resolveAliasChain`) alongside or instead of the raw value
- [x] JSON editor view has no Cmd+S keyboard shortcut — the save action in JSON view (TokenList.tsx:2757) requires clicking a button; all other primary save actions in the app support Cmd+Enter or a keyboard shortcut; add Cmd+S while `viewMode === 'json'` to trigger the save, consistent with how most text editors behave
- [x] No token type composition summary for a token set — there is no indicator anywhere showing how many tokens of each type a set contains (e.g. "42 color · 18 spacing · 5 typography"); this is basic metadata that power users need to audit sets, spot imbalances, and communicate scope; add a type-breakdown line to the set tab tooltip (or as a section in AnalyticsPanel's per-set view)
- [x] Theme live switcher shows no "tokens changed" count between options — when switching between theme dimension options, the token list silently refilters with no indication of how many tokens differ between options; a "12 tokens differ from default" label per option chip or a diff count badge on hover would help users understand the impact of each option without manually scanning the list (ThemeManager.tsx option switcher, CrossThemeComparePanel)
- [x] External token file changes trigger a silent full refresh with no change summary — when chokidar detects a file change and the server emits an SSE event, `useServerEvents` calls `onRefresh` and the UI reloads without showing what changed; users working with external editors (VS Code, git pull) have no way to know which tokens were updated; show a "N tokens updated" toast or briefly highlight the changed rows after an external-change refresh (useServerEvents.ts, App.tsx SSE refresh handler)
- [x] BatchEditor cannot set selected tokens to an alias reference — BatchEditor supports setting a raw value, scaling, find/replace, and type changes, but has no "set all to reference" mode; a common migration task is selecting a group of tokens with the same raw value (e.g. all direct `#1a73e8` colors) and converting them to reference a canonical alias token in one operation; add an "Alias" value-mode to BatchEditor that accepts a `{path}` reference and applies it to all selected tokens, similar to how TokenEditor's reference mode works
- [x] [HIGH] TokenEditor has no "unsaved changes" guard — closing the editor drawer (back button, tab switch, set change) while `isDirty` is true silently discards edits with no confirmation; add a "You have unsaved changes — discard or save?" confirmation before navigating away, consistent with how other destructive actions are guarded in the app (TokenEditor.tsx `isDirty` state, drawer close handler in App.tsx)
- [x] [HIGH] HistoryPanel has no redo — the operation log and undo stack are one-directional; after rolling back an operation there is no way to re-apply it; implement a redo stack that tracks rolled-back operations and exposes a "Redo" button and Cmd+Y shortcut alongside the existing "Undo" controls (HistoryPanel.tsx, useUndo.ts, operation-log.ts)
- [x] No unused token detection anywhere in the product — there is no view showing tokens that have zero usage in Figma designs (from `tokenUsageCounts`) AND are not referenced by any other token (no alias dependents); these are deletion candidates that accumulate silently as designs evolve; add an "Unused tokens" section to AnalyticsPanel or a `has:unused` qualifier to the search filter that surfaces tokens meeting both criteria
- [x] BatchEditor cannot batch-replace alias references — the existing find/replace operates on token paths only and has no mode to rewrite `$value` alias strings; a common migration task is renaming a canonical token from `{color.primary}` to `{brand.primary}` and needing all tokens that reference the old path updated in one shot; add an "Alias find/replace" sub-mode that targets `$value` strings matching a `{path}` pattern, distinct from the path-rename find/replace already present (BatchEditor.tsx ~L85)
- [x] ExportPanel cannot export a filtered subset of tokens — the export always includes all tokens in selected sets; power users need to export "only color tokens" or "only tokens in the spacing.* group" as separate files for platform-specific consumers; add type and path-prefix filters to the ExportPanel alongside the existing set selection, sending filter params to the export server route (ExportPanel.tsx set selection ~L215, export route)
- [x] ExportPanel single-file preview has no copy-to-clipboard button — users frequently want to paste generated CSS or JSON into another tool without downloading; the file preview pane shows content but requires a download to copy it; add a copy icon button on the preview pane header that writes the current file content to the clipboard (ExportPanel.tsx preview section ~L790)
- [x] SelectionInspector has no "apply to all matching properties" action — when the user binds a token to one fill/stroke/text property, there is no way to apply the same token to all other properties of the same type in the current selection in one click; add a "Apply to all [type] properties" button in the binding confirmation step so a user can bind `color.primary` to all three fill layers of a complex component at once (SelectionInspector.tsx ~L179)
- [x] [HIGH] ColorPicker token swatch panel strips alpha from 8-char hex colors — `colorTokens` useMemo at ColorPicker.tsx:355 uses `v.slice(0, 7)` on every hex value that matches `#[0-9a-fA-F]{6,8}`, silently discarding the alpha byte from `#RRGGBBAA` tokens; selecting such a token from the "browse tokens" swatch panel applies the wrong fully-opaque color (the recent-colors alpha fix at ~L54 was a separate code path and did not fix this instance)
- [x] [HIGH] handleMultiModeInlineSave and handleDetachFromGenerator in useTokenCrud.ts have no error handling — `handleMultiModeInlineSave` (useTokenCrud.ts:347) awaits an apiFetch without try-catch, so any network failure causes an unhandled promise rejection and still calls onPushUndo and onRefresh as if the save succeeded; `handleDetachFromGenerator` (useTokenCrud.ts:393) has the same missing try-catch on its PATCH call, meaning a failed detach silently calls onRefresh with no error toast, no operationLoading reset, and no user notification; both handlers should follow the try-catch/onError pattern already used by handleInlineSave and handleDescriptionSave in the same file
- [x] PreviewPanel ignores the active Theme Manager configuration — the live preview has only a hardcoded dark/light toggle (boolean) that swaps a CSS class; it has no connection to the actual theme dimensions and options defined in ThemeManager; users cannot preview "how does this component look in brand=Acme, mode=dark?" without manually switching the active theme in a separate tab; wire the preview panel to consume the active theme option selections from App state and apply them to the preview context (PreviewPanel.tsx ~L81, ThemeManager.tsx active theme state)
- [x] "Graph" tab label should be renamed to "Generators" — the top-level tab that houses the GraphPanel and token generator UI is labelled "Graph" in the navigation; new users have no way to know this is where token generators (color ramps, type scales, spacing scales) live; rename to "Generators" or "Generate" to match how the feature is described everywhere else in the UI and documentation (App.tsx tab definitions ~L203)
- [x] TokenEditor shows no dirty/unsaved indicator — the `isDirty` state is tracked internally but there is no visual signal to the user that they have uncommitted edits; the drawer header should show an "Unsaved" badge or asterisk (*) next to the token name when dirty, matching the convention used in code editors and preventing users from unknowingly leaving with lost changes (TokenEditor.tsx `isDirty` ~L581, drawer header)
- [x] HistoryPanel has no search within operations — the Recent Actions list can grow long and the only navigation is scrolling with "load more"; users who want to find "when was token X last changed?" must page through manually; add a text filter input above the operations list that filters entries by description or affected token path, similar to how the token filter banner works in TokenList (HistoryPanel.tsx ~L196, RecentActionsSource.tsx)
- [x] PreviewPanel cannot visualize shadow, gradient, or transition tokens — the preview templates (colors, type-scale, buttons, forms, card) do not include any token types from `shadow`, `gradient`, or `transition`/`animation`; users who heavily use these token types have no way to see live previews before applying to Figma; add a "Effects" preview template that renders shadow token swatches and transition timing demos, and add gradient swatches to the existing colors template (PreviewPanel.tsx template list ~L13)
- [~] Merge the HistoryPanel's three sub-tabs into a unified change timeline — "Recent Actions", "Git Commits", and "Snapshots" serve the same user goal (understand what changed and recover from mistakes) but exist as three disconnected views with different mental models; users must know which tab to check depending on how a change was made; replace the three-tab layout with a single chronological timeline that interleaves all three event types with visual type labels, while keeping the existing rollback and checkout actions per entry (HistoryPanel.tsx ~L177)
- [~] TokenTableView silently swallows invalid inline edit values with no user feedback — when the user types an invalid value and presses Enter, `commitEdit` at TokenTableView.tsx:148 returns early (`if (parsed === null) return`) without calling `setEditingCell(null)`, showing a validation error, or giving any indication why the input was rejected; the field appears to do nothing on Enter, which is confusing; should either show an inline red error message below the input or at minimum clear the editing state to avoid the silent-do-nothing UX
- [ ] Server GET /api/tokens/:set/dependents/* and /tokens/:set/group-dependents/* ignore the :set URL parameter — both routes at tokens.ts:484 and 498 declare a `:set` path param but never extract or use it; getDependents and getGroupDependents are called as global cross-set queries regardless of the set in the URL, so requests with a non-existent set name still return results instead of 404; the `:set` param should either be validated (404 if unknown) or removed from the route path to avoid the misleading API contract
- [ ] useGroupOperations group rename preview error silently falls through to executing the rename — when the rename-preview fetch fails (useGroupOperations.ts:102-104), the error is only logged to console and the code continues to call executeGroupRename without a confirmation dialog; this means a group rename that has alias dependents can proceed without showing the "N aliases will be updated" confirmation if the preview endpoint is temporarily unreachable, silently updating or breaking aliases across multiple sets; should show an error toast and abort instead of falling through when preview fails
