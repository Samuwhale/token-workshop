# PRD: TokenManager UX/UI Improvements

## 1. Introduction / Overview

This PRD captures all identified UX/UI improvements for the TokenManager Figma plugin. The improvements span the full product surface: navigation chrome, core token editing, bulk operations, validation, sync, and analytics. Stories are ordered by implementation dependency — foundation changes first, then features that build on them.

Each story is tagged with its implementation layer:
- `[Plugin]` — Figma plugin frontend only
- `[Server]` — Server-side changes only
- `[Plugin + Server]` — Both layers required

---

## 2. Goals

- Eliminate data-loss risk from missing undo and destructive-op UX
- Make core token operations (rename, create, alias) faster and more discoverable
- Reduce cognitive load in the plugin chrome (fewer tabs, better navigation)
- Give designers inline feedback on token health without leaving the token list
- Provide power-user tools (command palette, bulk ops, linting) for design system maintainers
- Improve sync reliability and transparency between plugin and Figma variables

---

## 3. User Stories

---

### Epic 1: Navigation Chrome & Information Architecture

---

### US-001: Tab Bar Reorganization `[Plugin]`
**Description:** As a designer, I want the tab bar to surface only the primary views so that I can focus on the 80% use case without visual noise from utility actions.

**Acceptance Criteria:**
- [ ] Tab bar shows exactly four tabs: `Tokens | Themes | Sync | Analytics`
- [ ] Import and Export are removed from the tab bar
- [ ] A `...` (overflow) menu or gear icon in the toolbar opens a dropdown containing Import and Export actions
- [ ] Existing Import and Export functionality is fully preserved behind the new entry point
- [ ] Server Settings is accessible from the overflow menu or within the Sync tab
- [ ] Active tab has a background fill treatment, not just an underline
- [ ] Each set tab displays its token count as a badge (e.g. `primitives 42`)
- [ ] Verify in browser using dev-browser skill

---

### US-002: Empty State Guidance `[Plugin]`
**Description:** As a new user, I want the empty token set to guide me toward my next action so that I don't stare at a blank screen wondering what to do.

**Acceptance Criteria:**
- [ ] When a set has zero tokens, the main area renders a guided empty state instead of blank space
- [ ] Empty state includes: a short description of what a token set is, and three call-to-action buttons: "Create first token (Cmd+N)", "Generate color scale", "Paste tokens from JSON"
- [ ] Each CTA button triggers the same action as its equivalent in the full UI
- [ ] Empty state disappears as soon as at least one token exists in the set
- [ ] Verify in browser using dev-browser skill

---

### US-003: Set-Level Metadata `[Plugin + Server]`
**Description:** As a design system maintainer, I want to add a description to each token set so that collaborators understand what each set is for.

**Acceptance Criteria:**
- [ ] Each token set supports an optional `$description` field stored in the set file (or sidecar)
- [ ] Set tab renders a tooltip on hover showing the description when one exists
- [ ] The Analytics panel's "by set" breakdown shows the description alongside the set name
- [ ] A UI affordance (e.g. edit icon in the set context menu) allows setting/editing the description
- [ ] Verify in browser using dev-browser skill

---

### US-004: Set Tab Visual Treatment & Token Count `[Plugin]`
**Description:** As a designer, I want the active set tab to be visually prominent and show its token count so that I always know where I am and how large each set is.

**Acceptance Criteria:**
- [ ] Active set tab has a filled background (not just underline/text weight change)
- [ ] Every set tab displays the number of tokens it contains as a small badge or parenthetical
- [ ] Badge updates immediately when tokens are added or removed
- [ ] Verify in browser using dev-browser skill

---

### Epic 2: Destructive Operation Safety

---

### US-005: Replace `confirm()` with In-Plugin Modals `[Plugin]`
**Description:** As a designer, I want all destructive confirmations to appear as proper in-plugin dialogs so that I don't get jarring native browser alerts that block the Figma UI.

**Acceptance Criteria:**
- [ ] All uses of `window.confirm()` in the plugin are removed
- [ ] Single-token delete triggers an in-plugin modal showing: token name, and a "Delete" / "Cancel" button pair
- [ ] Group delete modal shows: group name, count of tokens that will be deleted, and "Delete group (N tokens)" / "Cancel"
- [ ] Bulk delete modal shows: count of selected tokens, orphan count (tokens that will lose their alias source), and "Delete N tokens" / "Cancel"
- [ ] Modals are styled consistently with the rest of the plugin UI
- [ ] Pressing Escape or clicking outside the modal cancels the operation
- [ ] Verify in browser using dev-browser skill

---

### US-006: Session Undo for Destructive Operations `[Plugin]`
**Description:** As a designer, I want to undo the last destructive operation so that accidental bulk deletes or moves don't permanently destroy my work.

**Acceptance Criteria:**
- [ ] A single undo slot is maintained in memory per session
- [ ] The following operations populate the undo slot: delete token, delete group, bulk delete, move to set, bulk rename
- [ ] After any of these operations completes, a toast or snackbar appears with "Undo" for at least 8 seconds
- [ ] Pressing Cmd+Z also triggers undo if the undo slot is populated
- [ ] Executing undo restores the state to exactly before the destructive operation
- [ ] Performing a new destructive operation replaces the undo slot (only one level of undo)
- [ ] Undo slot is cleared on plugin close / session end
- [ ] Verify in browser using dev-browser skill

---

### Epic 3: Core Token Operations

---

### US-007: Set Rename `[Plugin + Server]`
**Description:** As a design system maintainer, I want to rename a token set so that I can fix naming mistakes without recreating the set from scratch.

**Acceptance Criteria:**
- [ ] A "Rename" action is available in the set context menu (right-click and `...` button on set tab)
- [ ] Renaming opens an inline input pre-filled with the current set name
- [ ] Name is validated to match `[a-zA-Z0-9_-]` pattern; invalid characters show an inline error
- [ ] On confirm: the JSON file on the server is renamed, all theme references to the old name are updated to the new name, and all cross-set alias references pointing to tokens in the renamed set are updated
- [ ] If any alias update fails, the rename is rolled back and an error is shown
- [ ] The set tab reflects the new name immediately after success
- [ ] Typecheck/lint passes

---

### US-008: Quick Create Token from Selection `[Plugin]`
**Description:** As a designer, I want to create a token directly from a selected Figma layer's properties so that I can formalize values organically while working on real frames.

**Acceptance Criteria:**
- [ ] When one or more layers are selected and the `SelectionInspector` is visible, any unbound property (fill color, stroke color, font family, font size, font weight, dimension) shows a "+" icon next to its value
- [ ] Clicking "+" opens a token creation form pre-filled with: the extracted value (hex for colors, font properties for typography, px value for dimensions), and a suggested path based on the active set's naming convention
- [ ] The designer can edit the suggested name before saving
- [ ] Saving creates the token in the active set and immediately binds it to the selected layer's property
- [ ] Verify in browser using dev-browser skill

---

### US-009: Create Sibling Token `[Plugin]`
**Description:** As a designer, I want to create a new token in the same group as an existing token so that I don't have to type the full path every time.

**Acceptance Criteria:**
- [x] Right-clicking a token row shows a "Create sibling" action
- [x] "Create sibling" opens the token creation form with the group path pre-filled (everything up to the last `.` segment)
- [x] Focus is placed on the name field so the designer only needs to type the last path segment
- [x] The new token is created in the same set and group as the source token
- [ ] Verify in browser using dev-browser skill

---

### US-010: Group Management — Rename, Move, Duplicate `[Plugin + Server]`
**Description:** As a design system maintainer, I want to rename, move, and duplicate entire token groups so that I can restructure my token hierarchy without tedious one-by-one edits.

**Acceptance Criteria:**
- [ ] Right-clicking a group header shows actions: "Rename group", "Move group to set...", "Duplicate group"
- [ ] **Rename:** Opens an inline input; on confirm, all tokens within the group have their paths updated (same cascade logic as individual safe-rename), and all alias references to those tokens are updated
- [ ] **Move to set:** Shows a set picker; on confirm, all tokens in the group are moved to the selected set, and alias references are preserved
- [ ] **Duplicate:** Creates a copy of the group with a suffix (e.g. `-copy`) in the same set
- [ ] All operations are reflected immediately in the UI
- [ ] Typecheck/lint passes

---

### Epic 4: Token List Navigation & Display

---

### US-011: Expand All / Collapse All Groups `[Plugin]`
**Description:** As a designer, I want to expand or collapse all token groups at once so that I can quickly navigate large token sets.

**Acceptance Criteria:**
- [ ] The toolbar row above the token list has "Expand all" and "Collapse all" buttons (or a toggle)
- [ ] "Expand all" opens every group in the current set
- [ ] "Collapse all" closes every group in the current set
- [ ] Expanded/collapsed state per group is persisted in `sessionStorage` keyed by set name
- [ ] State is restored when switching back to a previously visited set within the same session
- [ ] Verify in browser using dev-browser skill

---

### US-012: Sort Order in Token List `[Plugin]`
**Description:** As a designer, I want to sort the token list by different criteria so that I can find patterns and spot problems more easily.

**Acceptance Criteria:**
- [ ] A sort control in the toolbar offers: Alphabetical A→Z, Alphabetical Z→A, By type, By usage count (requires a prior scan result), By value, Default (insertion/tree order)
- [ ] Sorting is applied to the current set's token list without modifying the underlying data
- [ ] Sort selection persists within the session
- [ ] Usage count sort is disabled (greyed out) if no scan has been run yet, with a tooltip explaining why
- [ ] Verify in browser using dev-browser skill

---

### US-013: Filter Persistence Across Set Switches `[Plugin]`
**Description:** As a design system maintainer, I want my active type and ref filters to stay applied when I switch between sets so that I can audit all sets without reapplying filters each time.

**Acceptance Criteria:**
- [ ] Type filter, ref filter, and search query persist when the active set changes
- [ ] A visual indicator shows that a filter is active while browsing a different set
- [ ] Filters can still be cleared manually at any time
- [ ] Verify in browser using dev-browser skill

---

### US-014: Duplicate Value Filter `[Plugin]`
**Description:** As a design system maintainer, I want to filter the token list to show only tokens that share a raw value with another token so that I can identify missing alias opportunities.

**Acceptance Criteria:**
- [ ] A "Duplicate values" filter chip is available alongside existing filter options
- [ ] When active, the list shows only tokens whose raw (unresolved) value is identical to at least one other token in the current set
- [ ] Tokens are grouped or annotated to show which others share the same value
- [ ] Filter chip is visually consistent with existing type/ref filter chips
- [ ] Verify in browser using dev-browser skill

---

### US-015: Richer Previews in Tree/Table View `[Plugin]`
**Description:** As a designer, I want token rows to show visual previews for complex types so that I can recognize values at a glance without opening the editor.

**Acceptance Criteria:**
- [ ] Typography tokens render a small preview string styled with the token's font family, size, and weight
- [ ] Shadow tokens render a small box with the box-shadow applied
- [ ] Gradient tokens render a gradient strip (matching existing Gallery view behavior)
- [ ] Previews appear in both Tree and Table view modes
- [ ] Previews degrade gracefully if the value is an unresolved alias (show the alias path instead)
- [ ] Verify in browser using dev-browser skill

---

### US-016: Reference Chain Visualization `[Plugin]`
**Description:** As a designer, I want to see when a token is a multi-hop alias so that I can understand how deeply nested my references are without opening the editor.

**Acceptance Criteria:**
- [ ] When a token resolves through 3 or more alias hops, the token row shows a "via N aliases" badge next to the resolved value swatch
- [ ] Clicking the badge expands an inline chain view showing each hop: `token-A → token-B → token-C → #hex`
- [ ] Collapsing the chain restores the normal row layout
- [ ] Chains with fewer than 3 hops are not badged (to avoid noise)
- [ ] Verify in browser using dev-browser skill

---

### US-017: Inspect Mode — Canvas-Aware Token Highlighting `[Plugin]`
**Description:** As a designer, I want the token list to highlight tokens bound to my selected Figma layer so that I can see the relationship between canvas and token system without extra navigation.

**Acceptance Criteria:**
- [ ] When a layer is selected on the Figma canvas, the token list highlights (or filters to) the tokens bound to that layer
- [ ] A "Show bound tokens" toggle in the toolbar enables/disables this mode
- [ ] Hovering a token row in the list triggers a flash/highlight on layers in the canvas that use that token (uses existing `select-layer` controller message)
- [ ] If no layer is selected, inspect mode shows a prompt to select a layer
- [ ] Verify in browser using dev-browser skill

---

### US-018: Selection Inspector Positioning `[Plugin]`
**Description:** As a designer, I want the Selection Inspector to always be visible when a layer is selected so that I don't miss it by forgetting to scroll down.

**Acceptance Criteria:**
- [ ] The Selection Inspector is rendered as a collapsible panel docked at a fixed position (e.g. bottom of the plugin viewport), not inline in the scroll flow
- [ ] When a Figma layer is selected, the panel automatically expands if collapsed
- [ ] When no layer is selected, the panel shows a minimal collapsed state with a label "Select a layer to inspect"
- [ ] The panel can be manually collapsed by the designer
- [ ] Verify in browser using dev-browser skill

---

### Epic 5: Token Editing & Referencing

---

### US-019: Copy Token Path / Resolved Value `[Plugin]`
**Description:** As a developer, I want to copy a token's CSS variable name or resolved value to my clipboard directly from the token list so that I can use it in code without switching tools.

**Acceptance Criteria:**
- [ ] Hovering a token row reveals two copy icons in the action area (alongside existing edit/delete icons)
- [ ] First icon copies the CSS variable name (e.g. `--color-blue-500`) to clipboard
- [ ] Second icon copies the resolved value (e.g. `#2563eb`) to clipboard
- [ ] A brief toast/tooltip confirms which value was copied
- [ ] Copy icons do not shift layout — they appear in the existing action area space
- [ ] Verify in browser using dev-browser skill

---

### US-020: Jump to Referenced Token from Alias `[Plugin]`
**Description:** As a designer, I want to click an alias value to navigate directly to the source token so that I can inspect or edit it without searching manually.

**Acceptance Criteria:**
- [ ] Alias value chips in the token list and token editor show a subtle "→" icon
- [ ] Clicking the chip navigates the token list to the source token (scrolls to and highlights it)
- [ ] If the source token is in a different set, the plugin switches to that set first, then focuses the token
- [ ] If the source token cannot be found (broken alias), clicking shows an error tooltip instead of navigating
- [ ] Verify in browser using dev-browser skill

---

### US-021: Easier Token Referencing — Alias Ergonomics `[Plugin]`
**Description:** As a designer, I want alias autocomplete to be available everywhere I type a value so that I can reference tokens without switching to the full editor.

**Acceptance Criteria:**
- [ ] Typing `{` in any value field (inline edit, quick-edit popover, full TokenEditor) opens the alias autocomplete dropdown
- [ ] The dropdown filters by token type when the field type is known (e.g. color field only shows color tokens by default, but allows overriding)
- [ ] Each autocomplete suggestion shows: the token path, a resolved value preview (color swatch or dimension value), and the source set
- [ ] A dedicated "alias mode" toggle button on inline-edit rows switches the input to alias mode and immediately opens autocomplete
- [ ] Verify in browser using dev-browser skill

---

### US-022: Dimension / Number Stepper Input `[Plugin]`
**Description:** As a designer, I want dimension and number token inputs to behave like a proper number field so that I can nudge values without manually typing each time.

**Acceptance Criteria:**
- [ ] Dimension and number token value inputs render with up/down stepper arrows
- [ ] Arrow keys (↑/↓) increment/decrement by 1; Shift+Arrow by 10
- [ ] Scrolling the mouse wheel over the input increments/decrements the value
- [ ] A unit selector (px / rem / %) appears next to the input for dimension tokens
- [ ] Changing the unit converts the stored value appropriately (e.g. 16px → 1rem)
- [ ] Verify in browser using dev-browser skill

---

### US-023: Token References in Gradient Values `[Plugin + Server]`
**Description:** As a designer, I want to use token aliases as color stops in gradient tokens so that semantic color tokens are respected inside gradients across themes.

**Acceptance Criteria:**
- [ ] The gradient editor in `TokenEditor` allows each color stop to be toggled between raw color and alias mode
- [ ] In alias mode, the color stop uses the same alias autocomplete as US-021
- [ ] The server-side resolver (`resolver.ts`) expands alias references within gradient stop values before output
- [ ] Style Dictionary transform pipeline handles alias expansion in gradient stops
- [ ] On Figma sync, alias-based gradient stops resolve to their current theme value before being pushed as Figma gradient paint values
- [ ] Verify in browser using dev-browser skill
- [ ] Typecheck/lint passes

---

### US-024: Extract to Alias Action `[Plugin]`
**Description:** As a design system maintainer, I want to convert a token with a raw value into an alias referencing a new or existing primitive so that I can refactor hardcoded values into the primitive → semantic hierarchy.

**Acceptance Criteria:**
- [ ] Right-clicking a token with a raw (non-alias) value shows an "Extract to alias" option
- [ ] The dialog prompts for: a name for the new primitive token (pre-suggested based on value type and existing naming patterns), or an option to pick an existing token to alias instead
- [ ] On confirm with a new name: the primitive token is created in the appropriate set, and the current token's value is replaced with an alias reference to the primitive
- [ ] On confirm with an existing token: the current token's value is replaced with an alias reference to the selected token
- [ ] Verify in browser using dev-browser skill

---

### Epic 6: Bulk Operations

---

### US-025: Bulk Rename by Name Pattern (Find & Replace for Token Names) `[Plugin + Server]`
**Description:** As a design system maintainer, I want to find and replace token path segments by pattern so that I can rename a namespace across hundreds of tokens at once.

**Acceptance Criteria:**
- [ ] The Find & Replace panel (or a new "Name" mode within it) accepts a find pattern (plain text or regex) and a replacement string targeting token *paths*, not values
- [ ] Preview shows all tokens whose paths will change, with before/after path displayed
- [ ] On confirm, all matched token paths are renamed and all alias references pointing to those tokens are updated to the new paths
- [ ] Operation uses the existing `bulk-rename` API endpoint
- [ ] If any rename would produce a duplicate path, it is flagged in the preview and blocked
- [ ] Typecheck/lint passes

---

### US-026: Bulk Alias Creation — Promote to Semantic `[Plugin]`
**Description:** As a design system maintainer, I want to convert multiple tokens with raw values to aliases in one operation so that I can stop doing tedious one-by-one refactoring.

**Acceptance Criteria:**
- [ ] Selecting multiple tokens (multi-select already works) and right-clicking shows "Convert to aliases"
- [ ] A modal shows each selected token with its proposed alias match: closest color primitive by delta-E for color tokens, or exact value match for dimensions/numbers
- [ ] Each row in the modal is individually accept/reject-able
- [ ] On confirm, selected tokens have their values replaced with alias references to the matched primitives
- [ ] Uses `allTokensFlat` with resolved values to compute matches
- [ ] Verify in browser using dev-browser skill

---

### US-027: Mass Create from Paste `[Plugin]`
**Description:** As a designer, I want to paste a JSON fragment or simple `name: value` lines to create multiple tokens at once so that I can quickly add tokens from a doc or another tool without using the full Import flow.

**Acceptance Criteria:**
- [ ] A "Paste tokens" action is accessible from the overflow menu and as a keyboard shortcut
- [ ] A modal accepts: a JSON fragment in DTCG format, or newline-separated `name: value` pairs
- [ ] Parsing errors are shown inline with line numbers
- [ ] Valid tokens are previewed before creation, showing name, type, and value
- [ ] On confirm, tokens are created/updated in the currently active set
- [ ] Conflicts with existing token paths show a warning and allow skip or overwrite per-token
- [ ] Verify in browser using dev-browser skill

---

### Epic 7: Discoverability & Power User Tools

---

### US-028: Discoverable Set Context Menu `[Plugin]`
**Description:** As a designer, I want a visible menu button on each set tab so that I can discover set-level actions without knowing to right-click.

**Acceptance Criteria:**
- [ ] Each set tab renders a `...` (kebab) button that is always visible on hover and on the active tab
- [ ] Clicking `...` opens a context menu with all existing set-level actions: Generate Semantic Tokens, Generate Dark Theme, Adopt Figma File, Rename (US-007), Duplicate, Delete, Set Metadata (US-003)
- [ ] Right-click on the tab still works as before (no regression)
- [ ] The `...` button does not overflow the tab's width — it replaces the current right-click-only affordance
- [ ] Verify in browser using dev-browser skill

---

### US-029: Command Palette (Cmd+K) `[Plugin]`
**Description:** As a power user, I want a fuzzy-search command runner so that I can trigger any action in the plugin without navigating menus.

**Acceptance Criteria:**
- [ ] Pressing Cmd+K opens a full-width command palette overlay
- [ ] The palette accepts free-text fuzzy search across all available commands
- [ ] Commands include at minimum: Create new token, Find & Replace (values), Find & Replace (names), Generate color scale, Switch to set [name], Go to token..., Export as CSS, Validate tokens, Generate semantic tokens, Generate dark theme, Import, Export
- [ ] Selecting a command closes the palette and triggers the action
- [ ] Pressing Escape closes the palette without triggering anything
- [ ] The `?` keyboard shortcut overlay is removed (command palette supersedes it)
- [ ] Verify in browser using dev-browser skill

---

### US-030: Group Presets / Scaffolding Wizard `[Plugin]`
**Description:** As a designer starting a new token set, I want to generate a complete group scaffold from a preset so that I don't have to manually create standard token structures.

**Acceptance Criteria:**
- [ ] When creating a new group (or from the empty state), an option "Use preset" is available
- [ ] Available presets: Spacing scale (T-shirt or numeric, dimension tokens), Border radius scale (none, sm, md, lg, full), Typography scale (font-size ramp from base + ratio), Z-index layers (base, dropdown, modal, tooltip, toast), Opacity scale (0, 5, 10, 20, 25, 50, 75, 90, 95, 100)
- [ ] Each preset shows a preview of the tokens it will generate before confirming
- [ ] Generated tokens are added to the active set under the specified group path
- [ ] Verify in browser using dev-browser skill

---

### Epic 8: Validation & Quality

---

### US-031: Token Linting with Configurable Rules `[Plugin + Server]`
**Description:** As a design system maintainer, I want configurable lint rules that run on every token edit so that violations surface inline without requiring a separate validation pass.

**Acceptance Criteria:**
- [ ] Lint configuration is stored in the server config alongside `collectionMapping` under a `lintRules` key
- [ ] Supported rules (each independently enable/disable-able):
  - `no-raw-color`: All color tokens must be aliases, not raw hex
  - `require-description`: All tokens must have `$description`
  - `path-pattern`: Token paths must match a configurable regex
  - `max-alias-depth`: No alias chains deeper than N hops (configurable N)
  - `no-duplicate-values`: No duplicate resolved values across sets
- [ ] Violations appear inline in the token list as a warning indicator on the affected token row
- [ ] Each violation has a quick-fix action where applicable: "Add missing description" opens the description field, "Convert to alias" triggers US-024 (Extract to Alias)
- [ ] Typecheck/lint passes

---

### US-032: Validate All Tokens Panel `[Plugin]`
**Description:** As a design system maintainer, I want to run a full validation pass and see all problems in one list so that I can address issues systematically.

**Acceptance Criteria:**
- [ ] A "Validate" button is accessible from the Analytics tab toolbar and from the command palette (US-029)
- [ ] Running validation produces a structured list of errors and warnings covering: broken aliases, circular references, tokens missing `$type`, value/type mismatches, alias chains deeper than the configured max
- [ ] Each result row shows: severity (error/warning), token path, description of the problem, and a "Jump to token" link
- [ ] Results can be filtered by severity
- [ ] Verify in browser using dev-browser skill

---

### US-033: Color Contrast Checker `[Plugin]`
**Description:** As a designer, I want to check WCAG color contrast between tokens directly in the plugin so that I can validate accessibility without leaving my workflow.

**Acceptance Criteria:**
- [ ] A "Check contrast" action appears in the token editor for color tokens
- [ ] The action opens a panel letting the designer pick a background color token
- [ ] The panel shows the contrast ratio and WCAG AA / AAA pass/fail status for normal text, large text, and UI components
- [ ] The Analytics panel includes a contrast matrix showing foreground/background token pairs with their pass/fail status
- [ ] Verify in browser using dev-browser skill

---

### US-034: Theme Missing-Coverage Warnings `[Plugin]`
**Description:** As a designer, I want to see when tokens are not covered by any active set in a theme so that I catch missing values before publishing.

**Acceptance Criteria:**
- [ ] Each theme card shows a warning badge: "N tokens have no value in active sets" when coverage gaps exist
- [ ] Clicking the badge navigates to a filtered list of the uncovered tokens
- [ ] A token is considered "uncovered" if it exists in a disabled or excluded set for the theme and no enabled set provides a value for the same path
- [ ] Verify in browser using dev-browser skill

---

### US-035: Duplicate Color Value Detection `[Plugin]`
**Description:** As a design system maintainer, I want to identify color tokens that resolve to the same hex value so that I can eliminate redundant primitives.

**Acceptance Criteria:**
- [ ] A "Duplicate colors" filter or report is accessible from the Analytics tab
- [ ] It surfaces groups of color tokens that share an identical resolved hex value (after full alias resolution)
- [ ] Each group shows all token paths resolving to that value
- [ ] A "Deduplicate" action (optional) allows promoting one as the canonical primitive and converting the others to aliases (triggers US-026 flow)
- [ ] Verify in browser using dev-browser skill

---

### US-036: Color Scale Lightness Curve Inspector `[Plugin]`
**Description:** As a designer, I want to see the perceptual lightness distribution of a generated color scale so that I can spot uneven steps before publishing.

**Acceptance Criteria:**
- [ ] After generating a color scale, a small sparkline chart appears below the generated tokens showing the L* (Oklch lightness) value for each step
- [ ] Steps with disproportionately large or small lightness jumps are visually highlighted (e.g. red/orange dot on the sparkline)
- [ ] The chart is non-interactive in the minimum implementation (display only)
- [ ] Verify in browser using dev-browser skill

---

### Epic 9: Sync

---

### US-037: Two-Way Variable Sync with Unified Diff `[Plugin]`
**Description:** As a designer, I want to see local and Figma-side changes together in one view so that I can make an informed decision about sync direction per token.

**Acceptance Criteria:**
- [ ] A single "Sync" action in the Sync tab computes both `computeFigmaDiff` and `computePullDiff` and merges the results into one diff view
- [ ] Diff rows are categorized: local-only changes, Figma-only changes, conflicts (both sides changed)
- [ ] Each row shows a direction arrow toggle: push local → Figma, pull Figma → local, or skip
- [ ] Confirming applies all selected direction choices in a single operation
- [ ] The existing separate push and pull flows are preserved as quick-action shortcuts for cases where direction is already known
- [ ] Verify in browser using dev-browser skill

---

### US-038: Partial Sync by Group `[Plugin]`
**Description:** As a designer, I want to sync a single token group to Figma instead of the entire set so that iterative workflows are faster and safer.

**Acceptance Criteria:**
- [ ] Right-clicking a group header shows "Sync this group to Figma"
- [ ] The action pushes only the tokens within that group to Figma variables, leaving other groups untouched
- [ ] A confirmation shows the count of tokens that will be synced
- [ ] Verify in browser using dev-browser skill

---

### US-039: Variable Scope Management UI `[Plugin]`
**Description:** As a designer, I want to configure the Figma variable scopes for each token directly in the plugin so that I control where variables appear in Figma's native variable picker.

**Acceptance Criteria:**
- [ ] The full `TokenEditor` includes a "Scopes" section listing available Figma variable scopes for the token's type
- [ ] Table view includes an optional "Scopes" column (toggleable)
- [ ] Scope selections are stored in the token data and respected during `syncToFigma` via `scopeOverrides`
- [ ] A group-level scope editor allows setting the same scopes for all tokens in a group at once
- [ ] Verify in browser using dev-browser skill

---

### US-040: Sync Status Per-Row Indicator `[Plugin]`
**Description:** As a designer, I want to see at a glance which tokens are out of sync with Figma without having to enable a filter so that I notice drift proactively.

**Acceptance Criteria:**
- [ ] Each token row shows a subtle indicator dot (e.g. orange for "changed since last sync", red for "diverged") when the token's sync state is non-clean
- [ ] The indicator is visible without enabling any filter — it is always-on for tokens with non-clean sync state
- [ ] Hovering the indicator shows a tooltip: "Changed locally since last sync" or "Diverged — both local and Figma have changes"
- [ ] Tokens with clean sync state show no indicator (no visual noise)
- [ ] Verify in browser using dev-browser skill

---

### US-041: Publish Readiness Checklist `[Plugin]`
**Description:** As a design system maintainer, I want a pre-publish checklist that validates Figma variable state so that I can confidently publish a Figma library.

**Acceptance Criteria:**
- [ ] A "Publish Readiness" panel is accessible from the Sync tab or as a command palette action
- [ ] Checklist categories with pass/fail status: All tokens have corresponding Figma variables, Scopes are set (not all-scope wildcard) for every variable, Descriptions are populated for every variable, No orphan Figma variables that have no matching token
- [ ] Each failed check shows a count of affected items and a "Fix" action where automation is possible
- [ ] Verify in browser using dev-browser skill

---

### Epic 10: Analytics & Documentation

---

### US-042: Figma Component Token Coverage Map `[Plugin]`
**Description:** As a design system maintainer, I want a report showing which Figma components use tokens vs hardcoded values so that I can track tokenization progress.

**Acceptance Criteria:**
- [ ] A "Component Coverage" report is accessible from the Analytics tab
- [ ] Running the scan walks all component nodes in the current Figma file and checks bound variables vs raw fills/strokes/text styles
- [ ] Report shows: total component count, percentage tokenized, and a list of untokenized components with their hardcoded property counts
- [ ] Clicking an untokenized component in the list selects it on the Figma canvas
- [ ] Verify in browser using dev-browser skill

---

### US-043: Token Documentation / Style Guide Generation `[Server]`
**Description:** As a design system maintainer, I want auto-generated visual style guide pages on the server's `/docs` route so that I can share the token system with stakeholders who don't have Figma access.

**Acceptance Criteria:**
- [ ] The server's `/docs` route renders auto-generated HTML pages (no manual authoring required)
- [ ] Color tokens are displayed as palette swatches with hex values and contrast ratios between foreground/background pairs
- [ ] Typography tokens render specimen text styled with the actual font/size/weight values
- [ ] Spacing tokens render a visual scale (boxes of increasing size)
- [ ] Pages are shareable via direct URL with no authentication required (configurable)
- [ ] Typecheck/lint passes

---

### Epic 11: Information Architecture Polish

---

### US-044: Filter Bar Always-On Type Filter Chip `[Plugin]`
**Description:** As a new user, I want to see the Type filter chip without having to interact with the search bar first so that I discover filtering exists.

**Acceptance Criteria:**
- [ ] The Type filter chip is always visible in the filter bar regardless of search bar focus or active filter state
- [ ] Other filter chips (ref type, deprecated, missing desc) continue to appear on demand or when active
- [ ] The always-on chip does not cause layout overflow in the filter bar
- [ ] Verify in browser using dev-browser skill

---

### US-045: Semantic Generation Discoverability `[Plugin]`
**Description:** As a new user, I want to discover "Generate Semantic Tokens" and "Generate Dark Theme" as prominent actions so that I find these high-value features without stumbling into a right-click context menu.

**Acceptance Criteria:**
- [ ] After completing the starter wizard flow, the completion screen presents "Generate Semantic Tokens" and "Generate Dark Theme" as primary call-to-action buttons
- [ ] Empty-set states (US-002) include these as secondary actions if a primitives set exists
- [ ] The actions remain available in the set context menu (US-028) as before — this story adds the additional surface points only
- [ ] Verify in browser using dev-browser skill

---

## 4. Functional Requirements

- **FR-1:** All destructive operations (delete, bulk delete, group delete, rename, move) must produce an undo-able state snapshot before executing.
- **FR-2:** All uses of `window.confirm()` must be replaced with in-plugin modal components.
- **FR-3:** Set rename must cascade updates to theme references and cross-set alias references atomically; partial failure must roll back the entire operation.
- **FR-4:** Alias autocomplete must be available in every value input field, triggered by typing `{`.
- **FR-5:** The tab bar must contain exactly four primary tabs: Tokens, Themes, Sync, Analytics. All other views move to a `...` overflow menu.
- **FR-6:** Lint rules must be configurable via the server config and violations must appear inline in the token list without requiring a manual validation run.
- **FR-7:** The two-way sync unified diff must merge output from both `computeFigmaDiff` and `computePullDiff` without running two separate passes from the user's perspective.
- **FR-8:** All bulk operations (bulk rename by pattern, bulk alias creation) must show a preview before executing and allow per-item accept/reject.
- **FR-9:** The command palette must be accessible via Cmd+K and support fuzzy search across all plugin actions.
- **FR-10:** Token References inside gradient stop values must be resolved server-side before Style Dictionary transform and before Figma sync push.

---

## 5. Non-Goals (Out of Scope)

- Multi-level undo (only one undo slot is required)
- Real-time collaboration or conflict resolution between multiple simultaneous plugin users
- Exporting the style guide to PDF or Storybook (server HTML output is sufficient)
- Automated WCAG contrast fix suggestions (contrast checker is display-only for now)
- Figma REST API integration (all Figma communication is via the existing plugin controller message layer)
- Migrating existing `window.confirm()` tests — tests are not a priority in active development

---

## 6. Design Considerations

- The tab bar reorganization (US-001) is a prerequisite for several other stories — implement it first to establish the correct chrome structure before adding new panels to it.
- The in-plugin modal component (US-005) should be implemented as a shared, reusable component used by all subsequent destructive operations.
- Alias autocomplete (US-021) should be implemented as a shared component consumed by the inline editor, quick-edit popover, and full TokenEditor — avoid duplicating the implementation.
- The command palette (US-029) should be wired to an action registry so that new commands can be added without modifying the palette component itself.

---

## 7. Technical Considerations

- **Set Rename (US-007):** Requires a new server endpoint. The rename, theme reference update, and alias cascade update must all execute in a single transaction or with full rollback on failure.
- **Token Linting (US-031):** Lint rules run on every edit — rule evaluation must be O(n) or better to avoid UI lag on large token sets. Cache resolved values where possible.
- **Gradient alias references (US-023):** The resolver and Style Dictionary transform pipeline changes are server-side. Coordinate with the sync push path to ensure aliases resolve before Figma receives gradient paint values.
- **Two-Way Sync (US-037):** Merging `computeFigmaDiff` and `computePullDiff` output requires a stable token identity key across both directions. Verify the key scheme handles renamed tokens correctly.
- **Command Palette (US-029):** Use a simple action registry pattern (a map of command id → { label, handler }) so new commands are registered declaratively.

---

## 8. Success Metrics

- Zero uses of `window.confirm()` remain in the plugin codebase
- Set Rename works end-to-end with alias cascade in under 2 seconds for sets with up to 500 tokens
- Alias autocomplete appears within 100ms of typing `{` in any value field
- Command palette returns results within 50ms of keystroke
- The token list renders lint violation indicators without measurable FPS drop on sets with 500+ tokens

---

## 9. Open Questions

- Should the undo slot (US-006) persist across plugin open/close within the same Figma session, or only while the plugin is open?
- For the Publish Readiness Checklist (US-041), should "No orphan Figma variables" be a blocking error or a warning? (Orphans may be intentional for variables not yet managed by TokenManager.)
- Should the `/docs` style guide (US-043) support theming (switching between light/dark theme token values), or render only the default theme initially?
- For the Figma Component Coverage Map (US-042), should "component" mean top-level components only, or include component instances and nested frames?
