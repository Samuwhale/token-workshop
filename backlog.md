# UX Improvement Backlog
<!-- Status: [ ] todo  [~] in-progress  [x] done  [!] failed validation -->
<!-- Goal: no new features — only improve what already exists -->

## Agent Workflow Instructions

Agents may pick up items from this backlog and work autonomously.

**States:** `[ ]` todo · `[~]` in-progress · `[x]` done · `[!]` failed validation

**Workflow per item:**
1. Mark `[~]` as your **first file write**, before touching any source files.
2. Check: is any item in the same file region currently `[~]`? If yes, pick a different item. (Known hotspot: `TokenList.tsx ~L1700–2010` — group hover, row hover, delete button, copy icons. Treat as a sequence.)
3. Assess complexity:
   - **Simple** (single file, change is obviously scoped): plan inline, execute, validate.
   - **Complex** (multi-file, behaviour change, or unclear scope): dispatch a plan subagent first, review the plan, then execute.
4. Validate before marking `[x]`:
   - Any file changed → run build, confirm no new errors
   - UI class or markup added → grep for it in the output
   - Behaviour changed → logic review via subagent
   If validation fails: revert your source file changes, mark `[!]`, add a progress note.

**Session sizing:**
- Small, unrelated items may be batched in one session.
- Large items may span sessions — leave `[~]` with a progress note and continue next session.
- Stop between items when context is filling up or when the next item touches files you just modified.

**Progress notes** (required whenever leaving an item as `[~]` or `[!]`):
```
<!-- progress: <date> | status: partial|failed | done: … | remaining: … | blocker: … -->
```

**General rules:**
- Partial work is fine — do not revert unless validation failed.
- If a fix requires more context than is available, skip it and leave it `[ ]`.
- Prefer the smallest safe change.

## Cat 1: Discoverability & Affordance

- [ ] **Group actions invisible** — Group hover only shows delete; rename/move/duplicate/scopes/sync are right-click only with no hint. Add a `⋯` button on group hover that opens the same menu. `TokenList.tsx` ~L1715 group render
- [ ] **Type badge has no affordance** — Clicking type pill filters list but cursor/hover state don't signal interactivity. Add `cursor-pointer`, visible hover bg, tooltip "Click to filter by {type}". `TokenList.tsx` ~L1882
- [x] **"By usage" sort is a dead end** — Disabled option with no nearby trigger. Remove until ready, or add a scan button adjacent to sort dropdown. `TokenList.tsx` ~L832
- [ ] **Command palette undiscoverable** — `⌘K` only; no button or hint in UI. Add a search/command icon in the tab bar header with shortcut label. `App.tsx` ~L234
- [ ] **Theme state cycling invisible** — Click-to-cycle (disabled→enabled→source) has no affordance. Replace with an explicit select/segmented control per row; add a legend explaining the three states. `ThemeManager.tsx` ~L130
- [ ] **Settings panel has no Back button** — Import and Export panels have `← Back` headers; the Settings panel (`overflowPanel === 'settings'`) does not. Users must click a tab to escape. `App.tsx` ~L807
- [ ] **"Create sibling" only discoverable via right-click** — The action is in the token context menu but absent from the hover action bar. Users who don't right-click will never find it. `TokenList.tsx` ~L2040
- [ ] **Set tab bar has no overflow indicator** — With many sets, tabs overflow with `overflow-x-auto` but no fade, arrow, or count signals that more tabs exist off-screen. `App.tsx` ~L621
- [ ] **Theme states have no legend** — The three states (disabled/enabled/source) have no explanation anywhere on the page. "Source" especially is not self-explanatory. `ThemeManager.tsx` ~L211
- [ ] **Analytics tab has no issue-count badge** — No indicator on the "Analytics" tab label or in collapsed section headers shows pending validation errors. Users must navigate to the tab and run validation to discover issues.
- [ ] **Command palette searches labels only, not descriptions** — `fuzzyScore(query, cmd.label)` ignores the `description` field. Commands whose relevant keywords live in their description are invisible to search. `CommandPalette.tsx` ~L57
- [x] **Apply as Variables vs Styles unexplained** — Two equal-weight buttons, no differentiation. Add `title` tooltips explaining each. `TokenList.tsx` ~L1139

## Cat 2: Layout Instability & Hover Jank

- [ ] **Token row hover actions shift layout** — 5 buttons appear inline and push content on hover. Reserve fixed-width space with `opacity-0 group-hover:opacity-100` so no layout shift. `TokenList.tsx` ~L1965
- [ ] **Group hover delete causes accidental deletes** — Delete is the only hover action. Replace with a `⋯` menu; delete becomes a menu item. `TokenList.tsx` ~L1715
- [ ] **Set tab ⋯ inconsistently visible** — Inactive tabs show button only on hover; active always shows it. Ensure no layout shift between states. `App.tsx` ~L654
- [ ] **Token hover actions flicker at the cursor gap** — When moving the mouse from the token name into the action button area, the cursor briefly exits the group boundary, resetting `hovered` state and causing the buttons to disappear then reappear. Reserve the hover zone to include the full row. `TokenList.tsx` ~L1953
- [ ] **Table mode renders full bottom action bar redundantly** — In table mode the entire bottom bar (New Token, Use preset, Multi-select, Find & Replace, Apply as Variables, Apply as Styles) stays visible. The table is a read/navigate view; the bar should collapse to just Apply as Variables/Styles. `TokenList.tsx` ~L1084

## Cat 3: IA & Labeling

- [x] **"Select" is ambiguous** — Reads as text-select. Rename to "Multi-select" or "Select tokens". `TokenList.tsx` ~L1119
- [ ] **Complex types show raw JSON in value column** — Shadow/typography/gradient show truncated JSON. Show human-readable summary (e.g., "16px / 400 / Inter" for typography). `TokenList.tsx` `formatValue()` + ~L1908
- [ ] **Toolbar: mode toggles look like one-shot actions** — Bound tokens/Table are modes; Expand/Collapse are actions. Give modes a distinct pressed/active appearance. `TokenList.tsx` ~L786
- [ ] **Disabled set menu items unexplained** — "Generate Semantic Tokens" etc. appear first in the menu, greyed out, no tooltip. Move to bottom or add prerequisite tooltip. `App.tsx` ~L687
- [ ] **Mode toggles look identical to action buttons** — "Bound tokens" and "Table" (modes) sit unseparated from "Expand all" and "Collapse all" (actions) in the toolbar. All four use the same text-button style. Modes should be visually grouped/separated from one-shot actions. `TokenList.tsx` ~L757
- [ ] **Non-default sort order has no indicator** — When sorted by type or A→Z, nothing in the toolbar signals this. The inline `<select>` is easy to overlook. Add a tint or badge to the sort control when it's not "Default order". `TokenList.tsx` ~L790
- [ ] **Theme "uncovered" badge uses unexplained jargon** — "⚠ N uncovered" is cryptic. The meaning is "N tokens have no resolved value from any active set in this theme." Reword to "⚠ N tokens have no value" or similar. `ThemeManager.tsx` ~L194
- [ ] **Duplicate count badge `×N` reads as a multiplier** — `×2` conventionally means "times 2." The intent is "2 tokens share this value." Change to `2 shared` or `dup ×2`. `TokenList.tsx` ~L1904
- [ ] **Lint violation badges have no legend** — The `✕`/`⚠`/`ℹ` dot-buttons are only explained on hover. No legend exists. Users won't know they're interactive fix triggers. `TokenList.tsx` ~L1910
- [ ] **"Find & Replace" preview doesn't highlight the changed segment** — Old path (strikethrough) and new path are shown side by side, but neither highlights *which* segment mutated. For long paths this requires manual character-by-character comparison. `TokenList.tsx` ~L1326
- [ ] **Theme empty state doesn't explain what themes are for** — "No themes configured / Themes control which token sets are active" is too thin. New users won't understand themes enable multi-mode Figma variables. Add a one-sentence explanation and a link or hint. `ThemeManager.tsx` ~L177
- [ ] **"Bound tokens" mode label is misleading** — Sounds like it shows all tokens that have any bindings. Actual behavior: filters to tokens bound to the *currently selected layer*. Clearer: "Show for selection" or "Selection filter". `TokenList.tsx` ~L774
- [ ] **"Source" theme state has no definition anywhere** — "disabled" and "enabled" are obvious; "source" (base/override set) is not. Add a tooltip or inline note explaining what source means. `ThemeManager.tsx` ~L211
- [x] **"via 2" alias chain badge is cryptic** — Change to "2 hops"; tooltip shows full chain. `TokenList.tsx` ~L1959
- [ ] **Sync controls show below collapsed inspector** — "Sync Page" button visible when inspector says "Select a layer". Move sync controls inside collapsed body or hide when irrelevant. `SelectionInspector.tsx` ~L238
- [x] **Import/Export have no back button** — Panel replaces content area with no exit affordance. Add a `← Back` header matching the TokenEditor pattern. `App.tsx` ~L778; `ImportPanel.tsx`, `ExportPanel.tsx`

## Cat 4: Interaction & State

- [ ] **TokenEditor discards unsaved edits silently** — Escape/Cancel navigates back without warning. Track dirty state; show "Discard changes?" confirm if dirty. `TokenEditor.tsx` ~L107
- [ ] **New set name lost on blur** — Clicking outside cancels and discards typed text. Don't reset `creatingSet` on blur if value is non-empty; or at least preserve the value. `App.tsx` ~L755
- [x] **Broken alias error is a 2s flash only** — Flash red then row looks normal. Show persistent inline error or route user to lint panel. `TokenList.tsx` ~L1604
- [x] **Collapse toggles use ▲/▼ text chars** — Inconsistent with SVG chevrons used everywhere else. Replace with the same SVG chevron pattern. `TokenEditor.tsx` ~L275, ~L354
- [ ] **Alias mode toggle doesn't communicate token's alias status** — When token IS an alias, the form doesn't emphasize that. Make the resolved alias chain the primary visual focus when `aliasMode` is true. `TokenEditor.tsx` ~L185
- [x] **Context menus can go off-screen** — Raw mouse coords used for positioning. Clamp to `window.innerWidth/Height - menuWidth/Height`. `TokenList.tsx` `contextMenuPos`, `groupMenuPos`; `App.tsx` `tabMenuPos`
- [ ] **Group rename confirms on blur** — No way to cancel by clicking outside. Restore original on empty/unchanged input; don't confirm-on-blur if Escape was pressed. `TokenList.tsx` ~L1702
- [ ] **Delete adjacent to Edit in hover actions** — A misclick deletes the token. Add a spacer/divider between Edit and Delete, or move Delete to context menu only. `TokenList.tsx` ~L2006
- [ ] **Token type cannot be changed after creation** — The type badge in `TokenEditor` header is display-only. Wrong-type tokens require delete + recreate. Add a type selector to the editor form. `TokenEditor.tsx` ~L166
- [ ] **"Cancel" in TokenEditor footer is wrong label when form is pristine** — "Cancel" implies an active operation. When no changes have been made the button should say "Back"; only show "Cancel" (or "Discard") after edits exist. `TokenEditor.tsx` ~L391
- [ ] **Alias autocomplete: Escape closes the editor instead of the dropdown** — The global `keydown` handler fires `onBack()` on Escape. When the autocomplete is open, Escape should close just the dropdown first. `TokenEditor.tsx` ~L106
- [ ] **Theme rename is impossible** — Theme cards only have a delete button. To rename a theme you must delete and recreate it, losing all set-state configuration. Add a rename option to the theme header menu. `ThemeManager.tsx` ~L186
- [ ] **No way to duplicate a single token** — "Duplicate group" exists in the group context menu, but individual token duplication is absent from both hover actions and the token context menu. `TokenList.tsx` ~L1700
- [ ] **"Create token from property" in SelectionInspector has no navigation** — After creating and binding a token from a layer property, the UI silently closes the creation form. There's no "View token" affordance. `SelectionInspector.tsx` ~L188

## Cat 5: Empty & Loading States

- [ ] **Loading states are text-only** — No spinner. Add a consistent loading indicator (CSS animation) reused across all loading states. `ThemeManager.tsx` ~L161, `SyncPanel.tsx` ~L388, `TokenEditor.tsx` ~L144
- [ ] **Component coverage scan fails silently** — The catch block has `// silently fail`; the loading spinner just disappears on timeout or error with no message shown. `AnalyticsPanel.tsx` ~L119
- [ ] **Sync panel git status has no manual refresh** — Status is fetched once on panel open and only updates after performing an action. There's no visible refresh button for picking up external changes. `SyncPanel.tsx` ~L87
- [x] **No empty state when filters return zero results** — List just goes blank. Show "No tokens match your filters" + "Clear filters" button when `displayedTokens.length === 0 && filtersActive`. `TokenList.tsx` ~L1001
- [x] **Empty token set uses a clock icon** — Clock has no semantic relationship to "empty". Use a box/plus icon matching the create-token action. `TokenList.tsx` ~L934

## Cat 6: Micro-interactions

- [ ] **Copy path vs copy value icons indistinguishable at 10px** — Use distinct icons (e.g., `</>` for CSS var, clipboard for value). `TokenList.tsx` ~L1976
- [ ] **Sync-changed dot has no legend** — Orange dot is mysterious on first encounter. When any sync-changed indicators exist, show a note in the toolbar: "N tokens changed since last sync". `TokenList.tsx` ~L1873
- [ ] **ΔE score unexplained in Convert to Aliases modal** — Replace/supplement with qualitative label ("Exact", "Close", "Approximate"). Keep raw number in tooltip. `TokenList.tsx` ~L1399
- [x] **Three things share the `⋯` ellipsis symbol** — Global overflow menu, set tab action, and more-filters all use `⋯`. Use a funnel/filter icon for more-filters; keep `⋯` for menus only. `TokenList.tsx` ~L892, `App.tsx` ~L554
- [x] **Active filter bar tint nearly invisible** — `accent/8` on dark bg is imperceptible. Increase to `/20` or add a visible "Filtered" badge in the bar. `TokenList.tsx` ~L840
- [x] **Connection error has no action** — "Server offline" banner is purely informational. Add inline "Settings" link or "Retry" button. `App.tsx` ~L527
- [ ] **Group scope editor is a bottom sheet** — All other modals are centered. Convert to standard centered modal. `App.tsx` ~L955
- [ ] **Color editor strips alpha channel** — `ColorEditor` uses `hex.slice(0, 7)` for the color picker, silently dropping transparency. Editing a token like `#FF000066` corrupts its value. `TokenEditor.tsx` ~L419
- [ ] **Contrast checker uses a `<select>` for background token** — With potentially hundreds of color tokens, a plain native `<select>` is unusable. Replace with the same searchable token picker used by alias mode. `TokenEditor.tsx` ~L292
- [ ] **Table mode Scopes column toggle uses text arrows `▶`/`▼`** — Inconsistent with SVG chevrons used everywhere else. `TokenList.tsx` ~L930
- [ ] **"Apply as Variables/Styles" has no post-apply count in the UI** — The button disables for 1.5s but there's no "Applied N variables" or any in-panel result. The Figma toast is brief and easy to miss. `TokenList.tsx` ~L603
- [ ] **SelectionInspector "Sync Selection" shows when bindings are already current** — Sync buttons are always visible when a layer is selected and the server is connected, even immediately after a successful sync. Add an "up to date" or freshness indicator. `SelectionInspector.tsx` ~L251

## Cat 7: Terminology

- [x] **Push/Pull direction ambiguous in variable sync** — No indication of which direction (local→Figma vs Figma→local). Label as "Push to Figma ↑" / "Pull from Figma ↓". `SyncPanel.tsx` variable diff rows
- [ ] **Three names for the same concept** — "Extract to alias" (context menu), "Convert to aliases" (select mode), "Promote to Semantic" (internal). Pick one name and apply consistently. Suggested: "Link to token" (single) / "Link to tokens" (bulk).
- [x] **"Set Metadata" contains only a description** — Name implies richer data. Rename to "Set description" or "Edit description". `App.tsx` ~L896
