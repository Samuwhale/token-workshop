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

- [x] Global unmodified keyboard shortcuts trigger unexpected mutations — the token list container's `handleListKeyDown` registers N (new token), M (toggle multi-select), and Backspace (delete) as global single-key shortcuts that fire whenever a token row has focus; these are dangerous because they conflict with expected text-editing behavior and fire without modifier keys; N conflicts with pressing "n" to search; Backspace is one key away from a delete when focus returns to the list unexpectedly; replace N with Cmd+N, keep M as-is (it's a mode toggle with no destructive effect), verify Backspace is guarded against firing when the row's delete action is not meaningful (e.g., no row focused); note: letters like G, R, E, X shown in context menus are context-menu-only accelerators — they fire only while the dropdown is open, which is correct behavior and should not be changed; files: `shortcutRegistry.ts`, `TokenList.tsx` (handleListKeyDown, ~L1095–1160)

---

## Token Management

### Bugs

### QoL

### UX

- [x] Token rows display too many simultaneous indicators — a single leaf row shows up to 15+ pieces of information at once (depth bar, swatch, name, type badge at 8px font, lifecycle badge, provenance badge, extends indicator, generator source/derived badges, alias link, resolution chain badge, value text, duplicate-value dot, lint icon, cascade-change dot, usage count, sync-change dot) plus 9 hover-revealed action buttons; at 28px row height in a ~350px plugin window many of these are below legible size; apply progressive disclosure: (1) default row state: swatch + name + value + at most one status indicator using a strict priority order — lint violation > sync-changed > duplicate value; suppress all other badges; (2) when a token row is selected/focused: also show type badge and alias target path (if aliased); (3) all other metadata (lifecycle, provenance, extends, generator source, resolution chain, usage count) moves to the `TokenDetailPreview` side panel which already exists for this purpose; hover actions: keep edit button, copy path button, apply-to-selection button; remove move-up/move-down buttons (drag handles are sufficient); remove pin and star (merge into a single "favorite" concept); files: `TokenTreeNode.tsx` (TokenLeafNode component, lines ~1020–2800), `tokenListTypes.ts` (DENSITY_ROW_HEIGHT, DENSITY_SWATCH_SIZE constants)
- [x] Token context menus are too long to scan — the token row context menu has ~18 items and the group context menu has ~13; users cannot scan a menu this long; restructure both menus with a "More..." submenu pattern: token primary (max 6): Edit, Rename, Delete, Copy path, Apply to selection (only shown when Figma has a layer selected), More...; token More...: Duplicate, Move to set, Copy to set, Extract to alias, Compare across themes, Find references, View history; group primary (max 5): Add token, Rename, Delete, Generate scale, More...; group More...: New subgroup, Edit type & description, Move to set, Copy to set, Duplicate, Set scopes, Sync to Figma variables/styles; note: "Generate scale" in the group primary menu is a dependency of the quick-generator task — if that task ships first, this item becomes "Generate..." opening the quick-generator popover directly; files: `TokenTreeNode.tsx` (group context menu ~L720–930, token context menu ~L2260–2400), `useMenuKeyboard.ts`
- [x] Token creation entry points are inconsistent with each other — the inline create form (inside TokenList), the full TokenEditor in create mode, the command palette, context menu "Create sibling", and empty state each offer different subsets of fields and behave differently on validation errors; the fix is not to remove entry points but to make them consistent: (1) the inline form should offer only name + type + value, nothing else — strip the description field and any advanced options from it (those belong in the editor); (2) the full editor create mode is the canonical path for everything else and all other paths (command palette create, "Create sibling", empty state button) should invoke it; (3) the paste modal and import panel are batch operations and intentionally different — leave them alone; files: `useTokenCreate.ts` (inline create hook), `TokenEditor.tsx` (isCreateMode path), `TokenList.tsx` (inline create form rendering ~L1800–2000)
- [x] Boolean tokens mutate on single-click with no confirmation — `boolean` is in `INLINE_SIMPLE_TYPES` (`tokenListTypes.ts:217`) meaning it uses the inline edit path, but the inline edit for booleans immediately toggles the value on click rather than opening a text input like other types in that set; this is the only token type that mutates on a single click, which is inconsistent and dangerous (fat-finger on a token row changes a value); fix: boolean inline editing should require the same double-click activation as other INLINE_SIMPLE_TYPES; on double-click activation, show a small inline toggle button (true/false) that the user explicitly commits with Enter or by clicking elsewhere — do not auto-save on the first click; the single-click on a token row should only select/focus the row, never mutate; files: `TokenTreeNode.tsx` (inline edit activation logic for booleans, search for INLINE_SIMPLE_TYPES usage), `tokenListTypes.ts` (line 217, INLINE_SIMPLE_TYPES constant)
- [~] Too many token list viewing modes create an overwhelming UI — the toolbar exposes: 3 density options, a condensed-view toggle (`CONDENSED_MAX_DEPTH = 3`, key `tm_condensed_view`), 6 sort orders (`default | alpha-asc | alpha-desc | by-type | by-value | by-usage`), stats bar toggle, JSON view toggle, show-resolved-values toggle, plus search filters; most users never need most of these; reduce the persistent toolbar controls: keep 2 densities (rename `default` → `comfortable`, keep `compact`; remove the `comfortable` option or fold it into `default`); reduce sort to 3 options (`default`, `alpha-asc`, `by-type`) — remove `alpha-desc`, `by-value`, `by-usage` since these are edge-case audit tools; move stats bar, JSON view, and show-resolved-values out of the toolbar and into the command palette as toggleable settings (they persist via localStorage so the state is preserved); keep condensed view as-is since zoom-into-group serves a different purpose (navigation vs display density); files: `TokenList.tsx` (toolbar rendering and sort UI), `tokenListTypes.ts` (SortOrder type, Density type, DENSITY_ROW_HEIGHT), `storage.ts` (STORAGE_KEYS.DENSITY, STORAGE_KEYS.CONDENSED_VIEW)
- [ ] Structured search qualifiers are undiscoverable — the search bar supports 14 qualifiers (`type:`, `has:alias`, `has:direct`, `has:duplicate`, `has:description`, `has:extension`, `has:generated`, `has:unused`, `value:`, `desc:`, `path:`, `name:`, `generator:`, `group:` — defined in `tokenListUtils.ts` QUERY_QUALIFIERS) but the UI provides zero hints that these exist; add two discoverability mechanisms: (1) when the user types a word followed by a colon (e.g., "type:") show an autocomplete dropdown listing valid completions — for `type:` show all token type names, for `has:` show alias/direct/duplicate/etc., for other qualifiers show a text hint; (2) add a small filter-icon button (funnel icon) to the right of the search bar that opens a compact filter panel with checkbox groups (token type checkboxes, has: toggles for alias/unused/duplicate/generated) — selecting options constructs the qualifier string in the search bar so users learn the syntax by using the UI; do NOT use rotating placeholder text — a static placeholder like `Search… (type: has: value:)` with a tooltip on hover is sufficient and less distracting; files: `TokenList.tsx` (search bar rendering and `useTokenSearch` integration), `tokenListUtils.ts` (QUERY_QUALIFIERS constant, ~L148–163), `useTokenSearch.ts`

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

- [ ] Generator-backed token groups give no actionable information inline — the current signal is a small tag with an amber border (`border border-amber-500/30`) on the group header in the token tree (`TokenTreeNode.tsx` ~L628–634) linking to the Generators tab; to do anything with a generator (re-run it, tweak config, see what changed) users must leave the Tokens tab entirely; add an inline generator summary that renders inside the group row when the group is expanded (chevron-open state, not just selected): show the source token path (or "standalone"), generator type label, last-run timestamp, and two buttons — "Re-run" (calls `POST /api/generators/{id}/run`) and "Edit" (opens the existing `TokenGeneratorDialog` in a bottom drawer or side panel, same as token editing uses); this does not require restructuring the Generators tab — it only adds information to a group row that is already visually identified as generator-backed; the Generators tab remains unchanged; scope note: do NOT attempt to embed the full generator config editor inline — that is a separate larger effort; files: `TokenTreeNode.tsx` (TokenGroupNode component, generator badge rendering ~L595–634), `GeneratorPipelineCard.tsx` (reference for Re-run / Edit patterns), `useGenerators.ts` (derivedTokenPaths, generatorsBySource maps)
- [ ] Creating a generator for a simple case requires a full-screen modal — right-clicking a color or dimension token and choosing "Generate scale..." opens `TokenGeneratorDialog`, a full-screen modal with 3 collapsible sections; for the common case (source token is already known, just need to pick steps and confirm) this is too heavyweight; add a quick-generator popover: when "Generate color ramp..." or "Generate spacing scale..." is invoked from a token's context menu (where the source token is already known), open a compact popover (not a modal) showing only: the pre-filled source token, the most relevant config controls (color ramp: steps count + lightness range; type scale: ratio preset + steps preset; spacing scale: steps preset; others: steps count), a live preview strip (call `POST /api/generators/preview` with debounce — this endpoint already exists), and a "Create" button; on confirm: use the current active set as target set, derive the target group from the source token's parent group path (e.g., source `colors.brand.primary` → target group `colors.brand`), auto-name the generator from source + type; the full `TokenGeneratorDialog` remains accessible via "Advanced options..." link in the popover for multi-brand, semantic aliases, custom formulas, and overwrite review; files: `TokenTreeNode.tsx` (token context menu, add new entry), `TokenGeneratorDialog.tsx` (reference for config components to extract), `generatorUtils.ts` (defaultConfigForType, autoName, suggestTargetGroup — reuse these for defaults)
- [ ] Stale generator notification is easy to miss — when a source token changes, the staleness signal is an amber-bordered tag on the generator's target group header (`TokenTreeNode.tsx` ~L628–634, `border-amber-500/30`); in a dense tree with many groups this tag is easy to overlook, and there is no signal at the top of the list or in the tab bar beyond the tab badge count; add a dismissable notification bar between the search/filter row and the token list: "N generator(s) in [set name] are out of date — [Regenerate all] [Dismiss]"; "Regenerate all" should run only generators where `targetSet === activeSet` and `isStale === true` (call `POST /api/generators/{id}/run` for each in sequence, show a spinner during); bar should be dismissable per-session (localStorage key) and re-appear if staleness changes; the existing amber border on the tag should also be made slightly more visible (increase opacity from 30% to 60%, `border-amber-500/60`); files: `TokenList.tsx` (add banner between filter row and virtual list), `useGenerators.ts` (generators array and isStale field), `storage.ts` (add a key for dismissed stale banner)

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

- [ ] Sub-readable badge font sizes and undersized interactive targets — several elements in the token tree use font sizes below readable thresholds: type badges use 8px (`text-[8px]`), provenance badges are 7×7px SVG-only icons, the `Recommended` badge in the generator type selector uses 7px (`text-[7px]`); additionally, several interactive elements (type badge click area for filtering, provenance badge, resolution-chain badge) have click areas well below WCAG 2.2's 24×24px minimum because they have no padding; fix: audit all badge components in `TokenTreeNode.tsx` for font sizes below 10px and increase to 10px minimum; add `min-h-[24px] min-w-[24px]` or equivalent padding to all clickable badge elements; this does not require changing the visual size of badges — use padding to extend the hit area beyond the visual boundary; files: `TokenTreeNode.tsx` (badge rendering throughout TokenLeafNode), `tokenListTypes.ts` (DENSITY_SWATCH_SIZE), `styles.css` (token type badge CSS classes); note: full light theme support is a separate large effort and is intentionally out of scope for this task

### Maintainability

- [ ] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
