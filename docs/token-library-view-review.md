# TokenManager Product Review

## Purpose

This document reviews TokenManager as a product experience.

It focuses on:

- screens
- flows
- information architecture
- prioritization
- clarity
- user confidence
- day-to-day usability

It does not review code quality or implementation structure.

The goal is simple:

Does TokenManager feel easy to understand, trustworthy, empowering, and well-shaped for the people it is built for?

## Audience

The primary audience is:

- Figma UI designers
- UX designers
- design system creators and maintainers

The secondary audience is:

- developers involved in export, sync, governance, and versioning

The product should feel like a design tool first.

That does not mean hiding developer-facing power.

It means ranking that power correctly so designers can work fluently without feeling like they are operating internal infrastructure.

## Product Context

TokenManager lives inside a Figma-centered workflow.

That matters.

Users are already inside a design environment with limited space, strong expectations, and a clear mental model. They do not want to learn an abstract product map before they can do useful work.

The most important anchors in this product are:

- collections
- modes
- token browsing
- token editing
- token comparison
- token application in actual design work

These should dominate the product’s shape.

This project is also in active development with no legacy user base to protect.

That is a major advantage.

It means the product can be simplified aggressively. It does not need compatibility-driven complexity, soft transitions, or product architecture that preserves every prior concept.

If something is bloated, confusing, or over-promoted, it should be consolidated, demoted, or removed.

## Executive Verdict

TokenManager is already functionally strong.

It is not underpowered.

It is over-exposed.

The product currently presents too many concerns as first-class, too many expert tools as ambient, and too much methodology as implied default behavior.

The result is a tool that feels:

- capable
- serious
- technically rich
- unusually useful in some areas

But also:

- fragmented
- over-instrumented
- more operational than design-native
- harder to parse than it should be
- less calm than the underlying product idea deserves

The main issue is not styling.

The main issue is product shape.

This is not a feature gap problem.

The next leap in quality will come from consolidation, clearer ranking, stronger progressive disclosure, and more confidence about what should be primary versus advanced.

## Overall Assessment

The product has a strong engine and a mostly correct core model.

What is right:

- collections are the correct primary container
- modes are the correct variation model
- showing a collection’s modes together is correct
- the library should be table-centered
- canvas inspection and application add real value
- governance and delivery workflows are worth supporting

What is wrong:

- too many jobs are given equal visual and structural weight
- the shell communicates product architecture too early
- advanced capabilities leak into the default experience
- onboarding teaches a methodology instead of simply helping users begin
- the everyday authoring loop does not dominate strongly enough

The product is closest to excellent when it helps a designer:

1. choose a collection
2. scan tokens and mode values
3. edit confidently
4. apply tokens in Figma
5. fix issues when needed

Whenever the experience moves away from that core loop, it becomes less calm and less legible.

## What Is Working

Several decisions are already strong and should be preserved.

### 1. The canonical authoring model is correct

Collections and modes are the right backbone.

The product is strongest when it stays faithful to that model and avoids introducing parallel abstractions.

### 2. The library is correctly centered on token scanning

A serious token tool should not hide the system behind oversized cards or wizard-only flows.

A scan-friendly table is the right center of gravity.

### 3. Canvas workflows are a genuine differentiator

The product is unusually strong when it helps users connect token authoring to actual design work.

Especially valuable:

- seeing bindable properties
- surfacing likely token matches
- extracting unbound values
- remapping stale references

These are not side features.

They are some of the most empowering parts of the product.

### 4. The product takes sophisticated work seriously

Health, export, sync, history, and versioning are all legitimate capabilities.

The problem is not their existence.

The problem is how close they currently sit to the everyday authoring path.

### 5. The overall visual tone is mostly disciplined

The product does not feel like generic AI-generated SaaS.

It is relatively restrained, dense, and tool-like in a credible way.

The problem is not decorative excess.

The problem is cognitive and structural excess.

## Core Diagnosis

The clearest product diagnosis is this:

TokenManager currently feels like several good tools sharing one shell rather than one clear product with supporting capabilities around it.

That creates interpretation cost.

Users are repeatedly asked to understand:

- workspace structure
- advanced search behavior
- alternate views
- maintenance surfaces
- review surfaces
- delivery surfaces
- setup logic
- system state

before the core authoring job fully takes ownership.

That is backwards.

The product should feel obvious first.

Depth should emerge later.

## Main Problem Areas

## 1. The shell is too fragmented

Too many top-level destinations have independent identity.

This makes the product map feel important in itself.

Why this matters:

- users learn navigation before they learn the work
- primary and secondary jobs feel too equal
- the product feels broader than it feels coherent

This is the single biggest structural problem.

## 2. The library header behaves like a control deck

The library header currently behaves more like an operations surface than a workspace header.

It asks users to parse too much at once:

- creation choices
- health cues
- view changes
- filters
- structured search behavior
- edit actions
- active state indicators

Why this matters:

- the user’s eye lands on machinery before content
- the table loses dominance
- the everyday experience feels instrumented instead of natural

The library should feel like a place to work, not a cockpit.

## 3. The token workspace has too many global modes

The main library area supports too many alternate personalities.

Examples of the pattern:

- alternate browsing modes
- alternate presentation modes
- expert query behavior
- cross-collection search behavior
- review overlays
- batch editing states
- preview states
- inspection-related filters

Any one of these may be reasonable.

Together they make the workspace feel unstable.

Why this matters:

- users cannot form one strong mental model of the library
- the default surface feels less trustworthy
- basic browsing and expert workflows blur together

## 4. Search is too power-shaped by default

Advanced search is useful.

It should not define the emotional default of the product.

Most designers primarily want to:

- find a token by name
- narrow to a familiar area
- scan a relevant subset

They do not want the default behavior to feel query-driven or syntax-driven.

Why this matters:

- the product leans toward recall instead of recognition
- simple findability inherits too much complexity
- the tool feels more technical than it needs to

Search should be plain first and advanced second.

## 5. The product overuses global power instead of contextual power

Too many actions are available at the workspace level rather than surfacing when the user has enough context to need them.

That reduces the value of progressive disclosure.

Why this matters:

- users see decisions too early
- advanced actions feel noisy instead of empowering
- everyday work inherits expert complexity

More power should live in:

- the selected collection
- the selected token
- the selected group
- the current canvas selection
- the current issue or review task

Less power should be ambient.

## 6. Onboarding is too methodological

The current first-run split between starting fresh and importing is directionally correct.

The next step is where the product gets too opinionated.

The “start new” path quickly implies a preferred authored sequence:

- create a collection
- add modes
- generate foundations
- create semantics

That may be a useful accelerator.

It should not feel like the product’s implied definition of getting started.

Why this matters:

- the tool feels prescriptive too early
- generation workflows get over-ranked
- the product starts to feel like a system for implementing a doctrine instead of helping users author tokens

The best onboarding is simpler:

- connect if needed
- create or import
- land in the library
- begin authoring

Accelerators should stay optional.

## 7. Canvas is valuable, but still too dense

Canvas is one of the strongest areas in the product.

It solves real problems.

But it still stacks too many controls and task paths in one narrow surface.

Why this matters:

- the area is helpful, but not yet calm
- valuable features compete for attention instead of reinforcing one another
- the strongest application workflow still feels busier than it should

Canvas should feel immediate and focused.

It should present:

- what is selected
- what can be bound
- the best likely matches
- the next best action

Everything else should feel secondary.

## 8. Review and delivery work are not grouped strongly enough

Health, history, sync, export, and versions all matter.

They are not equally close to the primary job.

Right now they still feel flatter than they should.

Why this matters:

- nearby quality work and downstream delivery work blur together
- secondary areas feel too exposed
- the shell communicates breadth more strongly than flow

The relationship should be clearer:

- health is quality work close to authoring
- canvas is application work adjacent to authoring
- sync, export, and versions are delivery and governance work
- history belongs more with governance than with daily authoring

## 9. Too much system state is ambient

Connection, counts, issues, sync status, and operational cues are important.

The problem is not visibility itself.

The problem is visible state that appears before the user knows whether they should care.

Why this matters:

- passive warnings create anxiety
- the product feels more operational than creative
- informational state can crowd out the primary task

Trust comes from relevant state, not maximum state.

## 10. The product voice is precise, but still slightly infrastructural

The voice is mostly disciplined, which is good.

But it still sometimes sounds like internal tooling or workflow software rather than a design-native product.

Why this matters:

- advanced tasks feel heavier than necessary
- designer-facing flows feel more technical than they should
- the overall tone drifts away from the quiet confidence described in the design context

The product should sound:

- precise
- capable
- calm
- design-literate

It should sound less like operational software.

## 11. Some secondary areas feel more present than useful

There are places where the structure of a destination is clear before the everyday value of that destination is clear.

Why this matters:

- the product feels broad even when parts of it are only occasionally relevant
- sparse states can feel like exposed infrastructure instead of purposeful tools
- users spend attention on understanding areas they may not yet need

Secondary spaces should feel intentionally invoked, not permanently awaiting justification.

## 12. Density amplifies every other issue

The problem is not that the product is compact.

A Figma plugin should be compact.

The problem is compactness combined with too many simultaneously visible concepts.

Why this matters:

- scanning becomes tiring
- status and controls compete too easily with values
- the interface feels busier than the model really is

The answer is not more decoration or larger surfaces.

The answer is stronger hierarchy and fewer visible concerns at one time.

## Strategic Implication

This is not mainly a question of what to add.

It is a question of what to rank, what to merge, what to hide until invited, and what to cut.

The product already does a lot.

The next phase should be about making that capability legible.

The highest-value move is simplification before expansion.

## Recommended Product Direction

## 1. Reframe the product around three jobs

The product should be organized around three clear domains:

### Authoring

Where users:

- choose collections
- browse tokens
- compare mode values
- edit tokens
- manage collection structure

This is the center of the product.

### Application

Where users:

- inspect the current Figma selection
- bind tokens
- extract values
- remap references
- validate token usage in real design work

This is the bridge between the system and the canvas.

### Delivery

Where users:

- review issues
- sync and publish
- export outputs
- inspect history
- work with versions and governance

This is important, but secondary.

The shell should communicate that ranking clearly.

## 2. Make Library the unmistakable home base

The library should feel like the product’s natural home, not one peer destination among many.

It should answer immediately:

- where am I
- which collection is active
- what modes exist here
- what values am I editing
- how do I make a change

Users should not need to decode the product before they can work.

## 3. Rebuild the library around one stable default shape

The normal library experience should be:

### Collections rail

- lightweight
- navigational
- names first

### Compact workspace header

- current collection
- one create entry point
- search
- one advanced entry point

### Token table

- dominant focal area
- one identity column
- one visible column per mode
- values easy to compare and edit

### Persistent contextual inspector

- token or group detail
- metadata
- alias context
- advanced actions
- related review context when relevant

This should be the normal authoring experience, not a special mode.

## 4. Keep one primary browsing mode

The table should feel stable.

The product should avoid letting the default authoring area constantly change character.

Suggested direction:

- keep one primary token browsing mode
- treat alternate representations as advanced tools
- reduce the number of global state shifts in the main workspace

The goal is not less power.

The goal is a stronger default.

## 5. Make search plain by default

Search should start as:

- name
- path
- maybe description

Then allow refinement.

Advanced filtering should still exist, but it should feel explicitly invited rather than ambiently implied.

Suggested direction:

- plain search first
- advanced filters second
- saved filters as expert tooling
- cross-collection search as advanced behavior, not common default behavior

## 6. Put more explanatory weight into the inspector

The inspector is the best place to reconcile power and calmness.

It should absorb more of what currently clutters the default authoring surface.

It should be the home for:

- metadata
- alias chains
- usage context
- dependency context
- lifecycle state
- advanced editing
- review context

That frees the table to remain focused on:

- identity
- structure
- values

## 7. Keep Canvas separate, but simplify its visible choices

Canvas should remain a dedicated area.

That separation is good.

But it should feel like a focused application workspace rather than a dense utility panel.

Suggested direction:

- prioritize the selected object and its properties
- surface the best likely token matches more clearly
- collapse secondary filters until requested
- make extract, remap, and apply feel like distinct task paths instead of parallel controls

Canvas should feel empowering and immediate.

## 8. Consolidate delivery work more aggressively

Health, sync, export, history, and versions should remain.

But their grouping should be more deliberate.

Suggested direction:

- keep lightweight issue awareness near authoring
- keep full quality review inside the broader delivery space
- group sync, export, history, and versions as governance and delivery work
- avoid making each one feel like a separate product

This would reduce fragmentation without cutting important capability.

## 9. Make onboarding momentum-based, not curriculum-based

The product should not imply that users need to complete a methodology before they can begin.

Suggested direction:

- help users connect if needed
- let them import or create
- land them in the library quickly
- offer optional accelerators for modes, foundations, and semantics

The product should encourage motion, not coursework.

## 10. Clarify everyday work versus advanced work

This distinction should shape the whole experience.

Everyday work:

- choosing a collection
- finding tokens
- editing values
- adding groups
- adding modes
- binding tokens in Figma

Advanced work:

- generators
- structured search
- large-scale batch changes
- publish routing
- export presets
- versioning and rollback
- governance workflows

Both matter.

They should not look equally central.

## 11. Improve trust through actionability

Important state should be clear.

But the product should avoid ambient operational noise.

Suggested direction:

- show only the most relevant status for the current task
- tie warnings to obvious next steps
- keep informational state quiet when it does not affect the current flow
- make destructive actions explicit and calm

Trust comes from clarity and recoverability, not constant signaling.

## 12. Tighten the designer-facing voice

The product should consistently sound:

- precise
- calm
- confident
- design-literate

It should reduce moments where the language feels infrastructural, procedural, or system-admin-like.

## What To Preserve

The review is not arguing for simplification through reductionism.

These directions are strong and should be preserved:

- collections as the primary container
- modes as first-class authored values
- simultaneous visibility of collection modes
- table-centered authoring
- canvas application workflows
- issue review capability
- delivery and governance depth

The goal is not to make the product smaller in ambition.

The goal is to make the ambition readable.

## What To Simplify Or Cut Back

These areas should be questioned aggressively:

- top-level destinations that compete with the core loop
- global controls that could become contextual
- alternate global library modes
- onboarding steps that imply a preferred doctrine
- operational status that is visible before it is useful
- expert search behavior in the default flow

If a capability remains valuable but does not need to be visible all the time, it should move down a level.

## What Not To Do

The wrong next move would be:

- adding more top-level areas
- adding more persistent controls
- adding more always-visible status
- preserving every current capability at the same prominence
- treating this as mainly a visual refresh

That would leave the core problem intact.

## High-Value Areas To Work On Next

## A. A real everyday authoring workspace

The library should become calmer, more stable, and more obviously primary.

This is the single highest-value product move.

## B. A persistent contextual inspector

This is likely the best way to make the product both simpler and more powerful.

It allows advanced context without overloading the table.

## C. A stronger distinction between authoring, applying, and delivering

Users should feel a clear difference between:

- browsing and editing tokens
- applying them in Figma
- reviewing and shipping them

That structure should become self-evident.

## D. Less methodological onboarding

The start experience should help users begin real work quickly rather than implicitly teaching an authored philosophy.

## E. Cleaner transitions between related jobs

Movement between:

- authoring
- issue review
- canvas application
- delivery

should feel like one coherent product, not travel between neighboring tools.

## F. Better sparse and low-data states

Secondary areas should feel purposeful when empty or lightly used.

They should not feel like exposed product infrastructure waiting for justification.

## G. More ruthless ranking of generators

Generators are valuable accelerators.

They should not dominate the implied definition of authoring.

## Product Decision

The strongest recommendation is:

Simplify and consolidate before adding meaningful new breadth.

TokenManager does not currently need more major surface area.

It needs:

- a clearer center
- fewer equally promoted concerns
- better contextualization of advanced capability
- a calmer everyday experience

If new functionality is added, it should support the core flow rather than widen the shell.

The best additions are likely to be:

- a better inspector
- stronger transitions between authoring and canvas application
- more contextual review
- better prioritization of advanced tools

not more major destinations.

## Desired Outcome

A successful overhaul should make TokenManager feel:

- easier to understand at first glance
- calmer during everyday work
- more aligned with how designers think inside Figma
- more trustworthy in setup and status handling
- more empowering in real design workflows
- more deliberate about where advanced work lives

The final product should not feel like the same complexity arranged more neatly.

It should feel like:

- one strong core workflow
- clearly ranked
- with surrounding power in the right places

That is the opportunity.
