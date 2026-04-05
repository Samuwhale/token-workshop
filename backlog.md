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

---

## Token Management

### Bugs

### QoL

### UX

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

### Maintainability

- [ ] Theme dimension terminology is opaque for first-time users — "Add a Layer" button and "dimension" labels don't communicate that these represent theme axes like light/dark or brand variants; rename to "Add Theme Axis" or "Add Variant" and include inline examples (e.g. "e.g. Mode: light, dark") in the create dialog
- [ ] Generator creation has no entry point from ThemeManager — when a user creates a theme dimension and wants to generate variant tokens (e.g. dark mode color inversions), they must navigate away to the Generators sub-tab, discover the template picker, and configure from scratch; add a "Generate tokens for this dimension" action directly on theme options that pre-fills the generator dialog with the relevant source set and target
- [ ] Publish panel shows no sync status until user manually clicks Compare — there's no passive indicator of whether tokens are in sync with Figma variables/styles; add an auto-check on panel open (or a lightweight badge on the Ship tab) that shows "N changes pending" without requiring user action
- [ ] No token clipboard format interop with other design token tools — copy/paste uses internal JSON or CSS variable formats, but designers switching between tools (Tokens Studio, Style Dictionary, Specify) expect to paste tokens in W3C DTCG JSON format; add a "Copy as DTCG JSON" option to the copy menu and support pasting DTCG-formatted JSON from clipboard
- [ ] Git workflow in PublishPanel assumes git familiarity — merge conflicts show "ours/theirs" terminology, branch management uses raw git concepts, and commit messages default to empty; for designer-first UX, translate git concepts to design language ("your version / server version"), auto-generate descriptive commit messages from the diff summary, and add a "What does this mean?" expandable for conflict resolution
- [ ] Token tree has no visual grouping or section headers for top-level categories — with hundreds of tokens, the flat alphabetical tree makes it hard to scan by domain (colors, spacing, typography); add collapsible category headers based on first path segment with token count badges, or a toggle between flat-tree and category-grouped views
- [ ] No way to see all tokens affected by a generator before running it — the generator preview shows output values but not which existing tokens will be overwritten or created; add an impact summary ("Will create N new tokens, overwrite M existing") with expandable diff before the Run action
- [ ] Color picker in token editor lacks a way to sample colors from the Figma canvas — the eyedropper message handler exists in the plugin sandbox but there's no visible eyedropper button in the color editor UI; surface the eyedropper as a button next to the color input so designers can pick colors directly from their designs
- [ ] No "apply token to selection" from the token list context menu — binding a token to a Figma node requires navigating to the Apply > Inspect tab, selecting the node, finding the property, then searching for the token; add a right-click "Apply to selection" action on any token row that binds it to the currently selected Figma node's most relevant property (fill for colors, width/height for dimensions, etc.)
- [ ] ExportPanel has 10 platform exporters bundled in a single 2162-line component with no pluggable architecture — each platform formatter is a local function with platform-specific logic interleaved with shared UI state; extract each platform into a self-contained exporter module with a common interface (`{ id, label, fileExtension, format(tokens, options) }`) so new platforms can be added without touching ExportPanel
