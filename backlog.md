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

### UX

- [!] **UX audit & overhaul: App Shell** — Read the full app shell code, study how Figma plugin shells are conventionally structured (tab bars, overflow menus, resize handles), audit every interaction point (tab switching, overflow menu, resize, connection state), then rewrite the shell UX: improve tab labelling and iconography, ensure the active state is unmistakeable, make overflow actions discoverable, and surface connection status in a non-intrusive but always-visible way. `packages/plugin/src/components/AppShell.tsx`
<!-- stale — AppShell.tsx does not exist; app shell is in App.tsx -->

### UI

- [!] **UI audit & overhaul: App Shell** — Read the shell layout and all its sub-components, pull reference screenshots of polished Figma plugins (Linear, Tokens Studio, Variables), then redesign the shell: tighten spacing, improve the tab bar visual design, unify the header/toolbar area, and ensure the overall chrome feels lightweight rather than heavy. `packages/plugin/src/components/AppShell.tsx`
<!-- stale — AppShell.tsx does not exist; app shell lives in App.tsx -->

---

## Token Management

### Bugs

### QoL

- [ ] **Decompose TokenList.tsx into focused components** — The current `TokenList.tsx` is 2720 lines containing the list container, tree nodes, value previews, all filter/sort logic, the create form, find-and-replace, promote-to-semantic, extract-to-alias, move-group, and dozens of helpers. Extract into: `TokenRow.tsx` (individual token row), `TokenGroupRow.tsx` (group header), `ValuePreview.tsx`, `TokenFilters.tsx` (search/type/ref/sort controls), `TokenBulkActions.tsx` (multi-select toolbar). This is prerequisite for all other token list improvements. `packages/figma-plugin/src/ui/components/TokenList.tsx`

- [x] **Virtual scrolling for large token sets** — The token list currently renders all tokens with no virtualisation. Load a set with 500+ tokens and scroll performance degrades significantly. Implement a simple virtual scroll (only render visible rows + overscan) without a heavy library dependency. This is especially important once inline editing adds more interactive elements per row. `packages/figma-plugin/src/ui/components/TokenList.tsx`

- [x] **Full undo/redo stack** — `useUndo.ts` stores exactly one `UndoSlot` with an 8-second auto-dismiss toast and no redo. Replace with `useHistory.ts`: a stack with a cursor supporting Cmd+Z (undo) and Cmd+Shift+Z (redo), no auto-dismiss, and a persistent history of the last N operations. On the server side, add a ring buffer of mutations in `TokenStore` with before/after snapshots so undo can restore state reliably across reloads. `packages/figma-plugin/src/ui/hooks/useUndo.ts`, `packages/server/src/services/token-store.ts`

- [x] **Keyboard navigation in the token list** — Currently impossible to navigate the token list by keyboard. Add focused-row state and a keydown handler: ↑/↓ to move focus between rows, `Enter` to open the editor, `Space` to toggle selection in multi-select mode, `N` to open the create drawer, `/` to focus search, `E` to edit focused token, `Cmd+D` to duplicate, `Delete` to delete with confirmation, `Escape` to close drawer/deselect. `packages/figma-plugin/src/ui/components/TokenList.tsx`

### UX

- [ ] **UX audit & overhaul: Token List** — Read the token list component and all child row/group components, study design-token-tool UX patterns (Tokens Studio, Style Dictionary UI, Theo), identify every friction point (how you find a token, how groups expand/collapse, what clicking a row does, how the set switcher works), then redesign the interactions: make clicking a token predictably open the editor, add visible affordances for drag-to-reorder, improve group headers, ensure the empty state guides the user clearly, and make search/filter immediately accessible. `packages/plugin/src/components/TokenList.tsx`

- [x] **UX audit & overhaul: Token Editor** — Read the token editor and all type-specific input components, research how professional design tools handle token/variable editing (Figma's own variable editor, Tokens Studio), map every user action (name editing, type switching, value input, alias autocomplete, scope selection, save/cancel), identify friction (unclear save triggers, alias UX, type-switch side-effects), then redesign: make save/discard obvious, improve alias autocomplete discoverability, ensure type switching doesn't silently corrupt values, and add inline validation feedback. `packages/plugin/src/components/TokenEditor.tsx`

- [x] **UX audit & overhaul: Empty State** — Read the empty state component and all quick-action buttons, research how best-in-class empty states work (Figma's own empty states, Linear, Notion), audit the current layout and quick actions (create token, generate colour scale, paste JSON, use presets, generate semantic tokens, generate dark theme), identify friction (is it clear what to do first? are six options overwhelming?), then redesign: establish a clear visual hierarchy that guides new users to the most common first action, add brief helper text per action, and make the empty state feel welcoming rather than blank. `packages/plugin/src/components/EmptyState.tsx`

- [x] **Slide-over editor drawer (replace full-page navigation)** — Editing any token currently swaps the entire view to `TokenEditor`, losing all list context. The user must click Back to return, then find their place. Replace this with a bottom-sheet drawer (60% of viewport height) that slides up over the token list, keeping the list visible and scrollable above it. The drawer is dismissible via swipe-down, Escape, or a close button. The list auto-scrolls to keep the edited token visible above the drawer. Reuse all existing `TokenEditor` sub-components inside the drawer container. `packages/figma-plugin/src/ui/App.tsx`, `packages/figma-plugin/src/ui/components/TokenEditor.tsx`

- [x] **Unified create+edit flow (one-step token creation)** — Creating a token currently requires two separate steps: fill path+type form → Create (produces a placeholder default value) → click Edit → navigate away from list → set actual value. Eliminate the round-trip by replacing the bottom create form with the same editor drawer, pre-populated for a new token: path input with autocomplete for existing group prefixes, type selector as a compact pill bar, and the full type-specific value editor immediately visible below. One Save click creates the token with the real value. `packages/figma-plugin/src/ui/components/TokenList.tsx` (lines 1198-1253), new `TokenCreateDrawer.tsx`

- [x] **Inline quick-edit for simple token types** — For simple value types, clicking the value in the token list should edit it in place without opening the drawer. Color: clicking the swatch opens a popover color picker. Dimension/number: clicking the value makes it an inline input with stepper arrows. String: inline text input. Boolean: clicking toggles the value directly. Complex types (typography, shadow, gradient, border) open the drawer as normal. `packages/figma-plugin/src/ui/components/TokenList.tsx`, new `InlineColorPicker.tsx`, `InlineValueEditor.tsx`

- [x] **Visual diff in the token editor** — When editing a token value, show the previous value alongside the new value with a visual before/after comparison: side-by-side color swatches for colors, old → new with delta for dimensions, before/after specimen for typography. This prevents silent overwrites and helps the user evaluate the change before saving. `packages/figma-plugin/src/ui/components/TokenEditor.tsx`, new `ValueDiff.tsx`

- [ ] **Token dependency graph and impact analysis** — Before editing or deleting a token, show a reverse-dependency summary: "This token is referenced by 12 tokens across 3 sets." For color changes, show before/after swatches for every dependent token. For deletions, show the full orphan tree with all affected alias paths. Neither Tokens Studio nor Supaltokens warns you before you silently break alias chains. Add `GET /api/tokens/dependents/:path` on the server (reverse-index the alias graph from the existing resolver) and surface it in the editor drawer as a collapsible section. `packages/server/src/services/token-store.ts`, `packages/figma-plugin/src/ui/components/TokenEditor.tsx`, new `DependencyGraph.tsx`

- [~] **Multi-cursor batch editing** — Extend the existing multi-select mode with a batch editor panel. When multiple tokens are selected, allow editing them simultaneously: batch-adjust opacity on multiple colors, multiply all spacing values by a scalar, add a description to all tokens in a group. This is more powerful than the current "promote to semantic" bulk op, which only handles alias matching. New `BatchEditor.tsx` component, surfaced in the multi-select toolbar. `packages/figma-plugin/src/ui/components/TokenList.tsx`

- [ ] **Token canvas: spatial 2D visualization** — Add a third view mode alongside tree and table. A 2D SVG canvas positions tokens spatially by type: colors arranged by hue/lightness, dimensions as a scale ladder, typography tokens as a type specimen grid, aliases drawn as directed arrows between nodes. Click to edit, drag to reposition. Particularly powerful for discovering duplicate colors, finding gaps in spacing scales, and understanding alias network topology. New `TokenCanvas.tsx` with SVG rendering; add as a third toggle in the view controls toolbar. `packages/figma-plugin/src/ui/components/TokenList.tsx`

- [ ] **Live preview surface** — Add a built-in preview panel that renders a small set of UI components (button, card, input, text block) using current token values as CSS custom properties. Edit any token and the preview updates in real time with no configuration. Pre-built templates: Button States, Form Fields, Type Scale, Color Palette, Card Layout. Theme switching between light/dark previews if themes are configured. Add as a new tab or floating overlay panel. New `PreviewPanel.tsx`

- [ ] **Token recipes: composable transformations** — Extend the generator system (which already supports chained generators via topological sort in `generator-service.ts`) with higher-level recipes: "Accessible Color Pair" (takes a background color, auto-generates a WCAG AA-compliant foreground, links them), "Dark Mode Inversion" (takes a color group, generates dark-mode equivalents via L* inversion in OKLCH), "Responsive Scale" (takes a base dimension, generates `sm`/`md`/`lg`/`xl` variants). Recipes are composable pipelines — output of one feeds input of another. `packages/core/src/generator-engine.ts`, `packages/core/src/generator-types.ts`, `packages/server/src/services/generator-service.ts`

- [ ] **Figma canvas heatmap: token adoption overlay** — Add an overlay mode (toggle in the plugin header) that highlights every element on the active Figma canvas by token coverage: green (all applicable properties bound to tokens), yellow (partially bound), red (no bindings). Clicking a highlighted element shows which properties are bound and which are "naked". Turns TokenManager from a token management tool into a token adoption tool. Implementation: scan canvas bindings in the plugin controller, send results to the UI for overlay rendering. `packages/figma-plugin/src/plugin/controller.ts`

### UI

- [~] **UI audit & overhaul: Token List** — Read the token list and row components, audit the visual density, typography, colour swatch rendering, alias indicator styling, and type badges, then redesign: give each row a clear visual hierarchy (name primary, value secondary, type tertiary), make colour swatches larger and more legible, improve alias/reference indicators, and ensure the list feels scannable and calm rather than cluttered. `packages/plugin/src/components/TokenList.tsx`

- [x] **UI audit & overhaul: Token Editor** — Read the editor layout, study how input fields, colour pickers, dropdowns, and action buttons are currently laid out, then redesign: improve the form layout so related fields are visually grouped, make the colour picker feel integrated rather than bolted on, improve button hierarchy (primary save, secondary cancel, destructive delete), and ensure the editor feels like a focused editing surface. `packages/plugin/src/components/TokenEditor.tsx`

---

## Theme Management

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Theme Manager** — Read the theme manager and all its sub-components (theme cards, set assignment matrix, coverage view), research how theming UIs work in comparable tools (Tokens Studio multi-theme, Figma modes), audit every interaction (create theme, assign sets, reorder, view coverage, delete), identify confusion points (the set assignment matrix is particularly dense), then redesign: simplify the set assignment UI, make coverage gaps immediately visible, and ensure theme CRUD operations feel natural. `packages/plugin/src/components/ThemeManager.tsx`

### UI

- [x] **UI audit & overhaul: Theme Manager** — Read the theme manager layout, audit the visual design of theme cards, the matrix/table layout, and coverage indicators, then redesign: improve the theme card design, make the set assignment matrix readable at a glance (better column/row labels, clearer enabled/disabled/source states), and improve coverage gap visualisation. `packages/plugin/src/components/ThemeManager.tsx`

### QA

---

## Sync

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Sync Panel** — Read the sync panel and diff viewer components, research how git-adjacent sync UIs work in design tools (Supernova, Specify, Tokens Studio), audit the readiness checks UI, the diff viewer (local-only/figma-only/conflict display), and the sync trigger flow, identify confusion points (what does "sync" actually do? what is the scope?), then redesign: make the sync action and its consequences crystal clear before the user commits, improve the diff view readability, and make readiness check failures actionable. `packages/plugin/src/components/SyncPanel.tsx`

### QA

---

## Analytics & Validation

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Analytics Panel** — Read the analytics panel, validation issue list, and set statistics components, research how linting/validation UIs work in developer tools (ESLint output, design linters), audit how issues are displayed and how users navigate from an issue to the affected token, identify friction (is it clear what an issue means? is the fix obvious?), then redesign: improve issue grouping and severity visual hierarchy, make "navigate to token" and "auto-fix" actions prominent, and ensure the stats view communicates coverage at a glance. `packages/plugin/src/components/AnalyticsPanel.tsx`

### UI

- [x] **UI audit & overhaul: Analytics Panel** — Read the analytics layout, audit the visual design of issue rows, severity badges, set statistics cards, and coverage charts, then redesign: use consistent severity colour coding, improve stat card layout, and ensure the panel feels informational rather than alarming. `packages/plugin/src/components/AnalyticsPanel.tsx`

### QA

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Selection Inspector** — Read the selection inspector and property picker components, research how property panels work in Figma plugins that bind variables/tokens (Variables panel, Tokens Studio), audit every step of selecting a node, seeing its properties, and binding a token to a property, identify friction (is it clear which properties are bindable? does the picker open in a sensible place? is binding feedback immediate?), then redesign: make the inspector feel like a natural extension of Figma's own inspector, improve the property list legibility, and make binding/unbinding feel snappy and obvious. `packages/plugin/src/components/SelectionInspector.tsx`

### UI

- [x] **UI audit & overhaul: Selection Inspector** — Read the inspector layout and property row components, audit visual design (property name + current value + binding indicator layout), then redesign: improve the property row density and readability, make bound vs unbound states visually distinct, and ensure the inspector doesn't feel overwhelming when a node has many properties. `packages/plugin/src/components/SelectionInspector.tsx`

### QA

---

## Import

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Import** — Read the import panel and all sub-components, research how import/migration UIs work (Tokens Studio import, Figma's own import flows), audit the full import flow (source selection → load → filter → conflict check → target set → confirm), identify friction (is the conflict UI understandable? is the progress state clear?), then redesign: reduce the number of steps if possible, make conflicts visually obvious with clear resolution options, and ensure the user always knows what will happen before they commit. `packages/plugin/src/routes/ImportPanel.tsx`

- [x] **UX audit & overhaul: Paste Tokens** — Read the paste tokens modal and its parser logic, research how paste/import modals work in comparable tools, audit the full flow (paste text → parse → see preview → set group path → confirm), identify friction (is multi-format support communicated clearly? is type inference visible to the user?), then redesign: improve format hints and examples, make the parsed preview more readable, and reduce cognitive load of the group path field. `packages/plugin/src/components/PasteTokensModal.tsx`

### UI

### QA

---

## Export

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Export** — Read the export panel code, research how design token export UIs work (Style Dictionary, Tokens Studio, Specify), audit the mode toggle (platforms vs figma-variables), platform selection, filtering, and download/copy flows, identify friction (is the output format understandable before export? is copy-to-clipboard obvious?), then redesign: improve mode and platform selection clarity, make format previews more useful, and streamline the path from "I want to export" to "I have my output". `packages/plugin/src/routes/ExportPanel.tsx`

### UI

- [x] **UI audit & overhaul: Export** — Read the export layout, audit visual design of the mode toggle, platform selector, filter controls, and output preview area, then redesign: improve the visual hierarchy so the user's eye is drawn first to selecting the target and then to the output. `packages/plugin/src/routes/ExportPanel.tsx`

### QA

---

## Token Generation (Color Scale & Scaffolding)

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Color Scale Generator** — Read the color scale generator component, research how colour scale tools work (Radix Colours, Tailwind palette, Palette.app), audit the base colour input, step selector, preview, prefix input, and generation flow, identify friction (is the L* value useful to show? is step selection clear?), then redesign: improve the scale preview (show swatches large enough to evaluate), make the naming convention obvious, and ensure the user feels confident in the output before confirming. `packages/plugin/src/components/ColorScaleGenerator.tsx`

- [x] **UX audit & overhaul: Scaffolding Wizard** — Read the scaffolding wizard and preset definitions, research how design system bootstrapping tools work (Tokens Studio presets, Supernova templates), audit the preset selection UI, customisation options, and confirmation flow, identify friction (are the presets self-explanatory? does the user know what tokens they'll get?), then redesign: add brief descriptions and token count previews per preset, improve the naming/prefix field UX, and make the outcome predictable before the user commits. `packages/plugin/src/components/ScaffoldingWizard.tsx`

### UI

---

## Command Palette & Discoverability

### Bugs

### QoL

### UX

- [x] **Token-specific commands and fuzzy token search in command palette** — Add token-aware commands to the palette: "Create token", "Edit [token name]", "Go to [token name]", "Copy CSS var for [token name]". Add a fuzzy token search mode: typing `>color.brand` filters all tokens by path and jumps directly to the match. Add a recent actions section and category headers with keyboard shortcut hints. `packages/figma-plugin/src/ui/components/CommandPalette.tsx`, `packages/figma-plugin/src/ui/App.tsx`

### UI

---

## Settings & Data Management

### Bugs

### QoL

### UX

- [x] **UX audit & overhaul: Settings** — Read the settings panel and connection service code, research how Figma plugin settings panels are typically designed, audit the current settings (server URL, connection status, retry), identify friction (is the URL field labelled well? is the connection state obvious? what happens on failure?), then redesign: improve labelling and helper text, make connection success/failure states unmistakeable with actionable error messages, and ensure connection status is surfaced in the app shell so users don't have to open settings to know if they're connected. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/api-client.ts`

- [x] **Add "Clear All Data" action** — Research the current data persistence model (what is stored, where, how it's keyed in Figma plugin storage), then add a clearly labelled "Danger Zone" section to the Settings panel with a single "Clear all data" button that wipes all tokens, themes, sets, and plugin state after a confirmation dialog. The confirmation should require the user to type "DELETE" or similar to prevent accidents. This is a critical escape hatch for users who are stuck or want to start over — make it easy to find, but hard to trigger accidentally. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/storage.ts`

---

## Flows

### Flow: Create Token from Scratch

- [x] **Flow audit & overhaul: Create Token from Scratch** — Trace every step of this flow end-to-end in the code (trigger → editor open → name/type/value entry → save → list update → undo), research how other token tools handle first-time token creation, identify every point of confusion or unnecessary friction, then redesign: ensure the creation trigger is always visible and labelled clearly, that the editor opens in a predictable location, that required fields are obvious, and that save confirmation is immediate and reassuring. `packages/plugin/src/components/TokenList.tsx`, `packages/plugin/src/components/TokenEditor.tsx`

### Flow: Edit Token

- [x] **Flow audit & overhaul: Edit Token** — Trace the token editing flow (click token → editor opens → make change → save/discard → list updates), identify friction (is it obvious how to save? can you accidentally discard changes? does the editor close predictably?), then redesign: make the save/discard affordance unambiguous, add unsaved-changes protection, and ensure the editor closes and the list scrolls to the edited token on save. `packages/plugin/src/components/TokenEditor.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Generate Color Scale

- [x] **Flow audit & overhaul: Generate Color Scale** — Trace the flow (trigger → generator open → colour input → step select → prefix → preview → confirm → tokens appear), identify friction (is real-time preview working? is the group prefix field necessary at this step?), then redesign: prioritise the preview—make it the dominant element—and reduce required inputs to the essential minimum. `packages/plugin/src/components/ColorScaleGenerator.tsx`

### Flow: Create Tokens via Presets

- [x] **Flow audit & overhaul: Preset Token Creation** — Trace the full preset flow (trigger → wizard open → preset select → customise → confirm → tokens appear), identify friction points (is it clear the wizard creates real tokens? is the customisation step necessary or confusing?), then redesign: streamline the flow to the minimum necessary steps, add visual feedback as tokens are created, and ensure the user lands back in the token list with the new tokens visible and highlighted. `packages/plugin/src/components/ScaffoldingWizard.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Paste Tokens from JSON/Text

- [x] **Flow audit & overhaul: Paste Tokens** — Trace the paste flow (trigger → modal open → paste text → parse → preview → group path → target set → confirm), identify friction (is multi-format parsing communicated? is the group path field confusing?), then redesign: make format auto-detection visible to the user, improve the parsed preview legibility, and reduce the steps between pasting and confirming. `packages/plugin/src/components/PasteTokensModal.tsx`

### Flow: Import Tokens

- [x] **Flow audit & overhaul: Import Tokens** — Trace the full import flow (trigger → panel open → source select → load → filter → conflict check → target set → confirm → result), read all import service code to understand what happens at each step, identify friction (how long does "load" take? are conflicts explained clearly?), then redesign: add loading states and progress indicators where missing, make conflict resolution self-explanatory, and compress unnecessary steps. `packages/plugin/src/routes/ImportPanel.tsx`, `packages/plugin/src/services/import-service.ts`

### Flow: Export Tokens

- [x] **Flow audit & overhaul: Export Tokens** — Trace the full export flow (trigger → panel open → mode select → platform/format select → filter → generate → download/copy), identify friction (is the mode toggle self-explanatory? is the output preview useful before downloading?), then redesign: improve mode and platform selection clarity, add a more useful output preview, and make download vs copy-to-clipboard equally discoverable. `packages/plugin/src/routes/ExportPanel.tsx`

### Flow: Create and Manage Themes

- [x] **Flow audit & overhaul: Theme Management** — Trace the full theme lifecycle (create → assign sets → reorder → view coverage → edit → delete), read all theme manager and theme service code, identify friction (is the set assignment matrix intuitive? is coverage gap surfacing helpful or confusing?), then redesign: simplify the create flow, make set assignment feel like a simple toggle rather than a matrix form, and ensure theme deletion has appropriate friction (confirmation) without being annoying. `packages/plugin/src/components/ThemeManager.tsx`

### Flow: Sync Design Tokens to Figma

- [x] **Flow audit & overhaul: Sync to Figma** — Trace the full sync flow (open sync panel → view readiness → fix issues → select scope → trigger sync → progress → result), read all sync service and diff viewer code, research how comparable sync UIs communicate consequences (what changes, how many variables, potential overwrites), identify friction (are readiness failures clearly actionable? is scope selection confusing?), then redesign: make the pre-sync state crystal clear (what will change and why), improve readiness check copy to be actionable, and make progress/result feedback satisfying and informative. `packages/plugin/src/components/SyncPanel.tsx`, `packages/plugin/src/services/sync-service.ts`

### Flow: Bind Token to Figma Node Property

- [x] **Flow audit & overhaul: Token Binding** — Trace the property binding flow (select node → inspector shows properties → click property → picker opens → select token → binding applied), read all selection inspector and property picker code, identify friction (is it clear which properties are bindable? does the picker show too many/few options? is the binding result visible immediately?), then redesign: make bindable properties visually distinct from read-only ones, improve the picker search so the right token is easy to find, and make the post-binding state feel satisfying and complete. `packages/plugin/src/components/SelectionInspector.tsx`, `packages/plugin/src/components/PropertyPicker.tsx`

### Flow: Validate and Fix Token Issues

- [x] **Flow audit & overhaul: Validate & Fix** — Trace the validation flow (trigger → analytics view → issues listed → click issue → navigate to token → fix → re-validate), read the validator and analytics components, identify friction (is it clear how to trigger validation? is the issue list overwhelming? is "navigate to token" obvious?), then redesign: ensure validation runs automatically and the badge count is always current, make issue descriptions use plain language, and make the fix path (navigate → edit → re-validate) a smooth loop. `packages/plugin/src/components/AnalyticsPanel.tsx`, `packages/core/src/validator.ts`

### Flow: Command Palette Usage

- [x] **Flow audit & overhaul: Command Palette** — Trace the command palette flow (⌘K → type → filter → select → action), read the palette command definitions, audit whether every action reachable via the palette is also reachable via the UI, identify friction (are commands named consistently? are keyboard shortcuts shown at the right moment?), then redesign: ensure command names use consistent verb-noun format, improve the no-results state, and add a discoverable hint in the UI that ⌘K exists. `packages/plugin/src/components/CommandPalette.tsx`

### Flow: Switch Token Set

- [x] **Flow audit & overhaul: Switch Token Set** — Trace the set switching flow (set tab click → list reloads → set metadata), read the set tab and set context code, identify friction (is it clear which set is active? is the context menu on set tabs discoverable?), then redesign: make the active set tab unmistakeable, add a visible affordance for right-click/long-press context menu, and ensure switching sets is instant with no loading jank. `packages/plugin/src/components/SetTabs.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Server Connection & Settings

- [x] **Flow audit & overhaul: Server Connection** — Trace the settings flow (open settings → enter URL → update → connection check → connected/failed), read the settings panel and connection service code, identify friction (is the URL field pre-filled or empty? is the error message on failure helpful?), then redesign: add a connection status indicator that is always visible in the app shell, improve error messages to be actionable ("Cannot reach server — check the URL or your network"), and make the retry action obvious. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/api-client.ts`

### Flow: Find and Replace Token Names

- [x] **Flow audit & overhaul: Find & Replace** — Trace the find & replace flow (trigger → search input → matches highlight → replacement input → preview renames → confirm → tokens renamed), read all find-replace UI and service code, identify friction (is the preview of renamed tokens clear enough to prevent mistakes?), then redesign: make the match preview legible (show old name → new name diffs), add a count of affected tokens before confirming, and ensure the action is undoable. `packages/plugin/src/components/FindReplace.tsx`

### Flow: Inline Quick-Edit a Token Value

- [x] **Flow audit & overhaul: Inline Quick-Edit** — Trace the new inline editing flow for simple types (click color swatch → popover picker appears → change color → auto-save; click dimension value → inline input appears → type value → blur to save). Identify edge cases: what happens if the user clicks a different token while a picker is open? what if the new value is invalid? Ensure the inline edit state is visually distinct from the read state, that auto-save is immediate (not deferred), and that escape cancels cleanly. `packages/figma-plugin/src/ui/components/TokenList.tsx`, `InlineColorPicker.tsx`, `InlineValueEditor.tsx`

### Flow: Undo / Redo Token Operations

- [x] **Flow audit & overhaul: Undo/Redo** — Trace the undo/redo flow (perform action → Cmd+Z undoes → Cmd+Shift+Z redoes) across token creation, editing, deletion, group rename, bulk delete, and find-and-replace. Identify what the undo history indicator looks like, how it communicates what will be undone, and how it handles operations that can't be undone (e.g., Figma variable sync). Ensure the toast/indicator is non-intrusive but always accessible. `packages/figma-plugin/src/ui/hooks/useUndo.ts` (replace with `useHistory.ts`)

### Flow: View Token Dependencies Before Editing

- [ ] **Flow audit & overhaul: Dependency Impact** — Trace the flow: user opens editor drawer for a token → dependency section shows N dependents → user expands it → sees before/after previews → edits value → saves. Ensure the dependency fetch is fast (or cached), that the section is collapsed by default and doesn't dominate the editor, and that the before/after previews are legible at small sizes. `packages/figma-plugin/src/ui/components/TokenEditor.tsx`, `DependencyGraph.tsx`

---

## Global

### UX

- [ ] **Holistic UX audit & redesign: Full plugin** — After the per-area and per-flow improvements are done, conduct a holistic review: read every component file, map the full interaction model, identify cross-cutting issues (inconsistent terminology across areas, inconsistent affordances for the same action type, missing undo coverage, no onboarding for first-time users, poor empty states, no progressive disclosure of advanced features), then produce and implement a coherent set of fixes that unify the experience. Audit: (1) terminology consistency — do we use the same words for the same concepts everywhere? (2) affordance consistency — do similar actions look and behave the same? (3) feedback coverage — does every destructive or slow action have appropriate feedback? (4) learnability — can a new user understand what the plugin does within 60 seconds? (5) error recovery — are all error states actionable? Implement fixes for every issue found. `packages/plugin/src/`

- [x] Fix plugin crash: `ReferenceError: Cannot access 'It' before initialization` — thrown during render in the bundled plugin code (`VM4092:40`), caught by ErrorBoundary. Likely a circular dependency or incorrect import order causing a `let`/`const` binding to be accessed before its initializer runs after bundling. Investigate bundle output and circular deps.
