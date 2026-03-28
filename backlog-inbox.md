- Token type auto-inference from pasted/typed values — typing `#FF5500` should auto-select color type, `16px` should select dimension, `{ fontFamily: ... }` should select typography; reduces a mandatory manual step in every token creation flow and matches how Figma's paste-to-create works

- Inline color input instead of modal picker — the current color picker opens as a blocking modal that obscures the token list; replace with an inline popover (like Figma's native color input) that stays anchored to the swatch, allows typing hex/rgb/hsl directly, and dismisses on outside click without losing context

- Progressive disclosure in TokenEditor — all fields (description, scopes, extensions, color modifiers, mode values) are visible at once even for a simple color token; collapse optional/advanced fields behind an expandable "More options" section so the default create flow is: path + type + value + save

- "Create token here" button on group nodes — currently the only ways to create a token are global Cmd+N or the bottom bar button, which both require manually typing the full path prefix; add a small "+" affordance on group hover that pre-fills the path prefix (e.g., clicking "+" on `colors.brand` pre-fills `colors.brand.`)

- Validate typography fields on blur, not just on save — font family and font size are required but validation only fires when the user clicks Save; show inline validation errors immediately when the user leaves a required field empty, preventing the "click save, see error, scroll back to field" loop

- Keyboard shortcut cheat sheet overlay — shortcuts like Cmd+Shift+Enter (create & new), E (inline edit), Space (open editor) are powerful but undiscoverable; add a persistent `?` button or Cmd+/ overlay showing all available shortcuts for the current context (list vs editor vs inspector)

- Drag tokens between set tabs — currently moving tokens between sets requires right-click > "Move to set" > pick from dropdown; allow dragging selected tokens onto a set tab to move them, matching the direct manipulation pattern users expect from Figma

- Auto-save editor drafts to session storage — if the user accidentally closes the editor or navigates away mid-edit, all unsaved work is lost; persist draft state to sessionStorage so re-opening the editor restores the in-progress values with a "You have unsaved changes" banner

- Batch rename with live preview — Find & Replace exists but shows no preview of what will change; add a diff-style preview panel showing old path -> new path for every affected token before confirming, with per-token accept/reject checkboxes for surgical renames

- Smart token suggestions based on existing hierarchy — when creating a new token in a group that follows a pattern (e.g., `colors.brand` has `100` through `900`), suggest the next logical name and interpolated value; reduces cognitive load for extending established scales

- Spreadsheet/table view with inline cell editing — the table view mode exists but is read-only; make cells editable inline (click cell to edit value, tab to next cell) like Figma's variable table, supporting rapid sequential editing without opening the full TokenEditor for each token

- Group-level operations toolbar — selecting a group currently shows a context menu; add a visible toolbar (or floating action bar) when a group is focused, with: "Add token", "Add subgroup", "Rename", "Bulk edit children", "Duplicate", "Move", "Delete" — making group operations discoverable without right-click

- Token creation from canvas selection — when a Figma layer is selected and has properties not yet bound to tokens, offer a "Create tokens from selection" flow that extracts fill colors, stroke, dimensions, typography, shadows into a batch of pre-filled token drafts with smart naming based on layer/component names

- Recently used tokens section in the token picker — when binding tokens to properties (Inspect tab picker, alias picker), show a "Recent" section at the top with the last 5-10 tokens the user interacted with; in real workflows, users apply the same tokens repeatedly across layers

- Token value history / changelog per token — show a collapsible "History" section in the TokenEditor displaying previous values (from git or an operation log) with timestamps; helps users answer "what was this color before someone changed it?" without leaving the plugin

- Multi-select with floating action bar — entering select mode shows a top bar with batch actions, but users have to discover Cmd+Click first; add visible row-level checkboxes (toggled by a "Select mode" button) and show a sticky floating bar at the bottom with action count + quick actions (delete, move, change type)

- Shadow and gradient visual preview in editor — ShadowEditor and GradientEditor show only form fields with no visual representation of the result; add a live preview swatch (shadow: box with rendered shadow; gradient: rectangle with rendered gradient) that updates as properties change

- Paste-to-create shortcut — Cmd+V on the token list (not in an input field) should open the PasteTokensModal pre-populated with clipboard contents; currently users must navigate to the paste button or menu item first

- Token comparison mode — select 2+ tokens and see their values side-by-side in a dedicated comparison panel; useful for auditing similar tokens (e.g., comparing `colors.brand.primary` across two sets or checking if `spacing.md` and `spacing.lg` have the right ratio)

- Contextual "did you mean?" for alias references — when a user types an alias reference like `{colors.primry}` that doesn't resolve, suggest the closest matching token path (fuzzy match) instead of just showing "unresolved reference"; speeds up the alias authoring flow

- Visual filter builder for token search — the structured query language (`type:color`, `has:alias`, etc.) is powerful but text-only; add clickable filter chips/toggles for common queries (type dropdown, alias/direct toggle, has-description checkbox) that compose the query visually, with the raw text field still available for power users

- Copy token as CSS/SCSS/Tailwind snippet — individual tokens can be copied as path or JSON, but not as a ready-to-use code snippet; add "Copy as CSS" (`--color-primary: #FF5500;`), "Copy as SCSS" (`$color-primary: #FF5500;`), and "Copy as Tailwind" (`'primary': '#FF5500'`) options to the token context menu

- Skeleton loading states for token list and theme manager — when initially fetching tokens from the server, the list shows blank space; add shimmer skeleton rows matching the tree structure so users see immediate structural feedback before data arrives

- Focus trap in modals and drawers — ConfirmModal, TokenEditor drawer, and other overlays don't trap focus; users can Tab into background content behind the overlay, which is both an accessibility failure and a source of accidental edits

- Broken alias visual indicator in list view — broken aliases (referencing non-existent tokens) only show an error when opening the editor; add a red warning badge or strikethrough in the token list row so broken references are immediately scannable without clicking into each token

- Scroll position persistence when switching sets — navigating away from a set and back resets scroll to top; persist virtualScrollTop per set so users resume where they left off, especially important for large token lists

- Search query persistence across tab switches — switching from Tokens to Themes and back clears the search field; persist the active search query per tab so users don't have to re-enter filters when context-switching

- Confirmation dialog for theme dimension deletion — deleting a theme dimension is destructive and irreversible but has no confirmation; add a ConfirmModal showing how many options and set assignments will be lost

- "Last modified" sort option — sort dropdown has alpha, by-type, by-value but no temporal sort; track last-modified timestamps on tokens and add a "Recently changed" sort to surface active work without relying on the search filter

- Smooth expand/collapse animation for tree groups — expanding and collapsing groups in the token list is instant (virtual list swap); add a brief height transition (100-150ms) to give spatial context about where new items appeared

- Responsive layout for narrow plugin windows — the UI assumes either 400px or 900px with no in-between; filter buttons, set tabs, and action bars can overflow at intermediate widths; add breakpoint-aware wrapping or overflow menus for the search/filter bar

- Per-token "synced to Figma" indicator — no way to tell from the token list which tokens have been published as Figma variables vs which are local-only; add a subtle sync badge or dot so users know what's live in Figma without opening the Publish panel

- Visible undo history list — undo/redo works via keyboard but users can't see what actions are in the history; add an expandable undo history panel (or dropdown from the undo button) showing the last N operations with one-click rollback to any point

- Empty states for Generators, Theme Compare, and Graph panels — these panels show blank or broken UI when there's no data; add purposeful empty states with explanation text and a primary action (e.g., "Create your first generator" with a link to the generator dialog)

- "New set" button in the set tab bar — creating a new set requires right-clicking empty space or using the sidebar; add an explicit "+" tab at the end of the set tab bar (standard tab pattern) to make set creation discoverable

- Paste color from clipboard into color picker — when the user has a hex color on their clipboard and opens the color editor, offer to auto-fill from clipboard; saves the manual paste step that interrupts the flow

- Token editor auto-scroll to validation error — when save fails due to a validation error on a field that's scrolled out of view (common with typography's many fields), auto-scroll to the first errored field and pulse it so the user doesn't have to hunt for what went wrong
