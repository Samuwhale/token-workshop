# TokenManager Figma Plugin - UX/IA Review

**Date:** 2026-04-21  
**Scope:** Full audit of screens, flows, information architecture, and UX quality  
**Target users:** Figma UI/UX designers and design-system maintainers (primary); developers collaborating on tokens, sync, export, and governance (secondary)

## Executive Summary

The plugin is unusually capable for a Figma plugin. The core authoring model is strong: collections are the primary container, modes are visible simultaneously, and token authoring in `Library` generally follows a Figma-native mental model.

The main problem is not missing functionality. The main problem is that too many workflows are competing inside a narrow shell while the UI still treats several major Library surfaces as mutually exclusive state. This makes the app feel denser than it needs to and breaks continuity during normal work.

Four structural issues matter most:

1. **Library contention is both an IA problem and a state-model problem.** Token editing, generated groups, compare, collection setup, color analysis, import, health, and history all compete in the same workspace, and several of those routes still clear one another rather than preserving active editing context.
2. **`Share` is the wrong umbrella name.** It mixes a designer-critical sync workflow with developer-facing export and version-control workflows. The problem is naming and placement, not that those features exist.
3. **Several capabilities feel missing because they are buried.** Selection-aware filtering, health entry points, group sync, duplicate/create-from-token, rename with alias updates, and reorder already exist. They read as missing because they are hidden in menus, split across surfaces, or framed with the wrong language.
4. **System feedback is fragmented.** Health, toolbar issue counts, row badges, stale generated banners, and notifications all overlap, but they do not share one consistent model of what an "issue" is or where the user should go next.

For the target user, the right strategy is:

- keep `Canvas` first-class
- give `Library` persistent sub-navigation
- rename `Share` to `Sync`
- separate pinned editor state from maintenance routing before doing larger shell reshuffles
- unify issue and system-feedback models before adding more maintenance chrome
- surface existing capabilities before building replacements
- add a small set of real missing empowerment features, especially **copy value to all modes** and collection-level sync from Library

## 1. Current Product Read

### Navigation today

The current app has three top-level workspaces:

- **Library**: token authoring, collection management, and several contextual tools
- **Canvas**: selection inspection and canvas analysis
- **Share**: Figma Sync, Export, and Versions

`Library` currently hosts the following contextual surfaces:

- Token editor
- Generated group editor
- Collection details
- Compare
- Color analysis
- Import
- Health
- History

This matters because those surfaces still compete for the user's attention and, in several cases, for the same interaction state.

### Important distinction: History vs Versions

`History` and `Versions` are not duplicates.

- **History** is the local operational timeline: recent actions, undo/redo context, checkpoints, and rollback-oriented review.
- **Versions** is the repository and Git workflow: repo setup, branch status, pull/push, commits, and commit comparison.

That distinction is important for the target audience. Designers may mostly care about authoring and sync, but developers still need a clear, explicit place for version history and platform output.

### Important distinction: shell capability vs workflow behavior

The app already has a subsection-capable shell model. The sidebar can expand workspaces that have sections, and `Share` already uses this pattern for `Figma Sync`, `Export`, and `Versions`.

That means the biggest structural blocker is not that the shell cannot support `Library > Tokens / Health / History`. The bigger blocker is that editor state and maintenance routes are still coupled too tightly, so moving between related workflows often discards context.

## 2. What Is Already Working Well

Several foundations are solid and should be preserved:

- The canonical domain model is respected throughout the product.
- The collection rail + token tree + side editor pattern is strong.
- Multi-mode authoring is handled in the right mental model: all modes are visible together.
- `Canvas` is correctly treated as a distinct workflow rather than a hidden detail of Library.
- `Figma Sync` already has meaningful progressive disclosure: target editing can collapse, conflicts are separated from non-conflicts, and advanced routing is already behind a disclosure.
- Several secondary tools are already quieter than they used to be. JSON editing, token table creation, batch editing, and other utility workflows have already moved into menus instead of permanently crowding the shell.
- The product already distinguishes between side-panel Library tools and full-takeover Library tools. That distinction is useful and should be expanded, not discarded.

Several capabilities that the UI makes hard to discover are already implemented:

- drag-drop reorder in the token tree
- rename with alias updates
- group-level sync to Figma
- duplicate token and duplicate group flows
- selection-aware filtering in Library
- health entry points in the Library toolbar
- token-row issue/status badges
- bulk-edit and multi-select workflows
- stale generated-group signals inside Library

The product is not empty or immature. It is mainly oversubscribed and inconsistently surfaced.

## 3. Validated Information Architecture Problems

### 3.1 Library surface contention is the core problem

This is the most important conclusion in the review, and it holds up.

`Library` is trying to be all of the following at once:

- primary token browser
- token editor
- collection setup surface
- generator host
- compare tool
- import center
- maintenance dashboard
- history viewer

Because those surfaces replace one another, the user loses context while moving through normal work:

- edit a token, then open Health: the editor is gone
- preview tokens, then open Compare: the preview split closes
- import tokens, then inspect quality: back out of one takeover, open another

For designers, this feels like the app keeps hiding the thing they were just using. That is the wrong feeling for a primary authoring workspace.

The important nuance is that the current problem is not uniform:

- Token editing and collection setup already work as side-panel surfaces.
- Compare, generated-group editing, import, health, and history still behave as takeovers.
- The current contextual-surface state still resets adjacent Library workflows instead of preserving them.

That means the real fix is not just "add sub-navigation." The fix is to separate editing context from maintenance routing and then let the shell reflect that separation.

### 3.2 `Share` is vague, but the features inside it are real

The current top-level label does not match the user's task.

`Share` currently mixes:

- **Figma Sync**: designer-critical output into variables and styles
- **Export**: developer-facing platform files
- **Versions**: repository history and collaboration

The label is wrong because it does not tell the designer what will happen. But the fix is not to remove the secondary workflows.

For this product, developer features should not be buried or deleted. They should be visible, explicit, and quieter than the primary designer flow.

The right conclusion is:

- rename `Share` to `Sync`
- keep `Figma Sync` as the designer-facing primary output workflow
- keep `Export` and `Versions` visible and explicit
- only move `Export` and `Versions` into quieter secondary navigation once the shell gives them a real secondary home

Moving them prematurely into settings-like utilities would solve clutter by creating hiding, which is the wrong tradeoff for collaborative design-system work.

### 3.3 Hidden capabilities are being mistaken for missing capabilities

A recurring problem in the current UX is not absence, but poor surfacing.

Examples:

- **Selection-aware Library context exists**, but it is hidden behind a filter entry and an active chip rather than surfaced proactively when the user has a Figma selection.
- **Health already has more surfacing than a first glance suggests**: there is a header count and token rows already expose issue state. The deeper problem is that collection-level surfacing is weak and the product still does not unify one issue model across Library and Health.
- **Group sync exists in the tree**, but collection-level sync is absent, so the workflow feels incomplete.
- **Rename updates references already exist**, and the default path already supports updating aliases, but the experience still reads like a dependency warning rather than a normal designer rename flow.
- **Duplicate token already exists**, but the action label, placement, and default `-copy` naming still feel technical rather than authoring-oriented.
- **Several advanced tools are already partly demoted**, which means the right next step is continued simplification of placement and language, not rebuilding the feature set.

This distinction matters because the product should not spend time rebuilding features that already ship.

### 3.4 Jargon and naming drift still leak into designer-facing surfaces

The biggest remaining language problems are:

- `Share`
- the Canvas workflow label `Coverage`
- `Scopes`
- `Health` versus `Audit`
- `Library` versus `Tokens` when they refer to the same area of the product
- advanced sync terminology that appears too early

The app has already improved some naming:

- `Issues` is already better than `Lint violations`
- `Advanced` is already better than `Extensions`

The remaining work is narrower than it first appears, but still important.

The main caution is that `Coverage` should not be renamed blindly everywhere. In the shell, designers are really asking "where is this used?", so `Usage` is the stronger workflow label. But when a panel is literally measuring tokenization coverage as a percentage, `Coverage` is still accurate.

### 3.5 `Issue` does not mean one consistent thing yet

The current product has multiple overlapping issue systems:

- Library row badges and "Only tokens with issues" mainly mean lint-driven problems
- Health combines lint, validation, stale generated state, duplicates, and usage-related risk signals
- the toolbar health entry point emphasizes validation totals rather than the narrower Library row model
- stale generated groups also surface through their own status banners and row metadata

That means the same collection can look "clean" in one place and "warning" in another without the user understanding why.

For designers, that does not feel like rich maintenance tooling. It feels like the product is changing the definition of a problem depending on where they are standing.

### 3.6 The inbox and system feedback model are promising, but routing is brittle

The app already has the beginnings of a useful inbox. That is worth preserving.

The current weakness is that the inbox is still closer to toast history than to a reliable task system:

- notification history stores message text, variant, and timestamp
- navigation targets are inferred from keywords in the message
- token targets are recovered by scraping quoted token paths
- history is intentionally short-lived rather than structured around durable work items

That makes the experience feel less trustworthy than it should. If a system entry says "Open health" or "Open sync," the user should not have to wonder whether the app guessed correctly.

### 3.7 The shell already provides some of the needed foundation

The product does not need a net-new navigation framework before it can improve.

The current shell already supports:

- expandable workspace sections
- persistent top-level workspaces
- secondary takeovers for utility surfaces

That matters because some recommendations that look like "big shell work" are actually smaller than they appear. For example, making `Health` and `History` real `Library` sections is more straightforward than preserving edit context while moving between them.

## 4. Workflow Assessment

### Library

`Library` is fundamentally a good authoring surface. The collection rail, token tree, type grouping, search, and side-panel editing all make sense for designers.

The current problem is not that the top row is visibly overloaded. The visible chrome is already more condensed than the old "7+ controls" critique suggests. The current issue is that too much important state is distributed across:

- `View`
- `Filter`
- `Actions`
- search qualifiers
- state chips
- contextual takeovers

That shifts the problem from visible clutter to discoverability and context loss.

There is also a smaller but important collection-level gap: the rail currently emphasizes token count much more than mode structure, which weakens the Figma mental model at the point where designers choose where to work.

### Canvas

`Canvas` should stay a top-level workspace.

For the primary user, selecting a Figma layer and asking "what is bound here?" or "what should I apply here?" is not a secondary detail. It is the real usage moment for tokens.

The current weakness is not that Canvas exists. The weakness is that Library does not borrow enough context from Canvas when a selection is active.

There are two naming and behavior issues here:

- the workflow label `Coverage` is less natural than `Usage` for designer-facing navigation
- scanning behavior should feel explicit and predictable, especially in analysis views

That does not mean every coverage-related panel should be renamed. It means the navigation and view labels should match the user's intent.

### Sync

`Figma Sync` is still the densest surface in the product, but it is not as unstructured as a first glance suggests.

The panel already contains:

- a default target summary
- an idle "Check for changes" state
- explicit conflict handling
- a non-conflict summary
- advanced routing behind disclosure

The remaining issue is that the first pass still asks the user to understand too much structure before the happy path is obvious.

### Health

Health is feature-rich and useful, but still buried.

The right conclusion is not "Health should disappear." The right conclusion is that it deserves persistent access inside Library rather than existing only as a hidden takeover behind toolbar actions.

The other remaining weakness is conceptual: the product still does not make `Health`, `Issues`, `Audit`, row-level warnings, and stale generated state feel like one coherent maintenance system.

### Versions and Export

These are real secondary workflows and should stay.

- `Export` is a legitimate developer-facing output surface.
- `Versions` is a legitimate Git/history/collaboration surface.

The end-state should give them a quieter home than the designer's sync workflow, but that home must remain explicit. Do not solve this by burying them inside settings or generic utility menus.

### Onboarding

Onboarding has the right intent, but it still does not do enough to stage the product gradually for a designer.

The current setup guidance introduces sensible concepts, but the handoff from "start here" into ongoing work is still weak, and some of the copy mixes product labels in ways that reduce confidence early.

## 5. Keep, Demote, Remove

### Keep

These features are legitimate and should stay in the product:

- `Canvas` as a top-level workspace
- `Export`
- `Versions`
- `Color Analysis`
- notifications/inbox state as a model for actionable system feedback
- `Z-Index Scale`
- `Dark Mode Inversion`

The principle here is simple: if a feature supports a real designer or developer workflow, it deserves a home even if it should not be loud.

### Demote or Simplify

These features feel secondary and should move to quieter access paths:

- `JSON Editor`
- `Table Create`
- `Custom Scale`
- `Compare`
- `Batch Editor`
- `Keyboard Shortcuts` as a dedicated surface

Several of these are already partly demoted. That is the right direction.

The goal is not to delete them first. The goal is to stop letting them compete with the designer's primary authoring flow.

### Remove only with evidence

There are no high-confidence kill recommendations based on the current code alone.

Most current UX debt comes from **placement, naming, discoverability, and state coupling**, not from the mere existence of too many features.

If future usage data shows that `JSON Editor` or `Table Create` are effectively unused, they are the strongest removal candidates. They are not the first thing that needs to change.

## 6. What Is Actually Missing

These are the highest-leverage missing or incomplete workflows for the primary user.

1. **Pinned editor continuity across nearby Library workflows.** The current shell can already render adjacent sections, but the editing state still drops too easily when users move into maintenance views.
2. **Copy value to all modes.** The current multi-mode editor supports copying from a neighboring mode, but not the direct "apply this value to every mode" action designers expect.
3. **Collection-level sync from Library.** Group-level sync exists, but collection-level sync is still missing from the collection rail.
4. **A clearer "Create from this token" flow.** Duplicate already exists, but the label, placement, and default `-copy` path make it read like a technical clone command rather than a designer authoring flow.
5. **More direct bulk workflows once multi-select is active.** Multi-select and bulk edit exist, but they still read as secondary tools rather than a first-class editing mode.
6. **Better collection summaries in the rail, especially mode visibility and status.** Collections are the primary container in the domain model, so the rail should communicate more than token count alone.
7. **More explicit selection context in Library.** The user should not have to discover "related to selection" only through a filter menu.
8. **A single issue and system-feedback model across Library, Health, generated-state surfaces, and notifications.** The product needs one stable meaning for "issue," "warning," and "needs action."
9. **Structured notification destinations and action payloads.** The inbox can be useful, but only if entries navigate by explicit destination data instead of parsing prose.
10. **A clearer Canvas usage flow.** The workflow label should match designer language, and scan behavior should feel deliberate rather than side-effect driven.
11. **Better first-run guidance after setup.** The current onboarding does not do enough to gradually introduce generators, modes, sync, and maintenance workflows.
12. **More consistent visibility for generated-group upkeep state.** Generated state already appears in the token list, but through several disconnected patterns rather than one coherent status model.

## 7. Recommended Information Architecture

The strongest end-state IA shape for the current product is:

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

### Why this structure fits the target user

It does four useful things at once:

1. **Preserves the designer's mental model.** Designers mostly move between authoring, using, and syncing.
2. **Reduces Library contention.** `Health` and `History` stop competing with token editing inside the same body slot.
3. **Keeps Canvas first-class.** Using tokens in design work stays visible and explicit.
4. **Gives developer features a clear home without cluttering the designer's primary workflow.** `Export` and `Versions` remain visible, but they move out of the primary task path without being hidden.

### Library

`Library` should become three persistent sub-sections:

- **Tokens**: token tree, editor, generators, collection setup, compare, import
- **Health**: issue review and maintenance workflows
- **History**: recent operations, checkpoints, rollback-oriented review

Inside `Tokens`, the editor should remain a side panel and stop collapsing when the user briefly moves into related maintenance views.

### Canvas

`Canvas` should keep:

- **Selection**
- **Usage**

`Canvas` is already the right place for binding, suggestions, and analysis. The main improvement is to reflect active selection context back into Library more aggressively and to make analysis scans feel explicit.

### Sync

`Sync` should be a single top-level primary workspace focused on one job:

- compare local tokens with Figma variables and styles
- resolve real conflicts
- apply changes

This should be the designer-facing output surface.

### Export and Versions

`Export` and `Versions` should remain visible, but as quieter explicit entries rather than children of `Share`.

This is the target structure, not a cue to hide them immediately. Keep them explicit until the shell has a clear secondary home for them.

### Contextual surfaces that should stay contextual

These still make sense as occasional contextual or modal tools:

- Import
- Compare
- Color Analysis
- generator editing
- collection setup

The mistake today is not that contextual tools exist. The mistake is that too many major workflows are only reachable that way and too many adjacent workflows still clear each other.

## 8. Specific UX Fixes

These changes can ship independently of the broader IA restructuring.

### 8.1 Rename `Share` to `Sync`

This is the most obvious naming fix. The current label does not describe the designer's task.

### 8.2 Rename the Canvas workflow label `Coverage` to `Usage`

Designers ask "where is this used?" more often than "what is the coverage?"

Apply this to navigation, tabs, onboarding, and workflow copy. Keep `Coverage` only where a panel is literally measuring coverage as a metric.

### 8.3 Preserve the condensed toolbar, but improve state visibility

Do not overcorrect by forcing everything into one overflow menu.

The current toolbar is already reasonably compact. The better fix is:

- clearer active-state summaries
- stronger filter and inspect cues
- better visibility when selection-aware filtering is active
- simpler chip handling when many filters are on

### 8.4 Let the token editor stay pinned

When editing an existing token, the side-panel editor should survive movement into nearby Library workflows such as `Health` and `History`.

Create mode can remain a larger takeover when needed.

The prerequisite is architectural: separate editing state from contextual maintenance routing rather than relying on navigation changes alone.

### 8.5 Add `Copy to all modes`

This is the highest-value missing authoring control.

### 8.6 Add collection-level `Sync to Figma`

Keep group sync in the token tree and add a matching collection-level action in the collection rail.

### 8.7 Surface selection context in Library proactively

When a Figma selection exists, Library should not make the user hunt for "related to selection" inside a filter menu.

The preferred direction is:

- make selection context visible immediately
- provide a clear one-click scope into the related tokens
- avoid silently changing the user's browsing scope with no explanation

### 8.8 Make health more ambient and make "issue" mean one thing

The current header count is a start, not the finish.

Add health visibility at the collection and token level:

- issue counts in the collection rail
- inline issue markers on affected tokens
- clearer entry into `Health` from where the problem is visible
- one stable definition of what counts as an issue across row badges, filters, health totals, and warning banners

### 8.9 Frame rename safety as the default workflow

Keep the current alias-update safeguards, but make them read like the standard rename path rather than an advanced side feature.

### 8.10 Rephrase `Duplicate` as `Create from this token`

The capability already exists. The language should match the designer's intent.

Also improve the default post-duplicate naming flow so it feels like creating a new authored token, not generating a technical `-copy` path.

### 8.11 Keep notifications state, but give entries explicit destinations

Do not remove the underlying model that can power actionable system feedback.

Instead:

- reduce generic toast-history behavior
- store explicit navigation targets with notifications instead of inferring them from message copy
- connect entries to concrete destinations
- make the inbox quieter once Health and Sync carry more ambient state

### 8.12 Make Canvas analysis scans more explicit

Entering analysis views should feel intentional, not like a side effect.

Good options:

- require an explicit scan action the first time
- make scan state more obvious before results appear
- remember recent results so switching back into the view feels immediate when possible

### 8.13 Show modes and status in the collection rail

Collections are the primary authored container and modes are core to the Figma mental model.

The rail should communicate more than token count alone:

- mode count
- prominent multi-mode indication
- relevant issue or warning summary at the collection level

### 8.14 Use one product naming hierarchy consistently

If the product keeps `Library` as the workspace and `Tokens` as a subsection, that hierarchy should be used consistently in onboarding, import follow-up guidance, health routing, and command language.

The same applies to `Health` versus `Audit`. The chosen direction is to standardize on `Health` as the single maintenance term.

## 9. Naming Audit

These are the remaining high-impact naming fixes.

| Today | Change to | Why |
|-------|-----------|-----|
| **Share** | **Sync** | Matches the designer's primary output task. |
| **Canvas `Coverage` workflow label** | **Usage** | Matches designer language for "where is this used?" workflows. |
| **Coverage metrics** | Keep as **Coverage** where literal | Still accurate when a panel measures tokenization coverage as a percentage. |
| **Scopes** | **Applies to** or **Conditions** | More legible in designer-facing generator and metadata flows. |
| **Health / Audit** | **Health** | One maintenance concept should not have two product names. |
| **Library / Tokens** | Use one hierarchy consistently | Users should not have to infer whether these are the same place or different places. |
| **Duplicate** | **Create from this token** | Better matches designer intent. |
| **Resolver files / publish routing / orphan cleanup** | Keep, but hide behind advanced disclosure | Legitimate concepts, shown too early. |

These can stay as-is:

- **Alias**
- **Modes**
- **Collections**
- **Versions**
- **Export**

## 10. Code Architecture Implications

The code structure mirrors the UX problem.

- `App.tsx` is still very large at roughly 1,956 lines.
- `PanelRouter.tsx` is still very large at roughly 1,645 lines.
- The UI currently spans roughly 216 component files and 91 hooks.

The most important structural smell is not just file size. It is that the product still encodes too many overlapping workflow models:

- the routing model coordinates too many Library-only contextual surfaces
- editing and maintenance views are still treated as mutually exclusive state
- issue and status signals are split across multiple independent pipelines
- notification destinations are inferred from message text rather than carried as explicit state
- the shell already has some of the subsection infrastructure it needs, which makes state coupling the higher-priority cleanup

That means the product should not keep adding major Library workflows until the surface model and feedback model are simplified.

The cleanest implementation strategy is:

1. separate pinned editing state from Library maintenance routes
2. make `Health` and `History` persistent Library sections using the existing shell section model
3. unify issue/status pipelines and notification targets
4. rename and reorganize `Share` into `Sync`, and only move `Export` and `Versions` once a real secondary home exists
5. only then continue layering more tooling on top

This would improve both the user experience and the maintainability of the code.

## 11. Chosen Direction

The following decisions are now the intended product direction for future work:

- **State-first and structure-aware.** Use the existing shell section model where possible, but solve the mutually exclusive editor-state problem before larger navigation moves.
- **`Library` becomes a persistent three-section workspace.** The sections should be `Tokens`, `Health`, and `History`.
- **The token editor stays pinned across Library sections once opened.** Moving between `Tokens`, `Health`, and `History` should not discard active editing context.
- **`Canvas` stays first-class.** It should keep `Selection` and `Usage`, and Library should reflect active selection context more clearly.
- **`Share` becomes `Sync`.** `Sync` remains a primary workspace.
- **`Export` and `Versions` keep a clear explicit home.** They should become quieter than the primary sync workflow, but they should not be hidden or collapsed into utilities.
- **`Health` becomes the single maintenance term.** Avoid parallel `Audit` naming for the same concept.
- **The inbox becomes quieter, not more central.** Fix destination reliability, but let `Health` and `Sync` become the primary homes for system state.
- **`Copy to all modes` is the highest-priority missing authoring capability.**

This means the product should stop treating navigation, editor state, maintenance state, and notification routing as separate cleanup tracks. They are one UX program and should be sequenced that way.

## 12. Actionable Task List

The task list below is intentionally written for autonomous agents. It focuses on product outcomes and scope boundaries rather than implementation instructions.

### Wave 1 - Naming and state-model foundation

1. **Rename the primary output workflow from `Share` to `Sync`.**  
   Update the product language so the designer-facing output workflow is consistently described as `Sync`.

2. **Standardize maintenance naming on `Health`.**  
   Remove `Health` / `Audit` drift and make `Health` the only section-level maintenance concept in the product.

3. **Rename the Canvas workflow label `Coverage` to `Usage`.**  
   Use one clear term for the designer-facing canvas workflow across navigation, headers, onboarding, and follow-up guidance. Keep literal coverage terminology only in metric panels.

4. **Separate pinned editing state from Library maintenance routes.**  
   Make active token editing context durable while the user checks `Health`, `History`, and other nearby Library workflows.

5. **Replace inferred inbox routing with explicit destinations.**  
   Keep the notification model reliable, but stop deriving navigation from toast prose.

### Wave 2 - Library structure and context

6. **Turn `Library` into a persistent three-section workspace.**  
   Create stable `Tokens`, `Health`, and `History` sections so those workflows no longer compete for one body slot.

7. **Keep contextual tools contextual, but quieter.**  
   Re-home secondary tools so `Compare`, `Import`, `Color Analysis`, collection setup, and generator editing stop competing with the primary Library structure.

8. **Surface selection context proactively inside Library.**  
   When a Figma selection exists, make the related Library scope obvious and easy to enter without silently changing the user's browsing context.

9. **Preserve preview and editor context while moving between nearby Library tasks.**  
   Avoid closing useful adjacent surfaces simply because the user opened another related tool.

### Wave 3 - Health and system feedback

10. **Unify the meaning of `Health` across the product.**  
    Make issue counts, warnings, generated-state signals, and maintenance entry points use one coherent model of what needs attention.

11. **Surface Health at the collection and token levels.**  
    Make collections and token rows communicate meaningful maintenance state so `Health` is not only visible after entering a dedicated section.

12. **Consolidate generated-group state into the Health model.**  
    Stop treating stale generated state as a parallel warning system with its own separate logic and emphasis.

13. **Align toolbar counts, filters, row badges, and Health totals.**  
    The same user-facing issue language should mean the same thing across Library and Health.

### Wave 4 - Core authoring workflow gaps

14. **Add `Copy to all modes`.**  
    Introduce the missing multi-mode authoring action designers expect when working across modes.

15. **Add collection-level sync from Library.**  
    Complement existing group sync with a collection-level sync entry point in the collection workflow.

16. **Reframe `Duplicate` as `Create from this token`.**  
    Make the existing capability read like a normal authoring flow rather than a technical clone command.

17. **Make rename safety feel like the default workflow.**  
    Keep reference-safe rename behavior, but present it as the standard rename path rather than as a warning-heavy advanced case.

18. **Make multi-select feel like a first-class editing mode.**  
    Improve the clarity and momentum of bulk workflows once the user enters selection mode.

### Wave 5 - Secondary workflows, collection comprehension, and onboarding

19. **Give `Export` and `Versions` a quieter but explicit home.**  
    Move them out of the designer's primary sync path once the shell has a real secondary navigation home. Do not hide them inside utilities.

20. **Upgrade the collection rail to communicate the real container model.**  
    Make collections easier to choose and understand by surfacing more than token count, especially mode structure and relevant status.

21. **Tighten the first-run path after setup.**  
    Improve the handoff from initial setup into day-to-day work so designers gain confidence in collections, modes, sync, and maintenance flows faster.

22. **Use one consistent workspace hierarchy everywhere.**  
    Ensure navigation, onboarding, import follow-up, commands, and empty states all reinforce the same `Library` / `Tokens` / `Health` / `History` structure.

## 13. Suggested Parallelization

The work should still be staged, but several tasks can move in parallel once their parent wave starts.

- In **Wave 1**, naming cleanup can run separately from structured notification routing, but the editor-state split should be treated as the critical path.
- In **Wave 2**, Library sectioning and contextual-tool demotion can move in parallel once the editor-state groundwork is in place.
- In **Wave 3**, Health-model unification and generated-state consolidation are closely related, while collection-level and token-level surfacing can progress alongside them.
- In **Wave 4**, `Copy to all modes`, collection-level sync, create-from-token framing, and multi-select improvements can run as separate work items.
- In **Wave 5**, secondary-navigation cleanup, collection-rail improvement, and onboarding cleanup can proceed independently once the primary shell structure is stable.
