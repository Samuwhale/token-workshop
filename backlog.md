# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: no new features — only improve what already exists -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->

# Backlog Inbox

Add items here while backlog.sh is running. They will be appended to the relevant section at the end of each iteration.

---

## App Shell & Navigation

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: App Shell** — Read the full app shell code, study how Figma plugin shells are conventionally structured (tab bars, overflow menus, resize handles), audit every interaction point (tab switching, overflow menu, resize, connection state), then rewrite the shell UX: improve tab labelling and iconography, ensure the active state is unmistakeable, make overflow actions discoverable, and surface connection status in a non-intrusive but always-visible way. `packages/plugin/src/components/AppShell.tsx`

### UI

- [ ] **UI audit & overhaul: App Shell** — Read the shell layout and all its sub-components, pull reference screenshots of polished Figma plugins (Linear, Tokens Studio, Variables), then redesign the shell: tighten spacing, improve the tab bar visual design, unify the header/toolbar area, and ensure the overall chrome feels lightweight rather than heavy. `packages/plugin/src/components/AppShell.tsx`

---

## Token Management

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Token List** — Read the token list component and all child row/group components, study design-token-tool UX patterns (Tokens Studio, Style Dictionary UI, Theo), identify every friction point (how you find a token, how groups expand/collapse, what clicking a row does, how the set switcher works), then redesign the interactions: make clicking a token predictably open the editor, add visible affordances for drag-to-reorder, improve group headers, ensure the empty state guides the user clearly, and make search/filter immediately accessible. `packages/plugin/src/components/TokenList.tsx`

- [ ] **UX audit & overhaul: Token Editor** — Read the token editor and all type-specific input components, research how professional design tools handle token/variable editing (Figma's own variable editor, Tokens Studio), map every user action (name editing, type switching, value input, alias autocomplete, scope selection, save/cancel), identify friction (unclear save triggers, alias UX, type-switch side-effects), then redesign: make save/discard obvious, improve alias autocomplete discoverability, ensure type switching doesn't silently corrupt values, and add inline validation feedback. `packages/plugin/src/components/TokenEditor.tsx`

- [ ] **UX audit & overhaul: Empty State** — Read the empty state component and all quick-action buttons, research how best-in-class empty states work (Figma's own empty states, Linear, Notion), audit the current layout and quick actions (create token, generate colour scale, paste JSON, use presets, generate semantic tokens, generate dark theme), identify friction (is it clear what to do first? are six options overwhelming?), then redesign: establish a clear visual hierarchy that guides new users to the most common first action, add brief helper text per action, and make the empty state feel welcoming rather than blank. `packages/plugin/src/components/EmptyState.tsx`

### UI

- [ ] **UI audit & overhaul: Token List** — Read the token list and row components, audit the visual density, typography, colour swatch rendering, alias indicator styling, and type badges, then redesign: give each row a clear visual hierarchy (name primary, value secondary, type tertiary), make colour swatches larger and more legible, improve alias/reference indicators, and ensure the list feels scannable and calm rather than cluttered. `packages/plugin/src/components/TokenList.tsx`

- [ ] **UI audit & overhaul: Token Editor** — Read the editor layout, study how input fields, colour pickers, dropdowns, and action buttons are currently laid out, then redesign: improve the form layout so related fields are visually grouped, make the colour picker feel integrated rather than bolted on, improve button hierarchy (primary save, secondary cancel, destructive delete), and ensure the editor feels like a focused editing surface. `packages/plugin/src/components/TokenEditor.tsx`

---

## Theme Management

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Theme Manager** — Read the theme manager and all its sub-components (theme cards, set assignment matrix, coverage view), research how theming UIs work in comparable tools (Tokens Studio multi-theme, Figma modes), audit every interaction (create theme, assign sets, reorder, view coverage, delete), identify confusion points (the set assignment matrix is particularly dense), then redesign: simplify the set assignment UI, make coverage gaps immediately visible, and ensure theme CRUD operations feel natural. `packages/plugin/src/components/ThemeManager.tsx`

### UI

- [ ] **UI audit & overhaul: Theme Manager** — Read the theme manager layout, audit the visual design of theme cards, the matrix/table layout, and coverage indicators, then redesign: improve the theme card design, make the set assignment matrix readable at a glance (better column/row labels, clearer enabled/disabled/source states), and improve coverage gap visualisation. `packages/plugin/src/components/ThemeManager.tsx`

### QA

---

## Sync

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Sync Panel** — Read the sync panel and diff viewer components, research how git-adjacent sync UIs work in design tools (Supernova, Specify, Tokens Studio), audit the readiness checks UI, the diff viewer (local-only/figma-only/conflict display), and the sync trigger flow, identify confusion points (what does "sync" actually do? what is the scope?), then redesign: make the sync action and its consequences crystal clear before the user commits, improve the diff view readability, and make readiness check failures actionable. `packages/plugin/src/components/SyncPanel.tsx`

### QA

---

## Analytics & Validation

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Analytics Panel** — Read the analytics panel, validation issue list, and set statistics components, research how linting/validation UIs work in developer tools (ESLint output, design linters), audit how issues are displayed and how users navigate from an issue to the affected token, identify friction (is it clear what an issue means? is the fix obvious?), then redesign: improve issue grouping and severity visual hierarchy, make "navigate to token" and "auto-fix" actions prominent, and ensure the stats view communicates coverage at a glance. `packages/plugin/src/components/AnalyticsPanel.tsx`

### UI

- [ ] **UI audit & overhaul: Analytics Panel** — Read the analytics layout, audit the visual design of issue rows, severity badges, set statistics cards, and coverage charts, then redesign: use consistent severity colour coding, improve stat card layout, and ensure the panel feels informational rather than alarming. `packages/plugin/src/components/AnalyticsPanel.tsx`

### QA

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Selection Inspector** — Read the selection inspector and property picker components, research how property panels work in Figma plugins that bind variables/tokens (Variables panel, Tokens Studio), audit every step of selecting a node, seeing its properties, and binding a token to a property, identify friction (is it clear which properties are bindable? does the picker open in a sensible place? is binding feedback immediate?), then redesign: make the inspector feel like a natural extension of Figma's own inspector, improve the property list legibility, and make binding/unbinding feel snappy and obvious. `packages/plugin/src/components/SelectionInspector.tsx`

### UI

- [ ] **UI audit & overhaul: Selection Inspector** — Read the inspector layout and property row components, audit visual design (property name + current value + binding indicator layout), then redesign: improve the property row density and readability, make bound vs unbound states visually distinct, and ensure the inspector doesn't feel overwhelming when a node has many properties. `packages/plugin/src/components/SelectionInspector.tsx`

### QA

---

## Import

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Import** — Read the import panel and all sub-components, research how import/migration UIs work (Tokens Studio import, Figma's own import flows), audit the full import flow (source selection → load → filter → conflict check → target set → confirm), identify friction (is the conflict UI understandable? is the progress state clear?), then redesign: reduce the number of steps if possible, make conflicts visually obvious with clear resolution options, and ensure the user always knows what will happen before they commit. `packages/plugin/src/routes/ImportPanel.tsx`

- [ ] **UX audit & overhaul: Paste Tokens** — Read the paste tokens modal and its parser logic, research how paste/import modals work in comparable tools, audit the full flow (paste text → parse → see preview → set group path → confirm), identify friction (is multi-format support communicated clearly? is type inference visible to the user?), then redesign: improve format hints and examples, make the parsed preview more readable, and reduce cognitive load of the group path field. `packages/plugin/src/components/PasteTokensModal.tsx`

### UI

### QA

---

## Export

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Export** — Read the export panel code, research how design token export UIs work (Style Dictionary, Tokens Studio, Specify), audit the mode toggle (platforms vs figma-variables), platform selection, filtering, and download/copy flows, identify friction (is the output format understandable before export? is copy-to-clipboard obvious?), then redesign: improve mode and platform selection clarity, make format previews more useful, and streamline the path from "I want to export" to "I have my output". `packages/plugin/src/routes/ExportPanel.tsx`

### UI

- [ ] **UI audit & overhaul: Export** — Read the export layout, audit visual design of the mode toggle, platform selector, filter controls, and output preview area, then redesign: improve the visual hierarchy so the user's eye is drawn first to selecting the target and then to the output. `packages/plugin/src/routes/ExportPanel.tsx`

### QA

---

## Token Generation (Color Scale & Scaffolding)

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Color Scale Generator** — Read the color scale generator component, research how colour scale tools work (Radix Colours, Tailwind palette, Palette.app), audit the base colour input, step selector, preview, prefix input, and generation flow, identify friction (is the L* value useful to show? is step selection clear?), then redesign: improve the scale preview (show swatches large enough to evaluate), make the naming convention obvious, and ensure the user feels confident in the output before confirming. `packages/plugin/src/components/ColorScaleGenerator.tsx`

- [ ] **UX audit & overhaul: Scaffolding Wizard** — Read the scaffolding wizard and preset definitions, research how design system bootstrapping tools work (Tokens Studio presets, Supernova templates), audit the preset selection UI, customisation options, and confirmation flow, identify friction (are the presets self-explanatory? does the user know what tokens they'll get?), then redesign: add brief descriptions and token count previews per preset, improve the naming/prefix field UX, and make the outcome predictable before the user commits. `packages/plugin/src/components/ScaffoldingWizard.tsx`

### UI

---

## Command Palette & Discoverability

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Command Palette** — Read the command palette component and all command definitions, research how command palettes work in best-in-class tools (Linear, VS Code, Raycast), audit the current fuzzy search, command categories, keyboard navigation, and shortcut display, identify friction (are commands named intuitively? are categories helpful or just noise? is keyboard navigation reliable?), then redesign: improve command naming so actions are self-descriptive, improve category grouping, ensure keyboard-first usage is seamless, and add a discoverable hint in the UI that ⌘K exists. `packages/plugin/src/components/CommandPalette.tsx`

### UI

---

## Settings & Data Management

### Bugs

### QoL

### UX

- [ ] **UX audit & overhaul: Settings** — Read the settings panel and connection service code, research how Figma plugin settings panels are typically designed, audit the current settings (server URL, connection status, retry), identify friction (is the URL field labelled well? is the connection state obvious? what happens on failure?), then redesign: improve labelling and helper text, make connection success/failure states unmistakeable with actionable error messages, and ensure connection status is surfaced in the app shell so users don't have to open settings to know if they're connected. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/api-client.ts`

- [ ] **Add "Clear All Data" action** — Research the current data persistence model (what is stored, where, how it's keyed in Figma plugin storage), then add a clearly labelled "Danger Zone" section to the Settings panel with a single "Clear all data" button that wipes all tokens, themes, sets, and plugin state after a confirmation dialog. The confirmation should require the user to type "DELETE" or similar to prevent accidents. This is a critical escape hatch for users who are stuck or want to start over — make it easy to find, but hard to trigger accidentally. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/storage.ts`

---

## Flows

### Flow: Create Token from Scratch

- [ ] **Flow audit & overhaul: Create Token from Scratch** — Trace every step of this flow end-to-end in the code (trigger → editor open → name/type/value entry → save → list update → undo), research how other token tools handle first-time token creation, identify every point of confusion or unnecessary friction, then redesign: ensure the creation trigger is always visible and labelled clearly, that the editor opens in a predictable location, that required fields are obvious, and that save confirmation is immediate and reassuring. `packages/plugin/src/components/TokenList.tsx`, `packages/plugin/src/components/TokenEditor.tsx`

### Flow: Edit Token

- [ ] **Flow audit & overhaul: Edit Token** — Trace the token editing flow (click token → editor opens → make change → save/discard → list updates), identify friction (is it obvious how to save? can you accidentally discard changes? does the editor close predictably?), then redesign: make the save/discard affordance unambiguous, add unsaved-changes protection, and ensure the editor closes and the list scrolls to the edited token on save. `packages/plugin/src/components/TokenEditor.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Generate Color Scale

- [ ] **Flow audit & overhaul: Generate Color Scale** — Trace the flow (trigger → generator open → colour input → step select → prefix → preview → confirm → tokens appear), identify friction (is real-time preview working? is the group prefix field necessary at this step?), then redesign: prioritise the preview—make it the dominant element—and reduce required inputs to the essential minimum. `packages/plugin/src/components/ColorScaleGenerator.tsx`

### Flow: Create Tokens via Presets

- [ ] **Flow audit & overhaul: Preset Token Creation** — Trace the full preset flow (trigger → wizard open → preset select → customise → confirm → tokens appear), identify friction points (is it clear the wizard creates real tokens? is the customisation step necessary or confusing?), then redesign: streamline the flow to the minimum necessary steps, add visual feedback as tokens are created, and ensure the user lands back in the token list with the new tokens visible and highlighted. `packages/plugin/src/components/ScaffoldingWizard.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Paste Tokens from JSON/Text

- [ ] **Flow audit & overhaul: Paste Tokens** — Trace the paste flow (trigger → modal open → paste text → parse → preview → group path → target set → confirm), identify friction (is multi-format parsing communicated? is the group path field confusing?), then redesign: make format auto-detection visible to the user, improve the parsed preview legibility, and reduce the steps between pasting and confirming. `packages/plugin/src/components/PasteTokensModal.tsx`

### Flow: Import Tokens

- [ ] **Flow audit & overhaul: Import Tokens** — Trace the full import flow (trigger → panel open → source select → load → filter → conflict check → target set → confirm → result), read all import service code to understand what happens at each step, identify friction (how long does "load" take? are conflicts explained clearly?), then redesign: add loading states and progress indicators where missing, make conflict resolution self-explanatory, and compress unnecessary steps. `packages/plugin/src/routes/ImportPanel.tsx`, `packages/plugin/src/services/import-service.ts`

### Flow: Export Tokens

- [ ] **Flow audit & overhaul: Export Tokens** — Trace the full export flow (trigger → panel open → mode select → platform/format select → filter → generate → download/copy), identify friction (is the mode toggle self-explanatory? is the output preview useful before downloading?), then redesign: improve mode and platform selection clarity, add a more useful output preview, and make download vs copy-to-clipboard equally discoverable. `packages/plugin/src/routes/ExportPanel.tsx`

### Flow: Create and Manage Themes

- [ ] **Flow audit & overhaul: Theme Management** — Trace the full theme lifecycle (create → assign sets → reorder → view coverage → edit → delete), read all theme manager and theme service code, identify friction (is the set assignment matrix intuitive? is coverage gap surfacing helpful or confusing?), then redesign: simplify the create flow, make set assignment feel like a simple toggle rather than a matrix form, and ensure theme deletion has appropriate friction (confirmation) without being annoying. `packages/plugin/src/components/ThemeManager.tsx`

### Flow: Sync Design Tokens to Figma

- [ ] **Flow audit & overhaul: Sync to Figma** — Trace the full sync flow (open sync panel → view readiness → fix issues → select scope → trigger sync → progress → result), read all sync service and diff viewer code, research how comparable sync UIs communicate consequences (what changes, how many variables, potential overwrites), identify friction (are readiness failures clearly actionable? is scope selection confusing?), then redesign: make the pre-sync state crystal clear (what will change and why), improve readiness check copy to be actionable, and make progress/result feedback satisfying and informative. `packages/plugin/src/components/SyncPanel.tsx`, `packages/plugin/src/services/sync-service.ts`

### Flow: Bind Token to Figma Node Property

- [ ] **Flow audit & overhaul: Token Binding** — Trace the property binding flow (select node → inspector shows properties → click property → picker opens → select token → binding applied), read all selection inspector and property picker code, identify friction (is it clear which properties are bindable? does the picker show too many/few options? is the binding result visible immediately?), then redesign: make bindable properties visually distinct from read-only ones, improve the picker search so the right token is easy to find, and make the post-binding state feel satisfying and complete. `packages/plugin/src/components/SelectionInspector.tsx`, `packages/plugin/src/components/PropertyPicker.tsx`

### Flow: Validate and Fix Token Issues

- [ ] **Flow audit & overhaul: Validate & Fix** — Trace the validation flow (trigger → analytics view → issues listed → click issue → navigate to token → fix → re-validate), read the validator and analytics components, identify friction (is it clear how to trigger validation? is the issue list overwhelming? is "navigate to token" obvious?), then redesign: ensure validation runs automatically and the badge count is always current, make issue descriptions use plain language, and make the fix path (navigate → edit → re-validate) a smooth loop. `packages/plugin/src/components/AnalyticsPanel.tsx`, `packages/core/src/validator.ts`

### Flow: Command Palette Usage

- [ ] **Flow audit & overhaul: Command Palette** — Trace the command palette flow (⌘K → type → filter → select → action), read the palette command definitions, audit whether every action reachable via the palette is also reachable via the UI, identify friction (are commands named consistently? are keyboard shortcuts shown at the right moment?), then redesign: ensure command names use consistent verb-noun format, improve the no-results state, and add a discoverable hint in the UI that ⌘K exists. `packages/plugin/src/components/CommandPalette.tsx`

### Flow: Switch Token Set

- [ ] **Flow audit & overhaul: Switch Token Set** — Trace the set switching flow (set tab click → list reloads → set metadata), read the set tab and set context code, identify friction (is it clear which set is active? is the context menu on set tabs discoverable?), then redesign: make the active set tab unmistakeable, add a visible affordance for right-click/long-press context menu, and ensure switching sets is instant with no loading jank. `packages/plugin/src/components/SetTabs.tsx`, `packages/plugin/src/components/TokenList.tsx`

### Flow: Server Connection & Settings

- [ ] **Flow audit & overhaul: Server Connection** — Trace the settings flow (open settings → enter URL → update → connection check → connected/failed), read the settings panel and connection service code, identify friction (is the URL field pre-filled or empty? is the error message on failure helpful?), then redesign: add a connection status indicator that is always visible in the app shell, improve error messages to be actionable ("Cannot reach server — check the URL or your network"), and make the retry action obvious. `packages/plugin/src/routes/SettingsPanel.tsx`, `packages/plugin/src/services/api-client.ts`

### Flow: Find and Replace Token Names

- [ ] **Flow audit & overhaul: Find & Replace** — Trace the find & replace flow (trigger → search input → matches highlight → replacement input → preview renames → confirm → tokens renamed), read all find-replace UI and service code, identify friction (is the preview of renamed tokens clear enough to prevent mistakes?), then redesign: make the match preview legible (show old name → new name diffs), add a count of affected tokens before confirming, and ensure the action is undoable. `packages/plugin/src/components/FindReplace.tsx`

---

## Global

### UX

- [ ] **Holistic UX audit & redesign: Full plugin** — After the per-area and per-flow improvements are done, conduct a holistic review: read every component file, map the full interaction model, identify cross-cutting issues (inconsistent terminology across areas, inconsistent affordances for the same action type, missing undo coverage, no onboarding for first-time users, poor empty states, no progressive disclosure of advanced features), then produce and implement a coherent set of fixes that unify the experience. Audit: (1) terminology consistency — do we use the same words for the same concepts everywhere? (2) affordance consistency — do similar actions look and behave the same? (3) feedback coverage — does every destructive or slow action have appropriate feedback? (4) learnability — can a new user understand what the plugin does within 60 seconds? (5) error recovery — are all error states actionable? Implement fixes for every issue found. `packages/plugin/src/`
