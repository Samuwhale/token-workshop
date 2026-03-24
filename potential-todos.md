# Potential TODOs — UX/UI Improvements

Based on a thorough audit of the core token creation and maintenance flows.

---

## P0 — Critical (Data Loss Risk / Broken Core Flows)

### Set Rename
- No way to rename a token set exists anywhere in the UI or server API
- Implementation needs: rename the JSON file, update all theme references, safe-rename any cross-set aliases that reference tokens in the renamed set
- The server currently only validates `[a-zA-Z0-9_-]` names on create — rename needs the same validation

### Replace `confirm()` with In-Plugin Modals
- Single-token delete, group delete, and bulk delete all use `window.confirm()` — jarring in Figma plugin context, visually broken, blocks main thread
- Replace with in-plugin confirmation modals that show impact: how many tokens will be deleted, how many other tokens will become orphaned (orphan count is already computed in `handleBulkDelete` — just needs the right UI)

### Quick Create Token from Selection
- When a layer is selected with a fill/stroke/font that doesn't match any existing token, show a "Create token from selection" action in the SelectionInspector
- Extract the value (hex color, font family+size+weight, dimension), suggest a path based on the active set's naming convention, and save
- This is how design systems get built organically — the designer works on real frames, then formalizes values into tokens without switching mental context
- The SelectionInspector already reads `currentValues` from selected nodes — this just needs a "+" affordance next to unbound properties

### Session Undo (Single-Level)
- A single accidental bulk delete or group delete has no recovery path unless git is configured
- Minimum viable: keep a snapshot of the last destructive operation in memory and expose an "Undo" action (Cmd+Z) that replays the inverse
- Destructive ops to cover: delete token, delete group, bulk delete, move to set, bulk rename

---

## P1 — High Impact

### Inspect Mode — Canvas-Aware Token Highlighting
- When a layer is selected, highlight/filter the token list to show which tokens are bound to it
- Closes the mental gap between "what's on the canvas" and "what's in my token system"
- The `SelectionInspector` already reads bindings per node — surface this info bidirectionally: selecting a layer highlights its tokens in the list, and hovering a token in the list could flash the layers that use it
- Two-part implementation: (1) a "Show bound tokens" filter/highlight when selection exists, (2) optional "Select layers using this token" action on token rows (uses the existing `scan-token-usage` + `select-layer` controller messages)

### Consolidate Infrequent Tabs into Actions Menu
- Six tabs is overloaded for a Figma plugin's viewport — Import, Export, and Server Settings are utility actions, not primary views
- Consolidate into: `Tokens | Themes | Sync | Analytics` with Import/Export accessible from a `⋮` or gear menu
- The primary 80% use case is Tokens and Themes — they should dominate the chrome
- This also frees vertical space and reduces cognitive load for new users
- Note: the P3 "Tab Bar Reorganization" item below has a similar idea but is scoped narrower — this is the full recommendation

### Expand All / Collapse All Groups
- With 50+ groups, collapsing groups one at a time is painful
- Add "expand all" / "collapse all" buttons to the toolbar row (next to the view mode toggle)
- Also: remember expanded/collapsed state per set in sessionStorage

### Jump to Referenced Token from Alias
- When a token value is an alias like `{color.blue.500}`, clicking it should navigate to that token in the tree
- If the source token is in a different set, switch to that set first (`onSwitchSet` + `focusPath` already exist — just needs a click target)
- Show a subtle "→" icon on alias value chips to indicate they are navigable

### Copy Token Path / Resolved Value to Clipboard
- Every token row needs a "copy" affordance — two most-useful variants:
  - Copy the CSS variable name (e.g. `--color-blue-500`)
  - Copy the resolved value (e.g. `#2563eb`)
- Surface on hover (appears in the row action area alongside the edit/delete icons)

### Discoverable Set Context Menu
- Right-click is the only way to access set-level actions (generate semantic, generate dark theme, adopt Figma file, delete, duplicate)
- Right-click is not discoverable in Figma plugins — no visual affordance exists
- Add a visible `⋮` button on each set tab that opens the same context menu

### Bulk Rename by Name Pattern (Find & Replace for Token Names)
- Current Find & Replace operates on *values* and *references*, not on token *paths*
- Renaming `gray` → `neutral` across 200 tokens today requires individual safe-renames
- Add a "Name" mode to Find & Replace that does regex-aware path replacement (e.g. `gray\.(.*)` → `neutral.$1`) and updates all alias references automatically
- Wire through the existing `bulk-rename` API

### Bulk Alias Creation / "Promote to Semantic"
- When raw hex values are scattered across sets, provide a "Convert to alias" bulk action that finds the closest matching primitive and rewires the value to an alias reference
- This is the single most tedious task in design system maintenance — doing it one token at a time is what makes people give up on token hygiene
- Implementation: select multiple tokens (multi-select already works) → right-click → "Convert to aliases" → modal shows each token with its proposed alias match (closest color in primitives by delta-E, or exact match for dimensions) → confirm
- The existing `allTokensFlat` with resolved values gives everything needed to compute matches
- Related to the P3 "Extract to Alias" item below, but this is the bulk/automated version

### Token Linting with Configurable Rules
- Go beyond the analytics panel's static checks — add configurable lint rules that run on every edit:
  - "All color tokens must be aliases, not raw hex" (enforce the primitive → semantic pattern)
  - "All tokens must have `$description`"
  - "Token paths must match pattern `[category].[variant].[scale]`"
  - "No alias chains deeper than 3 hops"
  - "No duplicate resolved values across sets"
- Show violations inline in the token list as subtle warning indicators, not just in a separate panel
- Quick-fix actions where possible (e.g., "Add missing description", "Convert to alias")
- Store lint config in the server's config (alongside `collectionMapping`)

---

## P2 — Medium Impact

### Command Palette (Cmd+K)
- Unify all operations behind a fuzzy-search command runner
- Commands: "Create new token", "Find & Replace", "Generate color scale", "Switch to set X", "Go to token...", "Export as CSS", "Validate tokens", "Generate semantic tokens", "Generate dark theme", etc.
- The `?` shortcut already shows a keyboard shortcut overlay — the command palette supersedes it

### Validate All Tokens Panel
- No "run validation" action that surfaces all problems at once
- Should catch: broken aliases, circular references, tokens missing `$type`, value/type mismatches, alias chains deeper than N hops
- The analytics panel has orphan references and unused tokens but not a structured "fix-me" list
- Output: a list of errors/warnings with a "Jump to token" link on each row
- Should be triggerable from the Analytics tab or as a toolbar button

### Mass Create from Paste
- No lightweight "paste a few tokens" flow
- A "Paste tokens" modal that accepts a JSON fragment (DTCG format) or `name: value` lines and creates/updates tokens in bulk in the current set
- Import panel handles full files — this is for ad-hoc addition of a handful of tokens from a doc or another tool

### Sort Order in Token List
- Token list is always in insertion/tree order
- Add a sort control to the toolbar: Alphabetical (A→Z, Z→A), By type, By usage count (requires prior scan), By value (useful for spotting duplicates), "Changed recently"

### "Duplicate Value" Filter
- Surface tokens that share an identical raw value — strong signal of missing aliases
- E.g. `#1a1a1a` appearing as the raw value in 8 separate tokens → those should be aliases of one primitive
- Add as a filter chip option alongside the existing deprecated/missing-desc filters

### Richer Previews in Tree/Table View
- Typography tokens: render a small preview string with font/size/weight applied inline
- Shadow tokens: render a small box-shadow swatch instead of raw JSON
- Gradient tokens: render a gradient strip (gallery view does this but tree/table don't)

### Variable Scope Management UI
- Figma variables have scopes (which properties they appear in the native UI) — the plugin reads them during adopt but doesn't let you configure them
- Add a scope editor per token (or per group) so designers can control where variables appear in Figma's native variable picker
- This is a feature Token Studio lacks — direct control over `scopes` without leaving the plugin
- The controller already handles scopes in `syncToFigma` via `scopeOverrides` — this just needs a UI surface
- Best placement: in the full TokenEditor, or as a column in table view

### Two-Way Variable Sync with Unified Diff
- The current push/pull flows are separate workflows in the Sync panel — designers have to decide direction before seeing the state
- Unify into a single "Sync" action that shows a bidirectional diff: local-only changes, Figma-only changes, and conflicts (diverged)
- Show direction arrows per token row with toggle to choose direction
- The `computeFigmaDiff` and `computePullDiff` controller functions already compute both directions — merge their output into one view
- This is the workflow designers actually want: "show me what's different, let me resolve it"

### Color Contrast Checker
- Table-stakes for accessibility-first design systems
- Minimum: a "check contrast" action in the token editor that lets you pick a background token and shows WCAG AA/AAA pass/fail for the current color
- Stretch: a contrast matrix in the Analytics panel showing foreground/background token pairs

### Filter Persistence Across Set Switches
- Active type/set/ref filters reset when switching between sets
- If a user sets a "color" type filter to audit each set, they shouldn't need to re-apply it after switching
- Persist the active filter state independently from the active set

---

## P3 — Nice to Have

### Group Presets / Scaffolding Wizard
- Extend the color scale generator pattern to other token types
- Preset options when creating a new group:
  - Spacing scale (T-shirt or numeric, dimension tokens)
  - Border radius scale (none, sm, md, lg, full)
  - Typography scale (font-size ramp from a base + ratio)
  - Z-index layers (base, dropdown, modal, tooltip, toast)
  - Opacity scale (0, 5, 10, 20, 25, 50, 75, 90, 95, 100)

### Theme Missing-Coverage Warnings
- When a theme is configured, some tokens may have no value in any active set (e.g. a token only in `primitives` but that set is `disabled` for the theme)
- Surface a warning count on the theme card: "12 tokens have no value in active sets"
- Link to a filtered list of the uncovered tokens

### Dimension / Number Stepper Input
- Dimension and number tokens get a plain text input in inline edit mode
- A proper number input with stepper (↑/↓ arrows, scroll wheel) and a unit selector (px / rem / %) would match how these values are naturally adjusted

### Color Scale Lightness Curve Inspector
- After generating a color scale, show the perceptual lightness (L* in Oklch) across each step as a small sparkline
- Uneven jumps are the #1 problem with generated palettes — the data is already computed internally

### Duplicate Color Value Detection
- Highlight when two color tokens resolve to the same hex value (after alias resolution)
- Common problem: `color.gray.100` and `color.neutral.100` both resolving to `#f3f4f6`
- Surface in Analytics or as a dedicated filter

### Partial Sync by Group
- Right-click a group → "Sync this group to Figma" instead of syncing the entire set
- Useful for iterative workflows where only one section of tokens has changed

### "Create Sibling" Token Action
- When a token is selected/right-clicked, "Create sibling" creates a new token in the same group, pre-filled with the same type, ready to name
- Faster than using the global create form and typing the full path

### Easier Token Referencing (Alias Ergonomics)
- Typing `{` in any value field should immediately open the token autocomplete dropdown — currently this only works in the reference field of the full token editor, not in inline edit mode or the quick-edit popover
- The autocomplete should be filterable by type (e.g. when editing a color field, default to showing only color tokens)
- Alias suggestions should show a resolved value preview (color swatch, dimension value) alongside the path so users can confirm they're picking the right token without navigating away
- Add a dedicated "reference" input mode in inline edit: a toggle button on the row that switches the value input from raw to alias mode and opens the autocomplete immediately

### Token References in Gradient Values
- Gradients currently require raw hex/color values — there is no way to reference another token (e.g. `{color.brand.500}`) inside a gradient stop
- The gradient editor in `TokenEditor` should allow each color stop to be either a raw color or a token alias, with the same autocomplete used for reference fields
- The server-side resolver (`resolver.ts`) and Style Dictionary transform pipeline need to handle alias expansion within gradient stop values
- On the Figma sync side, alias-based gradient stops should resolve before being pushed as Figma gradient paint values
- This is a high-value feature because semantic color tokens in gradients is a common need (e.g. a brand gradient that respects the active theme's color tokens)

### "Extract to Alias" Action
- When a token has a raw value (not an alias), "Extract to alias" prompts for a new primitive token name, creates the primitive, and replaces the current value with an alias reference
- Inverse of "resolve alias" — helps users refactor hardcoded values into the primitive → semantic hierarchy

### Tab Bar Reorganization
- Six tabs (Tokens, Themes, Sync, Export, Import, Analytics) is overloaded
- Sync, Export, Import are utility actions more than primary views
- Consider: `Tokens | Themes | Tools (dropdown)` with analytics accessible from the Tools menu or a dashboard icon
- Primary 80% use case is Tokens and Themes — they should dominate the chrome
- See P1 "Consolidate Infrequent Tabs" for the full recommendation

### Empty State Guidance
- When a set is empty, the main area shows nothing
- Replace with guided empty state: description of what to do next, buttons for "Create first token (⌘N)", "Generate color scale", "Paste tokens from JSON", "Drag tokens here from another set"

### Set-Level Metadata
- Allow a description / display name to be set on each token set (stored in a sidecar or the set file itself under a `$description` key)
- Show as a tooltip on the set tab
- Display in the analytics panel's "by set" breakdown

### Reference Chain Visualization in List
- When a token is a 3+ deep alias chain, show "via N aliases" indicator next to the resolved value swatch
- Clicking the indicator expands the full chain inline without navigating to the editor

### Group Management (Rename, Move, Duplicate)
- Groups are implied by dot-separated paths but have no explicit management actions
- Add group-level operations: rename group (cascading rename of all children + alias reference updates), move group to another set, duplicate group
- Right-click a group header → context menu with these actions
- Group rename should use the same safe-rename-with-cascade logic as individual token rename

### Publish Readiness Checklist
- Before publishing a Figma library, designers need to verify all variables are correctly configured
- Add a "Publish Readiness" panel (in Sync or as a tool) that validates:
  - All tokens have corresponding Figma variables
  - Scopes are set appropriately
  - Descriptions are populated
  - `hiddenFromPublishing` flags are correct
  - No orphan variables exist in Figma that aren't in token sets
- Output: a checklist with pass/fail per category and "fix" actions

### Figma Component Token Coverage Map
- Scan components in the Figma file and report which ones use variables/tokens vs hardcoded values
- Gives design system maintainers a "migration progress" view — "60% of components are tokenized"
- Implementation: walk all component nodes, check bound variables vs raw fills/strokes/text styles
- Surface as a report in the Analytics tab or as a standalone tool
- Actionable: click an untokenized component to select it on canvas

### Token Documentation / Style Guide Generation
- The server already has a `/docs` route — enhance it with auto-generated visual style guide pages
- Color palettes with contrast ratios between foreground/background pairs
- Typography specimens rendered with actual font/size/weight
- Spacing scale visualization (boxes)
- Shareable with stakeholders who don't have Figma access
- Could also serve as the basis for a Storybook/docs integration

---

## Information Architecture Notes

- **Set tabs**: Active set needs stronger visual treatment — background fill, not just underline; show token count in the tab label
- **Right-click discoverability**: Both token rows and set tabs rely on right-click for their richest menus — neither surface has any visible affordance that a menu exists
- **Filter bar**: The filter chips are only visible after the search bar receives focus or a filter is active — consider always showing at least the Type filter chip to teach the feature
- **Sync status in list**: "Diverged" and "changed since sync" are filter-only; a persistent per-row indicator (subtle warning or dot) would let users see sync state without enabling the filter
- **Semantic generation discoverability**: "Generate Semantic Tokens" and "Generate Dark Theme" are killer features hidden behind a right-click context menu on set tabs and a conditional auto-prompt — consider surfacing them as first-class actions in the starter wizard completion flow and in empty-set states
- **Selection Inspector positioning**: renders at the bottom of the tokens tab, easy to miss — applying tokens to layers requires knowing to scroll down. Consider making it a collapsible sidebar or docked panel that's always visible when a selection exists
