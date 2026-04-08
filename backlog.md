# UX Improvement Backlog
<!-- Status: [ ] todo · [~] in-progress · [x] done · [!] failed -->
<!-- Goal: anything that makes this the best plugin — from atomic fixes to full overhauls. No users yet, no backwards compat needed. -->
<!-- Completed items: see scripts/backlog/progress.txt -->
<!-- Organization: by functional area, not by screen — resilient to UI restructuring -->
<!-- Inbox: backlog-inbox.md — drained into this file by the TypeScript backlog runner -->

---

## App Shell & Navigation

### Bugs

### QoL

### UX

- [x] [HIGH] Create `docs/redesign/plugin-ia-blueprint.md` as the canonical redesign blueprint for the plugin IA and screen model; include the target primary workspaces, secondary navigation, key user journeys, screen inventory, shared screen anatomy, and migration rules so implementation items can reference one concrete artifact
- [x] [HIGH] Introduce the new job-based workspace mapping layer in the app shell without removing existing internal routes yet: define the primary workspaces, define the secondary utilities/admin area, and make the shell navigation use that mapping instead of exposing duplicated top-tab versus section-tab concepts directly
- [x] [HIGH] Replace the current multi-row shell chrome with the new navigation structure from the blueprint: primary workspace nav, one secondary utilities/admin entry point, and a calmer header area that no longer stacks competing rows of pills and section controls
- [x] [HIGH] Extract a shared workspace header component and migrate Tokens, Themes, Apply, and Sync to it with a stable structure: title, one-sentence guidance, compact status indicators, and one primary action
- [x] Rework the offline / server-connection experience so connection problems do not add a permanent global warning banner to every screen; show blocking empty states only where a server-backed action is required and keep lightweight passive status elsewhere
- [x] Move import, settings, notifications, shortcuts, and other secondary surfaces into a coherent secondary navigation model so users do not have to discover critical workflows through the generic Utilities menu
- [ ] Define a consistent workspace transition model for how screens, drawers, and overlays open or close in the constrained Figma plugin viewport, including when to use inline panels versus modal dialogs versus full-screen takeovers
- [ ] Standardize hover, focus, pressed, disabled, and selected states across shell navigation controls so the app feels deliberate instead of visually inconsistent from workspace to workspace

---

## Token Management

### Bugs

### QoL

### UX

- [x] [HIGH] Rebuild the default Tokens workspace header and toolbar around the primary library flow only: set selection, search, theme mode, and token creation remain visible by default, while sorting, compare, batch selection, issue filtering, and other power features move behind one View Options / More Actions entry
- [x] [HIGH] Implement a dedicated token set manager surface with one consistent entry point, and keep the always-visible set switcher lightweight; the manager should own rename, duplicate, merge, split, reorder, metadata, and bulk operations instead of scattering them across the main workspace
- [ ] Simplify the token list toolbar so the row of pills and toggles becomes a small number of grouped controls with clearer hierarchy; remove equal visual weight between primary creation actions and secondary viewing modes
- [ ] Redesign token rows and group rows to reduce simultaneous indicators, badges, and hover actions; define which metadata is always visible, which appears on selection, and which belongs in a detail preview instead of the list
- [ ] Replace the current search / filter discoverability model with a progressive filter builder that still supports power-user qualifiers, but no longer expects users to infer syntax like `type:` and `has:` from placeholder text alone
- [ ] Rework token creation entry points so “new token”, “new group”, quick generators, inline creation, and manual start flows all feel like one product model instead of several unrelated creation patterns
- [ ] Define a cleaner split between browsing, previewing, and editing tokens so users are not forced to interpret drawers, preview splits, inline popovers, and modal editors as separate editing paradigms

---

## Theme Management

### Bugs

### QoL

### UX

- [x] [HIGH] Implement the Theme Management stage model in the UI shell: explicit steps for axes, options, set roles, and preview, with the default route optimized for common theme authoring instead of expert resolver configuration
- [x] [HIGH] Move coverage review, compare, and advanced resolver controls out of the default theme authoring route and into contextual secondary views or advanced routes so the main screen reads like one guided workflow
- [ ] Redesign the set-role assignment UI so source, override, and excluded states are obvious at a glance and can be edited without scanning dense toggle rows and helper text
- [ ] Improve theme option navigation for multi-axis systems by making the current focus, option context, and unresolved gaps visible without forcing users to parse chips, badges, and side controls scattered across the page
- [ ] Create a clearer path from theme gaps to fixes: when coverage or missing overrides are detected, the UI should explain what is missing, what set will be affected, and the safest next action from that exact context

---

## Sync

### Bugs

### QoL

### UX

- [x] [HIGH] Split the current Sync shell into two explicit subflows: primary Figma Sync and secondary Repo / Handoff, with designers able to complete Figma publishing without parsing Git-specific controls
- [x] [HIGH] Implement a dedicated sync preflight step ahead of compare/apply actions, with explicit blocking versus advisory states, grouped fixes, and one recommended next action per failing cluster
- [ ] Rework the Figma Variables and Figma Styles compare/apply flow so “compare”, “review differences”, and “apply” form one guided sequence rather than several accordions and banners that the user must mentally stitch together
- [ ] Redesign Export as a dedicated handoff surface with a narrower control set, clearer preset behavior, and more obvious output expectations, rather than an advanced sub-view bolted onto the sync workspace
- [ ] Write `docs/redesign/repo-handoff-decision.md` to decide whether the Git-based handoff workflow remains inside the plugin or moves out of the primary UX, documenting the target user, rationale, and chosen product direction
- [ ] If the repo handoff workflow stays in the plugin, collapse it behind a clearly advanced expert-only entry point with its own framing, success states, and no presence in the default designer publishing flow

---

## Analytics & Validation
<!-- All analytics items currently live under App Shell > "Inline analytics as a toolbar toggle" -->

### UX

- [ ] Turn audit and validation signals into actionable product feedback instead of raw counts and badges: each issue type should explain why it matters, where it comes from, and how to fix it from the relevant workflow
- [ ] Define a shared pattern for warnings, lint results, stale state, and informational notices so the app stops mixing neutral pills, danger pills, banners, and inline warnings without a clear severity hierarchy

---

## Selection Inspector & Property Binding

### Bugs

### QoL

### UX

- [x] [HIGH] Restructure the Apply workspace into a simple sequence for the target user: selection summary first, best-match suggestions second, property binding third, and advanced tools only on demand
- [x] [HIGH] Redesign property rows so bind, replace, remove, and create-from-value actions are consistently positioned and legible without relying on hover-only discovery or dense per-row UI
- [ ] Rework the suggestion model so the “Suggested” section is easier to trust and scan: explain why a token is suggested, group the best matches, and reduce the current long undifferentiated action list
- [ ] Simplify advanced tools inside Apply by consolidating layer search, remap, extract, selection sync, deep inspect, and filtering into one secondary tools surface with clearer status and fewer simultaneous toggles
- [ ] Define how Apply should respond as the canvas selection changes, including empty state, multi-layer mixed state, loading state, successful binding feedback, and when to surface sync status versus hide it

---

## Import

### Bugs

### QoL

### UX

- [x] [HIGH] Rebuild the import flow as a family-first experience: choose the source family first, then the exact format, then the destination rules, instead of presenting Figma, token files, code extraction, and migration sources as equal-weight options in one flat chooser
- [ ] Redesign the post-import handoff so the user always lands in a sensible next step with a summary of what was created, what needs review, and whether they should go to Tokens, Themes, or Sync next
- [ ] Clarify drag-and-drop import behavior with visible supported formats, drop affordances, validation feedback, and conflict resolution patterns that do not feel like a hidden expert feature

---

## Token Generation & Graph Editor

### Bugs

### UX

- [ ] Reframe generators as a supporting creation tool inside the Tokens workflow instead of a parallel product area; define when generators deserve a full editor, when quick-start templates are enough, and how generated groups communicate their status inline
- [ ] Simplify generator discovery, naming, and editing so users can understand what a generator owns, what will change on save, and how to get back to the generated tokens without using the graph or command palette as a workaround

---

## Token Editor

### Bugs

### QoL

- [ ] Redesign the token editor so it feels like one consistent editor across token types, with shared header structure, clearer field grouping, and better distinction between always-needed fields versus advanced metadata
- [ ] Define when token editing should happen inline, in a side panel, or in a modal drawer so the app stops mixing editing surfaces in ways that make navigation and unsaved-change behavior harder to understand

---

## Settings & Data Management

### Bugs

### QoL

### UX

- [x] [HIGH] Reduce Settings to a concise preferences area for real day-to-day decisions, and move recovery, backup/restore, destructive actions, and debugging controls into a deliberately advanced section with stronger framing
- [ ] Rework connection settings so server URL management, connection testing, retry behavior, and setup guidance live in one coherent place instead of being split between the top banner, onboarding, and the settings panel
- [ ] Define a better recovery / data management UX for destructive actions like clearing all data, importing settings, and restoring backups so these operations no longer sit visually adjacent to normal preferences without enough separation

---

## Cross-Cutting UX / IA

### UX

- [ ] Define the new plugin-wide visual system for density, typography, spacing, chips, badges, section headers, and CTA hierarchy, raising the baseline readability above the current 9–11px-heavy interface
- [ ] Establish one consistent empty-state system for first run, no sets, no selection, disconnected server, no results, and no issues found, so the app stops solving each zero-data case with a different visual and interaction pattern
- [ ] Establish one consistent loading / progress / success / error feedback model across imports, sync, binding, generator runs, audits, and settings changes so users can predict what is happening after every mutation
- [ ] Define plugin-specific motion and layout-change rules for drawers, accordions, split views, sticky regions, and contextual previews so the app can become calmer and easier to follow while still feeling responsive
- [ ] Audit temporary redesign docs after the new IA and major workspace flows are implemented; remove any document in `docs/redesign/` that no longer adds unique value, and update surviving references so the repo does not keep stale redesign planning artifacts around
- [ ] Promote any redesign guidance that still matters long-term into the correct permanent docs, then delete or archive the temporary planning docs such as `docs/redesign/plugin-ia-blueprint.md` and `docs/redesign/repo-handoff-decision.md` once their decisions are fully reflected in code and stable documentation

---

## Code Quality

### Redundancy & Duplication

### Performance

### Correctness & Safety

### Accessibility

### Maintainability

- [x] `export-all-variables` message handler in plugin sandbox is dead code — controller.ts registers a handler for this message type but no UI component ever sends it; the export flow uses server API routes instead; remove the dead handler to reduce sandbox bundle size and avoid confusion
