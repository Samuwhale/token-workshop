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
- [x] **Type badge has no affordance** — Clicking type pill filters list but cursor/hover state don't signal interactivity. Add `cursor-pointer`, visible hover bg, tooltip "Click to filter by {type}". `TokenList.tsx` ~L1882
- [x] **"By usage" sort is a dead end** — Disabled option with no nearby trigger. Remove until ready, or add a scan button adjacent to sort dropdown. `TokenList.tsx` ~L832
- [x] **Command palette undiscoverable** — `⌘K` only; no button or hint in UI. Add a search/command icon in the tab bar header with shortcut label. `App.tsx` ~L234
- [ ] **Theme state cycling invisible** — Click-to-cycle (disabled→enabled→source) has no affordance. Replace with an explicit select/segmented control per row; add a legend explaining the three states. `ThemeManager.tsx` ~L130
- [x] **Settings panel has no Back button** — Import and Export panels have `← Back` headers; the Settings panel (`overflowPanel === 'settings'`) does not. Users must click a tab to escape. `App.tsx` ~L807
- [ ] **"Create sibling" only discoverable via right-click** — The action is in the token context menu but absent from the hover action bar. Users who don't right-click will never find it. `TokenList.tsx` ~L2040
- [x] **Set tab bar has no overflow indicator** — With many sets, tabs overflow with `overflow-x-auto` but no fade, arrow, or count signals that more tabs exist off-screen. `App.tsx` ~L621
- [x] **Theme states have no legend** — The three states (disabled/enabled/source) have no explanation anywhere on the page. "Source" especially is not self-explanatory. `ThemeManager.tsx` ~L211
- [ ] **Analytics tab has no issue-count badge** — No indicator on the "Analytics" tab label or in collapsed section headers shows pending validation errors. Users must navigate to the tab and run validation to discover issues.
- [x] **Command palette searches labels only, not descriptions** — `fuzzyScore(query, cmd.label)` ignores the `description` field. Commands whose relevant keywords live in their description are invisible to search. `CommandPalette.tsx` ~L57
- [x] **Apply as Variables vs Styles unexplained** — Two equal-weight buttons, no differentiation. Add `title` tooltips explaining each. `TokenList.tsx` ~L1139

## Cat 2: Layout Instability & Hover Jank

- [ ] **Token row hover actions shift layout** — 5 buttons appear inline and push content on hover. Reserve fixed-width space with `opacity-0 group-hover:opacity-100` so no layout shift. `TokenList.tsx` ~L1965
- [ ] **Group hover delete causes accidental deletes** — Delete is the only hover action. Replace with a `⋯` menu; delete becomes a menu item. `TokenList.tsx` ~L1715
- [ ] **Set tab ⋯ inconsistently visible** — Inactive tabs show button only on hover; active always shows it. Ensure no layout shift between states. `App.tsx` ~L654
- [ ] **Token hover actions flicker at the cursor gap** — When moving the mouse from the token name into the action button area, the cursor briefly exits the group boundary, resetting `hovered` state and causing the buttons to disappear then reappear. Reserve the hover zone to include the full row. `TokenList.tsx` ~L1953
- [ ] **Table mode renders full bottom action bar redundantly** — In table mode the entire bottom bar (New Token, Use preset, Multi-select, Find & Replace, Apply as Variables, Apply as Styles) stays visible. The table is a read/navigate view; the bar should collapse to just Apply as Variables/Styles. `TokenList.tsx` ~L1084

## Cat 3: IA & Labeling

- [x] **"Select" is ambiguous** — Reads as text-select. Rename to "Multi-select" or "Select tokens". `TokenList.tsx` ~L1119
- [x] **Complex types show raw JSON in value column** — Shadow/typography/gradient show truncated JSON. Show human-readable summary (e.g., "16px / 400 / Inter" for typography). `TokenList.tsx` `formatValue()` + ~L1908
- [x] **Toolbar: mode toggles look like one-shot actions** — Bound tokens/Table are modes; Expand/Collapse are actions. Give modes a distinct pressed/active appearance. `TokenList.tsx` ~L786
- [ ] **Disabled set menu items unexplained** — "Generate Semantic Tokens" etc. appear first in the menu, greyed out, no tooltip. Move to bottom or add prerequisite tooltip. `App.tsx` ~L687
- [ ] **Mode toggles look identical to action buttons** — "Bound tokens" and "Table" (modes) sit unseparated from "Expand all" and "Collapse all" (actions) in the toolbar. All four use the same text-button style. Modes should be visually grouped/separated from one-shot actions. `TokenList.tsx` ~L757
- [x] **Non-default sort order has no indicator** — When sorted by type or A→Z, nothing in the toolbar signals this. The inline `<select>` is easy to overlook. Add a tint or badge to the sort control when it's not "Default order". `TokenList.tsx` ~L790
- [x] **Theme "uncovered" badge uses unexplained jargon** — "⚠ N uncovered" is cryptic. The meaning is "N tokens have no resolved value from any active set in this theme." Reword to "⚠ N tokens have no value" or similar. `ThemeManager.tsx` ~L194
- [x] **Duplicate count badge `×N` reads as a multiplier** — `×2` conventionally means "times 2." The intent is "2 tokens share this value." Change to `2 shared` or `dup ×2`. `TokenList.tsx` ~L1904
- [x] **Lint violation badges have no legend** — The `✕`/`⚠`/`ℹ` dot-buttons are only explained on hover. No legend exists. Users won't know they're interactive fix triggers. `TokenList.tsx` ~L1910
- [ ] **"Find & Replace" preview doesn't highlight the changed segment** — Old path (strikethrough) and new path are shown side by side, but neither highlights *which* segment mutated. For long paths this requires manual character-by-character comparison. `TokenList.tsx` ~L1326
- [x] **Theme empty state doesn't explain what themes are for** — "No themes configured / Themes control which token sets are active" is too thin. New users won't understand themes enable multi-mode Figma variables. Add a one-sentence explanation and a link or hint. `ThemeManager.tsx` ~L177
- [x] **"Bound tokens" mode label is misleading** — Sounds like it shows all tokens that have any bindings. Actual behavior: filters to tokens bound to the *currently selected layer*. Clearer: "Show for selection" or "Selection filter". `TokenList.tsx` ~L774
- [x] **"Source" theme state has no definition anywhere** — "disabled" and "enabled" are obvious; "source" (base/override set) is not. Add a tooltip or inline note explaining what source means. `ThemeManager.tsx` ~L211
- [x] **"via 2" alias chain badge is cryptic** — Change to "2 hops"; tooltip shows full chain. `TokenList.tsx` ~L1959
- [ ] **Sync controls show below collapsed inspector** — "Sync Page" button visible when inspector says "Select a layer". Move sync controls inside collapsed body or hide when irrelevant. `SelectionInspector.tsx` ~L238
- [x] **Import/Export have no back button** — Panel replaces content area with no exit affordance. Add a `← Back` header matching the TokenEditor pattern. `App.tsx` ~L778; `ImportPanel.tsx`, `ExportPanel.tsx`

## Cat 4: Interaction & State

- [x] **TokenEditor discards unsaved edits silently** — Escape/Cancel navigates back without warning. Track dirty state; show "Discard changes?" confirm if dirty. `TokenEditor.tsx` ~L107
- [x] **New set name lost on blur** — Clicking outside cancels and discards typed text. Don't reset `creatingSet` on blur if value is non-empty; or at least preserve the value. `App.tsx` ~L755
- [x] **Broken alias error is a 2s flash only** — Flash red then row looks normal. Show persistent inline error or route user to lint panel. `TokenList.tsx` ~L1604
- [x] **Collapse toggles use ▲/▼ text chars** — Inconsistent with SVG chevrons used everywhere else. Replace with the same SVG chevron pattern. `TokenEditor.tsx` ~L275, ~L354
- [ ] **Alias mode toggle doesn't communicate token's alias status** — When token IS an alias, the form doesn't emphasize that. Make the resolved alias chain the primary visual focus when `aliasMode` is true. `TokenEditor.tsx` ~L185
- [x] **Context menus can go off-screen** — Raw mouse coords used for positioning. Clamp to `window.innerWidth/Height - menuWidth/Height`. `TokenList.tsx` `contextMenuPos`, `groupMenuPos`; `App.tsx` `tabMenuPos`
- [ ] **Group rename confirms on blur** — No way to cancel by clicking outside. Restore original on empty/unchanged input; don't confirm-on-blur if Escape was pressed. `TokenList.tsx` ~L1702
- [x] **Delete adjacent to Edit in hover actions** — A misclick deletes the token. Add a spacer/divider between Edit and Delete, or move Delete to context menu only. `TokenList.tsx` ~L2006
- [ ] **Token type cannot be changed after creation** — The type badge in `TokenEditor` header is display-only. Wrong-type tokens require delete + recreate. Add a type selector to the editor form. `TokenEditor.tsx` ~L166
- [x] **"Cancel" in TokenEditor footer is wrong label when form is pristine** — "Cancel" implies an active operation. When no changes have been made the button should say "Back"; only show "Cancel" (or "Discard") after edits exist. `TokenEditor.tsx` ~L391
- [x] **Alias autocomplete: Escape closes the editor instead of the dropdown** — The global `keydown` handler fires `onBack()` on Escape. When the autocomplete is open, Escape should close just the dropdown first. `TokenEditor.tsx` ~L106
- [ ] **Theme rename is impossible** — Theme cards only have a delete button. To rename a theme you must delete and recreate it, losing all set-state configuration. Add a rename option to the theme header menu. `ThemeManager.tsx` ~L186
- [ ] **No way to duplicate a single token** — "Duplicate group" exists in the group context menu, but individual token duplication is absent from both hover actions and the token context menu. `TokenList.tsx` ~L1700
- [ ] **"Create token from property" in SelectionInspector has no navigation** — After creating and binding a token from a layer property, the UI silently closes the creation form. There's no "View token" affordance. `SelectionInspector.tsx` ~L188

## Cat 5: Empty & Loading States

- [x] **Loading states are text-only** — No spinner. Add a consistent loading indicator (CSS animation) reused across all loading states. `ThemeManager.tsx` ~L161, `SyncPanel.tsx` ~L388, `TokenEditor.tsx` ~L144
- [x] **Component coverage scan fails silently** — The catch block has `// silently fail`; the loading spinner just disappears on timeout or error with no message shown. `AnalyticsPanel.tsx` ~L119
- [x] **Sync panel git status has no manual refresh** — Status is fetched once on panel open and only updates after performing an action. There's no visible refresh button for picking up external changes. `SyncPanel.tsx` ~L87
- [x] **No empty state when filters return zero results** — List just goes blank. Show "No tokens match your filters" + "Clear filters" button when `displayedTokens.length === 0 && filtersActive`. `TokenList.tsx` ~L1001
- [x] **Empty token set uses a clock icon** — Clock has no semantic relationship to "empty". Use a box/plus icon matching the create-token action. `TokenList.tsx` ~L934

## Cat 6: Micro-interactions

- [x] **Copy path vs copy value icons indistinguishable at 10px** — Use distinct icons (e.g., `</>` for CSS var, clipboard for value). `TokenList.tsx` ~L1976
- [x] **Sync-changed dot has no legend** — Orange dot is mysterious on first encounter. When any sync-changed indicators exist, show a note in the toolbar: "N tokens changed since last sync". `TokenList.tsx` ~L1873
- [x] **ΔE score unexplained in Convert to Aliases modal** — Replace/supplement with qualitative label ("Exact", "Close", "Approximate"). Keep raw number in tooltip. `TokenList.tsx` ~L1399
- [x] **Three things share the `⋯` ellipsis symbol** — Global overflow menu, set tab action, and more-filters all use `⋯`. Use a funnel/filter icon for more-filters; keep `⋯` for menus only. `TokenList.tsx` ~L892, `App.tsx` ~L554
- [x] **Active filter bar tint nearly invisible** — `accent/8` on dark bg is imperceptible. Increase to `/20` or add a visible "Filtered" badge in the bar. `TokenList.tsx` ~L840
- [x] **Connection error has no action** — "Server offline" banner is purely informational. Add inline "Settings" link or "Retry" button. `App.tsx` ~L527
- [ ] **Group scope editor is a bottom sheet** — All other modals are centered. Convert to standard centered modal. `App.tsx` ~L955
- [x] **Color editor strips alpha channel** — `ColorEditor` uses `hex.slice(0, 7)` for the color picker, silently dropping transparency. Editing a token like `#FF000066` corrupts its value. `TokenEditor.tsx` ~L419
- [ ] **Contrast checker uses a `<select>` for background token** — With potentially hundreds of color tokens, a plain native `<select>` is unusable. Replace with the same searchable token picker used by alias mode. `TokenEditor.tsx` ~L292
- [x] **Table mode Scopes column toggle uses text arrows `▶`/`▼`** — Inconsistent with SVG chevrons used everywhere else. `TokenList.tsx` ~L930
- [ ] **"Apply as Variables/Styles" has no post-apply count in the UI** — The button disables for 1.5s but there's no "Applied N variables" or any in-panel result. The Figma toast is brief and easy to miss. `TokenList.tsx` ~L603
- [ ] **SelectionInspector "Sync Selection" shows when bindings are already current** — Sync buttons are always visible when a layer is selected and the server is connected, even immediately after a successful sync. Add an "up to date" or freshness indicator. `SelectionInspector.tsx` ~L251

## Cat 7: Terminology

- [x] **Push/Pull direction ambiguous in variable sync** — No indication of which direction (local→Figma vs Figma→local). Label as "Push to Figma ↑" / "Pull from Figma ↓". `SyncPanel.tsx` variable diff rows
- [ ] **Three names for the same concept** — "Extract to alias" (context menu), "Convert to aliases" (select mode), "Promote to Semantic" (internal). Pick one name and apply consistently. Suggested: "Link to token" (single) / "Link to tokens" (bulk).
- [x] **"Set Metadata" contains only a description** — Name implies richer data. Rename to "Set description" or "Edit description". `App.tsx` ~L896

# Backlog Inbox

Add items here while backlog.sh is running. They will be appended to backlog.md at the end of each iteration and this file will be cleared.

<!-- Example format:
## Cat 1: Discoverability & Affordance

- [ ] **Your new item** — Description of the change needed. `FileName.tsx` ~L123
-->

---

## Screen A: App Shell

### Bugs
- [ ] **ErrorBoundary swallows `componentDidCatch`** — The catch handler is a no-op; errors are never logged. At minimum log to console so errors are diagnosable. `App.tsx` ~L7
- [ ] **`retryConnection` not wired to the offline banner's "Retry" button** — The banner calls `updateServerUrl(serverUrl)` as a workaround; the dedicated retry handler is unused. Wire `retryConnection` directly. `App.tsx` ~L527
- [ ] **Active tab lost on plugin reload if tab name no longer valid** — `localStorage.getItem('tm_active_tab')` is not validated against the `TABS` array. Guard with a membership check. `App.tsx` ~L108

### QoL
- [x] **Settings panel server URL input doesn't auto-select on focus** — User must triple-click to replace the URL. Add `onFocus={e => e.target.select()}`. `App.tsx` settings panel input
- [ ] **No keyboard shortcut to cycle tabs** — `⌘1`–`⌘4` would let power users switch tabs without the mouse. Add to global `keydown` handler. `App.tsx` ~L252
- [ ] **Overflow menu closes on any outside click before an action is taken** — A slight mis-click dismisses the menu. Consider keeping open until Escape is pressed. `App.tsx` ~L227

### UX
- [ ] **New set name input: Enter key doesn't submit** — The input requires clicking the checkmark; pressing Enter does nothing. Add `onKeyDown` Enter handler matching rename behaviour. `App.tsx` ~L755
- [ ] **Set rename commits on blur even when Escape was pressed** — Blur fires after keyup and commits despite the cancel intent. Track an `escPressed` ref to suppress blur commit. `App.tsx` ~L350
- [ ] **Deleting the active set leaves a stale set name in the UI** — After delete the token list briefly shows the old set name before `refreshTokens` resolves. Immediately switch to the first remaining set on delete. `App.tsx` delete flow

### UI
- [ ] **Set tab rename input clips text before the allowed max length** — The inline `<input>` is narrower than the tab. Set `min-width` to match the tab's measured width. `App.tsx` ~L350 rename input
- [ ] **Overflow menu has no separator before destructive actions** — "Delete Set" sits adjacent to "Rename" with no divider. Add a `<hr>` before the delete item. `App.tsx` ~L687

### QA
- [ ] **Set name validation allows leading/trailing whitespace on rename** — `renameValue.trim()` strips it but the raw input still shows spaces. Trim on `onChange`. `App.tsx` ~L317
- [ ] **`setTabsOverflow` ResizeObserver may accumulate on rapid `sets` changes** — Confirm only one observer is alive at a time; verify cleanup on each effect re-run. `App.tsx` ~L283

---

## Screen B: Token List

### Bugs
- [ ] **`syncSnapshot` comparison produces false positives for object-valued tokens** — `JSON.stringify` key order is non-deterministic; a dimension token can stringify differently on two runs, showing a spurious changed-dot. Use a stable key-sorted serialiser or deep-equal. `TokenList.tsx` sync snapshot logic
- [ ] **Find & Replace preview shows identical before/after when the segment is absent** — The preview renders both rows even when old === new. Hide the row or show "no match". `TokenList.tsx` ~L1326
- [ ] **Multi-select "Select all" count mismatches when filters are active** — `selectAll` iterates `displayedTokens` but the badge reads from the full set. Scope both to `displayedTokens` consistently. `TokenList.tsx` multi-select
- [ ] **Convert-to-aliases: confirm button enabled with zero aliases selected** — Clicking fires a mutation with an empty map; spinner clears with no feedback. Disable the button when nothing is selected. `TokenList.tsx` ~L1399

### QoL
- [ ] **Filter state resets when switching sets** — Persist active type/group filters per-set in `localStorage`. `TokenList.tsx` filter state
- [ ] **Sort order resets to Default when switching sets** — Persist sort choice per-set in `localStorage`. `TokenList.tsx` ~L832
- [ ] **No way to jump from a token row to its parent group** — Add a clickable group path breadcrumb in the token row or editor header. `TokenList.tsx` row render

### UX
- [ ] **"Use preset" dropdown can immediately close on the same click that opens it** — The outside-click handler fires on the same `mousedown`. Distinguish `mousedown` open from `click` close. `TokenList.tsx` preset dropdown
- [ ] **Token row right-click context menu has no keyboard equivalent** — All context actions are mouse-only. Ensure the same menu opens on `Space`/`Enter` when the row is keyboard-focused. `TokenList.tsx` ~L1700

### UI
- [ ] **Lint dot buttons lack a focus ring and `focus-visible:opacity-100`** — Keyboard users cannot reach the fix-trigger buttons. Add `focus-visible:opacity-100 focus-visible:ring-2`. `TokenList.tsx` ~L1910
- [ ] **Group header `top-0` sticky value causes overlap with deeply nested groups** — Compute `top` offset based on nesting depth. `TokenList.tsx` group header render
- [ ] **Type badge colour mapping is implicit inline logic** — Codify into a `TOKEN_TYPE_COLORS` constant so all type-badge usages stay in sync. `TokenList.tsx` type badge

### QA
- [ ] **Deleting the last token in a group leaves the group header until next refresh** — Force an immediate refresh or local splice after delete. `TokenList.tsx` delete handler
- [ ] **Token paths with a literal dot in a segment are visually indistinguishable from nested groups** — Add escaping or quoted-segment display. `TokenList.tsx` path render
- [ ] **Find & Replace: empty "replace" field silently deletes path segments** — Require non-empty replace value or confirm before truncating. `TokenList.tsx` ~L1326

---

## Screen C: Token Editor

### Bugs
- [ ] **`hex.slice(0, 7)` strips alpha and permanently corrupts the saved value** — Editing `#FF000066` writes `#FF0000` to the server. Handle 8-char hex in both the color picker and value state. `TokenEditor.tsx` ~L419
- [ ] **`initialRef` not reset after save** — Dirty-check compares to the original pre-first-save state; a second edit in the same session always appears dirty from the wrong baseline. Reset `initialRef` after successful save. `TokenEditor.tsx` ~L75
- [ ] **Scopes section renders an empty list for types with no defined scopes** — `FIGMA_SCOPES[tokenType]` is `undefined` for `gradient`, `shadow`, `typography`. Hide the scopes section for unsupported types. `TokenEditor.tsx` ~L9

### QoL
- [ ] **No way to copy the token path from inside the editor** — Add a copy-path icon in the editor header. `TokenEditor.tsx` header
- [ ] **Description `<textarea>` shrinks to near-zero when empty** — Add `placeholder` and `min-h` so the field is always discoverable. `TokenEditor.tsx` description textarea
- [ ] **Switching alias mode off discards the previous raw value** — Cache the pre-alias value and restore it on toggle-off. `TokenEditor.tsx` ~L185

### UX
- [ ] **Color preview swatch not shown when alias resolves to a color** — Resolve the alias chain and show the swatch in the editor header when `aliasMode` is true. `TokenEditor.tsx` header
- [ ] **Save button can be enabled on an untouched form** — If `initialRef` is set late, the button may be enabled before any changes. Disable when `!isDirty`. `TokenEditor.tsx` ~L391

### UI
- [ ] **Scopes section label has no explanation tooltip** — Add `title="Scopes control which Figma properties this variable is offered for"`. `TokenEditor.tsx` ~L74
- [ ] **Long server error messages overflow the error container** — Add `break-words` and `max-h-16 overflow-auto` to the error display div. `TokenEditor.tsx` error display

### QA
- [ ] **`resolveColorValue` infinite loops on circular aliases** — A→B→A recurses until stack overflow. Add a visited-set depth guard. `TokenEditor.tsx` ~L42
- [ ] **Dimension token can save `{ value: NaN, unit: 'px' }` when the number input is cleared** — Validate field is non-empty and finite before enabling Save. `TokenEditor.tsx` dimension input
- [ ] **Typography token form doesn't require any sub-fields** — A token with `fontFamily: ''` saves and silently fails in Figma. Require at minimum `fontFamily` and `fontSize`. `TokenEditor.tsx` typography form

---

## Screen D: Theme Manager

### Bugs
- [ ] **Set-state click fires on the label column too** — Restrict the click target to the state control cell only, not the entire row. `ThemeManager.tsx` ~L130
- [ ] **"⚠ N uncovered" double-counts tokens whose alias chain crosses a disabled set** — Use the fully resolved value, not the first hop, to determine coverage. `ThemeManager.tsx` ~L194
- [ ] **Empty-theme message doesn't hide immediately after adding a set row** — Derive visibility from live `theme.sets.length`, not stale state. `ThemeManager.tsx` ~L177

### QoL
- [ ] **No drag-to-reorder set rows within a theme** — Set order determines override precedence; users must delete and re-add to reorder. Add drag handles. `ThemeManager.tsx` set rows
- [ ] **Theme cards cannot be reordered** — Add drag-to-reorder at the card level. `ThemeManager.tsx` card list
- [ ] **No confirmation before deleting a theme** — Delete is immediate with no undo. Show a `ConfirmModal`. `ThemeManager.tsx` ~L186

### UX
- [ ] **New set row defaults to "disabled"** — Default new rows to `enabled` so they take effect immediately. `ThemeManager.tsx` add-set handler
- [ ] **Theme creation name input doesn't auto-focus** — Add `useLayoutEffect` focus after the add-theme action. `ThemeManager.tsx` add-theme handler

### UI
- [x] **Long theme names clip with no tooltip** — Add `title` attribute with full name to the card header. `ThemeManager.tsx` ~L186
- [ ] **"Source" state is visually identical to "enabled"** — Give "source" a distinct background tint or underline so all three states are perceptually distinct. `ThemeManager.tsx` ~L130

### QA
- [ ] **Theme name uniqueness not validated** — Two themes with the same name target the same Figma variable collection mode, causing silent overwrites. Validate uniqueness on create. `ThemeManager.tsx` create handler
- [ ] **Deleted token sets still appear in theme rows** — Filter out rows whose set name is absent from the current `sets` list on theme load. `ThemeManager.tsx` data load

---

## Screen E: Sync Panel

### Bugs
- [ ] **Git diff "conflicts" array is always empty in the UI** — `diffView.conflicts` is populated server-side but the render only iterates `localOnly` and `remoteOnly`. Add a conflicts section. `SyncPanel.tsx` ~L67
- [x] **Commit button enabled with an empty message** — Disable when `commitMsg.trim() === ''`. `SyncPanel.tsx` commit handler
- [ ] **Variable diff "skip" rows may slip into the sync payload if state mutates mid-flight** — Snapshot `varDirs` at the moment the sync call is made, not at response time. `SyncPanel.tsx` varSyncing handler

### QoL
- [ ] **No "Push all / Pull all / Skip all" bulk action for variable diff rows** — With 50+ rows, per-row direction selection is tedious. Add bulk-action buttons above the diff table. `SyncPanel.tsx` var diff section
- [ ] **Branch list not refreshed after push/pull** — Re-fetch branches after a successful operation. `SyncPanel.tsx` ~L99
- [ ] **Non-repo state hides the remote URL field** — Show the remote URL input and an "Initialise repo" button so users can bootstrap from the panel. `SyncPanel.tsx` not-repo state

### UX
- [ ] **Readiness checks fire immediately on panel open with no CTA** — Add a "Run checks" button and only auto-run if checks are stale (>30s). `SyncPanel.tsx` readiness checks
- [ ] **Variable diff "conflict" meaning is never explained** — Add a tooltip or inline legend. `SyncPanel.tsx` ~L26
- [x] **Commit message textarea has no placeholder** — Add `placeholder="Describe your changes…"`. `SyncPanel.tsx` commit msg input

### UI
- [ ] **Readiness check icons use raw text `✓` / `✗`** — Replace with SVG icons consistent with the rest of the UI. `SyncPanel.tsx` readiness check render
- [ ] **Variable diff table has no column headers** — Add a sticky header row labelling Path, Local, and Figma columns. `SyncPanel.tsx` var diff table
- [x] **Long branch names truncate with no tooltip** — Add `title` attribute to the branch name display. `SyncPanel.tsx` branch display

### QA
- [ ] **`fetchStatus` can race on rapid connect/disconnect** — Use `AbortController` to cancel in-flight requests on re-trigger. `SyncPanel.tsx` ~L87
- [ ] **`orphansResolveRef` never rejects on timeout** — Add a 10s rejection timeout so the loading spinner always clears. `SyncPanel.tsx` orphansResolveRef

---

## Screen F: Analytics Panel

### Bugs
- [ ] **Coverage scan: `coverageResolveRef` never rejects on timeout** — The loading spinner never clears on sandbox timeout or error. Add a 10s timeout that rejects and surfaces an error message. `AnalyticsPanel.tsx` ~L119
- [ ] **`runValidate` fires again if `validateKey` increments while already loading** — Guard with `if (!validateLoading)` in the `useEffect`. `AnalyticsPanel.tsx` ~L88
- [ ] **Contrast matrix rows are in insertion order, not sorted by ratio** — Sort ascending by contrast ratio so worst pairs appear first. `AnalyticsPanel.tsx` contrast matrix

### QoL
- [ ] **No export for validation report** — Add "Copy as Markdown" or "Download JSON" to the results header. `AnalyticsPanel.tsx` validation results
- [ ] **Severity filter buttons don't show per-level counts** — Show `Error (3)` instead of just `Error`. `AnalyticsPanel.tsx` ~L52
- [ ] **Canonical pick for duplicate deduplication resets on navigation** — Persist `canonicalPick` in `localStorage` keyed by set. `AnalyticsPanel.tsx` ~L58

### UX
- [ ] **Validation issue rows have no "jump to token" affordance** — Wire `onNavigateToToken` so clicking an issue row navigates to the token. `AnalyticsPanel.tsx` issue list
- [ ] **Contrast matrix overflows the panel width** — Add `overflow-x-auto` or cap to the 10 lowest-contrast pairs with a "Show all" toggle. `AnalyticsPanel.tsx` contrast matrix

### UI
- [ ] **Stats section shows plain-text counts with no visual distribution** — Replace with an inline proportional bar chart per type. `AnalyticsPanel.tsx` stats section
- [ ] **Validation fetch error is silent** — The `catch` block sets results to `[]` with no message. Show "Validation failed — check server connection". `AnalyticsPanel.tsx` ~L82

### QA
- [ ] **Duplicate detection hashes by raw hex, not normalised hex** — `#F00` and `#FF0000` represent the same colour but are treated as different. Normalise to 6-char uppercase before comparing. `AnalyticsPanel.tsx` duplicate detection

---

## Screen G: Selection Inspector

### Bugs
- [ ] **"Sync Page" and "Sync Selection" appear when `connected === false`** — Wrap sync control render in `{connected && …}`. `SelectionInspector.tsx` ~L260
- [ ] **`handleCreateToken` doesn't validate token path format** — Paths like `..foo` or `foo..bar` are accepted. Apply the same regex used for set-name validation. `SelectionInspector.tsx` ~L174

### QoL
- [ ] **No "View token →" link after Create & bind** — Show a brief success state with a "View token" link. `SelectionInspector.tsx` ~L188
- [ ] **"Remove binding" has no undo** — Push a remove-binding undo slot via the undo system. `SelectionInspector.tsx` ~L160

### UX
- [ ] **Multi-selection binding summary doesn't distinguish shared vs mixed** — "3 layers selected / 4 bindings" is opaque. Show "2 shared, 2 mixed". `SelectionInspector.tsx` ~L206
- [ ] **Property group labels use ALL-CAPS at 8px** — Hard to read. Use title case at 9px with normal letter-spacing. `SelectionInspector.tsx` ~L289

### UI
- [ ] **Color swatch is 12×12px and hard to see at small sizes** — Increase to 14×14px with a white inner border for transparency support. `SelectionInspector.tsx` ~L321
- [ ] **Inspector max-height is hardcoded at 200px** — Use a flex-based or percentage max-height at larger panel sizes. `SelectionInspector.tsx` ~L275
- [ ] **Create-token form appends below the inspector body and pushes content off-screen** — The form should replace the body, not append after it. `SelectionInspector.tsx` ~L382

### QA
- [ ] **`getTokenTypeForProperty` returns `'string'` as a silent fallback for unknown properties** — New `BindableProperty` values not handled here silently produce string-typed tokens. Add a dev-mode console warning. `SelectionInspector.tsx` ~L67

---

## Screen H: Import Panel

### Bugs
- [ ] **Read-variables message never arriving leaves the spinner running forever** — Add a 15s timeout that clears `loading` and shows an error. `ImportPanel.tsx` ~L36
- [ ] **Switching source while previous read is in-flight corrupts the token list** — Track the active source request and discard responses from superseded requests. `ImportPanel.tsx` ~L57
- [ ] **Import silently overwrites tokens with matching paths** — Preflight-check for conflicts and offer a merge strategy (skip/overwrite) before committing. `ImportPanel.tsx` import handler

### QoL
- [ ] **No "Select all / Deselect all" toggle** — With 100+ tokens, individual checkboxes are impractical. Add a header checkbox. `ImportPanel.tsx` ~L23
- [ ] **No type filter on the token preview list** — Add a type-filter pill row above the list. `ImportPanel.tsx` token list
- [ ] **Target set defaults to `'imported'` regardless of existing sets** — Default to the first existing set or last-used import target (persisted in `localStorage`). `ImportPanel.tsx` ~L21

### UX
- [ ] **Loading state shows a generic spinner** — Show "Reading variables from Figma…" or "Reading styles from Figma…" based on `source`. `ImportPanel.tsx` loading state
- [ ] **Success has no token count** — Show "Imported N tokens" as a toast or inline message. `ImportPanel.tsx` success handler
- [ ] **Alias token values show raw `{other.token}` with no resolved preview** — Add a hover tooltip resolving the alias. `ImportPanel.tsx` token preview

### UI
- [ ] **Token preview list is ungrouped** — Group by collection (variables) or type (styles) for scanability. `ImportPanel.tsx` token list
- [ ] **"Read Variables" and "Read Styles" are equal-weight buttons** — Make the more-common action (Read Variables) a filled primary button. `ImportPanel.tsx` ~L57

### QA
- [ ] **`selectedTokens` Set may reference stale tokens if a second `variables-read` arrives** — Re-derive `selectedTokens` from the current `tokens` state in the import handler. `ImportPanel.tsx` ~L43

---

## Screen I: Export Panel

### Bugs
- [ ] **Platform export error is swallowed when `figmaLoading` is true** — The error handler is guarded by `&& figmaLoading`; separate the two error states. `ExportPanel.tsx` ~L74
- [ ] **`expandedFile` points to a deleted file after re-export** — Reset `expandedFile` when a new export starts. `ExportPanel.tsx` ~L53
- [ ] **Empty Figma-variables result doesn't reset `expandedCollection`** — Stale expanded state renders empty sections. Reset to `null` when result arrives empty. `ExportPanel.tsx` ~L70

### QoL
- [ ] **No "Copy to clipboard" for individual exported files** — Add a copy button in each file's header row. `ExportPanel.tsx` file preview
- [ ] **Platform selection doesn't persist between sessions** — Persist `selected` in `localStorage`. `ExportPanel.tsx` ~L49
- [ ] **No "Download all as ZIP" when multiple platforms are exported** — Add a download-all action. `ExportPanel.tsx` results area

### UX
- [ ] **Platform `description` field exists but is never rendered** — Show it as subtitle text under each platform label. `ExportPanel.tsx` ~L14
- [ ] **Figma variables tree has no search/filter** — With many variables, add a filter bar. `ExportPanel.tsx` figma tree

### UI
- [ ] **File content `<pre>` has no max-height** — Long exports expand the panel indefinitely. Add `max-h-48 overflow-auto`. `ExportPanel.tsx` file preview
- [ ] **No timestamp on the last export run** — Add a "Exported just now" label next to the results header. `ExportPanel.tsx` results header

### QA
- [ ] **`canExport` should derive from `selected.size > 0` explicitly** — The current check may allow export with zero platforms if the `Set` reference is replaced. `ExportPanel.tsx` ~L49

---

## Screen J: Command Palette

### Bugs
- [ ] **`activeIdx` can reference `undefined` when query changes between render and effect** — Guard `execute` with `if (filtered[activeIdx])`. `CommandPalette.tsx` ~L73
- [ ] **Focus is not trapped inside the palette overlay** — Tab-key moves focus to the underlying UI. Trap focus within the palette. `CommandPalette.tsx`

### QoL
- [ ] **No recently-used commands section** — Show the 3 most-recently executed commands at the top when query is empty (persisted in `localStorage`). `CommandPalette.tsx` ~L54
- [ ] **`onClose()` called before `cmd.handler()`** — If the handler opens a modal, the panel re-renders between close and open causing a flash. Call `onClose()` after `cmd.handler()`. `CommandPalette.tsx` ~L73

### UX
- [ ] **Empty results state is blank** — Show "No commands match '{query}'" with a "Clear" link. `CommandPalette.tsx` empty state
- [ ] **Backdrop click doesn't close the palette** — Add an `onClick` handler on the backdrop element. `CommandPalette.tsx` backdrop

### UI
- [ ] **Keyboard-selected item uses the same highlight as mouse-hover** — Use the accent colour at /20 opacity for keyboard selection so the two states are distinguishable. `CommandPalette.tsx` ~L80
- [ ] **Long descriptions truncate with no tooltip** — Add `title` attribute with full description text. `CommandPalette.tsx` description render

---

## Screen K: Scaffolding Wizard

### Bugs
- [ ] **Preset insertion doesn't check for existing tokens at the prefix path** — `spacing.xs` is silently overwritten. Preflight-check with a GET and warn on conflicts. `ScaffoldingWizard.tsx` insert handler
- [ ] **Prefix validation runs on submit only** — Validate inline on `onChange` to give immediate feedback. `ScaffoldingWizard.tsx` prefix input

### QoL
- [ ] **No token preview before insert** — Show the list of paths and values with a "Confirm" step before writing. `ScaffoldingWizard.tsx` confirm step
- [ ] **Prefix field doesn't auto-populate from `preset.defaultPrefix`** — Default the input to `preset.defaultPrefix` when a preset is selected. `ScaffoldingWizard.tsx` preset select handler
- [ ] **No success toast after insert** — Show "Inserted N tokens" after a successful write. `ScaffoldingWizard.tsx` success handler

### UX
- [ ] **Preset `description` field is never rendered** — Show it as a subtitle in the preset list. `ScaffoldingWizard.tsx` preset list

### UI
- [ ] **Selected preset has no checkmark or radio indicator** — A background tint alone is insufficient. Add a leading checkmark icon. `ScaffoldingWizard.tsx` preset list item

### QA
- [ ] **No target-set confirmation** — If a critical set is active, presets will overwrite it silently. Show the target set name prominently and offer a set-picker. `ScaffoldingWizard.tsx`

---

## Screen L: Color Scale Generator

### Bugs
- [ ] **`generateScale` returns `[]` silently on invalid hex** — A partially typed color leaves the preview blank. Show "Invalid color" inline. `ColorScaleGenerator.tsx` ~L24
- [ ] **Sparkline uses hardcoded `width={240}` instead of `viewBox`** — Coordinate points don't fill actual width when the SVG scales. Replace with a `viewBox`-based approach. `ColorScaleGenerator.tsx` ~L78
- [ ] **Sparkline jump-highlight uses hardcoded `stroke="red"`** — Replace with `var(--color-figma-error)` for theme consistency. `ColorScaleGenerator.tsx` ~L80

### QoL
- [ ] **No "Copy palette as JSON" action** — Add a button producing a DTCG-format snippet ready to paste. `ColorScaleGenerator.tsx` actions
- [ ] **No "Save to set" path** — Add a "Save to set" button with a set-picker and prefix field. `ColorScaleGenerator.tsx`
- [ ] **Base colour input has no colour picker companion** — Add a native `<input type="color">` alongside the hex text input. `ColorScaleGenerator.tsx` base colour input

### UX
- [ ] **Bell-curve chroma logic is unexplained** — Add a tooltip: "Chroma peaks in midtones and tapers at extremes for a perceptually even scale." `ColorScaleGenerator.tsx` sparkline area

### UI
- [ ] **Scale step swatches don't show the L\* value** — Add a small L\* label below each swatch. `ColorScaleGenerator.tsx` swatch render

### QA
- [ ] **`labToHex` can produce channel values outside `[0, 255]`** — Clamp each channel before converting to avoid malformed hex strings. `colorUtils.ts` labToHex

---

## Screen M: Paste Tokens Modal

### Bugs
- [ ] **Alias values inferred as `'color'` type** — `inferType` returns `$type: 'color'` for any `{…}` syntax. Return `$type: 'unknown'` or defer typing until a target token is resolved. `PasteTokensModal.tsx` ~L21
- [ ] **`name: value` line parser leaves a leading space on the value** — `--spacing-md: 16px` splits on `:` and produces value `' 16px'`. Trim the value and strip the `--` prefix. `PasteTokensModal.tsx` ~L76

### QoL
- [ ] **No conflict resolution strategy** — Pasted tokens that collide are silently overwritten. Offer "skip / overwrite / rename with suffix". `PasteTokensModal.tsx` submit handler
- [ ] **Always writes to `activeSet` with no set picker** — Add a compact set-picker dropdown in the modal footer. `PasteTokensModal.tsx` footer
- [ ] **Textarea not auto-focused on open** — Add `autoFocus` or `useLayoutEffect` focus. `PasteTokensModal.tsx` textarea

### UX
- [ ] **JSON parse errors displayed as a raw string** — Multi-line messages with line/col info should render in a `<pre>` with monospace font. `PasteTokensModal.tsx` error display

### UI
- [ ] **Preview list has no height constraint** — A 1000-token paste expands the modal past the viewport. Add `max-h-64 overflow-y-auto`. `PasteTokensModal.tsx` preview list

### QA
- [ ] **`inferType` types positive integers as `number` not `dimension`** — In most design contexts a bare `16` means `16px`. Prompt the user to choose type when the value is a positive integer. `PasteTokensModal.tsx` ~L18

---

## Screen N: Undo Toast

### Bugs
- [ ] **Auto-dismiss timer not reset when a new undo slot is pushed** — If `pushUndo` is called twice quickly the second toast dismisses on the first timer. Reset the timer on every `pushUndo`. `useUndo.ts`
- [ ] **`executeUndo` dismisses silently with no "Undone" confirmation** — Show a brief "Undone" state for 1s after a successful undo. `UndoToast.tsx`

### QoL
- [ ] **Only one undo level is supported** — Implement a small undo stack (3–5 levels). `useUndo.ts`
- [ ] **Undo toast doesn't describe the undoable action** — Show "Undo delete 'color.primary'" using the slot's action label. `UndoToast.tsx`

### UI
- [ ] **Toast position may overlap the bottom action bar** — Position above the action bar by accounting for its height. `UndoToast.tsx`

### QA
- [ ] **`executeUndo` doesn't check server connection before calling the undo action** — Show an error toast if the undo fetch fails. `useUndo.ts`

---

## Holistic / Cross-cutting

### Bugs
- [ ] **`resolveAllAliases` runs synchronously on every `tokens` change** — With 1000+ tokens this blocks the main thread. Move to a `useEffect` that writes to state, or offload to a Web Worker. `App.tsx` ~L184
- [ ] **No error surfacing for failed `refreshTokens`** — If the API call throws, `tokens` goes stale with no user-facing indicator. Show a "Failed to load tokens" banner. `useTokens.ts`
- [ ] **Multiple components register independent `message` event listeners with no deduplication** — `App.tsx`, `SyncPanel.tsx`, `SelectionInspector.tsx`, `ImportPanel.tsx`, `ExportPanel.tsx`, and `AnalyticsPanel.tsx` all add `window.addEventListener('message', …)`. A missed type check in any handler can pollute other components. Introduce a central message router. `App.tsx`

### QoL
- [ ] **No keyboard shortcut reference** — Add a `shortcuts` command to the palette that opens a modal listing all shortcuts. `App.tsx` commands list
- [ ] **Scroll position resets on every set switch** — Persist per-set scroll position in a ref and restore it on switch. `TokenList.tsx` scroll state
- [ ] **No theme override for the plugin** — Plugin follows Figma's dark/light theme with no user override. Add a toggle in Settings. `App.tsx` settings panel

### UX
- [ ] **No first-launch onboarding** — The plugin opens to a blank token list with no guidance. Add a first-launch empty state linking to docs or triggering the ScaffoldingWizard. `App.tsx` empty state
- [ ] **ConfirmModal doesn't indicate whether an action is reversible** — Destructive actions should include "This cannot be undone." in the modal body. `ConfirmModal.tsx`

### UI
- [ ] **Focus rings are inconsistently applied** — Many elements have `focus:outline-none` without a replacement indicator, failing WCAG 2.1 SC 2.4.7. Audit all `outline-none` usages and replace with `focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]`. All files
- [ ] **Native OS scrollbars shift layout on Windows** — Add `scrollbar-width: thin; scrollbar-color: var(--color-figma-border) transparent` globally. `main.tsx` or global CSS
- [ ] **No minimum plugin width enforced** — At very narrow Figma panel widths, badges and buttons overlap. Set `min-width: 280px` on the root element. `main.tsx`
- [ ] **Monospace font falls back to system default** — Token paths and code snippets render inconsistently across machines. Set an explicit `font-family: 'SF Mono', 'JetBrains Mono', monospace` for mono contexts. global CSS

### QA
- [ ] **`localStorage.setItem` calls are unwrapped** — `setItem` can throw `QuotaExceededError` in private browsing. Wrap all writes in try/catch. Multiple files
- [ ] **All `fetch` calls lack a timeout** — A slow server hangs the UI indefinitely. Add a 10s `AbortController` timeout to all API calls. `useTokens.ts`, `SyncPanel.tsx`, `AnalyticsPanel.tsx`
- [ ] **`pathToSet` has last-write-wins behaviour for duplicate cross-set paths** — If `color.primary` exists in both `base` and `brand`, navigation always goes to the last-written set. Warn when duplicate cross-set paths are detected. `App.tsx` ~L183
- [ ] **Plugin sandbox messages lack correlation IDs** — Concurrent operations of the same type can cross-wire their responses. Add a `reqId` field to each request/response pair. `controller.ts`

# Backlog Inbox

Add items here while backlog.sh is running. They will be appended to backlog.md at the end of each iteration and this file will be cleared.

<!-- Example format:
## Cat 1: Discoverability & Affordance

- [ ] **Your new item** — Description of the change needed. `FileName.tsx` ~L123
-->

---

## Screen A: App Shell

- [ ] **[bug] ErrorBoundary swallows `componentDidCatch`** — The catch handler is a no-op; errors are never logged. At minimum log to console so errors are diagnosable. `App.tsx` ~L7
- [ ] **[bug] `retryConnection` not wired to the offline banner's "Retry" button** — The banner calls `updateServerUrl(serverUrl)` as a workaround; the dedicated retry handler is unused. Wire `retryConnection` directly. `App.tsx` ~L527
- [ ] **[bug] Active tab persists an invalid value on plugin reload** — `localStorage.getItem('tm_active_tab')` is not validated against the `TABS` array. Guard with a membership check. `App.tsx` ~L108
- [ ] **[qol] Settings panel server URL input doesn't auto-select on focus** — User must triple-click to replace the URL. Add `onFocus={e => e.target.select()}`. `App.tsx` settings panel input
- [ ] **[qol] No keyboard shortcut to cycle tabs** — `⌘1`–`⌘4` would let power users switch tabs without the mouse. Add to the global `keydown` handler. `App.tsx` ~L252
- [ ] **[qol] Overflow menu closes on any outside click before an action is taken** — A slight mis-click dismisses the menu entirely. Keep open until Escape is pressed. `App.tsx` ~L227
- [ ] **[ux] New set name input: Enter key doesn't submit** — The input requires clicking the checkmark; pressing Enter does nothing. Add an `onKeyDown` Enter handler matching rename behaviour. `App.tsx` ~L755
- [ ] **[ux] Set rename commits on blur even when Escape was pressed** — Blur fires after keyup and commits despite the cancel intent. Track an `escPressed` ref to suppress blur commit. `App.tsx` ~L350
- [ ] **[ux] Deleting the active set leaves a stale set name in the UI** — After delete the token list briefly shows the old set name before `refreshTokens` resolves. Immediately switch to the first remaining set on delete. `App.tsx` delete flow
- [ ] **[ui] Set tab rename input clips text before the allowed max length** — The inline `<input>` is narrower than the tab. Set `min-width` to match the tab's measured width. `App.tsx` ~L350 rename input
- [ ] **[ui] Overflow menu has no separator before destructive actions** — "Delete Set" sits adjacent to "Rename" with no divider. Add a `<hr>` before the delete item. `App.tsx` ~L687
- [ ] **[qa] Set name validation allows leading/trailing whitespace on rename** — `renameValue.trim()` strips it but the raw input still shows spaces. Trim on `onChange`. `App.tsx` ~L317
- [ ] **[qa] `setTabsOverflow` ResizeObserver may accumulate on rapid `sets` changes** — Confirm only one observer is alive at a time; verify cleanup on each effect re-run. `App.tsx` ~L283

---

## Screen B: Token List

- [ ] **[bug] `syncSnapshot` produces false-positive changed-dots for object-valued tokens** — `JSON.stringify` key order is non-deterministic; a dimension token can stringify differently on two runs. Use a stable key-sorted serialiser or deep-equal. `TokenList.tsx` sync snapshot logic
- [ ] **[bug] Find & Replace preview shows identical before/after when the segment is absent** — The preview renders both rows even when old === new. Hide the row or show "no match". `TokenList.tsx` ~L1326
- [ ] **[bug] Multi-select "Select all" count mismatches when filters are active** — `selectAll` iterates `displayedTokens` but the badge reads from the full token set. Scope both to `displayedTokens` consistently. `TokenList.tsx` multi-select
- [ ] **[bug] Convert-to-aliases: confirm button enabled with zero aliases selected** — Clicking fires a mutation with an empty map; the spinner clears with no feedback. Disable when nothing is selected. `TokenList.tsx` ~L1399
- [ ] **[qol] Filter state resets when switching sets** — Persist active type/group filters per-set in `localStorage`. `TokenList.tsx` filter state
- [ ] **[qol] Sort order resets to Default when switching sets** — Persist sort choice per-set in `localStorage`. `TokenList.tsx` ~L832
- [ ] **[qol] No way to jump from a token row to its parent group** — Add a clickable group path breadcrumb in the token row or editor header. `TokenList.tsx` row render
- [ ] **[ux] "Use preset" dropdown can immediately close on the same click that opens it** — The outside-click handler fires on the same `mousedown`. Distinguish `mousedown` open from `click` close. `TokenList.tsx` preset dropdown
- [ ] **[ux] Token row right-click context menu has no keyboard equivalent** — All context actions are mouse-only. Ensure the same menu opens on `Space`/`Enter` when the row is keyboard-focused. `TokenList.tsx` ~L1700
- [ ] **[ui] Lint dot buttons lack a focus ring and `focus-visible:opacity-100`** — Keyboard users cannot reach the fix-trigger buttons. Add `focus-visible:opacity-100 focus-visible:ring-2`. `TokenList.tsx` ~L1910
- [ ] **[ui] Group header `top-0` sticky value causes overlap with deeply nested groups** — Compute `top` offset based on nesting depth. `TokenList.tsx` group header render
- [ ] **[ui] Type badge colour mapping is implicit inline logic** — Codify into a `TOKEN_TYPE_COLORS` constant so all type-badge usages stay in sync. `TokenList.tsx` type badge
- [ ] **[qa] Deleting the last token in a group leaves the group header until next refresh** — Force an immediate refresh or local splice after delete. `TokenList.tsx` delete handler
- [ ] **[qa] Token paths with a literal dot in a segment are visually indistinguishable from nested groups** — Add escaping or quoted-segment display. `TokenList.tsx` path render
- [ ] **[qa] Find & Replace: empty "replace" field silently deletes path segments** — Require non-empty replace value or confirm before truncating. `TokenList.tsx` ~L1326

---

## Screen C: Token Editor

- [ ] **[bug] `hex.slice(0, 7)` strips alpha and permanently corrupts the saved value** — Editing `#FF000066` writes `#FF0000` to the server. Handle 8-char hex in both the color picker and value state. `TokenEditor.tsx` ~L419
- [ ] **[bug] `initialRef` not reset after save** — Dirty-check compares to the original pre-first-save state; a second edit in the same session always appears dirty from the wrong baseline. Reset `initialRef` after successful save. `TokenEditor.tsx` ~L75
- [ ] **[bug] Scopes section renders an empty list for types with no defined scopes** — `FIGMA_SCOPES[tokenType]` is `undefined` for `gradient`, `shadow`, `typography`. Hide the scopes section for unsupported types. `TokenEditor.tsx` ~L9
- [ ] **[qol] No way to copy the token path from inside the editor** — Add a copy-path icon in the editor header. `TokenEditor.tsx` header
- [ ] **[qol] Description `<textarea>` shrinks to near-zero when empty** — Add `placeholder` and `min-h` so the field is always discoverable. `TokenEditor.tsx` description textarea
- [ ] **[qol] Switching alias mode off discards the previous raw value** — Cache the pre-alias value and restore it on toggle-off. `TokenEditor.tsx` ~L185
- [ ] **[ux] Color preview swatch not shown when alias resolves to a color** — Resolve the alias chain and show the swatch in the editor header when `aliasMode` is true. `TokenEditor.tsx` header
- [ ] **[ux] Save button can be enabled on an untouched form** — If `initialRef` is set late the button may be enabled before any changes. Disable when `!isDirty`. `TokenEditor.tsx` ~L391
- [ ] **[ui] Scopes section label has no explanation tooltip** — Add `title="Scopes control which Figma properties this variable is offered for"`. `TokenEditor.tsx` ~L74
- [ ] **[ui] Long server error messages overflow the error container** — Add `break-words` and `max-h-16 overflow-auto` to the error display div. `TokenEditor.tsx` error display
- [ ] **[qa] `resolveColorValue` infinite loops on circular aliases** — A→B→A recurses until stack overflow. Add a visited-set depth guard. `TokenEditor.tsx` ~L42
- [ ] **[qa] Dimension token can save `{ value: NaN, unit: 'px' }` when the number input is cleared** — Validate field is non-empty and finite before enabling Save. `TokenEditor.tsx` dimension input
- [ ] **[qa] Typography token form doesn't require any sub-fields** — A token with `fontFamily: ''` saves and silently fails in Figma. Require at minimum `fontFamily` and `fontSize`. `TokenEditor.tsx` typography form

---

## Screen D: Theme Manager

- [ ] **[bug] Set-state click fires on the label column too** — Restrict the click target to the state control cell only, not the entire row. `ThemeManager.tsx` ~L130
- [ ] **[bug] "⚠ N uncovered" double-counts tokens whose alias chain crosses a disabled set** — Use the fully resolved value, not the first hop, to determine coverage. `ThemeManager.tsx` ~L194
- [ ] **[bug] Empty-theme message doesn't hide immediately after adding a set row** — Derive visibility from live `theme.sets.length`, not stale state. `ThemeManager.tsx` ~L177
- [ ] **[qol] No drag-to-reorder set rows within a theme** — Set order determines override precedence; users must delete and re-add to reorder. Add drag handles. `ThemeManager.tsx` set rows
- [ ] **[qol] Theme cards cannot be reordered** — Add drag-to-reorder at the card level. `ThemeManager.tsx` card list
- [ ] **[qol] No confirmation before deleting a theme** — Delete is immediate with no undo. Show a `ConfirmModal`. `ThemeManager.tsx` ~L186
- [ ] **[ux] New set row defaults to "disabled"** — Default new rows to `enabled` so they take effect immediately without an extra click. `ThemeManager.tsx` add-set handler
- [ ] **[ux] Theme creation name input doesn't auto-focus** — Add `useLayoutEffect` focus after the add-theme action. `ThemeManager.tsx` add-theme handler
- [ ] **[ui] Long theme names clip with no tooltip** — Add `title` attribute with full name to the card header. `ThemeManager.tsx` ~L186
- [ ] **[ui] "Source" state is visually identical to "enabled"** — Give "source" a distinct background tint or underline so all three states are perceptually distinct. `ThemeManager.tsx` ~L130
- [ ] **[qa] Theme name uniqueness not validated** — Two themes with the same name target the same Figma variable collection mode, causing silent overwrites. Validate uniqueness on create. `ThemeManager.tsx` create handler
- [ ] **[qa] Deleted token sets still appear in theme rows** — Filter out rows whose set name is absent from the current `sets` list on theme load. `ThemeManager.tsx` data load

---

## Screen E: Sync Panel

- [ ] **[bug] Git diff "conflicts" array is always empty in the UI** — `diffView.conflicts` is populated server-side but the render only iterates `localOnly` and `remoteOnly`. Add a conflicts section. `SyncPanel.tsx` ~L67
- [ ] **[bug] Commit button enabled with an empty message** — Disable when `commitMsg.trim() === ''`. `SyncPanel.tsx` commit handler
- [ ] **[bug] Variable diff "skip" rows may slip into the sync payload if state mutates mid-flight** — Snapshot `varDirs` at the moment the sync call is made, not at response time. `SyncPanel.tsx` varSyncing handler
- [ ] **[qol] No "Push all / Pull all / Skip all" bulk action for variable diff rows** — With 50+ rows, per-row direction selection is tedious. Add bulk-action buttons above the diff table. `SyncPanel.tsx` var diff section
- [ ] **[qol] Branch list not refreshed after push/pull** — Re-fetch branches after a successful operation. `SyncPanel.tsx` ~L99
- [ ] **[qol] Non-repo state hides the remote URL field** — Show the remote URL input and an "Initialise repo" button so users can bootstrap from the panel. `SyncPanel.tsx` not-repo state
- [ ] **[ux] Readiness checks fire immediately on panel open with no CTA** — Add a "Run checks" button and only auto-run if checks are stale (>30s). `SyncPanel.tsx` readiness checks
- [ ] **[ux] Variable diff "conflict" meaning is never explained** — Add a tooltip or inline legend. `SyncPanel.tsx` ~L26
- [ ] **[ux] Commit message textarea has no placeholder** — Add `placeholder="Describe your changes…"`. `SyncPanel.tsx` commit msg input
- [ ] **[ui] Readiness check icons use raw text `✓` / `✗`** — Replace with SVG icons consistent with the rest of the UI. `SyncPanel.tsx` readiness check render
- [ ] **[ui] Variable diff table has no column headers** — Add a sticky header row labelling Path, Local, and Figma columns. `SyncPanel.tsx` var diff table
- [ ] **[ui] Long branch names truncate with no tooltip** — Add `title` attribute to the branch name display. `SyncPanel.tsx` branch display
- [ ] **[qa] `fetchStatus` can race on rapid connect/disconnect** — Use `AbortController` to cancel in-flight requests on re-trigger. `SyncPanel.tsx` ~L87
- [ ] **[qa] `orphansResolveRef` never rejects on timeout** — Add a 10s rejection timeout so the loading spinner always clears. `SyncPanel.tsx` orphansResolveRef

---

## Screen F: Analytics Panel

- [ ] **[bug] Coverage scan: `coverageResolveRef` never rejects on timeout** — The loading spinner never clears on sandbox timeout or error. Add a 10s timeout that rejects and surfaces an error message. `AnalyticsPanel.tsx` ~L119
- [ ] **[bug] `runValidate` fires again if `validateKey` increments while already loading** — Guard with `if (!validateLoading)` in the `useEffect`. `AnalyticsPanel.tsx` ~L88
- [ ] **[bug] Contrast matrix rows are in insertion order, not sorted by ratio** — Sort ascending by contrast ratio so worst pairs appear first. `AnalyticsPanel.tsx` contrast matrix
- [ ] **[qol] No export for validation report** — Add "Copy as Markdown" or "Download JSON" to the results header. `AnalyticsPanel.tsx` validation results
- [ ] **[qol] Severity filter buttons don't show per-level counts** — Show `Error (3)` instead of just `Error`. `AnalyticsPanel.tsx` ~L52
- [ ] **[qol] Canonical pick for duplicate deduplication resets on navigation** — Persist `canonicalPick` in `localStorage` keyed by set. `AnalyticsPanel.tsx` ~L58
- [ ] **[ux] Validation issue rows have no "jump to token" affordance** — Wire `onNavigateToToken` so clicking an issue row navigates to the token. `AnalyticsPanel.tsx` issue list
- [ ] **[ux] Contrast matrix overflows the panel width** — Add `overflow-x-auto` or cap to the 10 lowest-contrast pairs with a "Show all" toggle. `AnalyticsPanel.tsx` contrast matrix
- [ ] **[ui] Stats section shows plain-text counts with no visual distribution** — Replace with an inline proportional bar chart per type. `AnalyticsPanel.tsx` stats section
- [ ] **[ui] Validation fetch error is silent** — The `catch` block sets results to `[]` with no message. Show "Validation failed — check server connection". `AnalyticsPanel.tsx` ~L82
- [ ] **[qa] Duplicate detection hashes by raw hex, not normalised hex** — `#F00` and `#FF0000` represent the same colour but are treated as different. Normalise to 6-char uppercase before comparing. `AnalyticsPanel.tsx` duplicate detection

---

## Screen G: Selection Inspector

- [ ] **[bug] "Sync Page" and "Sync Selection" appear when `connected === false`** — Wrap sync control render in `{connected && …}`. `SelectionInspector.tsx` ~L260
- [ ] **[bug] `handleCreateToken` doesn't validate token path format** — Paths like `..foo` or `foo..bar` are accepted. Apply the same regex used for set-name validation. `SelectionInspector.tsx` ~L174
- [ ] **[qol] No "View token →" link after Create & bind** — Show a brief success state with a "View token" link. `SelectionInspector.tsx` ~L188
- [ ] **[qol] "Remove binding" has no undo** — Push a remove-binding undo slot via the undo system. `SelectionInspector.tsx` ~L160
- [ ] **[ux] Multi-selection binding summary doesn't distinguish shared vs mixed** — "3 layers selected / 4 bindings" is opaque. Show "2 shared, 2 mixed". `SelectionInspector.tsx` ~L206
- [ ] **[ux] Property group labels use ALL-CAPS at 8px** — Hard to read. Use title case at 9px with normal letter-spacing. `SelectionInspector.tsx` ~L289
- [ ] **[ui] Color swatch is 12×12px and hard to see at small sizes** — Increase to 14×14px with a white inner border for transparency support. `SelectionInspector.tsx` ~L321
- [ ] **[ui] Inspector max-height is hardcoded at 200px** — Use a flex-based or percentage max-height at larger panel sizes. `SelectionInspector.tsx` ~L275
- [ ] **[ui] Create-token form appends below the inspector body and pushes content off-screen** — The form should replace the body, not append after it. `SelectionInspector.tsx` ~L382
- [ ] **[qa] `getTokenTypeForProperty` returns `'string'` as a silent fallback for unknown properties** — New `BindableProperty` values not handled here silently produce string-typed tokens. Add a dev-mode console warning. `SelectionInspector.tsx` ~L67

---

## Screen H: Import Panel

- [ ] **[bug] Read-variables message never arriving leaves the spinner running forever** — Add a 15s timeout that clears `loading` and shows an error. `ImportPanel.tsx` ~L36
- [ ] **[bug] Switching source while previous read is in-flight corrupts the token list** — Track the active source request and discard responses from superseded requests. `ImportPanel.tsx` ~L57
- [ ] **[bug] Import silently overwrites tokens with matching paths** — Preflight-check for conflicts and offer a merge strategy (skip/overwrite) before committing. `ImportPanel.tsx` import handler
- [ ] **[qol] No "Select all / Deselect all" toggle** — With 100+ tokens, individual checkboxes are impractical. Add a header checkbox. `ImportPanel.tsx` ~L23
- [ ] **[qol] No type filter on the token preview list** — Add a type-filter pill row above the list. `ImportPanel.tsx` token list
- [ ] **[qol] Target set defaults to `'imported'` regardless of existing sets** — Default to the first existing set or last-used import target (persisted in `localStorage`). `ImportPanel.tsx` ~L21
- [ ] **[ux] Loading state shows a generic spinner** — Show "Reading variables from Figma…" or "Reading styles from Figma…" based on `source`. `ImportPanel.tsx` loading state
- [ ] **[ux] Success has no token count** — Show "Imported N tokens" as a toast or inline message. `ImportPanel.tsx` success handler
- [ ] **[ux] Alias token values show raw `{other.token}` with no resolved preview** — Add a hover tooltip resolving the alias. `ImportPanel.tsx` token preview
- [ ] **[ui] Token preview list is ungrouped** — Group by collection (variables) or type (styles) for scanability. `ImportPanel.tsx` token list
- [ ] **[ui] "Read Variables" and "Read Styles" are equal-weight buttons** — Make the more-common action (Read Variables) a filled primary button. `ImportPanel.tsx` ~L57
- [ ] **[qa] `selectedTokens` Set may reference stale tokens if a second `variables-read` arrives** — Re-derive `selectedTokens` from the current `tokens` state in the import handler. `ImportPanel.tsx` ~L43

---

## Screen I: Export Panel

- [ ] **[bug] Platform export error is swallowed when `figmaLoading` is true** — The error handler is guarded by `&& figmaLoading`; separate the two error states. `ExportPanel.tsx` ~L74
- [ ] **[bug] `expandedFile` points to a deleted file after re-export** — Reset `expandedFile` when a new export starts. `ExportPanel.tsx` ~L53
- [ ] **[bug] Empty Figma-variables result doesn't reset `expandedCollection`** — Stale expanded state renders empty sections. Reset to `null` when result arrives empty. `ExportPanel.tsx` ~L70
- [ ] **[qol] No "Copy to clipboard" for individual exported files** — Add a copy button in each file's header row. `ExportPanel.tsx` file preview
- [ ] **[qol] Platform selection doesn't persist between sessions** — Persist `selected` in `localStorage`. `ExportPanel.tsx` ~L49
- [ ] **[qol] No "Download all as ZIP" when multiple platforms are exported** — Add a download-all action. `ExportPanel.tsx` results area
- [ ] **[ux] Platform `description` field exists but is never rendered** — Show it as subtitle text under each platform label. `ExportPanel.tsx` ~L14
- [ ] **[ux] Figma variables tree has no search/filter** — With many variables the tree is hard to scan. Add a filter bar. `ExportPanel.tsx` figma tree
- [ ] **[ui] File content `<pre>` has no max-height** — Long exports expand the panel indefinitely. Add `max-h-48 overflow-auto`. `ExportPanel.tsx` file preview
- [ ] **[ui] No timestamp on the last export run** — Add a "Exported just now" label next to the results header. `ExportPanel.tsx` results header
- [ ] **[qa] `canExport` should derive from `selected.size > 0` explicitly** — The current check may allow export with zero platforms if the `Set` reference is replaced. `ExportPanel.tsx` ~L49

---

## Screen J: Command Palette

- [ ] **[bug] `activeIdx` can reference `undefined` when query changes between render and effect** — Guard `execute` with `if (filtered[activeIdx])`. `CommandPalette.tsx` ~L73
- [ ] **[bug] Focus is not trapped inside the palette overlay** — Tab-key moves focus to the underlying UI. Trap focus within the palette. `CommandPalette.tsx`
- [ ] **[qol] No recently-used commands section** — Show the 3 most-recently executed commands at the top when query is empty (persisted in `localStorage`). `CommandPalette.tsx` ~L54
- [ ] **[qol] `onClose()` called before `cmd.handler()`** — If the handler opens a modal the panel re-renders between close and open causing a flash. Call `onClose()` after `cmd.handler()`. `CommandPalette.tsx` ~L73
- [ ] **[ux] Empty results state is blank** — Show "No commands match '{query}'" with a "Clear" link. `CommandPalette.tsx` empty state
- [ ] **[ux] Backdrop click doesn't close the palette** — Add an `onClick` handler on the backdrop element. `CommandPalette.tsx` backdrop
- [ ] **[ui] Keyboard-selected item uses the same highlight as mouse-hover** — Use the accent colour at /20 opacity for keyboard selection so the two states are distinguishable. `CommandPalette.tsx` ~L80
- [ ] **[ui] Long descriptions truncate with no tooltip** — Add `title` attribute with full description text. `CommandPalette.tsx` description render

---

## Screen K: Scaffolding Wizard

- [ ] **[bug] Preset insertion doesn't check for existing tokens at the prefix path** — `spacing.xs` is silently overwritten. Preflight-check with a GET and warn on conflicts. `ScaffoldingWizard.tsx` insert handler
- [ ] **[bug] Prefix validation runs on submit only** — Validate inline on `onChange` to give immediate feedback. `ScaffoldingWizard.tsx` prefix input
- [ ] **[qol] No token preview before insert** — Show the list of paths and values with a "Confirm" step before writing. `ScaffoldingWizard.tsx` confirm step
- [ ] **[qol] Prefix field doesn't auto-populate from `preset.defaultPrefix`** — Default the input to `preset.defaultPrefix` when a preset is selected. `ScaffoldingWizard.tsx` preset select handler
- [ ] **[qol] No success toast after insert** — Show "Inserted N tokens" after a successful write. `ScaffoldingWizard.tsx` success handler
- [ ] **[ux] Preset `description` field is never rendered** — Show it as a subtitle in the preset list. `ScaffoldingWizard.tsx` preset list
- [ ] **[ui] Selected preset has no checkmark or radio indicator** — A background tint alone is insufficient. Add a leading checkmark icon. `ScaffoldingWizard.tsx` preset list item
- [ ] **[qa] No target-set confirmation** — If a critical set is active, presets will overwrite it silently. Show the target set name prominently and offer a set-picker. `ScaffoldingWizard.tsx`

---

## Screen L: Color Scale Generator

- [ ] **[bug] `generateScale` returns `[]` silently on invalid hex** — A partially typed colour leaves the preview blank. Show "Invalid color" inline. `ColorScaleGenerator.tsx` ~L24
- [ ] **[bug] Sparkline uses hardcoded `width={240}` instead of `viewBox`** — Coordinate points don't fill actual width when the SVG scales with CSS. Replace with a `viewBox`-based approach. `ColorScaleGenerator.tsx` ~L78
- [ ] **[bug] Sparkline jump-highlight uses hardcoded `stroke="red"`** — Replace with `var(--color-figma-error)` for theme consistency. `ColorScaleGenerator.tsx` ~L80
- [ ] **[qol] No "Copy palette as JSON" action** — Add a button producing a DTCG-format snippet ready to paste into the Paste Tokens modal. `ColorScaleGenerator.tsx` actions
- [ ] **[qol] No "Save to set" path** — Add a "Save to set" button with a set-picker and prefix field. `ColorScaleGenerator.tsx`
- [ ] **[qol] Base colour input has no colour picker companion** — Add a native `<input type="color">` alongside the hex text input. `ColorScaleGenerator.tsx` base colour input
- [ ] **[ux] Bell-curve chroma logic is unexplained** — Add a tooltip on the sparkline: "Chroma peaks in midtones and tapers at extremes for a perceptually even scale." `ColorScaleGenerator.tsx` sparkline area
- [ ] **[ui] Scale step swatches don't show the L* value** — Add a small L* label below each swatch so the perceptual distribution is legible. `ColorScaleGenerator.tsx` swatch render
- [ ] **[qa] `labToHex` can produce channel values outside `[0, 255]`** — Clamp each channel before converting to avoid malformed hex strings. `colorUtils.ts` labToHex

---

## Screen M: Paste Tokens Modal

- [ ] **[bug] Alias values inferred as `'color'` type** — `inferType` returns `$type: 'color'` for any `{…}` syntax. Return `$type: 'unknown'` or defer typing until a target token is resolved. `PasteTokensModal.tsx` ~L21
- [ ] **[bug] `name: value` line parser leaves a leading space on the value** — `--spacing-md: 16px` splits on `:` and produces value `' 16px'`. Trim the value and strip the `--` prefix. `PasteTokensModal.tsx` ~L76
- [ ] **[qol] No conflict resolution strategy** — Pasted tokens that collide are silently overwritten. Offer "skip / overwrite / rename with suffix". `PasteTokensModal.tsx` submit handler
- [ ] **[qol] Always writes to `activeSet` with no set picker** — Add a compact set-picker dropdown in the modal footer. `PasteTokensModal.tsx` footer
- [ ] **[qol] Textarea not auto-focused on open** — Add `autoFocus` or `useLayoutEffect` focus. `PasteTokensModal.tsx` textarea
- [ ] **[ux] JSON parse errors displayed as a raw string** — Multi-line messages with line/col info should render in a `<pre>` with monospace font. `PasteTokensModal.tsx` error display
- [ ] **[ui] Preview list has no height constraint** — A 1000-token paste expands the modal past the viewport. Add `max-h-64 overflow-y-auto`. `PasteTokensModal.tsx` preview list
- [ ] **[qa] `inferType` types positive integers as `number` not `dimension`** — In most design contexts a bare `16` means `16px`. Prompt the user to confirm type when the value is a positive integer. `PasteTokensModal.tsx` ~L18

---

## Screen N: Undo Toast

- [ ] **[bug] Auto-dismiss timer not reset when a new undo slot is pushed** — If `pushUndo` is called twice quickly the second toast dismisses on the first timer. Reset the timer on every `pushUndo`. `useUndo.ts`
- [ ] **[bug] `executeUndo` dismisses silently with no "Undone" confirmation** — Show a brief "Undone" state for 1s after a successful undo. `UndoToast.tsx`
- [ ] **[qol] Only one undo level is supported** — Implement a small undo stack (3–5 levels). `useUndo.ts`
- [ ] **[qol] Undo toast doesn't describe the undoable action** — Show "Undo delete 'color.primary'" using the slot's action label. `UndoToast.tsx`
- [ ] **[ui] Toast position may overlap the bottom action bar** — Position above the action bar by accounting for its height. `UndoToast.tsx`
- [ ] **[qa] `executeUndo` doesn't check server connection before calling the undo action** — Show an error toast if the undo fetch fails. `useUndo.ts`

---

## Holistic / Cross-cutting

- [ ] **[bug] `resolveAllAliases` runs synchronously on every `tokens` change** — With 1000+ tokens this blocks the main thread. Move to a `useEffect` that writes to state, or offload to a Web Worker. `App.tsx` ~L184
- [ ] **[bug] No error surfacing for failed `refreshTokens`** — If the API call throws, `tokens` goes stale with no user-facing indicator. Show a "Failed to load tokens" banner. `useTokens.ts`
- [ ] **[bug] Multiple components register independent `message` event listeners with no deduplication** — `App.tsx`, `SyncPanel.tsx`, `SelectionInspector.tsx`, `ImportPanel.tsx`, `ExportPanel.tsx`, and `AnalyticsPanel.tsx` all add `window.addEventListener('message', …)`. A missed type check in any handler can pollute other components. Introduce a central message router. `App.tsx`
- [ ] **[qol] No keyboard shortcut reference** — Add a `shortcuts` command to the palette that opens a modal listing all shortcuts. `App.tsx` commands list
- [ ] **[qol] Scroll position resets on every set switch** — Persist per-set scroll position in a ref and restore it on switch. `TokenList.tsx` scroll state
- [ ] **[qol] No theme override for the plugin** — Plugin follows Figma's dark/light theme with no user override. Add a toggle in Settings. `App.tsx` settings panel
- [ ] **[ux] No first-launch onboarding** — The plugin opens to a blank token list with no guidance. Add a first-launch empty state linking to docs or triggering the ScaffoldingWizard. `App.tsx` empty state
- [ ] **[ux] ConfirmModal doesn't indicate whether an action is reversible** — Destructive actions should include "This cannot be undone." in the modal body. `ConfirmModal.tsx`
- [ ] **[ui] Focus rings are inconsistently applied** — Many elements have `focus:outline-none` without a replacement indicator, failing WCAG 2.1 SC 2.4.7. Audit all `outline-none` usages and replace with `focus-visible:ring-2 focus-visible:ring-[var(--color-figma-accent)]`. All files
- [ ] **[ui] Native OS scrollbars shift layout on Windows** — Add `scrollbar-width: thin; scrollbar-color: var(--color-figma-border) transparent` globally. `main.tsx` or global CSS
- [ ] **[ui] No minimum plugin width enforced** — At very narrow Figma panel widths, badges and buttons overlap. Set `min-width: 280px` on the root element. `main.tsx`
- [ ] **[ui] Monospace font falls back to system default** — Token paths and code snippets render inconsistently across machines. Set an explicit `font-family: 'SF Mono', 'JetBrains Mono', monospace` for mono contexts. global CSS
- [ ] **[qa] `localStorage.setItem` calls are unwrapped** — `setItem` can throw `QuotaExceededError` in private browsing. Wrap all writes in try/catch. Multiple files
- [ ] **[qa] All `fetch` calls lack a timeout** — A slow server hangs the UI indefinitely. Add a 10s `AbortController` timeout to all API calls. `useTokens.ts`, `SyncPanel.tsx`, `AnalyticsPanel.tsx`
- [ ] **[qa] `pathToSet` has last-write-wins behaviour for duplicate cross-set paths** — If `color.primary` exists in both `base` and `brand`, navigation always goes to the last-written set. Warn when duplicate cross-set paths are detected. `App.tsx` ~L183
- [ ] **[qa] Plugin sandbox messages lack correlation IDs** — Concurrent operations of the same type can cross-wire their responses. Add a `reqId` field to each request/response pair. `controller.ts`
