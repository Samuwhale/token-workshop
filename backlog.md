# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: no new features — only improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be triaged at the end of each iteration:

- `- [HIGH] item title…` or `- [P0] item title…` — inserted before the first `[ ]` item (picked next by the agent).
- All other items are appended to the bottom.

---

## App Shell & Navigation

### Bugs

### QoL

- [ ] **Set tabs overflow strategy** — Horizontal set tabs work well for moderate counts but will break at 10+ sets. Add horizontal scrolling with fade indicators, or collapse to a dropdown after a threshold. Tokens Studio uses a vertical sidebar which scales better for many sets — our horizontal approach is cleaner for typical projects but needs a graceful overflow.

### UX

- [!] **UX audit & overhaul: App Shell** — Read the full app shell code, study how Figma plugin shells are conventionally structured (tab bars, overflow menus, resize handles), audit every interaction point (tab switching, overflow menu, resize, connection state), then rewrite the shell UX: improve tab labelling and iconography, ensure the active state is unmistakeable, make overflow actions discoverable, and surface connection status in a non-intrusive but always-visible way. `packages/plugin/src/components/AppShell.tsx`
<!-- stale — AppShell.tsx does not exist; app shell is in App.tsx -->

- [ ] **IA restructure: reduce to 3 primary tabs** — The current 5-tab layout (Tokens, Themes, Sync, Analytics, Preview) fragments the core workflow across too many screens. Restructure to 3 primary tabs: **Tokens** (the workspace — token list, set picker, theme switcher, inline preview), **Inspect** (selection inspector, promoted from bottom panel), **Publish** (sync + export, merged). Move Analytics into a toolbar toggle/panel within the Tokens tab (lint badges are already inline — the separate tab mostly duplicates that). Move Preview into a split-view or toggle within the Tokens tab. Move Theme management into a panel accessible from the theme switcher (not a separate top-level tab). Import/Export/Settings stay in the overflow menu. This matches the mental model: "I work with tokens" → "I check what's applied" → "I push to Figma/Git".

- [ ] **Theme switcher in the Tokens tab toolbar** — Currently switching the active theme requires navigating to the Themes tab. Add a theme dropdown/pill bar to the Tokens tab toolbar (next to the set tabs). Selecting a theme immediately resolves all tokens under that theme's set configuration, so you can see how `semantic.bg` resolves under "light" vs "dark" without leaving the token list. Theme *management* (create/edit/delete) opens from a "Manage themes..." link in the dropdown. This is the single highest-impact flow improvement — it makes theme-aware token browsing zero-friction.

- [ ] **Promote SelectionInspector to its own tab** — The inspector is currently a collapsible bottom panel within the Tokens tab. This buries the most important Figma integration feature. Promote it to a top-level "Inspect" tab (like Tokens Studio) so the workflow is: select layer on canvas → switch to Inspect tab → see all token bindings → remap/apply. The inspector should show: all bound tokens grouped by property, resolved values, remap action, "go to token" navigation, and a "no tokens applied" empty state with a hint to apply from the Tokens tab.

- [ ] **Merge Sync + Export into a "Publish" tab** — Sync (Figma variables, Git) and Export (CSS, JSON, etc.) are both "push tokens outward." Merge them into a single "Publish" tab with sections: Figma Variables, Figma Styles, Git, and File Export. This reduces tab count and groups related actions. The current Sync tab's "readiness checks" become a pre-publish validation gate shown at the top of Publish.

- [ ] **Inline analytics as a toolbar toggle** — The Analytics tab is mostly a summary of lint violations that are already shown as inline badges in the token list. Replace the dedicated tab with a toolbar toggle button (e.g., filter icon with issue count badge) that, when active, filters the token list to show only tokens with validation issues. Keep the color contrast matrix and duplicate detection as panels accessible from this filtered view or from the overflow menu. This removes a tab while making the data more actionable (you see the problem tokens *in context*, not on a separate screen).

- [ ] **Preview as split-view toggle** — The Preview tab shows live UI components rendered with token CSS variables, but it's disconnected from the token list. Replace the dedicated tab with a split-view toggle on the Tokens tab: when active, the bottom half shows the preview pane while the top half shows the token list. Editing a token inline immediately updates the preview below. This makes the preview useful as a *feedback loop* during editing, not just a read-only report.

### UI

- [!] **UI audit & overhaul: App Shell** — Read the shell layout and all its sub-components, pull reference screenshots of polished Figma plugins (Linear, Tokens Studio, Variables), then redesign the shell: tighten spacing, improve the tab bar visual design, unify the header/toolbar area, and ensure the overall chrome feels lightweight rather than heavy. `packages/plugin/src/components/AppShell.tsx`
<!-- stale — AppShell.tsx does not exist; app shell lives in App.tsx -->

---

## Token Management

### Bugs

- [ ] **Resolver crashes on malformed composite tokens** — `resolveValue()` in `packages/core/src/resolver.ts` recurses into nested objects and arrays without null guards on intermediate values. A composite token with an `undefined` field in its object value will throw at runtime. Add null checks before recursing into object/array values.

### QoL

- [ ] **Dual-value display for alias tokens** — When a token is an alias, the row currently shows the reference badge and resolved value separately. Improve this: show a compact `{ref.path} → resolved` inline on the right side of the row so both the raw reference and computed value are always visible at a glance, without needing to click or hover. This is one of Tokens Studio's best UX patterns.
- [ ] **Hover tooltip with full resolution chain** — On hover over any alias token row, show a tooltip with the full resolution chain (e.g., `semantic.bg → color.neutral.100 → #F5F5F5`) so designers can debug alias depth without clicking into the editor.
- [ ] **Rich color picker with color space support** — The color picker is currently a native HTML `<input type="color">` which only supports hex in sRGB. Replace with a custom color picker that supports HSL, LCH, and P3 color spaces, shows numeric inputs for each channel, and includes an opacity slider. LCH is particularly important since our generators already use CIELAB math — the picker should speak the same language. Consider also adding an eyedropper button that samples colors from the Figma canvas via the plugin API.
- [ ] **Copy token path (raw dot-notation)** — Currently only "Copy CSS variable name" is available (e.g., `--color-primary-500`). Add "Copy token path" to copy the raw dot-notation path (e.g., `color.primary.500`) and "Copy as JSON" to copy the full token definition as a JSON snippet. Tokens Studio has both.
- [ ] **Expand/collapse all groups** — No global toggle exists. Add "Expand all" / "Collapse all" buttons to the toolbar (or keyboard shortcut). Essential when navigating large sets.
- [ ] **Color swatch grid view for color tokens** — Tokens Studio offers a grid/swatch view for color tokens that shows them as a compact grid of color chips rather than a vertical list. Add a grid view option (toggle alongside tree/table/canvas) that renders color tokens as a visual palette. Useful for at-a-glance review of color systems.
- [ ] **Math expressions in token values** — Tokens Studio supports `{space.base} * 2` syntax in token values, enabling computed values from references. Add expression evaluation for numeric token types (dimension, number, duration) so users can write `{spacing.base} * 1.5` and have it resolve to the computed value.
- [ ] **Auto-type inference on value input** — When creating a token, if the user types `#FF0000` before selecting a type, auto-suggest "color". If they type `16px`, auto-suggest "dimension". Reduces a decision point during rapid token creation.
- [ ] **Rename token with reference update** — When renaming a token (path change), prompt the user: "N tokens reference this one. Update their references?" and bulk-update all alias paths that pointed to the old name. Tokens Studio does this; without it, renaming breaks aliases silently.

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

### UI

---

## Theme Management

### Bugs

### QoL

- [ ] **Inline explanation of set statuses** — Tokens Studio's #1 onboarding complaint is that `source` vs. `enabled` vs. `disabled` is unexplained. Wherever set status toggles appear (theme management panel, theme switcher detail view), add persistent inline descriptions or tooltips: "Base = foundation layer, can be overridden", "On = active, overrides base sets", "Off = not used in this theme". First-time users should never have to guess.
- [ ] **Persist active theme selection per file** — Store the currently active theme selection in Figma's `clientStorage` (keyed by file ID) so it survives plugin restarts. Tokens Studio has a known complaint that theme selections reset every session — solving this is a concrete advantage.

### UX

- [ ] **Multi-dimensional theme model** — Add support for theme groups (dimensions) with options, matching Tokens Studio's Group/Option model. A theme group represents one axis of variation (e.g., "Color Mode", "Brand", "Density"), and each group has mutually exclusive options (e.g., "Light"/"Dark"). Multiple groups can be active simultaneously, creating a matrix of combinations. This maps cleanly to Figma Variable Collections (groups) and Modes (options). Without this, enterprise design systems with multiple theming dimensions (brand × mode × density) require flat theme duplication. This is the single largest capability gap vs. Tokens Studio.
- [ ] **Theme live preview during editing** — When editing a theme's set configuration (toggling sets on/off/base), there's no immediate feedback on how tokens resolve under that configuration. With the theme switcher in the toolbar (see App Shell), switching *existing* themes already updates the token list. But when *editing* a theme's set assignments, the token list and split-view preview should update in real-time as you toggle sets, so designers can experiment with set combinations without save-and-check cycles.
- [ ] **Duplicate theme** — No way to clone an existing theme as a starting point. Add a "Duplicate" action to the theme card that copies all set statuses and ordering into a new theme with a "-copy" suffix. Essential when creating variants (e.g., "dark-high-contrast" from "dark").
- [ ] **Compare themes side-by-side** — No way to see how two themes differ. Add a comparison view that shows tokens with differing resolved values between two selected themes, highlighting what changes. Useful for auditing light/dark or brand variants.

### UI

### QA

---

## Sync

### Bugs

- [ ] **Missing `return` after error response in sync route** — In `packages/server/src/routes/sync.ts`, the catch block sends a 500 response but doesn't `return`, so execution continues and Fastify may attempt to send a second response. Add `return` before the `reply.status(500)` call.
- [ ] **Race condition: concurrent file watcher rebuilds** — In `packages/server/src/services/token-store.ts`, the `change`/`add`/`unlink` watcher handlers all call `rebuildFlatTokens()` without debouncing or locking. Rapid file-system events (e.g., an editor writing multiple files at once) trigger concurrent rebuilds, leaving the resolver in a partially stale state. Debounce the rebuild or use a rebuild queue.
- [ ] **File watcher errors silently halt updates** — The chokidar watcher in `token-store.ts` has no `error` event handler. If the watcher encounters a permission error or the watched directory is deleted, it stops firing events with no indication to the server or user.

### QoL

### UX

- [ ] **Create Figma Styles from tokens** — Currently only Figma Variables are supported. Add the ability to create/update Figma Styles (Color, Text, Effect) from tokens. Many teams use styles alongside variables, and Tokens Studio supports both targets.
- [ ] **Batch create variables/styles from group** — Tokens Studio has "Create variables from group" and "Create styles from group" in the group right-click context menu. Add these actions so users can bulk-publish an entire group (e.g., all `colors.brand.*` tokens) to Figma in one click, rather than syncing the entire set.

### QA

---

## Analytics & Validation

### Bugs

### QoL

### UX

### UI

### QA

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [ ] **Deep inspect for nested components** — Tokens Studio's Inspect panel can drill into component instances to show tokens applied on nested layers, not just the top-level selection. Ensure our inspector supports recursive inspection of component children with a "Deep inspect" toggle.
- [ ] **Remap token on selection** — Tokens Studio lets you remap a token binding on a selected layer to a different token (e.g., swap `color.brand.old` for `color.brand.new`) without detaching and re-applying. Add a "Remap" action in the inspector that shows the current binding and lets you pick a replacement token.
- [ ] **Bulk remap across selection** — When renaming or restructuring tokens, allow bulk-remapping all token bindings across the current selection (or page/document) from old paths to new paths. Tokens Studio supports this for migration workflows.

### UI

### QA

---

## Import

### Bugs

### QoL

### UX

- [ ] **Import from Figma Styles** — Add reverse-sync: pull existing Figma Color, Text, and Effect styles into the plugin as tokens. Tokens Studio supports this and it's the primary onboarding path for teams migrating from a styles-based workflow. Map style names to token paths (using `/` → `.` conversion) and style values to token values.
- [ ] **Import from Figma Variables** — Add reverse-sync: pull existing Figma Variables into the plugin as tokens. Map variable collections to token sets and variable modes to theme options. This is critical for teams that already have variables defined in Figma and want to adopt TokenManager without recreating everything manually.

### UI

### QA

---

## Export

### Bugs

### QoL

### UX

### UI

### QA

---

## Token Generation (Color Scale & Scaffolding)

### Bugs

- [ ] **Division by zero in formula evaluator** — `parseMulDiv()` in `packages/core/src/eval-expr.ts` performs division without checking for a zero divisor, silently producing `Infinity` or `NaN` values that get written as token values. Add a check and return an error when the right-hand side of `/` resolves to zero.
- [ ] **Color modifier `mix` silently no-ops on invalid color** — In `packages/core/src/color-modifier.ts`, the `mix` case calls `hexToLab()` and silently `break`s if either color is invalid. The token gets no modifier applied with no error or warning. Surface a validation error to the caller instead of silently skipping.

### QoL

### UX

- [ ] **Generator discoverability** — Generators are one of our strongest advantages over Tokens Studio (which has no scale generators at all), but they're only reachable from inside the token editor drawer. Surface generators prominently: add a "Generate" action to the set context menu, show a "Generate tokens from template" CTA in empty set states, and add generator entries to the command palette. Users should encounter generators naturally, not have to already know they exist.
- [ ] **Generator quick-start from group context menu** — When right-clicking a token group (e.g., `colors.brand`), offer "Generate scale from this group" which pre-fills the generator dialog with the group path as target and auto-detects a suitable generator type from the existing tokens' types.

### UI

---

## Command Palette & Discoverability

### Bugs

### QoL

- [ ] **Surface generators in command palette** — Add all generator types (color ramp, type scale, spacing scale, etc.) as command palette actions. Typing "generate" or "scale" should surface them immediately. This makes the generator feature discoverable through the primary power-user navigation path.

### UX

### UI

---

## Settings & Data Management

### Bugs

### QoL

- [ ] **Second screen / detached window** — Tokens Studio Pro offers a "Second Screen" mode that opens the plugin in a detached, resizable window. This gives more screen real estate for token management. Investigate Figma's plugin API for detached window support and add this if feasible.

### UX

---

## Flows

### Flow: Create Token from Scratch

### Flow: Edit Token

### Flow: Generate Color Scale

### Flow: Create Tokens via Presets

### Flow: Paste Tokens from JSON/Text

### Flow: Import Tokens

### Flow: Export Tokens

### Flow: Create and Manage Themes

### Flow: Sync Design Tokens to Figma

### Flow: Bind Token to Figma Node Property

### Flow: Validate and Fix Token Issues

### Flow: Command Palette Usage

### Flow: Switch Token Set

### Flow: Server Connection & Settings

### Flow: Find and Replace Token Names

### Flow: Inline Quick-Edit a Token Value

### Flow: Undo / Redo Token Operations

### Flow: View Token Dependencies Before Editing

---

## Code Quality

### Bugs

### Redundancy & Duplication

- [ ] **Duplicate `GeneratorType`/`TokenGenerator` interface in 3 components** — The same generator type and interface are defined inline in `TokenEditor.tsx`, `TokenList.tsx`, and `useGenerators.ts` instead of being imported from a shared module. Any change to the generator shape must be made in three places.
- [ ] **`flattenTokens` implemented 3+ times independently** — Token flattening logic exists separately in `token-store.ts` (`flattenTokens`), `useTokens.ts` (`flattenTokens`), and `PasteTokensModal.tsx` (`flattenDTCG`). These should share a single implementation from `@tokenmanager/core`.
- [ ] **Reference resolution duplicated between client and server** — `resolveColorValue()` in `TokenEditor.tsx` and `resolveRef()` in `style-dict.ts` implement nearly identical reference-chasing logic. Consolidate into a shared utility.

### Performance

- [ ] **Resolver rebuilds full graph on every `updateToken()`** — `token-store.ts` calls `rebuildFlatTokens()` after every single token save, reconstructing the entire flat map and resolver. Bulk operations (rename group, move group) trigger O(n) rebuilds per token updated, resulting in O(n²) behavior. Batch or defer the rebuild until the operation is complete.
- [ ] **`JSON.stringify` used for deep equality in `TokenList`** — `TokenList.tsx` uses `JSON.stringify(a) === JSON.stringify(b)` for diffing token structures. This is fragile (key order dependent) and slow for large composite tokens. Replace with a proper deep-equality check.
- [ ] **No `fetch()` timeout in UI hooks** — `useTokens.ts` and other hooks make `fetch()` calls to the local server with no timeout or `AbortController`. If the server is slow or unreachable, the plugin UI hangs with no way to recover. Add a timeout and surface an error after a reasonable threshold.

### Correctness & Safety

- [ ] **Unbounded recursion in `resolveValue()`** — `resolver.ts` recurses into nested objects and arrays without a depth limit. A pathologically nested token (or circular structure that slips through cycle detection) can overflow the call stack. Add a max-depth guard.
- [ ] **Recursive `invalidate()` risks stack overflow on deep dependency chains** — `resolver.ts` `invalidate()` calls itself recursively through the dependent graph. For deep chains this is fine in practice, but if a circular dependency escapes detection the recursion is infinite. Convert to an iterative BFS/DFS approach.
- [ ] **`body as any` in token route handlers bypasses type validation** — `packages/server/src/routes/tokens.ts` casts request bodies to `any` before passing them to `createToken`/`updateToken`. Malformed token payloads (missing `$type`, wrong `$value` shape) are accepted and written to disk. Add runtime validation (e.g., a Zod schema) at the route boundary.
- [ ] **`GeneratorTemplate` type exported from core but never used** — `packages/core/src/generator-types.ts` exports `GeneratorTemplate` but no file in the codebase imports it. Either integrate it into the generator pipeline or remove it.

---

## Global

### UX
