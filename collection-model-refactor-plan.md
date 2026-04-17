# Collection Model Refactor Plan

## Problem

TokenManager currently expresses one user-facing concept through multiple overlapping code concepts.

For a designer, the core object should be simple:

- a collection contains tokens
- a collection has modes
- tokens vary by mode inside their collection
- selected modes are a viewing state
- recipes are advanced automation, not the primary authoring model

The codebase does not consistently reflect that model today.

Instead, the same domain is split across:

- token `sets`
- collection definitions in `$collections.json`
- mode selections stored as active or preview state
- UI surfaces that treat collections as both a primary authoring concept and a secondary management concept
- leftover `theme` language mixed with `collection`, `set`, `mode`, and `preview`

That split creates two kinds of confusion:

1. User confusion
   Designers cannot easily tell whether they are editing tokens, editing collection structure, selecting a viewing state, or entering a separate theming system.

2. Code confusion
   Future agents and maintainers cannot easily tell which type is canonical, which identifiers should match, and which layer owns each behavior.

This is not just a naming problem. It is a domain-model problem.

## Root Cause

- The codebase duplicates identity. In many places, `set` and `collection` point at the same real thing.
- The codebase mixes authored data and view state. Mode values, selected modes, and hover preview are too easy to confuse.
- The codebase mixes product vocabulary and implementation vocabulary. Designers see `collection` and `mode`, while the code still routes major behavior through `set` and leftover `theme` naming.
- Advanced systems are exposed too close to the default authoring path. Recipes, compare tools, and preview/preset concepts are too easy to read as competing authoring models.

## Evidence In The Current Code

- [`ModeValuesEditor.tsx`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/components/token-editor/ModeValuesEditor.tsx) looks up a collection definition by `setName`, which means the current token set is also being treated as the current collection.
- [`collectionModeUtils.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/shared/collectionModeUtils.ts) resolves mode definitions and selected modes using `setName` as the collection id.
- [`themes.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/server/src/routes/themes.ts) normalizes collection state from the current list of token sets, which means collections are not truly first-class. They are reconstructed from sets.
- [`sets.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/server/src/routes/sets.ts) rewrites collection ids and token mode data when sets are renamed, merged, split, or deleted. That is a symptom of the model split, not a clean separation of responsibilities.
- [`useCollectionSwitcher.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/hooks/useCollectionSwitcher.ts) mixes persisted mode selection with transient hover preview in one conceptual area, then the UI exposes that state inconsistently as preview controls, selected modes, and current preview.
- [`navigationTypes.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/shared/navigationTypes.ts) still treats `Tokens`, `Recipes`, and `Collections` as parallel primary workspaces even though the product intent is moving toward one primary authoring surface.

## Goal

Refactor the codebase so one canonical domain model matches the intended product model and the Figma mental model.

After the refactor:

- `Collection` is the primary authoring container
- `Mode` belongs to a collection
- `Token` belongs to a collection and can vary by that collection's modes
- `Selected modes` are view state only
- `Hover preview` is transient UI state only
- `Recipe` is advanced automation attached to authored tokens, not a competing workspace model

The code should make those boundaries obvious enough that a future agent can navigate the system without reconstructing the intended model from implementation accidents.

## Solution Shape

- Unify the model around collections as the only first-class authoring container.
- Separate authored data from viewing state so selection, preview, compare, and presets never look like authoring ownership.
- Push advanced systems to the edges so they support the authoring model instead of redefining it.
- Delete old concepts instead of translating between old and new names forever.

## Non-Goals

- Backward compatibility with the current internal naming
- Preserving old route shapes or state shapes just because they already exist
- Keeping `theme` terminology around as an alias
- Reworking tests unless explicitly requested

## Canonical Vocabulary

### Keep

- `collection`
- `mode`
- `token`
- `group`
- `selectedModes`
- `hoverPreview`
- `recipe`

### Remove Or Replace

- `set` as the primary authoring concept
- `theme` when it really means collection or selected mode
- `preview state` as user-facing terminology
- `activeThemes` and `previewThemes` as long-term names
- `Themes` or `Collections` as competing primary workspaces

## Set Removal Rule

- `set` should be removed from the domain model, shared types, server business logic, client state, and UI.
- Today it acts as a second name for `collection`, which is one of the main sources of confusion.
- If `set` survives anywhere, it should survive only at a narrow storage or external-format boundary that cannot be renamed yet.
- Do not reintroduce `set` as a first-class product or business-logic concept during the refactor.

## Canonical Model

### Collection

The top-level authoring container.

Responsibilities:

- owns tokens
- owns modes
- owns collection metadata
- defines publish boundary

### Mode

A named variation inside one collection.

Responsibilities:

- identifies one value branch for tokens in that collection
- participates in compare and viewing flows
- does not exist outside a collection

### Token

The authored object.

Responsibilities:

- has a base value
- may have per-mode values for its own collection
- may participate in aliasing, grouping, lifecycle, and publish flows

### Selected Modes

Persisted view state.

Responsibilities:

- controls how authored tokens are resolved for display
- can be saved into view presets if that feature remains
- never owns authored token data
- if persisted, it must remain separate from collection identity and collection lifecycle data

### Hover Preview

Transient UI state.

Responsibilities:

- temporary inspection only
- must not leak into product language as a first-class authoring concept

### Recipe

Advanced automation that generates or manages tokens.

Responsibilities:

- creates or updates authored tokens
- exposes status and ownership
- remains downstream from the canonical authoring model

## Refactor Principles

- The domain model must be settled before the IA cleanup.
- One concept gets one canonical type and one canonical name.
- UI labels should be downstream from code vocabulary, not compensating for it.
- If a route or store exists only because the model is split, it should be collapsed or removed.
- The normal designer workflow must map directly to the canonical model.
- Boundary identifiers should be renamed in the phase that owns that boundary, not all at once during domain cleanup.

## Core Invariants

- A collection has one canonical identifier across domain logic, routes, storage, and client state. Do not replace `set` versus `collection` confusion with a new `id` versus `name` split unless there is a real product need.
- A token belongs to one collection.
- A mode belongs to one collection.
- A token can vary only through the modes of its own collection.
- Selected modes and hover preview are view state only. They never own authored token data.
- View presets are view artifacts, not collection metadata.
- Recipes may generate or manage tokens, but they do not define the primary authoring model.
- The refactor should remove duplicated concepts, not preserve them behind aliases.

## Boundary Rename Rule

- Phase 1 defines the canonical names and inventories old identifiers that must change.
- Phase 2 renames server-owned boundary identifiers.
  Examples: route payload names, operation-log action names, collection persistence shapes.
- Phase 3 renames client-owned boundary identifiers.
  Examples: plugin message names, local storage keys, client runtime state payloads.
- When a boundary identifier changes, update every reader and writer for that boundary in the same phase.
- Do not keep fallback reads, alias payloads, or compatibility shims to old names.
- Do not keep dual naming, alias layers, or compatibility shims.

## Phases

### Phase 1: Define The Canonical Domain Layer

#### Objective

Replace the current ambiguous `set` versus `collection` model with one explicit domain layer.

#### Deliverables

- Introduce canonical shared types for `TokenCollection`, `CollectionMode`, and selected mode state.
- Remove `set` from the shared API and domain model, except for any unavoidable storage-boundary translation point.
- Document the one-to-one relationship between collection identity and token storage.
- Remove remaining `theme` vocabulary from shared domain types.
- Inventory boundary identifiers that still encode the old model so later phases can rename them cleanly.
- Keep transport contracts and persistence contracts out of scope for direct renaming in this phase unless they are purely internal domain symbols.

#### Changes

- Update shared types in [`packages/core/src/types.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/core/src/types.ts).
- Introduce a dedicated domain module for collection concepts instead of scattering them across token and route utilities.
- Rename shared helpers so they describe collections and modes, not themes or sets.
- Define the target names for transport and persistence identifiers, but do not execute every boundary rename in this phase.

#### Exit Criteria

- A new contributor can answer “what is the primary authoring container?” by reading one type definition, not three routes and two hooks.

### Phase 2: Collapse Server State Around Collections

#### Objective

Make the server expose one canonical collection model instead of reconstructing collections from token sets plus separate collection metadata.

#### Deliverables

- A single collection service that owns collection metadata, modes, and collection lifecycle operations.
- Clear distinction between storage concerns and domain concerns.
- Elimination of cross-route synchronization logic whose only purpose is keeping sets and collections aligned.
- One target persistence shape for collections. Do not keep mirrored `set` and `collection` stores that must be normalized back into each other.

#### Changes

- Refactor [`packages/server/src/routes/themes.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/server/src/routes/themes.ts) into collection-focused routes or fold those routes into a new collection domain service.
- Refactor [`packages/server/src/routes/sets.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/server/src/routes/sets.ts) so structural collection operations are owned by the collection model rather than patching collection state as a side effect.
- Move collection normalization logic out of route handlers and into a single service.
- Remove server-side terminology that treats collections as a derived overlay on top of sets.
- Rename server-owned identifiers that still encode the old model.
  Examples: operation-log action names, route descriptions, persisted collection payload field names.
- Update server consumers of renamed identifiers in the same phase.
  Examples: history views, undo/rollback flows, and any route clients inside the app.
- Update server-owned collection dependencies in the same phase.
  Examples: recipe targets and ownership, resolver references, snapshot logic, publish routing, and lint/config systems that still key off collection identity.

#### Exit Criteria

- Renaming or restructuring a collection happens in one domain path, not one set path plus one collection repair path.

### Phase 3: Unify Client State Around The Same Model

#### Objective

Replace split client state with one collection-centered authoring state model.

#### Deliverables

- One authoritative client state owner for current collection, selected modes, and hover preview.
- Removal of `activeSet` as a competing primary concept in authoring flows, not just a rename layered over the old state shape.
- Renamed client state that matches the canonical vocabulary.
- Define the canonical client-only hover preview state shape, separate from shared domain types and separate from persisted selected mode state.
- Removal of parallel client models that keep old and new collection concepts alive at the same time.

#### Changes

- Inspect the current client state flow end to end before editing. Identify where `activeSet`, `activeThemes`, `previewThemes`, plugin message names, and local storage keys are defined, persisted, and consumed.
- Change the smallest coherent set of files needed to collapse client ownership into one collection-centered model instead of scattering partial renames across many surfaces.
- Replace or heavily refactor [`useCollectionSwitcher.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/hooks/useCollectionSwitcher.ts).
- Replace `activeThemes` with `selectedModes`.
- Replace `previewThemes` with `hoverPreviewModes` or similar transient-only naming.
- Update token resolution helpers to consume the new collection-centered state directly.
- Remove mixed naming in storage keys where practical.
- Rename client-owned identifiers that still encode the old model.
  Examples: plugin message names and local storage keys.
- Stop reading old client keys and message names once the new ones land.
- Model hover preview as transient per-collection client state, not shared domain state and not persisted state.
- Keep authored data separate from view state. Collection identity and authored token state must not be inferred from selected modes or hover preview.
- Avoid replacing `set` versus `collection` confusion with a new client-only `id` versus `name` split unless there is a real product need.
- Update every reader and writer for renamed client-owned boundary identifiers in the same phase.

#### Exit Criteria

- The client has exactly one authoritative collection-centered authoring state model.
- `activeSet` is gone from client business logic as a primary authoring concept, except at any unavoidable external boundary that has not yet been renamed.
- `activeThemes` and `previewThemes` are gone from client business logic.
- Hover preview is transient-only and cannot be mistaken for persisted authored state.
- Plugin message names, local storage keys, and client runtime payloads use the new client-owned identifiers with all readers and writers updated together.
- The client no longer reads old client keys, old plugin message names, alias payloads, or fallback names.
- The client state tree clearly separates authored data from view state.
- The client is no longer coupled to server concepts that only exist to preserve the old `set` model.
- Phase 4 can build on the resulting client model without needing to guess whether `activeSet`, selected modes, or hover preview is the real source of truth.

### Phase 4: Refactor Authoring Surfaces To Match The Model

#### Objective

Make the UI express the canonical model without compensating for domain confusion.

#### Deliverables

- `Tokens` becomes the single primary authoring workspace.
- Collection and mode context live in the token authoring surface.
- `Manage collections` is clearly advanced.
- Recipes become contextual or advanced, not a competing first stop.

#### Changes

- Simplify top-level navigation in [`navigationTypes.ts`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/shared/navigationTypes.ts).
- Refactor top-bar controls in [`App.tsx`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/App.tsx) to use one collection context, not a set switcher plus separate preview controls.
- Refactor [`ModeValuesEditor.tsx`](/Users/samuel/Documents/Projects/TokenManager/packages/figma-plugin/src/ui/components/token-editor/ModeValuesEditor.tsx) so it operates on the explicit collection model.
- Remove or rename confusing labels like `Current Preview`, `Preview values`, and `View: Preview`.
- Move collection structure tasks out of the default authoring path.

#### Exit Criteria

- A designer can edit a token and its mode values without touching a second conceptual system.

### Phase 5: Re-home Advanced Systems

#### Objective

Keep advanced capabilities without letting them redefine the authoring model.

#### Deliverables

- Recipes remain available, but clearly as automation.
- Collection review, compare, and health tools become contextual support tools.
- Saved presets remain viewing tools, not authoring containers.
- This phase is about product placement and UX, not deferred collection-identity cleanup in server logic.

#### Changes

- Evaluate whether the standalone recipe dashboard belongs under `Health`, an advanced secondary surface, or a contextual token/collection action.
- Reframe compare, preset, and preview features as view tools layered over authored collections.
- Trim any surface that duplicates the authoring story instead of supporting it.

#### Exit Criteria

- Advanced tools extend the collection model instead of competing with it.

### Phase 6: Delete Old Concepts And Dead Paths

#### Objective

Finish the refactor by removing compatibility names and stale mental-model artifacts.

#### Deliverables

- Deleted dead code and obsolete helpers
- Removed stale route names, storage keys, and component props that encode the old model
- Updated docs so future agents inherit the correct vocabulary

#### Changes

- Remove leftover `theme` naming from files, props, comments, and route descriptions.
- Remove legacy code paths that translate between old and new model names internally.
- Update root planning docs and README references where needed.

#### Exit Criteria

- Future work can proceed without needing to remember that “collection really means set here, except when it means mode metadata.”

## Recommended Implementation Order

1. Shared types and vocabulary
2. Server-side collection service and route cleanup
3. Client state consolidation
4. Tokens workspace refactor
5. Recipes and advanced surfaces re-home
6. Dead code deletion and doc cleanup

Do not start with navigation polish. Navigation should be the expression of the cleaned-up model, not the mechanism used to hide it.
Do not start Phase 4 until Phases 2 and 3 have produced a stable collection-centered server and client model.

## Success Criteria

The refactor is successful when all of the following are true:

- The codebase has one canonical type for the primary authoring container.
- The server no longer reconstructs the product model from multiple partially overlapping stores.
- The client no longer treats set context, selected mode context, and preview context as competing concepts.
- The default designer flow maps cleanly to `collection -> mode -> token`.
- Future agents can read the shared types and predict the routing and UI structure correctly.
- The UI can then be simplified without papering over deeper inconsistencies.

## Bottom Line

TokenManager should stop translating between multiple internal stories about the same thing.

The right move is:

- settle the model
- rename the code to match it
- collapse duplicated ownership paths
- then simplify the UI on top of that clean foundation

If this refactor is done in that order, the product gets clearer for designers and the code gets safer for future agents.

## Boundary Inventory

Remaining identifiers that still encode the old `set` or `theme` model.
Generated at the end of Phase 1 to guide Phases 2 and 3.

### Phase 2 — Server-Owned Identifiers

#### Operation-Log Action Names (persisted in undo history)

| Current | Suggested | Location |
|---|---|---|
| `create-set` | `create-collection` | `operation-log.ts` |
| `delete-set` | `delete-collection` | `operation-log.ts` |
| `rename-set` | `rename-collection` | `operation-log.ts` |
| `reorder-sets` | `reorder-collections` | `operation-log.ts` |
| `write-set-metadata` | `write-collection-metadata` | `operation-log.ts` |
| `write-themes` | `write-collections` | `operation-log.ts` |

#### API Route Paths

| Current | Suggested | Location |
|---|---|---|
| `GET /api/sets` | `/api/collections` | `sets.ts` |
| `GET /api/sets/:name` | `/api/collections/:name` | `sets.ts` |
| `POST /api/sets` | `/api/collections` | `sets.ts` |
| `PATCH /api/sets/:name/metadata` | `/api/collections/:name/metadata` | `sets.ts` |
| `POST /api/sets/:name/rename` | `/api/collections/:name/rename` | `sets.ts` |
| `PUT /api/sets/reorder` | `/api/collections/reorder` | `sets.ts` |
| `POST /api/sets/:name/duplicate` | `/api/collections/:name/duplicate` | `sets.ts` |
| `POST /api/sets/:name/merge` | `/api/collections/:name/merge` | `sets.ts` |
| `POST /api/sets/:name/split` | `/api/collections/:name/split` | `sets.ts` |
| `POST /api/sets/:name/preflight` | `/api/collections/:name/preflight` | `sets.ts` |
| `DELETE /api/sets/:name` | `/api/collections/:name` | `sets.ts` |

#### Token Store Methods

| Current | Suggested | Location |
|---|---|---|
| `getSets()` | `getCollections()` | `token-store.ts` |
| `getSet(name)` | `getCollection(name)` | `token-store.ts` |
| `createSet(name, tokens)` | `createCollection(name, tokens)` | `token-store.ts` |
| `deleteSet(name)` | `deleteCollection(name)` | `token-store.ts` |
| `renameSet(old, new)` | `renameCollection(old, new)` | `token-store.ts` |
| `getSetCounts()` | `getCollectionCounts()` | `token-store.ts` |
| `getSetDescriptions()` | `getCollectionDescriptions()` | `token-store.ts` |
| `getSetMetadata(name)` | `getCollectionMetadata(name)` | `token-store.ts` |
| `getSetPublishRoute(name)` | `getCollectionPublishRoute(name)` | `token-store.ts` |

### Phase 3 — Client-Owned Identifiers

#### Plugin Message Names

| Current | Suggested | Location |
|---|---|---|
| `get-active-themes` | `get-selected-modes` | `shared/types.ts` |
| `set-active-themes` | `set-selected-modes` | `shared/types.ts` |
| `active-themes-loaded` | `selected-modes-loaded` | `shared/types.ts` |

#### Local Storage Keys

| Current Key | Current Value | Suggested Key | Location |
|---|---|---|---|
| `ACTIVE_SET` | `tm_active_set` | `ACTIVE_COLLECTION` | `storage.ts` |
| `ACTIVE_MODES` | `tm_active_themes` | `SELECTED_MODES` | `storage.ts` |
| `IMPORT_TARGET_SET` | `importTargetSet` | `IMPORT_TARGET_COLLECTION` | `storage.ts` |
| `CROSS_SET_RECENTS` | `tm_cross_set_recents` | `CROSS_COLLECTION_RECENTS` | `storage.ts` |
| Per-set builders | `token-sort:{setName}` etc. | Parameter rename: `collectionId` | `storage.ts` |

#### App State Variables

| Current | Suggested | Location |
|---|---|---|
| `activeSet` | `activeCollection` | `App.tsx` |
| `setActiveSet` | `setActiveCollection` | `App.tsx` |
| `pathToSet` | `pathToCollection` | `App.tsx` |
| `addSetToState` | `addCollectionToState` | `App.tsx` |
| `removeSetFromState` | `removeCollectionFromState` | `App.tsx` |

#### Context Exports

| Current | Suggested | Location |
|---|---|---|
| `TokenSetsContext` | `TokenCollectionsContext` | `TokenDataContext.tsx` |
| `useTokenSetsContext()` | `useTokenCollectionsContext()` | `TokenDataContext.tsx` |
| `TokenSetsContextValue` | `TokenCollectionsContextValue` | `TokenDataContext.tsx` |

#### Figma pluginData Fields

| Current | Suggested | Location |
|---|---|---|
| `tokenSet` | `tokenCollection` | `variableSync.ts`, `controller.ts` |
