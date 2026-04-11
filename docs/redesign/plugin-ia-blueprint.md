# Plugin IA Reference

## Status

Audited on 2026-04-09.

This file stays in `docs/redesign/` because it still adds one piece of value the code does not: a compact cross-workspace map of shell ownership, secondary surfaces, and overlay rules. Temporary planning-only guidance has been removed so the document reflects the implemented information architecture instead of an in-flight redesign plan.

## Implementation anchors

The current shell contract is implemented in:

- `packages/figma-plugin/src/ui/shared/navigationTypes.ts`
- `packages/figma-plugin/src/ui/App.tsx`
- `packages/figma-plugin/src/ui/panels/PanelRouter.tsx`
- `packages/figma-plugin/src/ui/components/WelcomePrompt.tsx`

`TOP_TABS` remains the internal routing model. `WORKSPACE_TABS`, `SECONDARY_SURFACES`, and `UTILITY_MENU` define the user-facing shell.

## IA principles

1. Primary navigation is job-based, not implementation-based.
2. Section tabs only appear inside the active workspace.
3. Fast object switching stays lightweight; structural management lives in dedicated secondary surfaces.
4. Default authoring paths stay simple; advanced logic appears as explicit deeper views.
5. The utility menu is for transient actions, not substitute navigation.
6. Every surface should clearly read as one of: workspace screen, contextual sub-screen, secondary takeover, contextual panel, or transient overlay.

## Primary workspaces

| Workspace | Primary job                                           | Current sections                   | Notes                                                                                    |
| --------- | ----------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `Tokens`  | Build and edit the token library                      | `Library`, `Generators`            | Main authoring home for token sets, previews, and generator work.                        |
| `Themes`  | Define theme axes, overrides, and resolver logic      | none in shell                      | Deeper theme views stay inside the workspace instead of becoming peer destinations.      |
| `Apply`   | Inspect selected layers and apply tokens on canvas    | `Selection`, `Canvas`              | Default path stays focused on the current selection.                                     |
| `Sync`    | Publish to Figma and handle repo or file handoff work | `Figma Sync`, `Repo / Handoff`     | Publish stays primary; repo work remains adjacent for downstream delivery.               |
| `Audit`   | Review quality, history, and graph relationships      | `Audit`, `History`, `Dependencies` | `Dependencies` is internally routed through `apply` but belongs to `Audit` in the shell. |

## Secondary shell surfaces

These are long-lived takeovers that keep the shell visible while replacing the body:

- `Import`
- `Sets`
- `Notifications`
- `Shortcuts`
- `Settings`

## Utility menu

`Tools` owns transient actions that dismiss back to the current surface:

- `Command palette`
- `Paste tokens`
- `Window size`

## Start flow

The implemented start flow still resolves through `WelcomePrompt` and its shared branch model:

- `root`
- `import`
- `template`
- `guided-setup`
- `template-library`
- `manual`

Tokens empty states and recovery entry points should deep-link straight into these branches instead of recreating onboarding copy inline. The current Tokens start shortcuts reopen `guided-setup`, `template-library`, `import`, and `manual` directly while still resolving through the same `WelcomePrompt` branch model.

## Settings ownership

`Settings` stays a secondary takeover, but its advanced actions are not one undifferentiated bucket:

- Recovery and start-over helpers own reversible state repair and re-entry work such as `export settings`, `restore settings`, `guided setup`, and `undo depth`.
- Guided setup belongs with recovery because it relaunches the shared start flow without deleting workspace data.
- Destructive reset controls own irreversible workspace wipes only. They should sit in their own clearly labeled section with stronger warning styling and should not appear adjacent to routine import, export, or restart affordances.

## Surface model

| Surface type                    | Definition                                                                       | Current examples                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Primary workspace screen        | Shell-owned route reachable from workspace or section tabs                       | `Tokens > Library`, `Apply > Canvas`, `Sync > Repo / Handoff`                               |
| Contextual workspace sub-screen | Deeper route that stays owned by one workspace and preserves parent context      | Theme coverage, theme compare, advanced theme logic, dependency tracing                     |
| Secondary takeover              | Full-height body replacement that keeps the shell visible                        | `Import`, `Sets`, `Notifications`, `Shortcuts`, `Settings`                                  |
| Persistent contextual panel     | Editing or review surface shown beside the current screen or in a bottom drawer  | Token compare, token editor, generator editor, token preview                                 |
| Split preview                   | Library body plus a dedicated live preview pane that stays mounted in the layout | `Tokens > Library` split preview                                                             |
| Transient overlay               | Short-lived modal or picker that dismisses back to the current surface           | Start flow, command palette, quick apply, set switcher, paste tokens, color scale generator |

## Contextual screen inventory

### Tokens workspace

- `Tokens > Library` owns one surface contract: the library body stays mounted, compare or editors attach as contextual panels, and live preview can expand into the split preview pane without changing workspace ownership.
- Token compare, token editor, generator editor, and token preview are all contextual library surfaces. They never replace the underlying library browse state.
- Split preview is a presentation of the `Tokens > Library` contract, not a separate workspace or shell route.
- `Tokens > Generators` owns generator authoring and returns to the library after creation or refinement.
- `Sets` is the structural management takeover for rename, reorder, merge, split, duplicate, and metadata work.

### Themes workspace

- The default route is theme authoring.
- Coverage review, compare, and advanced theme logic remain contextual theme views rather than top-level shell sections.

### Apply workspace

- `Selection` is the default inspection and binding screen.
- `Canvas` is the broader review screen for coverage and usage outside the current selection.

### Sync workspace

- `Figma Sync` owns preflight, compare, and publish work into the active Figma file.
- `Repo / Handoff` owns export generation and repository-oriented downstream delivery tasks.

### Audit workspace

- `Audit` owns validation, warning, duplicate, and health review.
- `History` owns recent operations and rollback context.
- `Dependencies` owns alias and graph tracing even though the internal route still sits in the `apply` bucket.

## Shared shell anatomy

The plugin shell currently reads top-to-bottom in this order:

1. Global status banner when connection or setup needs attention.
2. Workspace row.
3. Secondary surfaces row.
4. Workspace summary strip with section tabs, status pills, and workspace actions.
5. Workspace-specific contextual controls.
6. Main panel body for the active workspace section or secondary takeover.
7. Contextual side panel, drawer, or split preview when the current screen supports in-place editing.
8. Modal and transient overlays above the shell.

## Notice placement rules

Notices use one shared severity model (`NoticeSeverity` in `noticeSystem.tsx`): `info`, `success`, `warning`, `stale`, and `error`. The primitives below determine **where** a notice appears.

| Primitive            | When to use                                                                                         | Placement                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `NoticePill`         | Compact status indicator inside a header strip or list row (e.g. stale count, error count)          | Inline within workspace summary strip or row-level metadata    |
| `NoticeBanner`       | Persistent panel-level condition that affects the entire surface (e.g. disconnected, invalid config) | Top of the panel body, below workspace controls                |
| `NoticeFieldMessage` | Validation feedback tied to a single form field                                                     | Directly below the input it describes                          |
| Toast (`dispatchToast`) | Ephemeral confirmation or failure after a user action (save, publish, apply)                     | Bottom of the plugin window, auto-dismisses                    |

**Selection guidelines:**

1. If the notice describes the outcome of an action the user just performed, use a toast.
2. If the notice describes a persistent condition of the current surface, use a banner.
3. If the notice is a validation result for a specific input, use a field message.
4. If the notice is a compact status count in a header or list, use a pill.
5. Never duplicate the same information across two notice types simultaneously.

## Transition rules

1. Workspace screens and contextual sub-screens navigate in place and keep the shell visible.
2. Secondary takeovers replace the body but restore the previously active workspace when closed.
3. Contextual panels remain attached to the current workspace instead of becoming shell destinations.
4. Transient overlays dismiss back to the exact underlying workspace screen or takeover.
5. Longer review and management work belongs in secondary takeovers; short actions belong in transient overlays.
