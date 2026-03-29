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


- [~] [HIGH] Color picker recent colors silently strip alpha channel — `const color = hex.slice(0, 7)` at ColorPicker.tsx:54 always discards the last two hex chars (alpha) when storing a color to the recent-colors history; tokens with transparency (8-char `#RRGGBBAA`) will have their alpha silently lost the next time the user picks that color from the recents swatch row

- [~] TokenList view mode (tree / table / JSON editor) is not persisted per set — `viewMode` is a plain `useState('tree')` at TokenList.tsx:441 with no localStorage backing; switching sets or returning from another tab resets the view to tree even when the user was working in table or JSON editor view; persist per-set in localStorage using the same `STORAGE_KEY` pattern as `tokenSort` and `tokenTypeFilter`
- [~] Dependent tokens in TokenEditor are displayed as an unclickable count — TokenEditor.tsx:1038 shows "N dependent tokens reference this token and may break" as static text only; users who want to understand the blast radius of a change must close the editor and search manually; expand into a clickable list (collapsible if long) that navigates to each dependent token, matching the pattern used for the "Show references" button
- [ ] AliasAutocomplete shows raw `{alias}` value for candidate tokens that are themselves aliases — AliasAutocomplete.tsx:118-133 renders `entry.$value` directly; when the candidate token is itself a reference (e.g. `{color.palette.500}`), the preview shows another placeholder rather than the final resolved color or value; for multi-hop chains this makes it impossible to know what value you are actually picking; show the resolved final value (walking the chain via `resolveAliasChain`) alongside or instead of the raw value
- [ ] JSON editor view has no Cmd+S keyboard shortcut — the save action in JSON view (TokenList.tsx:2757) requires clicking a button; all other primary save actions in the app support Cmd+Enter or a keyboard shortcut; add Cmd+S while `viewMode === 'json'` to trigger the save, consistent with how most text editors behave
- [ ] No token type composition summary for a token set — there is no indicator anywhere showing how many tokens of each type a set contains (e.g. "42 color · 18 spacing · 5 typography"); this is basic metadata that power users need to audit sets, spot imbalances, and communicate scope; add a type-breakdown line to the set tab tooltip (or as a section in AnalyticsPanel's per-set view)
- [ ] Theme live switcher shows no "tokens changed" count between options — when switching between theme dimension options, the token list silently refilters with no indication of how many tokens differ between options; a "12 tokens differ from default" label per option chip or a diff count badge on hover would help users understand the impact of each option without manually scanning the list (ThemeManager.tsx option switcher, CrossThemeComparePanel)
- [ ] External token file changes trigger a silent full refresh with no change summary — when chokidar detects a file change and the server emits an SSE event, `useServerEvents` calls `onRefresh` and the UI reloads without showing what changed; users working with external editors (VS Code, git pull) have no way to know which tokens were updated; show a "N tokens updated" toast or briefly highlight the changed rows after an external-change refresh (useServerEvents.ts, App.tsx SSE refresh handler)
- [ ] BatchEditor cannot set selected tokens to an alias reference — BatchEditor supports setting a raw value, scaling, find/replace, and type changes, but has no "set all to reference" mode; a common migration task is selecting a group of tokens with the same raw value (e.g. all direct `#1a73e8` colors) and converting them to reference a canonical alias token in one operation; add an "Alias" value-mode to BatchEditor that accepts a `{path}` reference and applies it to all selected tokens, similar to how TokenEditor's reference mode works
- [ ] No unused token detection anywhere in the product — there is no view showing tokens that have zero usage in Figma designs (from `tokenUsageCounts`) AND are not referenced by any other token (no alias dependents); these are deletion candidates that accumulate silently as designs evolve; add an "Unused tokens" section to AnalyticsPanel or a `has:unused` qualifier to the search filter that surfaces tokens meeting both criteria
