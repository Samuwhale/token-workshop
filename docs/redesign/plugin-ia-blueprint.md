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

| Workspace | Primary job | Current sections | Notes |
| --- | --- | --- | --- |
| `Tokens` | Build and edit the token library | `Library`, `Generators` | Main authoring home for token sets, previews, and generator work. |
| `Themes` | Define theme axes, overrides, and resolver logic | none in shell | Deeper theme views stay inside the workspace instead of becoming peer destinations. |
| `Apply` | Inspect selected layers and apply tokens on canvas | `Selection`, `Canvas` | Default path stays focused on the current selection. |
| `Sync` | Publish to Figma and handle repo or file handoff work | `Figma Sync`, `Repo / Handoff` | Publish stays primary; repo work remains adjacent for downstream delivery. |
| `Audit` | Review quality, history, and graph relationships | `Audit`, `History`, `Dependencies` | `Dependencies` is internally routed through `apply` but belongs to `Audit` in the shell. |

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

Empty states and recovery entry points should continue deep-linking into these branches instead of creating parallel root-level onboarding flows.

## Surface model

| Surface type | Definition | Current examples |
| --- | --- | --- |
| Primary workspace screen | Shell-owned route reachable from workspace or section tabs | `Tokens > Library`, `Apply > Canvas`, `Sync > Repo / Handoff` |
| Contextual workspace sub-screen | Deeper route that stays owned by one workspace and preserves parent context | Theme coverage, theme compare, advanced theme logic, dependency tracing |
| Secondary takeover | Full-height body replacement that keeps the shell visible | `Import`, `Sets`, `Notifications`, `Shortcuts`, `Settings` |
| Persistent contextual panel | Editing or preview surface shown beside the current screen or in a bottom drawer | Token editor, generator editor, token preview, split preview |
| Transient overlay | Short-lived modal or picker that dismisses back to the current surface | Start flow, command palette, quick apply, set switcher, paste tokens, color scale generator |

## Contextual screen inventory

### Tokens workspace

- `Tokens > Library` is the parent for token browsing, set switching, token compare, token preview, and token editing.
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

## Transition rules

1. Workspace screens and contextual sub-screens navigate in place and keep the shell visible.
2. Secondary takeovers replace the body but restore the previously active workspace when closed.
3. Contextual panels remain attached to the current workspace instead of becoming shell destinations.
4. Transient overlays dismiss back to the exact underlying workspace screen or takeover.
5. Longer review and management work belongs in secondary takeovers; short actions belong in transient overlays.
