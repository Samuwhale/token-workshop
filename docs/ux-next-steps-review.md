# TokenManager Product Review

## Purpose

This document reviews TokenManager as a product experience inside Figma.

It focuses on:

- product clarity
- day-to-day authoring confidence
- information architecture
- workflow ranking
- structural trust
- usability for real design system work

The question is not whether TokenManager is capable.

It is.

The question is whether the product makes the right work feel obvious, trustworthy, and well-ranked for the people who actually have to use it.

## Audience And Product Reality

TokenManager serves two equally primary jobs inside Figma:

- helping designers apply and work with tokens in live design flows
- helping design system maintainers author, govern, review, and deliver the token system

That distinction matters.

This is not a product for generic "designers."

It is a product for people doing real token work at different levels of responsibility:

- applying tokens in interface work
- authoring tokens and modes
- maintaining naming and structure
- reviewing health and change history
- managing sync, export, and delivery confidence

The product succeeds only if one default experience can support both day-to-day design use and system maintenance without becoming bloated or hard to trust.

Audit, history, sync, export, and versioning are not secondary in value.

They are core parts of the product.

The problem is not that they exist.

The problem is when they appear with the wrong prominence, at the wrong time, or without enough relationship to the user's current task.

TokenManager also lives inside Figma.

That means it has to respect:

- constrained space
- fast scanning
- established mental models
- low tolerance for abstraction that does not clearly help the task

## Core Product Judgment

TokenManager is still stronger as a capability system than as a product.

It contains meaningful depth.

It supports serious work.

But the overall experience still asks users to resolve too many questions too early.

Too often, the product does not make these basics obvious fast enough:

- where am I working right now
- what collection am I editing
- which modes am I looking at
- whether this value is authored or aliased
- whether something is a real source value, a generated output, or only contextual guidance
- what will happen if I merge, move, split, generate, or bulk edit
- how to move from canvas context to the right token without losing confidence

That is the central product problem.

The issue is not feature count by itself.

The issue is that the product still gives too much surface area, too much framing, and too much decision weight to adjacent concerns before the core work feels stable and trustworthy.

## What The Product Gets Right

Several core product decisions are strong and should be protected.

### 1. The canonical authoring model is correct

The product is strongest when it stays firmly anchored to collections, modes, and authored tokens.

Collections are the primary container.

Modes belong to collections.

Tokens vary by the modes of their own collection.

That model is aligned with how this product should think and how users should understand it.

### 2. Modes should remain visible together

The product is right when it treats every token value as a mode value and keeps those mode values visible together.

The UI should not drift back toward:

- a base value plus overrides mental model
- a single-mode picker that hides the rest
- language that implies one mode is the real one and the others are secondary

That would make the product easier to explain only by making it less truthful.

### 3. The token table is the right center of gravity

A serious token tool should be scan-friendly.

Users need to move quickly across token names, structure, aliases, and values.

The answer to product complexity is not replacing that center with more ornamental or more guided surfaces.

The answer is to make the table easier to trust and easier to work from.

### 4. Canvas context is one of the product's strongest advantages

The product becomes much more compelling when token work connects directly to design work.

That includes:

- applying tokens from the current design context
- understanding what is already bound
- finding likely token matches for existing values
- extracting unbound values into a maintained system
- repairing stale or broken references with confidence

This is not peripheral product value.

It is one of the clearest reasons for the product to exist inside Figma.

### 5. Governance and delivery belong in the product

Health, history, sync, export, and versions are legitimate parts of the same product.

They should not be treated as awkward additions or hidden away as if they matter less.

They matter because maintainers need confidence that the token system is coherent, reviewable, and deliverable.

The requirement is integration with clear ranking, not demotion.

## Where The Product Is Failing Users

## 1. The default authoring experience is still not stable enough

This is the biggest problem.

The core Tokens experience still changes character too easily.

It can feel like:

- a primary authoring surface
- a review surface
- a batch-editing surface
- a contextual assistance surface
- a maintenance surface
- a search surface

Each of those can be valid.

The problem is that the product does not establish one steady default strongly enough before other concerns start competing for attention.

Users need the center of the product to feel fixed:

- one active collection
- clear token structure
- all modes visible together
- obvious relationship between authored values and aliases
- support UI that helps only when it is needed

Without that stability, the product feels capable but not settled.

## 2. Structural trust is still weaker than it needs to be

This product asks users to make meaningful structural changes.

That means trust is not optional.

Right now, the product still does not make it obvious enough:

- what exactly is being changed
- where that change happens
- what the current scope is
- whether an action edits authored values, reorganizes structure, or creates derived output

This matters most for actions such as:

- merge
- split
- move
- bulk edit
- generate
- save generated outputs into the system

If users have to pause and mentally simulate consequences, the product is asking too much from them.

## 3. The path from canvas context to token work is still not clear enough

The product has strong canvas value, but the route from selected design work to the right token workflow still does not feel decisive enough.

Users need to move from what they have selected in Figma to the correct next step without friction:

- inspect what is bound
- understand what is missing
- create or connect the right token
- return to design work without losing context

If that handoff feels indirect, the product loses one of its strongest advantages.

## 4. The product still surfaces too much support material too early

There is still too much visible explanation, status, and framing competing with actual work.

The issue is not any one banner, helper, summary, or support surface in isolation.

The issue is accumulation.

When too much supporting material is visible at once:

- token values are no longer the visual center
- the interface feels more operational than authorial
- users spend attention parsing the product instead of doing the work

The right standard is simple:

if a surface does not help the next decision, it should not compete with the current task.

## 5. Product areas still do not feel ranked with enough discipline

The product contains multiple valid areas of work:

- authoring
- application in canvas context
- review and health
- version awareness
- sync and export

Those are all legitimate.

The failure is not that the product includes them.

The failure is that their relationship to one another is still not clear enough in everyday use.

Users should never have to wonder whether they are in:

- the place where tokens are authored
- the place where token usage is applied or repaired
- the place where system integrity is reviewed
- the place where changes are prepared for delivery

The product should make those distinctions obvious while still feeling like one system.

## 6. The product still sounds too much like internal tooling in places

The voice is disciplined, but it is not always grounded enough in design-system work inside Figma.

When the language becomes too infrastructural or too process-oriented:

- design tasks feel heavier than they are
- maintenance tasks feel more technical than necessary
- the product starts sounding like it is organized around internal machinery instead of user intent

This product should sound precise, calm, and design-literate.

It should not sound like users are entering a workflow platform.

## 7. The product does not yet recognize all valid ways users begin

The product should clearly support three legitimate starts:

- bring in an existing system
- author a system directly
- start from the current file or canvas context and build from what already exists

If the product over-emphasizes only setup or only generation, it misses how people actually begin design-system work inside Figma.

## Priority Product Direction

## Priority 0: Strengthen authoring confidence and structural trust

The first job is not to add more explanation.

It is to make the core authoring experience trustworthy.

The product should establish one stable collection-centered workflow where users can immediately understand:

- what collection they are in
- what tokens they are looking at
- all mode values together
- whether a value is literal, aliased, derived, or only contextually suggested

Structural actions should become much more consequence-explicit.

Before users confirm an action, the product should make the scope and result of that action feel unmistakable.

## Priority 1: Make canvas-to-token workflows feel native and decisive

Canvas context should feel like a first-class entry into the product, not a side route.

Users should be able to move from current design selection to the right token action with minimal interpretation:

- inspect
- match
- create
- bind
- repair

This should feel like one clean bridge between design work and token work.

## Priority 2: Re-rank the product without diminishing core governance work

The default experience should keep authoring visible and steady without pretending that governance and delivery are less important.

The correct move is not to hide health, history, sync, export, or versions.

The correct move is to surface them in stronger relationship to the current job.

They should feel integrated and trustworthy, not visually equal to every task at every moment.

## Priority 3: Clarify how the product begins

The opening product posture should recognize three valid starts:

- import an existing system
- author manually
- start from current file or canvas context

Generators should remain clearly positioned as optional acceleration layered on top of authored tokens.

They should help users move faster when useful.

They should not imply that authored work is secondary or that generation is the preferred expression of quality.

## What Not To Do

The response to these problems should not be:

- flattening the domain model to make the product seem simpler
- reintroducing a base-value mental model for multi-mode tokens
- hiding governance and delivery work as if it were secondary
- treating Library and Canvas as the only legitimate core jobs
- adding more support UI to explain existing clutter
- replacing the token table with a more decorative but less trustworthy center
- making generation feel like the proper way to create a serious system
- solving ranking problems with more product framing instead of clearer task flow

## Final Decision

TokenManager does not primarily need more breadth.

It needs a stronger center.

The product should feel like one trustworthy system for two equally primary kinds of work:

- applying and using tokens in design
- authoring, governing, and delivering the system behind them

The next phase should focus on making that center unmistakable:

- a stable collection-based authoring workflow
- equal visibility of modes
- clearer distinction between authored, aliased, derived, and contextual states
- more decisive canvas-to-token flows
- governance and delivery surfaces that feel integrated without crowding the default experience

Until that becomes true, the product will continue to feel more impressive in capability than confident in use.
