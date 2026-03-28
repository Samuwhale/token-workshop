
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
