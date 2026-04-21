# TokenManager Figma Plugin - UX/IA Review

**Date:** 2026-04-21  
**Scope:** Verified review of the current app UX, IA, and workflow model  
**Target users:** Figma UI/UX designers and design-system maintainers (primary); developers collaborating on sync, export, history, and governance (secondary)

## Executive Summary

The product is already strong at the core job: authoring tokens in a Figma-native model. Collections are the primary container, modes are visible together, and `Canvas` is correctly treated as a distinct usage workflow rather than hidden inside `Library`.

The main UX problem is not missing capability. The main problem is that too many workflows still compete inside a narrow shell, while several important Library surfaces behave as mutually exclusive state. That creates context loss and makes the app feel denser than it needs to.

The direction should be:

1. Keep `Canvas` first-class.
2. Keep `Library` as the primary authoring workspace.
3. Rename `Share` to `Sync`.
4. Split pinned editing state from maintenance routing before larger shell changes.
5. Make `Health` one coherent maintenance concept across the product.
6. Keep developer-facing workflows visible, but quieter than the primary designer path.

## 1. Validated Current State

### What is already working

- The canonical domain model is strong and should stay: collections are primary, modes belong to collections, and tokens vary by mode without exposing storage details in UI.
- The collection rail + token tree + side editor pattern is a good fit for designers.
- Multi-mode authoring follows the right mental model: all modes are visible together.
- `Canvas` is a legitimate top-level workspace and should remain one.
- `Figma Sync` already has meaningful structure: target editing can collapse, conflicts are separated from non-conflicts, and advanced routing is already partly deferred.
- Several secondary tools have already been pushed out of the main shell, which is the right direction.

### Capabilities that already exist but are easy to miss

- selection-aware filtering in `Library`
- group-level sync to Figma
- rename with alias updates
- duplicate token and duplicate group flows
- drag-drop reorder in the token tree
- health entry points from the toolbar
- row-level issue or warning state
- bulk edit and multi-select workflows
- stale generated-group signals in `Library`

### Important product distinctions

`History` and `Versions` are not duplicates.

- `History` is local operational history: recent actions, checkpoints, rollback-oriented review.
- `Versions` is Git and repository workflow: branch state, pull/push, commits, comparison.

The app shell already supports workspace sections and expandable navigation. The larger blocker is not shell capability. The larger blocker is that editing state and maintenance routing are still too tightly coupled.

## 2. Core Problems

### 2.1 Library contention is the main UX problem

`Library` is currently trying to host too many jobs at once:

- token browsing
- token editing
- collection setup
- generator editing
- compare
- import
- health review
- history review

That matters because several of these surfaces still replace one another instead of preserving context. For designers, this feels like the app keeps hiding the thing they were just using.

This is both an IA problem and a state-model problem. Sub-navigation alone will not fix it.

### 2.2 `Share` is the wrong umbrella label

The features inside `Share` are real and should stay, but the top-level label is too vague.

`Share` currently mixes:

- designer-facing output to Figma
- developer-facing export workflows
- version-control workflows

The right fix is to rename the workspace to `Sync`, keep `Figma Sync` primary, and give `Export` and `Versions` a quieter explicit home later. Do not solve this by hiding them.

### 2.3 Several things feel missing because they are buried

The product has a discoverability problem more than a missing-feature problem in several areas.

Examples:

- selection-aware Library context exists, but is hidden behind filtering
- health is present, but not surfaced coherently at collection and token levels
- group sync exists, but collection-level sync is missing, so the workflow feels incomplete
- rename is already reference-safe, but the experience still reads as warning-heavy
- duplicate already exists, but the wording and default naming make it feel technical

The product should surface existing capability before rebuilding it.

### 2.4 Naming still drifts away from designer language

The remaining high-impact naming problems are:

- `Share`
- Canvas workflow label `Coverage`
- `Scopes`
- `Health` versus `Audit`
- inconsistent `Library` / `Tokens` hierarchy

The main caution is that `Coverage` should not be renamed blindly everywhere. The workflow label in `Canvas` should become `Usage`, but literal coverage metrics should stay `Coverage`.

### 2.5 `Issue` does not mean one thing yet

The product still has overlapping issue systems:

- row badges and issue filters in `Library`
- `Health` totals and maintenance views
- stale generated-state warnings
- toolbar issue summaries
- notification entries

That means the same collection can appear healthy in one place and problematic in another without a clear explanation. The app needs one stable definition of what needs attention.

### 2.6 Notifications are promising, but too brittle

The current inbox model is worth keeping, but it behaves more like recent toast history than a reliable task system.

The current weaknesses are:

- short-lived message history
- routing inferred from message text
- token targets scraped from prose
- no durable explicit destination payload

If an entry says "Open health" or "Open sync," the destination should be explicit, not guessed.

## 3. Workflow Read

### Library

`Library` is fundamentally the right authoring home. The main weakness is not visible button clutter. The main weakness is that important state is spread across menus, chips, and contextual takeovers, while adjacent tasks still clear one another too aggressively.

There is also a collection-level comprehension gap: the rail communicates token count better than it communicates mode structure and maintenance state.

### Canvas

`Canvas` should remain top-level. For the primary user, selecting a Figma layer and asking "what is bound here?" or "what should I apply here?" is a primary workflow, not a secondary detail.

The main improvements are:

- rename the workflow label `Coverage` to `Usage`
- make scans feel explicit and predictable
- reflect active selection context back into `Library` more clearly

### Sync

`Figma Sync` is still the densest workflow in the product, but it is a real primary workflow and should remain visible. The remaining issue is clarity of the happy path, not whether the surface belongs in the product.

### Health

`Health` is useful, but still too hidden and too disconnected from the rest of the maintenance model. It should become a persistent Library section, not stay only as a takeover hidden behind toolbar entry points.

### Export and Versions

These are legitimate secondary workflows. They should become quieter than the designer's main sync path, but they should remain explicit. Do not bury them inside settings or generic utility menus.

## 4. Chosen Direction

The intended product direction is:

- `Library` remains the primary authoring workspace.
- `Library` becomes a persistent three-section workspace: `Tokens`, `Health`, `History`.
- The token editor stays pinned across nearby Library sections once opened.
- `Canvas` stays first-class and keeps `Selection` and `Usage`.
- `Share` becomes `Sync`.
- `Sync` remains a primary workspace for designer-facing output to Figma.
- `Export` and `Versions` keep a clear explicit home, but move out of the main designer path once the shell provides a real secondary navigation home.
- `Health` becomes the single maintenance term. Stop using `Audit` for the same concept.
- Notifications become quieter and more reliable, but not more central.
- The next major authoring addition should be `Copy to all modes`.

### Recommended IA shape

```text
Primary
|- Library
|  |- Tokens
|  |- Health
|  `- History
|- Canvas
|  |- Selection
|  `- Usage
`- Sync

Secondary
|- Export
`- Versions

Utilities
|- Settings
|- Notifications
`- Undo / Redo
```

### Naming decisions

| Today | Use instead | Notes |
|-------|-------------|-------|
| `Share` | `Sync` | Primary designer-facing output workflow |
| Canvas `Coverage` workflow label | `Usage` | Use in navigation and workflow copy |
| literal coverage metrics | `Coverage` | Keep where the panel measures coverage |
| `Scopes` | `Applies to` or `Conditions` | Use the simpler label that fits the surface |
| `Audit` | `Health` | Use one maintenance term |
| `Duplicate` | `Create from this token` | Match authoring intent |

## 5. Implementation Constraints

The UX problem is reflected directly in the current code structure.

The main architectural constraints are:

- editing and maintenance routes are still treated as mutually exclusive in too many places
- Library contextual surfaces still clear adjacent state too aggressively
- issue and warning signals are split across multiple pipelines
- notification destinations are inferred from prose instead of carried as explicit state
- the shell already has some of the section infrastructure needed, so state cleanup is the higher-priority prerequisite

The implementation order should be:

1. separate pinned editing state from Library maintenance routing
2. make `Health` and `History` persistent Library sections
3. unify issue, warning, and maintenance signals
4. replace inferred notification routing with explicit destinations
5. rename and reorganize `Share` into `Sync`
6. move `Export` and `Versions` only when there is a real secondary home

This is the critical point: the hardest part is not adding sub-navigation. The hardest part is preserving editing context while users move through nearby Library workflows.

## 6. Highest-Value Missing or Incomplete Work

These are the highest-leverage gaps that remain after accounting for what already exists:

1. pinned editor continuity across Library workflows
2. `Copy to all modes`
3. collection-level `Sync to Figma`
4. clearer `Create from this token` workflow
5. stronger multi-select and bulk-edit momentum
6. better collection summaries in the rail, especially modes and status
7. proactive selection context inside `Library`
8. one coherent issue and system-feedback model
9. structured notification destinations and action payloads
10. clearer first-run handoff after setup

## 7. Execution Plan

### Wave 1 - Naming and state foundation

1. Rename `Share` to `Sync`.
2. Standardize maintenance naming on `Health`.
3. Rename the Canvas workflow label `Coverage` to `Usage`.
4. Separate pinned editing state from Library maintenance routing.
5. Replace inferred inbox routing with explicit destinations.

### Wave 2 - Library structure and continuity

6. Turn `Library` into persistent `Tokens`, `Health`, and `History` sections.
7. Keep contextual tools contextual, but quieter.
8. Surface selection context proactively inside `Library`.
9. Preserve editor and preview context while moving between nearby Library tasks.

### Wave 3 - Health and system feedback

10. Unify the meaning of `Health` across the product.
11. Surface Health at collection and token levels.
12. Consolidate generated-group upkeep into the same maintenance model.
13. Align toolbar counts, row badges, filters, and Health totals.

### Wave 4 - Core authoring gaps

14. Add `Copy to all modes`.
15. Add collection-level sync from `Library`.
16. Reframe `Duplicate` as `Create from this token`.
17. Make rename safety feel like the default workflow.
18. Make multi-select feel like a first-class editing mode.

### Wave 5 - Secondary workflows and onboarding

19. Give `Export` and `Versions` a quieter but explicit home.
20. Upgrade the collection rail to communicate modes and status better.
21. Tighten the first-run path after setup.
22. Use one consistent workspace hierarchy across navigation, onboarding, and follow-up guidance.

## 8. Parallelization Guidance

- In Wave 1, naming cleanup and notification routing can proceed alongside one another, but the editor-state split is the critical path.
- In Wave 2, Library sectioning and contextual-tool demotion can proceed in parallel once editor-state groundwork is in place.
- In Wave 3, Health-model unification and generated-state consolidation are tightly related; collection and token surfacing can progress alongside them.
- In Wave 4, `Copy to all modes`, collection sync, create-from-token framing, and multi-select improvements can be separate work items.
- In Wave 5, secondary-navigation cleanup, collection-rail improvements, and onboarding cleanup can move independently once the primary shell structure is stable.
