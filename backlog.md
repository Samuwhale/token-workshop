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
- [x] Inspect and Ship tabs have undiscoverable inner navigation — clicking Inspect or Ship reveals a secondary inner-tab row (Inspect: Selection, Canvas, Dependencies; Ship: Publish, Export, History, Health) with no prior visual signal, while Tokens, Themes, and Generators go directly to content; users clicking these tabs don't know they're about to get a submenu; fix: (1) add a small secondary-label or chevron hint on the Inspect and Ship primary tab buttons themselves so the inner navigation is visible before clicking, (2) ensure the panel header clearly shows which inner tab is active; do not add inner tabs to Tokens/Themes/Generators — keep their primary tabs as direct destinations; files: `App.tsx` (primary tab bar rendering, ~L300–400), `navigationTypes.ts` (FLAT_TABS, inner tab definitions)
- [~] Settings and Recents panels are invisible in the UI — they are accessible only by knowing a hidden toolbar overflow "..." button exists; Settings should become a persistent gear icon (⚙) in the right side of the toolbar (between the notification bell and the "..." menu); Recents should be removed as a standalone panel and its functionality merged into the token list as a "recently touched" filter toggle (the `useRecentlyTouched` hook already tracks this); Import is already a modal workflow and requires no change; files: `App.tsx` (toolbar, overflow menu ~L450–550), `RecentsPanel.tsx`, `TokenList.tsx` (filter bar), `useRecentlyTouched.ts`
- [ ] Global unmodified keyboard shortcuts trigger unexpected mutations — the token list container's `handleListKeyDown` registers N (new token), M (toggle multi-select), and Backspace (delete) as global single-key shortcuts that fire whenever a token row has focus; these are dangerous because they conflict with expected text-editing behavior and fire without modifier keys; N conflicts with pressing "n" to search; Backspace is one key away from a delete when focus returns to the list unexpectedly; replace N with Cmd+N, keep M as-is (it's a mode toggle with no destructive effect), verify Backspace is guarded against firing when the row's delete action is not meaningful (e.g., no row focused); note: letters like G, R, E, X shown in context menus are context-menu-only accelerators — they fire only while the dropdown is open, which is correct behavior and should not be changed; files: `shortcutRegistry.ts`, `TokenList.tsx` (handleListKeyDown, ~L1095–1160)

---

## Token Management

### Bugs

### QoL

### UX
- [ ] Token rows display too many simultaneous indicators — a single leaf row shows up to 15+ pieces of information at once (depth bar, swatch, name, type badge at 8px font, lifecycle badge, provenance badge, extends indicator, generator source/derived badges, alias link, resolution chain badge, value text, duplicate-value dot, lint icon, cascade-change dot, usage count, sync-change dot) plus 9 hover-revealed action buttons; at 28px row height in a ~350px plugin window many of these are below legible size; apply progressive disclosure: (1) default row state: swatch + name + value + at most one status indicator using a strict priority order — lint violation > sync-changed > duplicate value; suppress all other badges; (2) when a token row is selected/focused: also show type badge and alias target path (if aliased); (3) all other metadata (lifecycle, provenance, extends, generator source, resolution chain, usage count) moves to the `TokenDetailPreview` side panel which already exists for this purpose; hover actions: keep edit button, copy path button, apply-to-selection button; remove move-up/move-down buttons (drag handles are sufficient); remove pin and star (merge into a single "favorite" concept); files: `TokenTreeNode.tsx` (TokenLeafNode component, lines ~1020–2800), `tokenListTypes.ts` (DENSITY_ROW_HEIGHT, DENSITY_SWATCH_SIZE constants)
- [ ] Token context menus are too long to scan — the token row context menu has ~18 items and the group context menu has ~13; users cannot scan a menu this long; restructure both menus with a "More..." submenu pattern: token primary (max 6): Edit, Rename, Delete, Copy path, Apply to selection (only shown when Figma has a layer selected), More...; token More...: Duplicate, Move to set, Copy to set, Extract to alias, Compare across themes, Find references, View history; group primary (max 5): Add token, Rename, Delete, Generate scale, More...; group More...: New subgroup, Edit type & description, Move to set, Copy to set, Duplicate, Set scopes, Sync to Figma variables/styles; note: "Generate scale" in the group primary menu is a dependency of the quick-generator task — if that task ships first, this item becomes "Generate..." opening the quick-generator popover directly; files: `TokenTreeNode.tsx` (group context menu ~L720–930, token context menu ~L2260–2400), `useMenuKeyboard.ts`
- [ ] Token creation entry points are inconsistent with each other — the inline create form (inside TokenList), the full TokenEditor in create mode, the command palette, context menu "Create sibling", and empty state each offer different subsets of fields and behave differently on validation errors; the fix is not to remove entry points but to make them consistent: (1) the inline form should offer only name + type + value, nothing else — strip the description field and any advanced options from it (those belong in the editor); (2) the full editor create mode is the canonical path for everything else and all other paths (command palette create, "Create sibling", empty state button) should invoke it; (3) the paste modal and import panel are batch operations and intentionally different — leave them alone; files: `useTokenCreate.ts` (inline create hook), `TokenEditor.tsx` (isCreateMode path), `TokenList.tsx` (inline create form rendering ~L1800–2000)
- [ ] Boolean tokens mutate on single-click with no confirmation — `boolean` is in `INLINE_SIMPLE_TYPES` (`tokenListTypes.ts:217`) meaning it uses the inline edit path, but the inline edit for booleans immediately toggles the value on click rather than opening a text input like other types in that set; this is the only token type that mutates on a single click, which is inconsistent and dangerous (fat-finger on a token row changes a value); fix: boolean inline editing should require the same double-click activation as other INLINE_SIMPLE_TYPES; on double-click activation, show a small inline toggle button (true/false) that the user explicitly commits with Enter or by clicking elsewhere — do not auto-save on the first click; the single-click on a token row should only select/focus the row, never mutate; files: `TokenTreeNode.tsx` (inline edit activation logic for booleans, search for INLINE_SIMPLE_TYPES usage), `tokenListTypes.ts` (line 217, INLINE_SIMPLE_TYPES constant)
- [ ] Too many token list viewing modes create an overwhelming UI — the toolbar exposes: 3 density options, a condensed-view toggle (`CONDENSED_MAX_DEPTH = 3`, key `tm_condensed_view`), 6 sort orders (`default | alpha-asc | alpha-desc | by-type | by-value | by-usage`), stats bar toggle, JSON view toggle, show-resolved-values toggle, plus search filters; most users never need most of these; reduce the persistent toolbar controls: keep 2 densities (rename `default` → `comfortable`, keep `compact`; remove the `comfortable` option or fold it into `default`); reduce sort to 3 options (`default`, `alpha-asc`, `by-type`) — remove `alpha-desc`, `by-value`, `by-usage` since these are edge-case audit tools; move stats bar, JSON view, and show-resolved-values out of the toolbar and into the command palette as toggleable settings (they persist via localStorage so the state is preserved); keep condensed view as-is since zoom-into-group serves a different purpose (navigation vs display density); files: `TokenList.tsx` (toolbar rendering and sort UI), `tokenListTypes.ts` (SortOrder type, Density type, DENSITY_ROW_HEIGHT), `storage.ts` (STORAGE_KEYS.DENSITY, STORAGE_KEYS.CONDENSED_VIEW)
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
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
- [x] [HIGH] Generator rollback is inconsistent and can leave token state corrupted — single-brand path (generator-service.ts:744) silently swallows rollback errors via `.catch()` that only logs, so the caller never learns token state is inconsistent; multi-brand path (generator-service.ts:835) throws inside `.catch()` which exits the `for` loop over `preRunSnapshots` early, leaving remaining sets un-rolled-back; both paths should use `Promise.allSettled` over all affected sets and report aggregate failure
- [x] No saved filter presets for the token list — users with large token sets who repeatedly use combinations like "type:color has:unused" or "type:dimension has:duplicate" must re-type these each time; add named filter presets that persist and are accessible from a dropdown next to the search bar
- [x] Bulk create tab does not infer token type per row — the single-create tab auto-detects type from the path (e.g., "colors.primary" infers color) but the bulk tab requires manually selecting a type for each row; apply the same path-based type inference to each bulk row's name field
- [x] "Simple mode" auto-activates with no explanation — when totalTokenCount < 200 and sets exist, the UI silently merges all sets into a type-grouped view and hides the set switcher; there is no banner explaining what happened or how to switch to advanced mode, which will confuse users who expect to see their set structure
- [x] No cross-set token search in the token list — the search bar and structured qualifiers (type:, has:, value:, etc.) only search within the active set; users managing tokens across 10+ sets have no way to find a token globally without using the command palette's ">" mode or the server search endpoint
- [x] ThemeManager coverage matrix and compare panel are powerful but hidden below the fold — the coverage matrix (showing which theme options have gaps) and the compare panel (side-by-side theme option diff) are rendered after the dimension grid and require scrolling past all dimensions to reach; surfacing them as tabs or a collapsible top section would make them more discoverable
- [x] No token value history or changelog per token — the HistoryPanel shows operation-level and commit-level history but there is no way to see the edit history of a single token's value over time; the server has token-history endpoint but the UI only surfaces it in the timeline view, not from the token editor or context menu
- [x] [HIGH] Inline token edit silently discards invalid values — when `parseInlineValue` returns null in TokenTreeNode, Enter keeps the editor open with no error message and Tab moves to the next token dropping the edit entirely; user gets zero feedback about what went wrong (TokenTreeNode.tsx ~L1155, ~L1168) (violates: system status visibility, error prevention)
- [x] Lint rules are limited to 5 hardcoded checks — LintConfigPanel offers no-raw-color, require-description, path-pattern, max-alias-depth, and no-duplicate-values; common design system rules like "no hardcoded dimensions" (matching no-raw-color but for dimensions), "require-alias-for-semantic-tokens", or "enforce-token-type-consistency" are missing; consider making the lint rule system extensible or adding more built-in rules
- [x] Color contrast matrix in HealthPanel does not surface actionable fixes — it shows WCAG AA/AAA pass/fail for color pairs but offers no suggestion for what the nearest compliant color would be; adding a "suggested fix" column (nearest color that passes the threshold) would close the loop from detection to resolution
- [x] ExportPanel.tsx is 2423 lines combining format selection, platform configuration, preset management, CSV/ZIP generation, and diff/changes-only filtering into a single component — extract platform-specific config editors, preset CRUD, and export format logic into sub-components/hooks (similar to the HealthPanel extraction that went from 1813→670 lines)
- [x] ThemeManager.tsx has two near-identical toggle bar blocks (~L503 and ~L554) for switching between simple/advanced mode — the blocks share the same structure (label, shortcut badge, chevron) but are maintained separately; extract a shared `ModeToggleBar` component to eliminate the duplication and prevent future drift
- [x] `packages/core/src/dtcg-resolver.ts:205` casts `dtcgToken.$value` to `Token['$value']` without any validation — malformed values (wrong shape for type, circular structures, NaN) silently propagate through the resolver and surface as cryptic errors in downstream consumers like generators or the UI; add validation at the merge boundary where external DTCG files enter the system
- [x] `packages/core/src/generator-engine.ts:162` silently defaults `baseExponent` to 0 when `baseStep` name doesn't match any step definition — a misconfigured generator (typo in step name) produces wrong scaling values with no warning or error; should throw a descriptive validation error so generator config problems are caught at creation/edit time, not at run time via wrong output
- [x] `manual-snapshot.ts:321` quarantined sets (those exceeding MAX_RECOVERY_RETRIES) are skipped via `continue` but never added to `journal.completedSets` — on every subsequent server restart, recovery re-attempts the quarantined set, hits the retry limit again, and logs the same error forever; the set should be added to completedSets (or a separate quarantine list) so the journal can eventually be cleaned up

- [x] Consolidate canvas analysis panels — HeatmapPanel, ConsistencyPanel, and ComponentCoveragePanel exist both as standalone imports and as tabs inside CanvasAnalysisPanel; the standalone versions are dead weight since the CanvasAnalysisPanel wrapper is the only one rendered in PanelRouter; remove the standalone routing paths and unify scope state management (currently three separate ScanScopeSelector instances)
- [x] WelcomePrompt has no re-entry path — once dismissed via "I'll explore on my own", the `FIRST_RUN_DONE` localStorage flag is set permanently with no way to re-trigger the guided setup from Settings or the command palette; add a "Restart guided setup" action somewhere discoverable
- [x] Token context menu missing "Go to definition" for aliases — right-clicking an alias token has 21 actions but no "Jump to referenced token" shortcut; users who want to navigate an alias chain must manually search for the target path; add a "Go to definition" action that selects and scrolls to the aliased token
- [x] Batch editor silently skips alias tokens during numeric transforms — when applying multiply/divide/add/subtract to selected tokens, tokens with alias values (e.g., `{spacing.base}`) are skipped without any feedback; show a count of skipped tokens after the operation completes so users know some selections weren't affected
- [x] CreatePanel "token already exists" error has no navigation link — when creating a token with a path that already exists, the validation message says "edit it instead" but there's no clickable link or action to jump to that existing token in the editor; add a "Go to token" button inline with the error
- [x] PasteTokensModal lacks "overwrite all conflicts" shortcut — when pasting 50+ tokens where many conflict with existing tokens, each conflict must be toggled individually; add a "Select all conflicting" / "Deselect all conflicting" toggle to reduce clicks
- [x] No "duplicate set as theme override" workflow — duplicating a set copies all tokens verbatim, but when creating theme variants (e.g., dark mode from light mode) users want to create an override set pre-linked to a theme dimension option containing only the tokens they intend to change; add a "Create override set from…" flow that connects set creation with theme configuration
- [x] TokenTableView is a second token view with significantly fewer capabilities than the tree view — it has no context menu, no inline popover editing for complex types, no drag-and-drop, no multi-select batch operations, and no pinning; either invest in making it feature-complete or remove it in favor of the tree view which already supports flat display via search/filter
- [x] No lightweight "find references" for tokens — the context menu has "Open in dependency graph" which navigates away to a separate panel, but there's no inline way to see "which tokens alias this one?" without leaving the current view; add a quick popover or expandable section showing reverse references directly in the token list row
- [x] HealthPanel lacks a summary score or prioritized issue list — it aggregates 5+ sub-panels (lint, duplicates, contrast, lightness, unused, coverage) but users must expand each section manually to discover problems; add a top-level health summary with the most urgent issues listed first so the panel is useful at a glance
- [x] No keyboard shortcut for quick set switching — the SetSwitcher is a modal triggered by clicking; power users managing 10+ sets need a Cmd+Shift+S or similar hotkey to pop the set switcher without reaching for the mouse, similar to how IDEs switch between files with Cmd+P
- [x] ThemeManager hover-only actions are not discoverable — dimension reorder grips, delete buttons, and option management buttons only appear on hover; first-time users have no visual hint these actions exist; add persistent but subtle affordances (e.g., faint icons) or an onboarding tooltip the first time the theme panel is opened
- [x] Clear all bindings in SelectionInspector fires without confirmation — `handleClearAllBindings` immediately removes every property binding on the selected layer(s) with no confirmation dialog; while undo exists, this bulk destructive action is a single click away from the sync controls bar (SelectionInspector.tsx ~L447) (violates: error prevention)
- [x] Inconsistent success feedback across mutation operations — CreatePanel and ExportPanel dispatch toasts on success, but ThemeManager dimension/option CRUD and ResolverPanel create/edit/delete show no success indication; users must infer success from list UI updates, creating uncertainty about whether the server operation completed (violates: system status visibility, consistency)
- [x] Hover-only action buttons are invisible to keyboard users across many panels — ResolverPanel, ThemeManager, HistoryPanel, ExportPanel, SetSwitcher, CompareView, and others use `opacity-0 group-hover:opacity-100` without the `group-focus-within:opacity-100` variant that TokenTreeNode and TokenList correctly use; keyboard-only users cannot see edit/delete/action buttons at all (violates: keyboard accessibility, consistency)
- [x] Incomplete ARIA relationships in interactive panels — PropertyRow token search has `aria-autocomplete="list"` but no `aria-controls`/`aria-activedescendant` linking input to the candidates listbox; ExportPanel preview file tabs are plain buttons without `role="tab"`/`aria-selected`/`role="tablist"` while SettingsPanel implements these correctly; MetadataEditor icon-only remove buttons have `title` but no `aria-label` despite `aria-hidden` SVG children (violates: accessibility, consistency)
