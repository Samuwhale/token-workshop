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

---

## Token Management

### Bugs

### QoL

### UX

- [x] Replace the current search / filter discoverability model with a progressive filter builder that still supports power-user qualifiers, but no longer expects users to infer syntax like `type:` and `has:` from placeholder text alone
- [ ] Rework token creation entry points so “new token”, “new group”, quick generators, inline creation, and manual start flows all feel like one product model instead of several unrelated creation patterns
- [ ] Define a cleaner split between browsing, previewing, and editing tokens so users are not forced to interpret drawers, preview splits, inline popovers, and modal editors as separate editing paradigms

---

## Theme Management

### Bugs

### QoL

### UX

- [ ] Redesign the set-role assignment UI so source, override, and excluded states are obvious at a glance and can be edited without scanning dense toggle rows and helper text
- [ ] Improve theme option navigation for multi-axis systems by making the current focus, option context, and unresolved gaps visible without forcing users to parse chips, badges, and side controls scattered across the page
- [ ] Create a clearer path from theme gaps to fixes: when coverage or missing overrides are detected, the UI should explain what is missing, what set will be affected, and the safest next action from that exact context

---

## Sync

### Bugs

### QoL

### UX

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

- [ ] Rework the suggestion model so the “Suggested” section is easier to trust and scan: explain why a token is suggested, group the best matches, and reduce the current long undifferentiated action list
- [ ] Simplify advanced tools inside Apply by consolidating layer search, remap, extract, selection sync, deep inspect, and filtering into one secondary tools surface with clearer status and fewer simultaneous toggles
- [ ] Define how Apply should respond as the canvas selection changes, including empty state, multi-layer mixed state, loading state, successful binding feedback, and when to surface sync status versus hide it

---

## Import

### Bugs

### QoL

### UX

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
