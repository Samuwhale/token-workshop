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

## Recommended Product Direction

## 1. Make the library feel unquestionably primary

The library should feel like the home base of the product.

It should answer immediately:

- where am I
- which collection is active
- what modes exist here
- what values am I editing
- what can I do next

## 2. Establish one canonical default authoring state

The default library should be stable, predictable, and easy to learn.

It should feel like:

- active collection
- token table dominant
- all modes visible together
- plain search
- contextual editing one step away

Everything else should feel explicitly invoked.

## 3. Compress the default header much harder

The default header should carry only what is necessary to start work.

That likely means:

- current collection context
- one create entry point
- search
- one advanced entry point

If a control does not materially help the user begin work, it probably does not belong in the default header.

## 4. Remove visible support clutter before adding anything else

The product should reduce helper UI that mainly restates nearby context.

Suggested direction:

- reduce strips and banners in the default library
- reduce persistent state summaries
- avoid visible wrappers that only explain existing controls
- keep support UI only when it directly changes comprehension or action

This is a major quality move, not cosmetic cleanup.

## 5. Simplify the collection rail

The rail should prioritize orientation over management.

Suggested direction:

- make collection switching faster to scan
- make hierarchy legible without visual noise
- quiet metadata that does not affect the immediate decision
- push heavier actions deeper into collection context

## 6. Unify contextual depth

The product needs one stronger, more predictable model for deeper context.

That layer should hold:

- token detail
- token editing
- collection detail
- dependency and alias context
- issue detail

The goal is not to create more panels.

The goal is to make depth feel consistent.

## 7. Keep search plain by default

Search should begin as obvious findability:

- name
- path
- familiar narrowing

Advanced refinement should still exist.

It just should not define the emotional default of the workspace.

## 8. Keep Canvas separate, but simplify it around the next action

Canvas should remain a dedicated adjacent workspace.

But it should feel focused around:

- what is selected
- what can be bound
- the best likely match
- the next meaningful action

Secondary controls should recede.

## 9. Re-rank review and delivery work

The product should communicate a clearer hierarchy:

- authoring at the center
- quality work near authoring
- canvas application adjacent
- history close enough to support active work
- sync, export, and versions downstream

## 10. Make onboarding momentum-based

The first-run experience should help users begin work quickly.

Suggested direction:

- connect if needed
- create or import
- land in the library
- begin authoring

Accelerators should remain optional.

## 11. Demote generators without weakening them

Generators should remain available and useful.

But the product should consistently frame authored tokens as primary and automation as optional leverage.

## 12. Show less system state, but make it more actionable

Suggested direction:

- show status when it changes a decision
- tie warnings to obvious next actions
- keep informational state quiet when it is not actionable
- make risk clear without making the workspace anxious

## 13. Tighten voice and sparse states

The product should make occasional areas feel purposeful and should consistently use language that feels:

- direct
- calm
- clear
- native to design workflows

## Priority Order

The product does not need a single large redesign effort.

It needs better sequence and stricter discipline.

Recommended order:

1. stabilize the default library state
2. compress the header and reduce helper clutter
3. simplify the collection rail
4. unify contextual depth
5. simplify Canvas around the next action
6. re-rank review and delivery areas
7. improve onboarding, generator framing, sparse states, and voice

This order matters.

The product should not start with a shell-first rewrite.

It should first become calmer and clearer where the primary work actually happens.

## Clear Actionable Workstreams

## A. Stabilize the default library state

Goals:

- define one unmistakable default authoring state
- reduce the number of ways the library changes character
- keep the table dominant
- make alternate states feel explicitly entered

## B. Compress the library header

Goals:

- reduce visible controls
- remove competing emphasis
- preserve only the actions needed to begin work
- move advanced controls behind clearer invitation

## C. Remove support clutter

Goals:

- reduce helper surfaces that restate nearby context
- remove low-value visible summaries
- keep only support UI that improves a decision or action immediately

## D. Simplify the collection rail

Goals:

- make collection selection easier to scan
- quiet secondary metadata
- stop the rail from acting like a parallel control center

## E. Consolidate contextual depth

Goals:

- reduce fragmentation between detail, edit, compare, review, and setup context
- make deeper context easier to predict
- improve confidence in where advanced information lives

## F. Simplify Canvas around the next action

Goals:

- foreground the current selection
- foreground bindable properties
- foreground likely matches
- reduce visible secondary paths

## G. Re-rank adjacent and downstream areas

Goals:

- make authoring feel central
- keep quality work nearby without over-promoting it
- keep downstream delivery areas clearly secondary in everyday use

## H. Reduce doctrinal framing

Goals:

- help users begin real work quickly
- keep generator and setup flows optional
- stop implying a preferred philosophy of authoring

## I. Tighten status, voice, and sparse states

Goals:

- remove passive operational noise
- make status more actionable
- make empty and low-data areas feel intentional
- make the product sound calmer and more design-native

## Product Decision

The strongest recommendation is:

Simplify and consolidate before adding major new breadth.

The first focus should be the default library experience.

If the product becomes calmer there, every adjacent decision becomes easier to rank and easier to trust.
