# Token Library Product Review

## Purpose

This document reviews the plugin’s screens, flows, information architecture, and product priorities from a UX and product-design perspective.

It is intentionally not a code review.

The goal is to answer a simple question:

Does TokenManager currently feel easy to understand, trustworthy, empowering, and well-shaped for the people it is meant to serve?

## Audience

The primary users are:

- Figma UI designers
- UX designers
- design system creators and maintainers

The secondary audience is:

- developers participating in token governance, handoff, export, sync, and versioning

The product should primarily feel native to designers.

That does not mean hiding developer-facing capability.

It means ranking capability correctly so the product’s primary experience feels like a design tool first, and a delivery/governance system second.

## Context

TokenManager lives inside a Figma-centered workflow.

That should shape almost every product decision.

The strongest mental anchors are:

- collections
- modes
- token browsing
- value comparison
- token editing
- application to actual design work

This project is also in active development with no legacy user base to protect.

That is an advantage.

It means the product can be simplified aggressively.

It does not need compatibility-driven complexity, legacy concepts, or polite half-measures.

If a structure is confusing, bloated, or split across too many paradigms, it should be replaced rather than rationalized.

## Scope

This review focuses on the token library as the core authoring workspace, but it also includes the adjacent areas that shape how the library is understood:

- onboarding and setup
- connection and system state
- canvas application and inspection
- health and review workflows
- sync and publish flows
- export and versions

These areas matter because users do not experience the library in isolation.

## Executive Verdict

TokenManager is already functionally strong.

It is not a weak product because it lacks capability.

It is a confusing product because it gives too many concerns equal importance.

The main issue is not aesthetics.

The main issue is product shape.

Right now the plugin feels broader than it feels coherent.

It often behaves like several powerful tools sharing a shell rather than one clear authoring product with supporting workflows around it.

The result is a product that feels:

- capable
- serious
- custom
- technically rich

But also:

- over-segmented
- too mode-heavy
- too eager to expose advanced states
- unevenly prioritized
- more operational than design-native

This is not a case where the answer is “add more features.”

The product needs better ranking, better consolidation, and more ruthless progressive disclosure.

## Overall Assessment

The plugin has a strong engine and a partially strong product model.

The core model is correct:

- collections are the right primary container
- modes are the right variation model
- showing modes together is the right authoring behavior
- table-based authoring is the right center of gravity
- canvas inspection and application are genuinely useful

The problem is that the product does not consistently protect that model.

Instead, it frequently asks the user to understand:

- product architecture
- advanced workflows
- multiple browsing modes
- multiple review modes
- multiple delivery surfaces
- multiple setup concepts

before the primary job feels settled.

That is backwards.

The primary job should feel obvious first.

Depth should become visible later.

## What Is Working

Several important directions are already right and should be preserved.

### 1. The canonical authoring model is fundamentally strong

The product is built around collections and modes rather than around a muddled mix of sets, themes, and alternate abstractions.

That is the right foundation.

### 2. The library is correctly table-centered

A token tool for serious work should let users scan names and values at scale.

The table is the right primary interaction surface.

### 3. Canvas workflows add real value

The plugin is strongest when it helps designers move from authored tokens into actual design work:

- inspecting current properties
- suggesting likely matches
- extracting unbound values
- remapping stale references

Those are not decorative features.

They are genuinely empowering.

### 4. The product is not trying to be simplistic

It is correct to support health, sync, export, history, and versions.

The issue is not that these areas exist.

The issue is how prominently and separately they are presented.

## The Core Product Problem

The plugin currently has too many first-class surfaces for one primary job.

That is the clearest diagnosis.

The user’s main task is:

1. choose a collection
2. browse tokens
3. compare values across modes
4. edit confidently
5. apply and validate in design work

Instead, the product often feels like it is asking the user to choose between:

- authoring
- inspection
- review
- sync
- export
- versioning
- setup
- advanced maintenance

before the authoring loop has fully taken ownership.

That splits attention and weakens fluency.

## Main Problem Areas

## 1. The shell is too fragmented

The product currently gives too many areas top-level identity.

This makes the architecture feel more important than the work.

Why this matters:

- users have to learn the product map early
- primary and secondary jobs feel equally weighted
- the plugin feels broader than it feels purposeful

The result is not “power.”

The result is interpretation cost.

## 2. The library header behaves like a control surface

The main library view currently tries to carry too much of the product’s control model at once.

The user is asked to parse:

- creation entry points
- view modes
- filter entry points
- edit actions
- health cues
- search modes
- state chips

before the table can become the focal point.

Why this matters:

- the user’s eye lands on controls before content
- the core job feels more instrumented than natural
- even experienced users pay a small but constant cognitive tax

The library should feel like a workspace header, not an operations toolbar.

## 3. The token table has too many alternate modes

The table is the correct center of the product, but it currently supports too many global states and alternate ways of behaving.

This includes things like:

- alternate browsing or presentation modes
- cross-collection search behavior
- structured query behavior
- preview states
- review overlays
- batch workflows
- inspection-related filters

Any one of these can be valid.

Taken together, they make the main workspace feel unstable.

Why this matters:

- users cannot build one strong mental model of “how the library works”
- basic browsing is mixed with expert workflows
- the table feels less trustworthy as a default workspace

## 4. The product overuses global power instead of local context

Too many actions are available at the workspace level when they should be contextual.

The product often exposes capability globally rather than revealing it when the user has selected a collection, a token, a mode, or a specific problem.

Why this matters:

- users see decisions before they have enough context to make them
- advanced actions feel noisy instead of powerful
- progressive disclosure is weakened

The product should rely more on:

- contextual inspectors
- row actions
- collection setup
- task-specific panels

and less on globally visible controls.

## 5. The collection rail is slightly too informative, but that is not the main issue

The collection rail could be calmer.

It currently includes counts and issue metadata that make it heavier than pure navigation.

That said, this is not the biggest problem in the product.

The rail is comparatively restrained.

Why this matters:

- it still adds to the information load
- it pushes the rail toward inspection rather than orientation
- it participates in the general feeling of “everything is visible at once”

But the larger source of complexity is still the workspace header and the number of primary surfaces.

## 6. Search leans too far toward power-user behavior in the default experience

Advanced search and filtering are useful.

They are not the right emotional default for most designers.

Most users primarily want to:

- find a token by name
- narrow to a familiar area
- scan a small relevant subset

They do not want the product’s default voice to feel query-driven.

Why this matters:

- the product leans toward recall instead of recognition
- it feels more tool-like than design-like
- simple findability inherits unnecessary abstraction

The right model is plain search first, advanced filtering second.

## 7. The library still carries too much detail that should live in an inspector

The product has the right instinct in using contextual detail surfaces.

It just does not rely on them heavily enough.

The library still exposes too much state, too many hints, and too many secondary interpretations directly in the default browsing surface.

Why this matters:

- the main table becomes harder to scan
- hierarchy weakens
- users read status before they read values

The product should make the inspector do more of the explanatory work.

## 8. Onboarding is directionally right, but still too opinionated

The first-run fork between “start new” and “import existing” is correct.

That is the right high-level split.

The problem is the next layer.

The “start new” path leans too quickly into a specific authored recipe:

- create a collection
- add modes
- generate foundations
- create semantics

That path will fit some teams.

It should not feel like the implied universal path.

Why this matters:

- the product feels more prescriptive than it needs to
- generators become over-emphasized
- the first-run experience can feel like a methodology choice rather than a simple beginning

The better default is:

- create or import
- land in the library
- start authoring

with optional guided accelerators layered on top.

## 9. The relationship between Library and Canvas is valuable but under-shaped

The plugin is at its best when it supports two connected activities:

- authoring token systems
- applying and validating them in design work

That relationship is real product value.

But it does not yet feel like one coherent workflow.

Why this matters:

- the two areas can feel like sibling tools instead of adjacent steps
- library-specific and canvas-specific modes can bleed into each other conceptually
- the product narrative becomes less clear

Library should feel like the source of truth.

Canvas should feel like the place where authored tokens meet actual design decisions.

## 10. Canvas is empowering, but still too control-dense

Canvas is one of the product’s strongest areas.

It provides tangible help:

- matching likely tokens
- extracting unbound values
- remapping stale bindings
- applying to selection or page

That is excellent.

The problem is presentation.

The surface still stacks too many controls, bands, and parallel actions at once.

Why this matters:

- the user gets value, but through a relatively dense surface
- the strongest flow in the product still feels more technical than necessary
- some of its good ideas do not translate into a calm experience

Canvas should become the benchmark for usefulness, with less visible machinery.

## 11. Review and delivery work need clearer grouping

Health, history, sync, export, and versions are all legitimate.

They are not equally close to the primary job.

Right now they are not grouped in a way that makes their relationship obvious.

Why this matters:

- nearby review work and downstream delivery work blur together
- the product feels flatter than it should
- some secondary areas feel too empty while others feel too exposed

In particular:

- health is close to authoring
- history is less close than health
- sync, export, and versions belong to a delivery and governance cluster

The current shape does not make that distinction strongly enough.

## 12. Density amplifies every other problem

The issue is not simply that the UI is compact.

Plugins often need compactness.

The issue is compactness combined with too many visible concepts.

Why this matters:

- scanning becomes tiring
- secondary information competes too easily with primary information
- the product feels more technical and less confident

The answer is not decoration.

The answer is stronger hierarchy and fewer simultaneously visible concerns.

## 13. System state is visible, but not always well-ranked

Connection, issue counts, sync readiness, and status signals are important.

But the product sometimes shows state before it is clear whether the user should care about it right now.

Why this matters:

- status can create anxiety instead of trust
- warnings can feel ambient rather than actionable
- the interface can feel more operational than design-oriented

The product should show the most important current state, not the maximum available state.

## 14. The voice is precise, but sometimes too infrastructural

The product generally avoids fluffy language, which is good.

But it sometimes speaks like a system console rather than a design tool.

Why this matters:

- terminology becomes heavier than necessary
- advanced actions feel more intimidating
- the emotional tone skews toward internal software

Designer-facing products should feel precise and capable without sounding infrastructural.

## What This Means Strategically

This is not mainly a feature gap problem.

This is a ranking problem.

The product already does a lot.

The next leap in quality will come from deciding:

- what should be primary
- what should be secondary
- what should be contextual
- what should be hidden until invited
- what should be merged
- what should be removed

The biggest improvement would come from consolidation, not expansion.

## What Should Be Preserved

Not everything needs to change.

These directions are strong and should remain:

- collections as the primary container
- modes as first-class values
- simultaneous visibility of a collection’s mode values
- table-centered authoring
- contextual detail surfaces
- canvas application and inspection workflows
- advanced delivery and governance capability

The goal is not to make the product smaller in ambition.

The goal is to make the ambition readable.

## Recommended Overhaul Direction

## 1. Reframe the product around three jobs, not many workspaces

The product should be structured around three clear domains:

### Authoring

Where users:

- browse collections
- read tokens
- compare mode values
- create and edit tokens
- manage collection structure

This is the center of the product.

### Application

Where users:

- inspect the current Figma selection
- bind tokens
- extract values
- remap references
- validate token usage in design work

This is the bridge between token authoring and actual design execution.

### Delivery

Where users:

- review health and issues
- publish and sync
- export outputs
- inspect history and versions
- participate in governance

This is important, but secondary to day-to-day authoring.

The shell should communicate that ranking clearly.

## 2. Make Library the unmistakable home base

The library should feel like the product’s default home, not one major area among many equal peers.

It should feel calm, stable, and immediately understandable.

The user should not need to “decode the product” before editing tokens.

The library should answer, at a glance:

- where am I
- which collection is selected
- what modes exist here
- what values am I looking at
- how do I edit this

## 3. Rebuild the library around one default workspace shape

The ideal default workspace is:

### Collections rail

- lightweight
- clearly navigational
- focused on names first

### Compact header

- current collection
- one create entry point
- search
- one advanced menu entry point

### Token table

- dominant focal area
- one identity column
- one visible column per mode
- values easy to compare and edit

### Persistent contextual inspector

- token or group detail
- metadata
- advanced actions
- related review context
- history or usage when relevant

This should be the normal authoring experience.

Not an edge case.

## 4. Reduce alternate global modes in the library

The library should have fewer global personality shifts.

A user should not feel like the main table keeps changing what kind of tool it is.

Suggested direction:

- keep one main browsing mode
- treat JSON editing as advanced, not peer to the main table
- treat cross-collection searching as an advanced task, not a common default
- move some expert filters behind a clear advanced entry point
- avoid making batch and review states part of the default visual rhythm

The table should feel stable.

## 5. Make search plain by default

Search should start simple.

The advanced model should still exist, but it should not define the default experience.

Suggested direction:

- default to text search by token name or path
- let users refine after they have already found their area
- expose advanced filters as explicit “narrow further” behavior

Power users will still find advanced behavior.

Everyone else will get a calmer starting point.

## 6. Put more intelligence into the inspector

The inspector should carry more of the explanatory burden.

It should be the home for:

- metadata
- alias chains
- lifecycle state
- related references
- advanced edits
- review context
- usage or dependency context

This frees the table to stay focused on:

- identity
- structure
- values

That is the right split.

## 7. Keep Canvas separate, but simplify its visible controls

Canvas should remain its own area.

That separation is useful.

But it should feel like a focused application workspace, not a dense utility panel.

Suggested direction:

- prioritize the selected object and its bindable properties
- present likely matches and actions more cleanly
- collapse secondary filters until requested
- make extract, remap, and apply feel like clear task paths rather than parallel toolbar actions

Canvas should feel empowering, immediate, and less busy.

## 8. Consolidate review and delivery work

Health, sync, export, history, and versions should remain.

They should feel more deliberately grouped.

Suggested direction:

- keep health adjacent to authoring because it directly improves token quality
- move history closer to versions and broader governance work
- treat sync, export, and versions as one delivery cluster rather than separate peer products

This makes the product feel better ranked without cutting important capability.

## 9. Make onboarding less methodological

The first-run experience should feel confident and low-friction.

The right first fork is:

- start a new token system
- import an existing token system

After that, the product should help the user get into real work quickly.

Suggested direction:

- connection help should be precise and short
- creating a first collection should be the first authored step
- generating foundations and semantics should be optional guided accelerators
- the user should land in the library quickly

The product should invite momentum, not curriculum.

## 10. Clarify what is “everyday” versus “advanced”

This distinction should shape the whole experience.

Everyday work includes:

- choosing a collection
- finding tokens
- editing values
- adding modes
- creating groups
- applying tokens in Figma

Advanced work includes:

- generators
- large-scale bulk actions
- structured search
- specialized review flows
- publish routing
- export presets
- git and versioning operations

Both categories matter.

They should not look equally central.

## 11. Improve trust through actionability, not volume

Important system state should be obvious.

But not every possible signal should be ambiently visible.

Suggested direction:

- make warnings more directly tied to next steps
- keep informational state quiet when it does not affect the current task
- make destructive actions explicit and calm
- reduce passive anxiety-inducing counters unless they are actionable now

Trust comes from clarity, not from constant state emission.

## 12. Tighten the product voice

The product should sound:

- precise
- capable
- calm
- design-literate

It should sound less like:

- internal tooling
- infrastructure
- engineering workflow software

This is mostly a matter of wording, emphasis, and where advanced concepts are introduced.

## Areas Especially Worth Working On Next

Beyond the broad structural overhaul, these are especially high-value areas to improve.

## A. A real persistent inspector

This is likely the single most valuable addition to the day-to-day authoring experience.

The inspector is how the product can become both calmer and more powerful at the same time.

## B. Better distinction between overview and task mode

The user should feel a difference between:

- browsing and scanning
- editing deeply
- reviewing issues
- performing delivery work

Those states currently blur together too often.

## C. Better empty, sparse, and low-data states

Several secondary screens feel structurally present before they feel productively useful.

The product should make sparse states feel intentional and directed, not simply empty.

## D. Better prioritization of advanced generation workflows

Generators are useful.

They should not dominate the implied authoring model.

They should feel like accelerators layered on top of authored token work.

## E. Better mobility between related work

The user should be able to move clearly between:

- token authoring
- token quality review
- token application on canvas
- final publishing and export

That movement should feel like one coherent workflow rather than moving between neighboring tools.

## What Not To Do

The wrong next move would be:

- adding more top-level areas
- adding more persistent controls
- adding more always-visible status surfaces
- keeping every current capability equally promoted
- treating this as mainly a styling pass

That would preserve the underlying problem.

## Product Decision

The strongest recommendation is:

Simplify and consolidate before adding significant new functionality.

The product does not currently need a major expansion of breadth.

It needs a clearer center.

If new functionality is added, it should be in service of the central model.

The highest-value additions are likely to be:

- a better inspector
- clearer contextual review
- stronger transitions between authoring and application

not more major sections.

## Desired Outcome

A successful overhaul should make TokenManager feel:

- easier to understand on first glance
- calmer during everyday work
- more aligned with how designers already think in Figma
- more trustworthy in setup and state handling
- more empowering in actual design workflows
- more deliberate about where advanced work lives

The end state should not feel like “the same complexity arranged more neatly.”

It should feel like:

- the right core workflow
- clearly ranked
- with supporting power around it
- instead of on top of it

That is the opportunity.
