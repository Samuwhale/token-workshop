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
- [!] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion

- [ ] SelectionInspector property filter resets on every selection change — filter text and mode (bound/unbound/colors/dimensions) are cleared whenever the Figma selection updates; users working through multiple similar layers must re-type the same filter each time
- [ ] ConsistencyPanel has no "apply all" for suggestions — each consistency suggestion must be applied one node at a time; when a suggestion matches 20+ layers there is no batch-apply action, making systematic cleanup tedious
- [ ] HeatmapPanel shows coverage problems but offers no remediation path — red/yellow nodes are listed with their missing bindings but there is no "bind token" or "extract and bind" action inline; users must switch to SelectionInspector, find the node, and bind manually
- [ ] No undo operation grouping — rapid sequential edits (e.g., renaming 5 tokens in a row, or batch editor sub-operations) each create separate undo entries in useUndo.ts; undoing a logical batch requires pressing Cmd+Z multiple times with no way to undo the group as one action
- [ ] SettingsPanel is a single unstructured scroll — all settings (UI preferences, export defaults, lint config, undo limits, danger zone) live in one long panel with no tabs, sections, or search; finding a specific setting requires scrolling through the entire list
- [ ] Token rename does not propagate to Figma variable names — renaming a token via the server API updates alias references and file paths but does not update the corresponding Figma variable's name; over time variable names drift from token paths, creating confusion during sync
- [ ] DeepInspectSection cannot select child layers in the canvas — clicking a nested layer row in deep inspect mode shows its bindings but provides no way to select that layer in Figma for further inspection; the discovery loop ("see binding → inspect layer") is broken
- [ ] CreatePanel does not allow setting description or metadata during creation — users must first create the token, then open the editor to add description, scopes, or extensions; this two-step workflow is friction for teams that require descriptions on all tokens (especially with the require-description lint rule enabled)
- [ ] No import merge preview — ImportPanel's conflict detection shows that conflicts exist but not a side-by-side diff of local vs. incoming values; users must decide skip/overwrite/merge without seeing what will actually change per token
