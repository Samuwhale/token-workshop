# Plugin IA Blueprint

## Purpose

This document is the canonical redesign blueprint for the Token Manager plugin information architecture. Backlog items that change navigation, screen ownership, empty states, overflow panels, or cross-screen flows should reference this file before implementation.

The redesign goal is to make the plugin read like a job-focused workspace shell instead of a collection of internal tools. Users should always know:

1. what job they are in,
2. what the next step inside that job is,
3. where advanced or secondary tooling lives.

## Source of truth

This blueprint is aligned to the current implementation anchors:

- `packages/figma-plugin/src/ui/shared/navigationTypes.ts`
- `packages/figma-plugin/src/ui/App.tsx`
- `packages/figma-plugin/src/ui/panels/PanelRouter.tsx`
- `packages/figma-plugin/src/ui/components/WelcomePrompt.tsx`
- `scripts/backlog/patterns.md`
- `scripts/backlog/progress.txt`

`TOP_TABS` remains the internal routing model. `WORKSPACE_TABS` is the user-facing shell model and is the canonical source for primary IA decisions.

## IA principles

1. Primary navigation is job-based, not implementation-based.
2. Section navigation only appears inside the active workspace.
3. Frequently switched objects get lightweight switchers; structural management lives elsewhere.
4. Beginner authoring stays on the default path; expert workflows get explicit advanced entry points.
5. The command palette is a power layer for actions, not a backup navigation system.
6. Global utilities stay outside the workspace tabs.
7. New surfaces must declare whether they are primary screens, contextual review screens, overflow panels, or transient modal/panel tools.

## Primary workspaces

| Workspace | Primary job | Sections | Notes |
| --- | --- | --- | --- |
| `Tokens` | Build and edit the token library | `Library`, `Generators` | Default landing area for ongoing token authoring. |
| `Themes` | Define theme axes, options, overrides, and resolver logic | none in shell; internal contextual views stay inside the workspace | Theme authoring is the default; compare/coverage/advanced are subordinate views, not peer homes. |
| `Apply` | Inspect selected layers and apply tokens on canvas | `Selection`, `Canvas` | Focused on current design application work. |
| `Sync` | Sync variables/styles to Figma and generate handoff artifacts | `Sync to Figma`, `Export` | Export stays adjacent to sync because both are handoff actions. |
| `Audit` | Review library quality, history, and graph-level relationships | `Audit`, `History`, `Dependencies` | `Dependencies` is internally routed under `apply`, but shell ownership belongs to `Audit`. |

## Secondary navigation model

### 1. Workspace shell

- The top row is reserved for the five primary workspaces only.
- Workspace labels should stay stable; do not expose internal route buckets like `Define`, `Ship`, or `Inspect` in the shell.
- Selecting a workspace restores its last relevant section/sub-view through the internal route mapping.

### 2. Section tabs

- Section tabs appear only when the active workspace has more than one section.
- Section labels describe the current slice of work inside the workspace, not implementation details.
- Section switching stays inside the active workspace and never opens modals.

### 3. Workspace summary strip

- Every workspace gets one summary strip directly under the workspace tabs.
- The strip contains:
  - workspace label and current section description,
  - section tabs when relevant,
  - workspace status pills,
  - workspace-scoped actions on the right.
- Pills summarize status; they should not become a second navigation row.

### 4. Global utilities

- `Utilities` is the global secondary menu.
- It owns app-wide tools that are useful everywhere but are not primary workspaces:
  - command palette,
  - token import entry,
  - notifications,
  - keyboard shortcuts,
  - window sizing,
  - settings.
- Utilities should not contain destinations that deserve a primary workspace.

### 5. Tokens workspace sub-navigation

- `Tokens > Library` owns the horizontal set bar.
- The set bar is for fast switching only.
- `Set Switcher` is a quick-search switch surface.
- `Set Manager` is the dedicated structural-management surface for create, rename, reorder, merge, split, duplicate, and bulk actions.
- Theme/mode selectors remain contextual controls inside `Tokens > Library`, not standalone destinations.

### 6. Unified start flow

- `Start here` is the canonical onboarding/start surface.
- Entry points from empty states, settings, and command palette should deep-link into this single flow.
- Branches:
  - `root`
  - `import`
  - `template`
  - `guided-setup`
  - `template-library`
  - `manual`

### 7. Contextual secondary views

- Some workflows stay inside a workspace but are not top-level shell sections.
- These views must preserve a clear "back to authoring" or "back to library" action.
- Current examples:
  - theme coverage review,
  - theme compare,
  - advanced theme logic,
  - token compare in place,
  - token editor / generator editor / preview side panels.

## Screen model

Every UI surface should fit exactly one of these buckets.

| Surface type | Definition | Examples |
| --- | --- | --- |
| Primary workspace screen | A route owned by a workspace and reachable from the shell/section tabs | `Tokens > Library`, `Apply > Canvas`, `Sync > Export` |
| Contextual workspace sub-screen | A deeper screen that remains inside one workspace and carries context from the parent screen | Theme coverage, theme compare, advanced theme logic |
| Overflow panel | A full-height replacement surface opened from utilities or management actions | Import, Settings, Set Manager |
| Persistent contextual panel | Editor, preview, or detail surface shown beside/over the current primary screen | Token editor, generator editor, token preview |
| Modal / transient tool | Short-lived task surface that does not replace the workspace | Start here, command palette, quick apply, set switcher, notifications |

## Key user journeys

### 1. Start or import a system

1. Land in `Tokens > Library` with an empty-state or explicit `Start here` entry.
2. Choose one start branch: import, template, guided setup, or manual.
3. Return into the relevant authoring workspace rather than remaining in a setup-only destination.

### 2. Author tokens

1. Enter `Tokens > Library`.
2. Switch the active set via the set bar or set switcher.
3. Create/edit tokens, inspect previews, or open token compare in place.
4. Escalate to `Tokens > Generators` when the task is scale/template generation rather than manual editing.

### 3. Build generators

1. Enter `Tokens > Generators` directly or from a contextual token/library action.
2. Create or refine a generator.
3. Return to `Tokens > Library` with the generated group visible and editable.

### 4. Author themes

1. Enter `Themes`.
2. Stay on the default authoring view: create axes, define options, map sets, preview the active combination.
3. Launch coverage review or compare from the axis/option currently being edited.
4. Open `Advanced theme logic` only for resolver-specific or cross-dimensional logic.

### 5. Apply tokens to designs

1. Enter `Apply > Selection` for current-selection binding work.
2. Use `Apply > Canvas` for broader canvas-level review.
3. Open `Audit > Dependencies` when the job shifts from applying values to tracing relationships.

### 6. Sync and handoff

1. Enter `Sync > Sync to Figma` for publish/readiness work.
2. Move to `Sync > Export` for file generation and external handoff.
3. Stay in the same workspace because both screens serve the same delivery phase.

### 7. Review quality and history

1. Enter `Audit > Audit` for quality issues and library health.
2. Move to `Audit > History` for operation review and rollback context.
3. Use `Audit > Dependencies` when relationship tracing is the main task.

## Screen inventory

### Primary workspace screens

| Workspace | Section / screen | Internal route | Current implementation owner |
| --- | --- | --- | --- |
| Tokens | Library | `define / tokens` | `TokenList` via `PanelRouter.renderDefineTokens()` |
| Tokens | Generators | `define / generators` | `GraphPanel` |
| Themes | Theme authoring home | `define / themes` | `ThemeManager` default `authoring` view |
| Apply | Selection | `apply / inspect` | `SelectionInspector` |
| Apply | Canvas | `apply / canvas-analysis` | `CanvasAnalysisPanel` |
| Sync | Sync to Figma | `ship / publish` | `PublishPanel` |
| Sync | Export | `ship / export` | `ExportPanel` |
| Audit | Audit | `ship / health` | `HealthPanel` |
| Audit | History | `ship / history` | `HistoryPanel` |
| Audit | Dependencies | `apply / dependencies` | `TokenFlowPanel` |

### Contextual workspace sub-screens

| Parent workspace | Screen | Owner |
| --- | --- | --- |
| Themes | Coverage review | `ThemeManager` `coverage` view |
| Themes | Compare | `ThemeManager` `compare` view |
| Themes | Advanced theme logic | `ThemeManager` `advanced` view |
| Tokens | In-place token compare | `UnifiedComparePanel` from `Tokens > Library` |
| Tokens | Token editor | `TokenEditor` side panel/drawer |
| Tokens | Generator editor | `TokenGeneratorDialog` in panel mode |
| Tokens | Token preview | `TokenDetailPreview` |

### Overflow panels

| Trigger area | Screen | Notes |
| --- | --- | --- |
| Utilities | Import | Replaces main panel until dismissed. |
| Utilities | Settings | Replaces main panel until dismissed. |
| Tokens workspace | Set Manager | Dedicated management surface, not a quick switcher. |

### Global modals and transient tools

| Surface | Purpose |
| --- | --- |
| Start here | Unified onboarding and entry flow |
| Command palette | Power-user actions and contextual commands |
| Quick apply | Fast token application from the current selection |
| Set switcher | Fast token-set switching |
| Notification history | Review recent toasts/notifications |
| Keyboard shortcuts | Global help surface |

## Shared screen anatomy

The plugin should read from top to bottom in this order:

1. Global status banner when connection/setup needs attention.
2. Workspace tabs.
3. Workspace summary strip with description, section tabs, pills, and workspace actions.
4. Workspace-specific contextual controls.
   - Example: set bar in `Tokens > Library`.
   - Example: theme/mode selection controls relevant to token authoring.
5. Main panel body routed by the active workspace/section.
6. Contextual side panel, drawer, or split preview when the current screen supports in-place editing.
7. Modal/transient layers above the shell.

### Anatomy rules

1. Do not add a second top-level navigation strip outside the workspace shell.
2. If a control only matters in one workspace, place it below the workspace summary strip, not in global chrome.
3. If a surface replaces the main panel entirely, it is an overflow panel and must have a clear back/close action.
4. If a surface needs the current parent context to make sense, keep it contextual and include an explicit return path.
5. Status pills summarize state; actions belong in buttons, menus, or section tabs.

## Migration rules

### Route ownership

1. Keep internal route buckets (`TOP_TABS`) stable unless there is a strong implementation reason to change them.
2. Change the user-facing IA through `WORKSPACE_TABS` and workspace mapping first.
3. If a screen conceptually belongs to a different user job than its internal route bucket, remap it at the shell level instead of forcing a router rewrite.

### New screens

Every new screen proposal must answer:

1. Which workspace owns it?
2. Is it a primary screen, contextual sub-screen, overflow panel, or transient modal?
3. What is its parent journey?
4. What is the explicit back path?
5. Why does it not belong in an existing section or utility surface?

If those answers are unclear, the screen is not ready to ship.

### Command palette

1. Do not add obvious workspace or settings destinations to the command palette.
2. Prefer expert actions, toggles, contextual operations, undo/redo, and other speed paths.
3. Keep category labels visible so commands remain legible after IA changes.

### Switchers vs managers

1. Fast switching surfaces stay lightweight and selection-focused.
2. Structural operations move into dedicated manager surfaces.
3. Do not let object-count thresholds change the interaction model.

### Beginner vs expert flows

1. Keep one primary authoring home for each domain.
2. Put advanced logic behind an explicit advanced route or action.
3. Preserve stable imperative entry points when refactoring internals so commands and cross-screen links do not churn.

### Start-flow and empty-state changes

1. New onboarding or empty-state entry points must route into `Start here`, not open parallel root-level flows.
2. Branch additions should extend the existing flow model instead of creating a new top-level modal.

### Overflow panels and utilities

1. Use overflow panels for utilities, settings, import/export-adjacent management, or structural tasks that temporarily replace the main workspace body.
2. Do not use overflow panels to hide primary workspaces.

## Open decisions

These are known follow-up questions, not blockers to using this blueprint as the current canonical model.

1. `Utilities` is still a broad bucket. As more global tools appear, reevaluate whether some should become clearer named secondary surfaces instead of one catch-all menu.
2. The global connection/setup banner is still outside the workspace model. Future work may fold parts of that status into the shell without hiding urgent offline/error states.
3. The workspace summary strip is implemented inline in `App.tsx`. It may eventually deserve extraction into a shared shell component, but the IA contract should stay the same if that refactor happens.

## Definition of done for IA backlog items

An IA item is only done when:

1. the target screen ownership is reflected in this blueprint or intentionally matches it,
2. the implementation follows the surface type and migration rules above,
3. command palette, utilities, and entry points are updated to match the new ownership,
4. any changed user journey still has a clear return path to its parent workspace.

When an implementation intentionally diverges from this blueprint, update this file in the same change. This document is the artifact future backlog items should cite rather than re-deriving the shell model from code history.
