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

It does not review implementation details.

The question is not whether TokenManager is powerful enough.

It is.

The real question is whether that power is arranged in a way that feels native to Figma designers, clear under pressure, and trustworthy during everyday authoring.

## Audience

The primary audience is:

- Figma UI designers
- UX designers
- design system creators and maintainers

The secondary audience is:

- developers involved in export, sync, governance, and versioning

This matters because the product should optimize first for how designers think, not for how infrastructure is organized.

Developer-facing depth should stay present.

It should not dominate the primary authoring flow.

## Product Context

TokenManager lives inside Figma.

That means the product has to respect:

- constrained space
- fast scanning
- strong existing mental models
- low patience for abstract product structure

Users do not want to learn a system of destinations before they can do useful work.

They want to pick a collection, see token values, understand modes, make changes, and use those tokens in design work.

Everything else has to support that.

This project is also in active development with no userbase to protect.

That is an advantage.

It means complexity should not be preserved out of caution.

If a pattern is cluttered, confusing, duplicative, or too operational for the default workflow, it should be removed or demoted.

## Non-Negotiables

These are the product rules this review assumes.

### 1. Designers come first

The product should feel native to Figma designers and design system maintainers.

Naming, grouping, and flows should not require translation from developer-centric concepts.

### 2. Collections are the primary container

The product should keep collections as the main authoring anchor.

It should not drift back toward mixed models built around alternate container concepts.

### 3. Modes are equal, visible, and first-class

Every token value is a mode value.

When a collection has multiple modes, the UI should show those modes together and treat them as equal.

The product should not simplify itself by:

- reintroducing a base value concept
- hiding modes behind a picker
- presenting one mode as the real value and the others as secondary

Any simplification that breaks this mental model is the wrong simplification.

### 4. The table remains the center of the library

The product should not solve complexity by replacing the token table with cards, wizard-first flows, or setup-heavy surfaces.

The answer is better ranking, not abandoning the core scanning workflow.

### 5. Developer features need a clear home, not equal prominence

Export, versioning, sync, audit, and history are valid capabilities.

The mistake is not that they exist.

The mistake is letting them compete visually and mentally with everyday authoring.

## Executive Verdict

TokenManager is stronger as a capability engine than it is as a product.

That gap is now the main design problem.

The product feels:

- capable
- serious
- unusually useful in the right workflows

But also:

- over-exposed
- over-surfaced
- too eager to show options
- more infrastructural than a designer-facing tool should feel

The biggest issue is not missing features.

The biggest issue is that too many concerns are visible before the user has enough context to care about them.

That creates drag everywhere:

- the library feels less stable
- the shell feels broader than necessary
- status reads as noise instead of support
- advanced power reads as clutter instead of confidence

## Overall Assessment

The product has the correct underlying authoring model.

That is a major strength.

What is right:

- collections are the right primary container
- modes are the right variation model
- showing modes together is correct
- a table-centered library is correct
- canvas application work is genuinely valuable
- health, history, sync, export, and versions belong in the product

What is wrong:

- too many jobs are surfaced too early
- the default library state is not stable enough
- the UI still overuses helper surfaces and visible control layers
- contextual depth is fragmented
- the product still looks broader than its core value proposition
- onboarding and generator framing still imply a methodology

The product is closest to excellent when it helps a designer:

1. choose a collection
2. scan tokens and all mode values together
3. edit with confidence
4. apply tokens in Figma
5. resolve issues when those issues become relevant

Whenever the experience moves away from that loop, it becomes less legible.

## What Is Working

Several decisions are already strong and should be protected.

### 1. The canonical authoring model is correct

The product is strongest when it stays faithful to collections, modes, and authored tokens.

### 2. The library is correctly scan-oriented

A serious token tool should help users scan structure and values quickly.

The table is the right center of gravity.

### 3. Canvas is one of the product's strongest differentiators

The product becomes much more compelling when it connects token authoring to actual design work.

Especially strong:

- seeing bindable properties
- surfacing likely token matches
- extracting unbound values
- remapping stale references

### 4. The product takes advanced work seriously

That is good.

The issue is not the existence of advanced work.

It is the current ranking of advanced work relative to the designer's default job.

## Core Diagnosis

TokenManager still feels like multiple strong tools arranged side by side, rather than one strong authoring product with supporting capabilities around it.

That is the central problem.

Users are repeatedly asked to parse:

- workspace structure
- alternate library modes
- helper bars
- filter logic
- setup flows
- system cues
- adjacent operational areas

before the primary authoring experience fully takes control.

That is backwards.

The product should feel obvious first.

Depth should emerge only when the user's context makes that depth relevant.

## Main Problem Areas

## 1. The default library experience still does not have a strong default

This is the main issue.

The library still changes character too easily.

It can become:

- a browsing tool
- a filtered review surface
- a batch editing surface
- a preview workspace
- a selection-aware workspace
- a cross-collection search surface
- an issue-adjacent surface

Any one of these can be useful.

Together they weaken the user's sense of what the library fundamentally is.

Why this matters:

- users cannot form one stable mental model
- the table stops feeling authoritative
- advanced states start to blur into normal work

The library needs one unmistakable default state.

That state should feel like authored token work, not a configurable workspace shell.

## 2. The product still overuses chrome and helper surfaces

This review needs to be stricter here.

TokenManager currently relies too much on visible support layers:

- strips
- banners
- helper rows
- active-state summaries
- visible control groupings
- persistent optional surfaces

Even when each one is individually reasonable, the combined effect is clutter.

Why this matters:

- the product explains itself too much instead of reading clearly on its own
- support UI starts to crowd out the actual work
- users spend attention parsing interface furniture rather than token values

This is not a small issue.

It is one of the main reasons the product feels over-instrumented.

## 3. The library header is still too much of a control surface

The header carries too many kinds of meaning at once:

- current location
- create actions
- search
- advanced search behavior
- view control
- filter control
- edit control
- issue awareness
- active state explanation

That is too much responsibility for the very top of the core workspace.

Why this matters:

- the eye lands on machinery before content
- the user starts in interpretation mode instead of work mode
- the product communicates flexibility more strongly than clarity

The header should help the user begin work.

It should not advertise the full complexity of the system.

## 4. Too much power is ambient instead of contextual

The product surfaces many legitimate decisions before the user has selected enough context to need them.

That is a ranking failure.

Why this matters:

- expert capability becomes novice burden
- advanced actions feel noisy instead of empowering
- the default experience inherits the needs of edge cases

The product should show more power from:

- the active collection
- the selected token
- the selected group
- the selected issue
- the current canvas selection

And less power from the ambient frame around the work.

## 5. Contextual depth is still fragmented

The product has the correct instinct toward contextual depth.

The current problem is inconsistency.

Depth appears through multiple patterns that do not feel like one coherent system.

Users encounter different kinds of deeper context for:

- token editing
- token details
- collection setup
- comparison
- issue detail
- preview
- import and setup

Why this matters:

- users have to re-learn where deeper information lives
- support tools compete with one another
- the product feels mechanically assembled

The product does not need more contextual surfaces.

It needs fewer, clearer, more predictable ones.

## 6. The collection rail is still too busy

The collection rail matters because it frames the whole library.

Right now it tries to do too much:

- orientation
- discovery
- hierarchy
- summary
- warning surfacing
- quick management

Why this matters:

- the library feels busy from both edges
- collection choice becomes heavier than it should be
- the rail starts competing with the main table for attention

The rail should first answer:

- where am I
- what else exists
- what should I open next

It should not behave like a second toolbar.

## 7. Search is still being asked to do too much emotional work

Advanced search is valid.

But the product still risks making search feel like a power-user language rather than a simple findability tool.

Why this matters:

- recognition gives way to recall
- basic use inherits unnecessary complexity
- the product feels more technical than it needs to

Search should feel plain, forgiving, and obvious before it feels advanced.

## 8. The shell still overstates breadth

This problem is real, but it is not the first one to solve.

The shell still makes the product feel broader and more peer-ranked than it should.

Why this matters:

- users learn structure before they learn the core work
- adjacent and downstream areas feel too equal
- the product map becomes part of the cognitive load

This should be addressed.

But the library itself is still the more urgent problem.

## 9. Canvas is valuable, but still not calm enough

Canvas is one of the best parts of the product.

That is exactly why this should be judged harshly.

Its problem is not lack of usefulness.

Its problem is that usefulness is still surrounded by too many simultaneously visible paths.

Why this matters:

- helpful tools compete rather than reinforce one another
- the best next action is not always obvious enough
- the area feels denser than the user's immediate task

Canvas should foreground:

- the current selection
- the bindable properties
- the best likely token matches
- the next recommended action

Everything else should step back.

## 10. Review, history, and delivery work are still not ranked clearly enough

The current product shape still understates the difference between:

- authoring work
- quality work close to authoring
- operational support during active work
- downstream delivery and governance work

Why this matters:

- secondary areas feel more ever-present than they should
- nearby and downstream work blur together
- the product feels like a broad system instead of a focused tool with supporting depth

These areas should not be removed.

They should be more clearly subordinated to authoring.

## 11. Too much system state is ambient

The product still shows too much state before the user understands whether it matters.

Why this matters:

- passive warnings create anxiety
- informational state reads as friction
- the product feels operational before it feels useful

Good status is timely, specific, and actionable.

Visible status that does not help a present decision is often just clutter.

## 12. Onboarding still implies too much doctrine

The product still slightly teaches a preferred way of thinking too early.

That is unnecessary.

Why this matters:

- it makes the tool feel more opinionated than helpful
- it over-ranks setup and generation language
- it risks making authored work feel like the less important path

The product should help users begin work quickly, not recruit them into a process.

## 13. Generators are still over-framed

Generators are useful.

They are not the definition of authoring.

This distinction needs to be much clearer.

Why this matters:

- automation can start to feel like the preferred path
- authored systems can feel secondary
- the product can drift away from deliberate ownership

Generators should feel like accelerators layered on top of authored tokens.

Nothing in the product should suggest otherwise.

## 14. The document has to be stricter about modes

This deserves explicit emphasis because it is easy to regress here while "simplifying."

The product should never simplify itself by reducing multi-mode authoring to a one-mode-at-a-time mental model.

If the UI becomes calmer by hiding equal modes, it has become calmer by becoming wrong.

That is not acceptable.

Good simplification keeps all modes visible and legible while reducing everything around them.

## Where This Review Is Still Too Soft

This review is directionally right.

But it still pulls some punches.

## 1. It is still too generic about what is cluttering the library

The document correctly says the library has too much chrome.

It should go further and say that the problem is now structural, not cosmetic.

In the current product, the token table can sit beneath multiple stacked support layers:

- selection strip
- library toolbar
- selection-mode toolbar
- batch action panel
- stale generated banner
- stats bar
- operation status row

That is not just "a bit busy."

It means the default authoring surface no longer has a stable visual shape.

The table keeps moving down the screen while support UI keeps moving up the ranking.

## 2. The shell problem is more urgent than this document suggests

This review says the shell is real but not the first thing to solve.

I would be harsher.

The shell is part of the first impression of the product.

When the app presents Library, Canvas, Sync, Export, and Versions as peer workspaces, it teaches a broad system map before it teaches the core authoring job.

That is a serious ranking problem for a Figma plugin.

The library default is still the most important workflow to fix.

But the shell should be treated as part of the same problem, not a later cleanup.

## 3. The review does not separate user jobs clearly enough

The document talks about "designers" as one group.

That is not precise enough.

There are at least three important jobs here:

- system authors building and maintaining collections and modes
- working designers applying tokens to real canvas work
- collaborators handling export, sync, history, and delivery

These users overlap, but their moments are different.

The product should not force all three jobs to feel equally present at all times.

The review should judge every surface by asking:

- is this authoring
- is this application
- is this maintenance
- is this downstream delivery

And then decide whether it is ranked correctly for that moment.

## 4. The review should be stricter about naming and copy

A lot of the product language is internally coherent.

That is not the same as being natural for designers in a tight Figma workflow.

Terms like:

- generate group
- foundations
- semantics
- sync
- versions
- collection setup

may all be valid, but the product currently asks users to interpret too much product vocabulary too early.

The problem is not only layout.

It is also language load.

## 5. The review does not emphasize authoring trust enough

Designers need to feel confident about:

- what container they are editing
- what mode they are editing
- what a structural action will change
- whether a token is authored, derived, filtered, or just currently highlighted by context

This product has many powerful structural actions:

- merge collection
- split collection
- generate group
- keep updated
- bulk edit
- move across collections

The review should more explicitly treat trust and consequence clarity as core UX criteria, not secondary polish.

## 6. The review needs a stronger position on onboarding and generators

The current document says onboarding and generators imply too much doctrine.

That is true.

But the stronger point is this:

the product still risks teaching automation before teaching authorship.

That is backwards for this audience.

Generators should be introduced as optional accelerators after the user understands collections, modes, and deliberate token authoring.

Not as the implied path to building a good system.

## Additional Product Judgments

These are the conclusions I would add after reviewing the current UX more closely.

### 1. The token editor is conceptually stronger than the library shell around it

The editor generally respects the canonical model better than the surrounding library frame.

That matters.

It suggests the right solution is not to rethink authoring.

It is to reduce the amount of surrounding machinery competing with authored token work.

### 2. Collection setup is useful, but it still bundles too many structural actions together

Modes, rename, duplicate, merge, split, and delete all belong in collection management.

But the current setup surface still feels more like an operations console than a calm designer-facing configuration panel.

It should communicate structure and consequences more clearly and make destructive or reshaping actions feel more deliberately separated from normal setup.

### 3. Canvas remains one of the highest-value parts of the product

This should be protected.

The apply workflow is one of the most compelling reasons for this product to exist inside Figma.

The goal is not to reduce capability there.

The goal is to make the next best action more obvious and reduce side-path competition inside that workspace.

### 4. Overview is probably not carrying enough product weight to justify equal prominence

At the moment, Overview reads more like a secondary convenience surface than a primary workspace.

That does not mean it should be deleted.

It means it should probably not compete for attention with the same visual weight as authoring and application work.

## Actionable Worklist

This should be added to the product plan as a prioritized sequence, not as a grab bag.

## Priority 0: Reassert the default authoring experience

### 1. Define the one true default Tokens screen

The default Tokens state should be:

- one active collection
- token table visible immediately
- all modes visible together
- minimal persistent support UI

Make every other library state visibly secondary to this one.

### 2. Collapse the stacked support layers above the table

Reduce the number of persistent rows above the token list.

As a rule:

- only one persistent toolbar row should remain by default
- selection-specific controls should appear only during explicit selection work
- review and generator status should not permanently displace the table

### 3. Strip the library header back to essentials

Keep only:

- current collection
- primary create entry point
- simple search
- one overflow entry point for advanced controls

Move active-state explanation, advanced search behavior, and low-frequency actions out of the top-level header.

## Priority 1: Make the library easier to read

### 4. Simplify the collection rail into navigation first

The collection rail should primarily show:

- collection name
- active state
- maybe one small secondary fact

Remove or demote multi-line summaries, issue surfacing, and action affordances that make the rail compete with the token table.

### 5. Move structural collection actions out of the rail’s everyday rhythm

Keep selection and navigation in the rail.

Keep powerful management actions in collection setup.

Make the rail feel like navigation, not a management console.

### 6. Rework search so basic search feels plain before advanced search exists

Default behavior should optimize for simple path/name/value finding.

Qualifier-driven and structured filtering should become a progressive layer, not something the user has to parse in the main search field from the start.

### 7. Reduce ambient status

Audit every banner, strip, chip, pill, and inline status surface in the library.

Remove or demote anything that does not help an immediate decision.

Status should be:

- timely
- local
- actionable

## Priority 2: Make context predictable

### 8. Standardize one contextual-depth model for library work

Token edit, token inspect, collection setup, compare, import follow-up, and review should feel like one coherent family of contextual surfaces.

Users should not have to relearn where "deeper detail" appears for each task.

### 9. Keep editing and inspecting clearly distinct

A user should always be able to tell whether they are:

- editing a token
- inspecting a token
- reviewing an issue
- performing a structural collection action

Do not let these states blur into one another visually.

### 10. Make structural actions more consequence-explicit

For merge, split, generator save, bulk edit, and cross-collection moves, improve the clarity of:

- what changes
- where it changes
- whether authored values are being created, replaced, or derived

This is a trust problem, not just a wording problem.

## Priority 3: Fix the product framing

### 11. Rewrite onboarding around two valid starts, not a preferred doctrine

The opening choices should be:

- bring in an existing system
- start authoring manually

Generator and semantic workflows should appear as optional accelerators later, not as the implied shape of a good token system.

### 12. Reposition generators as optional acceleration

Review all generator entry points and copy.

The product should say, in effect:

- author tokens directly when you want control
- use generation when it saves time

Not:

- generation is how a proper system gets made

### 13. Tighten naming around designer-native tasks

Review top-level labels, setup labels, and create actions for language that feels too product-internal or too infrastructural.

Prioritize wording that matches how design system authors already think inside Figma.

## Priority 4: Re-rank the shell

### 14. Stop presenting all major areas as equally primary

Library and Canvas are the core day-to-day jobs.

Sync, Export, History, and Versions are important, but they are not equally frequent authoring destinations.

Reflect that in the shell.

### 15. Re-evaluate whether Overview deserves a peer section

If Overview is primarily a summary aid, it should be demoted or folded into Library rather than holding peer weight with primary work surfaces.

### 16. Clarify the relationship between authoring, review, and delivery

The product structure should make it obvious that:

- Library is authoring
- Canvas is application
- Health and History are maintenance close to authoring
- Sync, Export, and Versions are downstream support

That ranking should be visible in navigation, not just implied in copy.

## Priority 5: Validate with the right lens

### 17. Review all major surfaces against real designer questions

For each major surface, test whether a designer can answer:

- where am I
- what am I editing
- what should I do next
- what will happen if I use this action

If the UI does not answer those quickly, it is not yet ranked correctly.

### 18. Use reduction as the default design move

When a surface feels confusing, first try:

- removing a row
- collapsing duplicate explanations
- moving advanced actions behind context
- demoting support UI

before adding new helper UI.

## 15. Sparse states still risk feeling like exposed infrastructure

Some occasional-use areas still risk feeling justified by product architecture more than user value.

Why this matters:

- the product feels broader than it feels necessary
- lightly used spaces can feel like unfinished admin areas
- users spend attention understanding places they may not need today

Secondary areas should feel intentionally invoked, purposeful, and self-explanatory.

## 16. The product voice is still slightly too infrastructural

The voice is disciplined.

That is not the problem.

The problem is that discipline sometimes reads as workflow software rather than designer-facing clarity.

Why this matters:

- advanced tasks feel heavier than necessary
- designer-facing flows sound more technical than they should
- the product loses some calm and confidence

The product should sound:

- precise
- calm
- direct
- design-literate

## What Not To Do

The response to these problems should not be:

- replacing the table with a card-first or wizard-first product
- hiding developer-facing capabilities completely
- flattening the domain model to make the UI seem simpler
- reintroducing a base-value mental model for multi-mode tokens
- adding more helper surfaces to explain existing clutter
- starting with a broad shell rewrite before stabilizing the library

## Strategic Direction

The product needs stronger ranking, not more explanation.

It needs fewer visible concerns at once, not more layers describing those concerns.

It needs a more decisive default experience, not more optionality at the top level.

The highest-value move is simplification before expansion.

Not simplification through capability loss.

Simplification through disciplined disclosure.

## Product Decision

The strongest recommendation is:

Simplify and consolidate before adding major new breadth.

The first focus should be the default library experience.

If the product becomes calmer there, every adjacent decision becomes easier to rank and easier to trust.
