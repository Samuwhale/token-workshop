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

- [x] App shell navigation mixes task navigation, section navigation, utilities, and status indicators into one crowded header — the current shell combines 5 flat tabs, hidden inner tabs for `Inspect` and `Ship`, a row of utility toggles (issues filter, preview, command palette, expand, canvas analysis, undo/history, notifications, settings), and a separate overflow menu; this makes the IA hard to learn because the user must understand internal app structure before they can accomplish a goal; redesign the shell around user jobs instead of implementation groupings: keep a small set of primary workspaces with explicit names that match designer/design-system workflows (for example: `Tokens`, `Themes`, `Apply`, `Sync`, `Audit`), remove umbrella labels like `Inspect` and `Ship`, and move non-navigation utilities out of the persistent tab row into contextual panel actions or a single utilities surface; success criteria: (1) no primary tab should hide multiple unrelated workflows behind a second row unless those workflows are tightly related, (2) the top header should no longer be the dumping ground for status badges and infrequent toggles, (3) import/settings remain reachable but are clearly secondary utilities, not peer destinations; keep the backlog items already covering token-list density, context menus, and search discoverability separate — this task is about the global shell and IA only; files: `packages/figma-plugin/src/ui/shared/navigationTypes.ts`, `packages/figma-plugin/src/ui/App.tsx`, `packages/figma-plugin/src/ui/panels/PanelRouter.tsx`
- [x] Onboarding and empty-state entry points are fragmented and compete with each other — the app currently has a first-run welcome prompt, a guided setup wizard, an empty-state action list, a quick-start template dialog, manual create paths, and generator/template-driven starts; these overlap conceptually and make the first user decision much harder than it should be; replace them with a single canonical “start here” flow that asks one question first: “How do you want to begin?” with at most 3 branches: `Import an existing system`, `Start from a template`, `Start manually`; everything else should become a sub-step within one of those branches rather than a parallel top-level entry point; required constraints: (1) keep the guided setup path for true first-time users, but make it one branch of the unified start flow, (2) quick-start templates should live under `Start from a template`, not as a separate competing modal, (3) manual token creation should not appear as a peer to more strategic setup choices unless the user explicitly chooses manual setup; this task should also rewrite the copy so the mental model is design-system-first rather than implementation-first; files: `packages/figma-plugin/src/ui/components/WelcomePrompt.tsx`, `packages/figma-plugin/src/ui/components/EmptyState.tsx`, `packages/figma-plugin/src/ui/components/QuickStartDialog.tsx`, `packages/figma-plugin/src/ui/components/QuickStartWizard.tsx`, `packages/figma-plugin/src/ui/App.tsx`
- [x] Token set switching and token set management are split across too many inconsistent surfaces — the same concept currently appears as horizontal set tabs, a sidebar tree when set count grows, duplicated context menus, and a separate `SetSwitcher` dialog with `Switch` and `Manage` modes plus bulk actions; this makes sets feel unstable and increases the amount of UI a user must scan before understanding where to rename, reorder, merge, split, or bulk edit them; redesign this so there is one lightweight set-switching surface and one clearly separate management surface; target behavior: (1) switching sets should be fast and visually quiet, (2) management actions such as rename/duplicate/reorder/move to folder/merge/split/bulk delete should live in one dedicated manager rather than being replicated across the shell, (3) crossing the threshold from tabs to sidebar should not fundamentally change the interaction model; preserve the existing capability set, but reduce duplication and choose one information architecture for sets; files: `packages/figma-plugin/src/ui/App.tsx`, `packages/figma-plugin/src/ui/components/SetSwitcher.tsx`

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
- [x] Too many token list viewing modes create an overwhelming UI — the toolbar exposes: 3 density options, a condensed-view toggle (`CONDENSED_MAX_DEPTH = 3`, key `tm_condensed_view`), 6 sort orders (`default | alpha-asc | alpha-desc | by-type | by-value | by-usage`), stats bar toggle, JSON view toggle, show-resolved-values toggle, plus search filters; most users never need most of these; reduce the persistent toolbar controls: keep 2 densities (rename `default` → `comfortable`, keep `compact`; remove the `comfortable` option or fold it into `default`); reduce sort to 3 options (`default`, `alpha-asc`, `by-type`) — remove `alpha-desc`, `by-value`, `by-usage` since these are edge-case audit tools; move stats bar, JSON view, and show-resolved-values out of the toolbar and into the command palette as toggleable settings (they persist via localStorage so the state is preserved); keep condensed view as-is since zoom-into-group serves a different purpose (navigation vs display density); files: `TokenList.tsx` (toolbar rendering and sort UI), `tokenListTypes.ts` (SortOrder type, Density type, DENSITY_ROW_HEIGHT), `storage.ts` (STORAGE_KEYS.DENSITY, STORAGE_KEYS.CONDENSED_VIEW)
- [x] Structured search qualifiers are undiscoverable — the search bar supports 14 qualifiers (`type:`, `has:alias`, `has:direct`, `has:duplicate`, `has:description`, `has:extension`, `has:generated`, `has:unused`, `value:`, `desc:`, `path:`, `name:`, `generator:`, `group:` — defined in `tokenListUtils.ts` QUERY_QUALIFIERS) but the UI provides zero hints that these exist; add two discoverability mechanisms: (1) when the user types a word followed by a colon (e.g., "type:") show an autocomplete dropdown listing valid completions — for `type:` show all token type names, for `has:` show alias/direct/duplicate/etc., for other qualifiers show a text hint; (2) add a small filter-icon button (funnel icon) to the right of the search bar that opens a compact filter panel with checkbox groups (token type checkboxes, has: toggles for alias/unused/duplicate/generated) — selecting options constructs the qualifier string in the search bar so users learn the syntax by using the UI; do NOT use rotating placeholder text — a static placeholder like `Search… (type: has: value:)` with a tooltip on hover is sufficient and less distracting; files: `TokenList.tsx` (search bar rendering and `useTokenSearch` integration), `tokenListUtils.ts` (QUERY_QUALIFIERS constant, ~L148–163), `useTokenSearch.ts`

---

## Theme Management

### Bugs

### QoL

### UX

- [x] Theme authoring mixes beginner workflows with advanced resolver workflows too early — the current `ThemeManager` asks users to choose between `Theme Layers` and `DTCG Resolvers`, then also exposes `Dimensions`, `Coverage`, and `Compare` as peer views inside the same area; for designers and design-system maintainers this is too much conceptual branching before they have even created a usable theme axis; restructure the theme area around the primary authoring job first: create axes, define options, map sets, preview active combinations; move resolver-specific concepts behind an explicit advanced entry point such as `Advanced theme logic` instead of presenting them as a near-equal top-level mode; constraints: (1) keep resolver functionality intact, (2) do not collapse important expert capabilities into hidden dead-ends, (3) the default path through themes should make sense to someone thinking in light/dark, brand, density, or platform variants rather than DTCG internals; files: `packages/figma-plugin/src/ui/components/ThemeManager.tsx`
- [x] Coverage and compare are useful theme tools, but they currently behave like parallel destinations instead of contextual tools — the `ThemeManager` exposes `Dimensions`, `Coverage`, and `Compare` as sibling tabs, which makes the theme area feel wider and more complex than necessary; refactor this so authoring remains the default home and coverage/compare are launched contextually from the axis or option the user is currently working on; for example, coverage should feel like “show me gaps for this theme setup” and compare should feel like “compare this option/set against another” rather than separate quasi-products; success criteria: (1) a new user can complete the basic theme-authoring flow without needing to understand why there are 3 sub-views, (2) coverage and compare remain discoverable for experts, (3) preview, gap-filling, and compare flows are anchored to the current theme context instead of resetting the user into a new mental model; files: `packages/figma-plugin/src/ui/components/ThemeManager.tsx`

---

## Sync

### Bugs

### QoL

### UX

- [x] Publishing is overloaded because Figma sync, Git operations, readiness checks, history, export, and “health” are grouped too tightly — the current `Ship` concept combines several different workflows and `Publish` itself opens as a compound workspace with readiness gating, publish-all banners, compare-all, and multiple accordions; split this into clearer mental models aimed at the actual user: `Sync to Figma` for variables/styles, `Export` for file output, `Audit` for quality analysis, and `Git` as a secondary expert/developer workflow instead of part of the primary designer path; if the shell redesign introduces a dedicated `Sync` workspace, it should default to Figma-oriented actions and treat Git as optional/advanced; constraints: (1) readiness checks remain available before destructive sync actions, (2) publish-all can still exist, but only after the underlying destinations are understandable, (3) avoid duplicating audit concepts between sync and health; files: `packages/figma-plugin/src/ui/shared/navigationTypes.ts`, `packages/figma-plugin/src/ui/components/PublishPanel.tsx`, `packages/figma-plugin/src/ui/components/HealthPanel.tsx`, `packages/figma-plugin/src/ui/App.tsx`

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [x] The Selection Inspector exposes too many secondary operations in the main toolbar and obscures the primary binding flow — the surface currently mixes layer search, deep inspect, selection/page sync, extract-all-unbound, extract tokens, remap bindings, clear-all, suggested tokens, and property filtering in one dense stack; keep the capability set, but reorganize it around the main user task: inspect a selected layer, understand current bindings, and apply or replace a token; secondary maintenance actions such as page sync, extract, remap, and bulk clear should move into an `Advanced tools` drawer or overflow action group; target flow: selected layer summary → current bindings → suggested/applicable tokens → apply/remove action → optional advanced maintenance tools; constraints: (1) do not remove power-user functionality, (2) preserve page-wide sync and extract/remap capabilities, (3) make the default visual hierarchy communicate “bind tokens to selection” first; files: `packages/figma-plugin/src/ui/components/SelectionInspector.tsx`

---

## Import

### Bugs

### QoL

### UX

- [x] Import source selection gives too many equal-weight choices at once and mixes very different source families — the current import source selector presents Figma Variables, Figma Styles, JSON, Tokens Studio, CSS, and Tailwind as a long flat list with plan caveats and parser caveats interleaved; redesign this as a progressive disclosure flow: first choose a source family (`From Figma`, `From token files`, `From code`, `Migrate from another tool`), then choose the specific format within that family; this will reduce scan load and make it easier for designers to identify the right path without reading every card; constraints: (1) drag-and-drop support should remain intact, (2) plan/limitation messaging should be shown only when relevant to the chosen family, not globally, (3) preserve support for all current import sources; files: `packages/figma-plugin/src/ui/components/ImportPanel.tsx`, `packages/figma-plugin/src/ui/components/ImportSourceSelector.tsx`

---

## Token Generation & Graph Editor

### Bugs

### UX

- [x] Generator-backed token groups give no actionable information inline — the current signal is a small tag with an amber border (`border border-amber-500/30`) on the group header in the token tree (`TokenTreeNode.tsx` ~L628–634) linking to the Generators tab; to do anything with a generator (re-run it, tweak config, see what changed) users must leave the Tokens tab entirely; add an inline generator summary that renders inside the group row when the group is expanded (chevron-open state, not just selected): show the source token path (or "standalone"), generator type label, last-run timestamp, and two buttons — "Re-run" (calls `POST /api/generators/{id}/run`) and "Edit" (opens the existing `TokenGeneratorDialog` in a bottom drawer or side panel, same as token editing uses); this does not require restructuring the Generators tab — it only adds information to a group row that is already visually identified as generator-backed; the Generators tab remains unchanged; scope note: do NOT attempt to embed the full generator config editor inline — that is a separate larger effort; files: `TokenTreeNode.tsx` (TokenGroupNode component, generator badge rendering ~L595–634), `GeneratorPipelineCard.tsx` (reference for Re-run / Edit patterns), `useGenerators.ts` (derivedTokenPaths, generatorsBySource maps)
- [x] Creating a generator for a simple case requires a full-screen modal — right-clicking a color or dimension token and choosing "Generate scale..." opens `TokenGeneratorDialog`, a full-screen modal with 3 collapsible sections; for the common case (source token is already known, just need to pick steps and confirm) this is too heavyweight; add a quick-generator popover: when "Generate color ramp..." or "Generate spacing scale..." is invoked from a token's context menu (where the source token is already known), open a compact popover (not a modal) showing only: the pre-filled source token, the most relevant config controls (color ramp: steps count + lightness range; type scale: ratio preset + steps preset; spacing scale: steps preset; others: steps count), a live preview strip (call `POST /api/generators/preview` with debounce — this endpoint already exists), and a "Create" button; on confirm: use the current active set as target set, derive the target group from the source token's parent group path (e.g., source `colors.brand.primary` → target group `colors.brand`), auto-name the generator from source + type; the full `TokenGeneratorDialog` remains accessible via "Advanced options..." link in the popover for multi-brand, semantic aliases, custom formulas, and overwrite review; files: `TokenTreeNode.tsx` (token context menu, add new entry), `TokenGeneratorDialog.tsx` (reference for config components to extract), `generatorUtils.ts` (defaultConfigForType, autoName, suggestTargetGroup — reuse these for defaults)
- [x] Stale generator notification is easy to miss — when a source token changes, the staleness signal is an amber-bordered tag on the generator's target group header (`TokenTreeNode.tsx` ~L628–634, `border-amber-500/30`); in a dense tree with many groups this tag is easy to overlook, and there is no signal at the top of the list or in the tab bar beyond the tab badge count; add a dismissable notification bar between the search/filter row and the token list: "N generator(s) in [set name] are out of date — [Regenerate all] [Dismiss]"; "Regenerate all" should run only generators where `targetSet === activeSet` and `isStale === true` (call `POST /api/generators/{id}/run` for each in sequence, show a spinner during); bar should be dismissable per-session (localStorage key) and re-appear if staleness changes; the existing amber border on the tag should also be made slightly more visible (increase opacity from 30% to 60%, `border-amber-500/60`); files: `TokenList.tsx` (add banner between filter row and virtual list), `useGenerators.ts` (generators array and isStale field), `storage.ts` (add a key for dismissed stale banner)

---

## Token Editor

### Bugs

### QoL

---

## Settings & Data Management

### Bugs

### QoL

### UX

- [x] Settings is structured like an internal configuration console rather than a concise preferences area — the panel currently mixes searchable sections, tabs, connection controls, export defaults, validation config, backup/restore, guided setup restart, undo settings, and danger-zone actions into one large settings surface; reorganize this into a smaller set of user-meaningful groups and push operational/rarely used controls lower in the hierarchy; recommended direction: `Preferences`, `Connection`, `Export`, and `Advanced / Recovery`, with clearer copy explaining when a setting matters; constraints: (1) do not remove current capabilities, (2) keep dangerous operations clearly separated and strongly worded, (3) search can remain, but it should support a cleaner IA rather than compensate for one; files: `packages/figma-plugin/src/ui/components/SettingsPanel.tsx`

---

## Cross-Cutting UX / IA

### UX

- [x] The command palette is compensating for weak primary navigation instead of acting as a true power-user layer — there are currently dozens of registered commands spanning navigation, modal launchers, view toggles, set management, theme operations, import/export, and selection tools; after the shell and flow redesigns land, audit the command palette and trim it so it emphasizes expert shortcuts and high-frequency actions rather than basic wayfinding; success criteria: (1) commands that merely expose hidden primary navigation should disappear once the UI is clear, (2) the remaining command set should make the app faster for expert users without being required to understand it, (3) descriptions/categories should reflect the final IA rather than the pre-refactor shell; do this after the IA work above, not before, otherwise the command inventory will be reworked twice; files: `packages/figma-plugin/src/ui/hooks/useCommandPaletteCommands.ts`, `packages/figma-plugin/src/ui/components/CommandPalette.tsx`

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

- [~] Sub-readable badge font sizes and undersized interactive targets — several elements in the token tree use font sizes below readable thresholds: type badges use 8px (`text-[8px]`), provenance badges are 7×7px SVG-only icons, the `Recommended` badge in the generator type selector uses 7px (`text-[7px]`); additionally, several interactive elements (type badge click area for filtering, provenance badge, resolution-chain badge) have click areas well below WCAG 2.2's 24×24px minimum because they have no padding; fix: audit all badge components in `TokenTreeNode.tsx` for font sizes below 10px and increase to 10px minimum; add `min-h-[24px] min-w-[24px]` or equivalent padding to all clickable badge elements; this does not require changing the visual size of badges — use padding to extend the hit area beyond the visual boundary; files: `TokenTreeNode.tsx` (badge rendering throughout TokenLeafNode), `tokenListTypes.ts` (DENSITY_SWATCH_SIZE), `styles.css` (token type badge CSS classes); note: full light theme support is a separate large effort and is intentionally out of scope for this task

### Maintainability

- [ ] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
