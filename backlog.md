# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: ambitious feature additions + improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be triaged at the end of each iteration:

- `- [HIGH] item title…` or `- [P0] item title…` — inserted before the first `[ ]` item (picked next by the agent).
- All other items are appended to the bottom.

---

## App Shell & Navigation

### QoL

- [x] ~~**Set tabs overflow strategy**~~ — *Superseded by "Set folder organization" below.* Horizontal set tabs work well for moderate counts but will break at 10+ sets. Add horizontal scrolling with fade indicators, or collapse to a dropdown after a threshold.

### UX

- [~] **IA restructure: reduce to 3 primary tabs** — The current 5-tab layout (Tokens, Themes, Sync, Analytics, Preview) fragments the core workflow across too many screens. Restructure to 3 primary tabs: **Tokens** (the workspace — token list, set picker, theme switcher, inline preview), **Inspect** (selection inspector, promoted from bottom panel), **Publish** (sync + export, merged). Move Analytics into a toolbar toggle/panel within the Tokens tab (lint badges are already inline — the separate tab mostly duplicates that). Move Preview into a split-view or toggle within the Tokens tab. Move Theme management into a panel accessible from the theme switcher (not a separate top-level tab). Import/Export/Settings stay in the overflow menu. This matches the mental model: "I work with tokens" → "I check what's applied" → "I push to Figma/Git".

- [x] **Theme switcher in the Tokens tab toolbar** — Currently switching the active theme requires navigating to the Themes tab. Add a theme dropdown/pill bar to the Tokens tab toolbar (next to the set tabs). Selecting a theme immediately resolves all tokens under that theme's set configuration, so you can see how `semantic.bg` resolves under "light" vs "dark" without leaving the token list. Theme *management* (create/edit/delete) opens from a "Manage themes..." link in the dropdown. This is the single highest-impact flow improvement — it makes theme-aware token browsing zero-friction.

- [~] **Promote SelectionInspector to its own tab** — The inspector is currently a collapsible bottom panel within the Tokens tab. This buries the most important Figma integration feature. Promote it to a top-level "Inspect" tab (like Tokens Studio) so the workflow is: select layer on canvas → switch to Inspect tab → see all token bindings → remap/apply. The inspector should show: all bound tokens grouped by property, resolved values, remap action, "go to token" navigation, and a "no tokens applied" empty state with a hint to apply from the Tokens tab.

- [~] **Merge Sync + Export into a "Publish" tab** — Sync (Figma variables, Git) and Export (CSS, JSON, etc.) are both "push tokens outward." Merge them into a single "Publish" tab with sections: Figma Variables, Figma Styles, Git, and File Export. This reduces tab count and groups related actions. The current Sync tab's "readiness checks" become a pre-publish validation gate shown at the top of Publish.

- [ ] **Inline analytics as a toolbar toggle** — The Analytics tab is mostly a summary of lint violations that are already shown as inline badges in the token list. Replace the dedicated tab with a toolbar toggle button (e.g., filter icon with issue count badge) that, when active, filters the token list to show only tokens with validation issues. Keep the color contrast matrix and duplicate detection as panels accessible from this filtered view or from the overflow menu. This removes a tab while making the data more actionable (you see the problem tokens *in context*, not on a separate screen).

- [ ] **Preview as split-view toggle** — The Preview tab shows live UI components rendered with token CSS variables, but it's disconnected from the token list. Replace the dedicated tab with a split-view toggle on the Tokens tab: when active, the bottom half shows the preview pane while the top half shows the token list. Editing a token inline immediately updates the preview below. This makes the preview useful as a *feedback loop* during editing, not just a read-only report.

---

## Token Management

### Bugs

- [x] **Resolver crashes on malformed composite tokens** — `resolveValue()` in `packages/core/src/resolver.ts` recurses into nested objects and arrays without null guards on intermediate values. A composite token with an `undefined` field in its object value will throw at runtime. Add null checks before recursing into object/array values.

### QoL

- [ ] **Dual-value display for alias tokens** — When a token is an alias, the row currently shows the reference badge and resolved value separately. Improve this: show a compact `{ref.path} → resolved` inline on the right side of the row so both the raw reference and computed value are always visible at a glance, without needing to click or hover. This is one of Tokens Studio's best UX patterns.
- [ ] **Hover tooltip with full resolution chain** — On hover over any alias token row, show a tooltip with the full resolution chain (e.g., `semantic.bg → color.neutral.100 → #F5F5F5`) so designers can debug alias depth without clicking into the editor.
- [ ] **Rich color picker with color space support** — The color picker is currently a native HTML `<input type="color">` which only supports hex in sRGB. Replace with a custom color picker that supports HSL, LCH, and P3 color spaces, shows numeric inputs for each channel, and includes an opacity slider. LCH is particularly important since our generators already use CIELAB math — the picker should speak the same language. Consider also adding an eyedropper button that samples colors from the Figma canvas via the plugin API.
- [x] **Copy token path (raw dot-notation)** — Currently only "Copy CSS variable name" is available (e.g., `--color-primary-500`). Add "Copy token path" to copy the raw dot-notation path (e.g., `color.primary.500`) and "Copy as JSON" to copy the full token definition as a JSON snippet. Tokens Studio has both.
- [x] **Expand/collapse all groups** — No global toggle exists. Add "Expand all" / "Collapse all" buttons to the toolbar (or keyboard shortcut). Essential when navigating large sets.
- [ ] **Color swatch grid view for color tokens** — Tokens Studio offers a grid/swatch view for color tokens that shows them as a compact grid of color chips rather than a vertical list. Add a grid sub-mode within the List view (toggle button in the toolbar) that renders color tokens as a visual palette. This is distinct from the Canvas view (which shows all token types spatially) — the grid is specifically optimized for reviewing color systems at a glance.
- [ ] **Math expressions in token values** — Tokens Studio supports `{space.base} * 2` syntax in token values, enabling computed values from references. Add expression evaluation for numeric token types (dimension, number, duration) so users can write `{spacing.base} * 1.5` and have it resolve to the computed value.
- [ ] **Auto-type inference on value input** — When creating a token, if the user types `#FF0000` before selecting a type, auto-suggest "color". If they type `16px`, auto-suggest "dimension". Reduces a decision point during rapid token creation.
- [ ] **Rename token with reference update** — When renaming a token (path change), prompt the user: "N tokens reference this one. Update their references?" and bulk-update all alias paths that pointed to the old name. Tokens Studio does this; without it, renaming breaks aliases silently.
- [ ] **Token `$description` field** — The DTCG spec supports `$description` on every token; Tokens Studio exposes this and teams use it to document *why* a token exists. Add an optional description field to the token editor form. Show a truncated description below the value in the list view (expand on hover). Critical for multi-contributor design systems where semantic tokens need to explain when/where to use them. The JSON editor view (see below) gives `$description` editing for free, but the form editor needs an explicit field.
- [ ] **Group quick-add `+` button** — Tokens Studio shows a `+` icon on hover over any group header that opens the create form with the group path pre-filled. Add this micro-interaction — it eliminates the "create token → manually type group prefix" friction for the most common flow: adding a token to an existing group.

### UX

- [ ] **Apply-to-layer discoverability** — The apply-to-selection button exists but is a tiny 10px arrow icon that's easy to miss. Make the apply action more prominent: enlarge the hit target, add a tooltip, and consider making left-click on the token row itself apply (with edit moving to double-click or a dedicated button). This is the #1 daily workflow for designers — it should be the most obvious interaction.
- [ ] **"Create another" rapid-entry mode** — After creating a token, the form closes and the user must manually re-trigger it. Add a "Create & New" button (or Shift+Enter) that saves the current token and immediately re-opens the create form with the same group prefix and type pre-filled. For bootstrapping a design system (e.g., adding 20 color primitives), this eliminates half the clicks.
- [ ] **Drag-to-move tokens between groups** — Moving tokens between groups currently requires Find & Replace on paths. Add drag-and-drop for individual tokens or multi-selected tokens to move them into a different group (updating the path prefix). This is a basic expectation for tree-based UIs.
- [ ] **Explicit group creation** — Groups can only be created implicitly by naming a token with a dotted path. Add a "New group" action (context menu on group header or set level) that creates a named group node in the tree, so users can establish structure before populating with tokens. Empty groups should be visually distinguished but persistent.
- [ ] **Duplicate token set** — Sets cannot be cloned. Add a "Duplicate set" action to the set context menu that copies all tokens into a new set with a suffix (e.g., "primitives-copy"). Essential for creating dark/light variants from a base set.
- [ ] **Reorder sets** — No drag-to-reorder for set tabs. Set order matters for cascading resolution (later sets override earlier ones). Add drag-to-reorder on set tabs with a visual indicator of precedence direction.
- [ ] **Set folder organization** — Tokens Studio supports `/` in set names to create a folder hierarchy in the sidebar (e.g., `brands/berry`, `themes/light`). Add support for folder-grouped sets as a collapsible sidebar that replaces the horizontal tab bar when set count exceeds a threshold (~6-8 sets). The horizontal toolbar is already crowded with the theme switcher (see App Shell IA restructure), so a vertical sidebar with folder nesting is the right solution at scale. This supersedes the set tabs overflow strategy item.
- [ ] **Delete token from editor** — Delete is only available from the token list. Add a "Delete token" action (with confirmation) to the editor drawer so users don't have to close the editor, find the token in the list, and right-click to delete.
- [ ] **Revert to saved in editor** — No way to discard unsaved changes in the editor drawer. Add a "Revert" or "Discard changes" button that resets the editor to the last saved state.
- [ ] **Token editor as contextual side panel** — The current bottom drawer at 65% height obscures the token list, breaking context. When the plugin window is wide enough (>480px), show the editor as a right-side panel instead, so the token list remains visible and scrollable on the left. The list should highlight and scroll to the token being edited. For narrow windows, fall back to the current drawer. This keeps the user oriented in the token hierarchy while editing.
- [ ] **Composition tokens** — Tokens Studio Pro has a "composition" token type that bundles multiple property tokens into one (e.g., a "card" token with fill, borderRadius, padding, spacing all defined together). When applied, all properties are set at once. Add a composition type that lets users define a token whose value is an object mapping property names to other token references, and apply all properties in one action.
- [ ] **Asset tokens (URL/image)** — Tokens Studio supports an "asset" token type that holds a URL pointing to an image. When applied to a layer, the plugin fetches the image and sets it as an image fill. Useful for logos, icons, and brand assets that vary by theme. Add an asset type with URL input and image preview in the editor.
- [ ] **JSON editor view mode** — Add a raw DTCG JSON editor as a view mode in the Tokens tab toolbar (alongside List, Canvas, and Graph). This is one of Tokens Studio's most-used power features — experienced design system engineers constantly drop into raw JSON for bulk renames, group restructuring, and copy-pasting token blocks between sets. The editor should: use a lightweight code editor (CodeMirror/Monaco), support syntax highlighting for `$value`/`$type`/`$description` fields, validate alias references inline (red underline for broken `{refs}`), and bi-directionally sync with the List view (edit in one, see changes in the other). This is NOT an import/export — it's a live view of the current set's tokens. Subsumes the need for a separate "Copy as JSON" action and makes `$description` editing natural. Essential for Tokens Studio migration (users paste their existing JSON directly).
- [ ] **Cascade visualization on set reorder** — When dragging sets to reorder (see "Reorder sets" item), show a live diff overlay of which tokens change resolved value due to the new precedence order. Token rows that would resolve differently under the new order flash with a before/after badge. This makes the cascade model — which is Tokens Studio's #1 source of user confusion — immediately understandable through direct visual feedback.
- [ ] **Set merge and split** — Add "Merge into..." and "Split by group" actions to the set context menu. Merge combines two sets into one with a conflict resolution step (pick which value wins per-token). Split separates a set into child sets based on top-level group prefixes (e.g., a set with `colors.*` and `spacing.*` becomes two sets). Common need when reorganizing growing design systems.

---

## Theme Management

### QoL

- [ ] **Inline explanation of set statuses** — Tokens Studio's #1 onboarding complaint is that `source` vs. `enabled` vs. `disabled` is unexplained. Wherever set status toggles appear (theme management panel, theme switcher detail view), add persistent inline descriptions or tooltips: "Base = foundation layer, can be overridden", "On = active, overrides base sets", "Off = not used in this theme". First-time users should never have to guess.
- [ ] **Persist active theme selection per file** — Store the currently active theme selection in Figma's `clientStorage` (keyed by file ID) so it survives plugin restarts. Tokens Studio has a known complaint that theme selections reset every session — solving this is a concrete advantage.

### UX

- [ ] **Multi-dimensional theme model** — Add support for theme groups (dimensions) with options, matching Tokens Studio's Group/Option model. A theme group represents one axis of variation (e.g., "Color Mode", "Brand", "Density"), and each group has mutually exclusive options (e.g., "Light"/"Dark"). Multiple groups can be active simultaneously, creating a matrix of combinations. This maps cleanly to Figma Variable Collections (groups) and Modes (options). Without this, enterprise design systems with multiple theming dimensions (brand × mode × density) require flat theme duplication. This is the single largest capability gap vs. Tokens Studio.
- [ ] **Theme live preview during editing** — When editing a theme's set configuration (toggling sets on/off/base), there's no immediate feedback on how tokens resolve under that configuration. With the theme switcher in the toolbar (see App Shell), switching *existing* themes already updates the token list. But when *editing* a theme's set assignments, the token list and split-view preview should update in real-time as you toggle sets, so designers can experiment with set combinations without save-and-check cycles.
- [ ] **Duplicate theme** — No way to clone an existing theme as a starting point. Add a "Duplicate" action to the theme card that copies all set statuses and ordering into a new theme with a "-copy" suffix. Essential when creating variants (e.g., "dark-high-contrast" from "dark").
- [ ] **Compare themes side-by-side** — No way to see how two themes differ. Add a comparison view that shows tokens with differing resolved values between two selected themes, highlighting what changes. Useful for auditing light/dark or brand variants.

---

## Sync

### Bugs

- [x] **Missing `return` after error response in sync route** — In `packages/server/src/routes/sync.ts`, the catch block sends a 500 response but doesn't `return`, so execution continues and Fastify may attempt to send a second response. Add `return` before the `reply.status(500)` call.
- [x] **Race condition: concurrent file watcher rebuilds** — In `packages/server/src/services/token-store.ts`, the `change`/`add`/`unlink` watcher handlers all call `rebuildFlatTokens()` without debouncing or locking. Rapid file-system events (e.g., an editor writing multiple files at once) trigger concurrent rebuilds, leaving the resolver in a partially stale state. Debounce the rebuild or use a rebuild queue.
- [x] **File watcher errors silently halt updates** — The chokidar watcher in `token-store.ts` has no `error` event handler. If the watcher encounters a permission error or the watched directory is deleted, it stops firing events with no indication to the server or user.

### UX

- [ ] **Create Figma Styles from tokens** — Currently only Figma Variables are supported. Add the ability to create/update Figma Styles (Color, Text, Effect) from tokens. Many teams use styles alongside variables, and Tokens Studio supports both targets.
- [ ] **Batch create variables/styles from group** — Tokens Studio has "Create variables from group" and "Create styles from group" in the group right-click context menu. Add these actions so users can bulk-publish an entire group (e.g., all `colors.brand.*` tokens) to Figma in one click, rather than syncing the entire set.

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

---

## Selection Inspector & Property Binding

### UX

- [ ] **Deep inspect for nested components** — Tokens Studio's Inspect panel can drill into component instances to show tokens applied on nested layers, not just the top-level selection. Ensure our inspector supports recursive inspection of component children with a "Deep inspect" toggle.
- [ ] **Remap token on selection** — Tokens Studio lets you remap a token binding on a selected layer to a different token (e.g., swap `color.brand.old` for `color.brand.new`) without detaching and re-applying. Add a "Remap" action in the inspector that shows the current binding and lets you pick a replacement token.
- [ ] **Bulk remap across selection** — When renaming or restructuring tokens, allow bulk-remapping all token bindings across the current selection (or page/document) from old paths to new paths. Tokens Studio supports this for migration workflows.

---

## Import

### UX

- [ ] **Import from Figma Styles** — Add reverse-sync: pull existing Figma Color, Text, and Effect styles into the plugin as tokens. Tokens Studio supports this and it's the primary onboarding path for teams migrating from a styles-based workflow. Map style names to token paths (using `/` → `.` conversion) and style values to token values.
- [ ] **Import from Figma Variables** — Add reverse-sync: pull existing Figma Variables into the plugin as tokens. Map variable collections to token sets and variable modes to theme options. This is critical for teams that already have variables defined in Figma and want to adopt TokenManager without recreating everything manually.

---

## Token Generation & Graph Editor

### Bugs

- [x] **Division by zero in formula evaluator** — `parseMulDiv()` in `packages/core/src/eval-expr.ts` performs division without checking for a zero divisor, silently producing `Infinity` or `NaN` values that get written as token values. Add a check and return an error when the right-hand side of `/` resolves to zero.
- [x] **Color modifier `mix` silently no-ops on invalid color** — In `packages/core/src/color-modifier.ts`, the `mix` case calls `hexToLab()` and silently `break`s if either color is invalid. The token gets no modifier applied with no error or warning. Surface a validation error to the caller instead of silently skipping.

### UX

- [ ] **Token Graph: node-based generation editor** — Visual node editor as the fourth view mode in the Tokens tab (alongside List, Canvas, JSON). This is the centrepiece feature that unifies and replaces the current `TokenGeneratorDialog`, `ColorScaleGenerator`, `SemanticMappingDialog`, and `QuickStartDialog` into a single composable system. A graph is a canvas of connected nodes: Input nodes (token references, color pickers, numbers) feed into Scale nodes (all 7 current generator types: color ramp, type scale, spacing, opacity, border radius, z-index, custom) which feed into Mapping nodes (semantic map, rename prefix, filter steps) which feed into Output nodes (write to target set/group) and Preview nodes (inline visual preview). Graphs are saved per-project, support named inputs for multi-brand parameterization (see below), and encode the *why* behind token values — not just the *what*. **Simple mode**: selecting a graph template creates a linear 2-3 node graph. This graph can be edited via a **form view** identical to the current generator dialog (same fields, same layout). Users who never want the node editor never see it. Power users switch to node view to compose, branch, and chain. **Migration**: existing `TokenGenerator` records auto-migrate to single-path graphs (sourceToken → scale node → output). The `/api/generators` endpoint evolves to return `TokenGraph` objects. Once the Graph is stable, delete `TokenGeneratorDialog`, `ColorScaleGenerator`, `SemanticMappingDialog`, and `QuickStartDialog` as standalone components — the Graph subsumes all of them. **Initial node types**: Token Reference Input, Color Picker Input, Number Input, Enum Input, Color Ramp, Type Scale, Spacing Scale, Opacity Scale, Border Radius Scale, Z-Index Scale, Custom Scale, Semantic Map, Output, Preview. Add Color Math (blend/adjust/convert), General Math (add/multiply/clamp), and Validation (contrast check) nodes iteratively.
- [ ] **Graph templates library** — Pre-built graph templates that replace `QuickStartDialog` presets: "Material color palette" (input → 11-step ramp → semantic map → output), "Tailwind spacing" (base → spacing scale → component spacing map → output), "Modular type scale" (ratio + base → type scale → output), "Full semantic color system" (brand color → ramp → semantic map for surfaces/text/borders/actions → output). Templates are the onboarding path: empty set states and the command palette surface them. Selecting a template drops a pre-built graph into the Graph view, ready to customize.
- [ ] **Multi-brand graph inputs** — A graph's Input nodes can be parameterized: instead of a single fixed value, an input can be bound to an **input table** where each row represents a brand/variant and each column is a named input. Running the graph produces one output set per row (e.g., row "Berry" with brandColor=#8B5CF6 → writes to `brands/berry`, row "Mango" with brandColor=#F59E0B → writes to `brands/mango`). This captures ~80% of Tokens Studio's Graph Engine value: define generation logic once, run across N brands. The input table is edited in the graph's config panel, not in a separate UI.
- [ ] **Contrast Check graph node** — Takes two color inputs (or a color + a reference), outputs WCAG AA/AAA pass/fail and contrast ratio. Wire it between a color ramp and the output to flag accessibility failures *during generation* rather than after the fact in the Analytics panel. Failed steps get a warning badge on the Preview node and in the graph's output summary.
- [ ] **Generator discoverability** — Generators (now graphs) are one of our strongest advantages over Tokens Studio (which has no scale generators at all). Even with the Graph as a dedicated view mode, entry points must be everywhere: "Generate" action in the set context menu, "Generate tokens from template" CTA in empty set states, a prominent "New graph" action in the Graph view's empty state, and all graph template types + "New graph" / "Open graph" as **command palette** actions (typing "generate", "graph", or "scale" should surface them immediately). The Graph view being a tab is necessary but not sufficient — users must encounter generation naturally from their current context.
- [ ] **Generator quick-start from group context menu** — When right-clicking a token group (e.g., `colors.brand`), offer "Generate scale from this group" which creates a new graph pre-populated with an Output node targeting that group and auto-detects a suitable scale node type from the existing tokens' types. Opens in Graph view with form mode active.

---

## Settings & Data Management

### QoL

- [ ] **Second screen / detached window** — Tokens Studio Pro offers a "Second Screen" mode that opens the plugin in a detached, resizable window. This gives more screen real estate for token management. Investigate Figma's plugin API for detached window support and add this if feasible.

---

## Code Quality

### Redundancy & Duplication

- [ ] **Duplicate `GeneratorType`/`TokenGenerator` interface in 3 components** — The same generator type and interface are defined inline in `TokenEditor.tsx`, `TokenList.tsx`, and `useGenerators.ts` instead of being imported from a shared module. Any change to the generator shape must be made in three places.
- [ ] **`flattenTokens` implemented 3+ times independently** — Token flattening logic exists separately in `token-store.ts` (`flattenTokens`), `useTokens.ts` (`flattenTokens`), and `PasteTokensModal.tsx` (`flattenDTCG`). These should share a single implementation from `@tokenmanager/core`.
- [ ] **Reference resolution duplicated between client and server** — `resolveColorValue()` in `TokenEditor.tsx` and `resolveRef()` in `style-dict.ts` implement nearly identical reference-chasing logic. Consolidate into a shared utility.

### Performance

- [ ] **Resolver rebuilds full graph on every `updateToken()`** — `token-store.ts` calls `rebuildFlatTokens()` after every single token save, reconstructing the entire flat map and resolver. Bulk operations (rename group, move group) trigger O(n) rebuilds per token updated, resulting in O(n²) behavior. Batch or defer the rebuild until the operation is complete.
- [x] **`JSON.stringify` used for deep equality in `TokenList`** — `TokenList.tsx` uses `JSON.stringify(a) === JSON.stringify(b)` for diffing token structures. This is fragile (key order dependent) and slow for large composite tokens. Replace with a proper deep-equality check.
- [x] **No `fetch()` timeout in UI hooks** — `useTokens.ts` and other hooks make `fetch()` calls to the local server with no timeout or `AbortController`. If the server is slow or unreachable, the plugin UI hangs with no way to recover. Add a timeout and surface an error after a reasonable threshold.

### Correctness & Safety

- [x] **Unbounded recursion in `resolveValue()`** — `resolver.ts` recurses into nested objects and arrays without a depth limit. A pathologically nested token (or circular structure that slips through cycle detection) can overflow the call stack. Add a max-depth guard.
- [x] **Recursive `invalidate()` risks stack overflow on deep dependency chains** — `resolver.ts` `invalidate()` calls itself recursively through the dependent graph. For deep chains this is fine in practice, but if a circular dependency escapes detection the recursion is infinite. Convert to an iterative BFS/DFS approach.
- [x] **`body as any` in token route handlers bypasses type validation** — `packages/server/src/routes/tokens.ts` casts request bodies to `any` before passing them to `createToken`/`updateToken`. Malformed token payloads (missing `$type`, wrong `$value` shape) are accepted and written to disk. Add runtime validation (e.g., a Zod schema) at the route boundary.
- [x] **`GeneratorTemplate` type exported from core but never used** — `packages/core/src/generator-types.ts` exports `GeneratorTemplate` but no file in the codebase imports it. Either integrate it into the generator pipeline or remove it.

