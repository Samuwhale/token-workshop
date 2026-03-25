# UX Improvement Backlog
<!-- Status: [ ] todo  [~] in-progress  [x] done -->
<!-- Goal: no new features — only improve what already exists -->

## Agent Workflow Instructions

Agents may pick up items from this backlog and work autonomously. Ground rules:

**Workflow per item:**
1. Mark the item `[~]` before starting.
2. Assess complexity:
   - **Simple** (single file, change is obvious): plan inline, then execute.
   - **Complex** (multiple files, unclear scope, or behaviour change): dispatch a subagent to produce a plan first, then a second subagent to execute it.
3. Always dispatch a final validation subagent (or validate inline for simple items) before marking `[x]`. Validation should confirm the change works as intended — build check, visual review, or logic review as appropriate.

**General rules:**
- Partial work is fine — do not revert. If stopping mid-item, leave it `[~]` and add a progress note directly below it so the next agent can continue.
- Stop rather than produce low-quality work. If a fix requires more context than is available, skip it and leave it `[ ]`.
- If context is running low, stop cleanly after the current item. Do not start the next item.
- Prefer the smallest safe change.

## Cat 1: Discoverability & Affordance

- [ ] **Group actions invisible** — Group hover only shows delete; rename/move/duplicate/scopes/sync are right-click only with no hint. Add a `⋯` button on group hover that opens the same menu. `TokenList.tsx` ~L1715 group render
- [ ] **Type badge has no affordance** — Clicking type pill filters list but cursor/hover state don't signal interactivity. Add `cursor-pointer`, visible hover bg, tooltip "Click to filter by {type}". `TokenList.tsx` ~L1882
- [x] **"By usage" sort is a dead end** — Disabled option with no nearby trigger. Remove until ready, or add a scan button adjacent to sort dropdown. `TokenList.tsx` ~L832
- [ ] **Command palette undiscoverable** — `⌘K` only; no button or hint in UI. Add a search/command icon in the tab bar header with shortcut label. `App.tsx` ~L234
- [ ] **Theme state cycling invisible** — Click-to-cycle (disabled→enabled→source) has no affordance. Replace with an explicit select/segmented control per row; add a legend explaining the three states. `ThemeManager.tsx` ~L130
- [x] **Apply as Variables vs Styles unexplained** — Two equal-weight buttons, no differentiation. Add `title` tooltips explaining each. `TokenList.tsx` ~L1139

## Cat 2: Layout Instability & Hover Jank

- [ ] **Token row hover actions shift layout** — 5 buttons appear inline and push content on hover. Reserve fixed-width space with `opacity-0 group-hover:opacity-100` so no layout shift. `TokenList.tsx` ~L1965
- [ ] **Group hover delete causes accidental deletes** — Delete is the only hover action. Replace with a `⋯` menu; delete becomes a menu item. `TokenList.tsx` ~L1715
- [ ] **Set tab ⋯ inconsistently visible** — Inactive tabs show button only on hover; active always shows it. Ensure no layout shift between states. `App.tsx` ~L654

## Cat 3: IA & Labeling

- [x] **"Select" is ambiguous** — Reads as text-select. Rename to "Multi-select" or "Select tokens". `TokenList.tsx` ~L1119
- [ ] **Complex types show raw JSON in value column** — Shadow/typography/gradient show truncated JSON. Show human-readable summary (e.g., "16px / 400 / Inter" for typography). `TokenList.tsx` `formatValue()` + ~L1908
- [ ] **Toolbar: mode toggles look like one-shot actions** — Bound tokens/Table are modes; Expand/Collapse are actions. Give modes a distinct pressed/active appearance. `TokenList.tsx` ~L786
- [ ] **Disabled set menu items unexplained** — "Generate Semantic Tokens" etc. appear first in the menu, greyed out, no tooltip. Move to bottom or add prerequisite tooltip. `App.tsx` ~L687
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

## Cat 5: Empty & Loading States

- [ ] **Loading states are text-only** — No spinner. Add a consistent loading indicator (CSS animation) reused across all loading states. `ThemeManager.tsx` ~L161, `SyncPanel.tsx` ~L388, `TokenEditor.tsx` ~L144
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

## Cat 7: Terminology

- [x] **Push/Pull direction ambiguous in variable sync** — No indication of which direction (local→Figma vs Figma→local). Label as "Push to Figma ↑" / "Pull from Figma ↓". `SyncPanel.tsx` variable diff rows
- [ ] **Three names for the same concept** — "Extract to alias" (context menu), "Convert to aliases" (select mode), "Promote to Semantic" (internal). Pick one name and apply consistently. Suggested: "Link to token" (single) / "Link to tokens" (bulk).
- [x] **"Set Metadata" contains only a description** — Name implies richer data. Rename to "Set description" or "Edit description". `App.tsx` ~L896
