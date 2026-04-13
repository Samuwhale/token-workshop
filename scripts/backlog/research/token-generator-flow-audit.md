# Token Generator Flow Audit

## Scope

- Reviewed the current generator composer in `packages/figma-plugin/src/ui/components/TokenGeneratorDialog.tsx`, `packages/figma-plugin/src/ui/components/generator-steps/StepWhat.tsx`, `packages/figma-plugin/src/ui/components/generator-steps/StepWhere.tsx`, `packages/figma-plugin/src/ui/components/generator-steps/StepReview.tsx`, `packages/figma-plugin/src/ui/hooks/useGeneratorDialog.ts`, `packages/figma-plugin/src/ui/hooks/useGeneratorPreview.ts`, and `packages/figma-plugin/src/ui/hooks/useGeneratorSave.ts`.
- Reviewed the current generator management surfaces in `packages/figma-plugin/src/ui/components/GeneratorPipelineCard.tsx`, `packages/figma-plugin/src/ui/components/GraphPanel.tsx`, and `packages/figma-plugin/src/ui/hooks/useGenerators.ts`.
- Reviewed the current starter-template surfaces in `packages/figma-plugin/src/ui/components/graph-templates.ts`, `packages/figma-plugin/src/ui/components/TemplatePicker.tsx`, `packages/figma-plugin/src/ui/components/QuickGeneratorPopover.tsx`, and `packages/figma-plugin/src/ui/components/QuickStartWizard.tsx`.
- Reviewed the server-side generator execution model in `packages/server/src/services/generator-service.ts`.
- Declared touch paths `packages/figma-plugin/src/ui/components/GeneratorStepWhat.tsx`, `packages/figma-plugin/src/ui/components/GeneratorStepWhere.tsx`, and `packages/figma-plugin/src/ui/components/GeneratorStepReview.tsx` are stale in the current codebase. Their responsibilities now live under `packages/figma-plugin/src/ui/components/generator-steps/`.
- Declared touch path `packages/figma-plugin/src/ui/hooks/useGeneratorDraft.ts` is stale in the current codebase. Draft state is now owned by `packages/figma-plugin/src/ui/hooks/useGeneratorDialog.ts`.

## Current Flow

### 1. Generator creation starts from multiple entry points with different mental models

- The main generator workspace pushes users toward templates from `GraphPanel`, with copy that still frames the feature around generator mechanics rather than designer goals (`packages/figma-plugin/src/ui/components/GraphPanel.tsx:625-629`).
- `QuickGeneratorPopover` is the opposite extreme: it receives a pre-selected `generatorType`, seeds the dialog with that type, and asks the user to tune parameters immediately (`packages/figma-plugin/src/ui/components/QuickGeneratorPopover.tsx:131-149`, `:206-243`).
- `QuickStartWizard` is still explicitly described as a three-step guided setup, but its first step is template selection, its second step is a separate semantic dialog, and the actual generator configuration happens inside `TokenGeneratorDialog` as an overlay (`packages/figma-plugin/src/ui/components/QuickStartWizard.tsx:571-610`, `:676-710`).
- Existing graph templates already contain useful outcome metadata such as `label`, `description`, `whenToUse`, `stages`, and semantic layers, but they live in a separate template library instead of driving the default new-generator flow (`packages/figma-plugin/src/ui/components/graph-templates.ts:14-24`, `:27-234`; `packages/figma-plugin/src/ui/components/TemplatePicker.tsx:166-239`).

### 2. The current composer is visually single-page, but structurally still behaves like a three-phase wizard

- `TokenGeneratorDialog` renders `StepWhat`, `StepWhere`, and `StepReview` sequentially, separated by dividers, with a single footer button that first calls `handleSave()` and later `handleConfirmSave()` once confirmation is active (`packages/figma-plugin/src/ui/components/TokenGeneratorDialog.tsx:113-140`, `:304-389`).
- `StepWhat` still begins from a compact type dropdown. Users must already know which generator class they want before they see the corresponding editor, even though the UI tries to soften that with one-line descriptions and a small `rec.` marker (`packages/figma-plugin/src/ui/components/generator-steps/StepWhat.tsx:134-215`).
- `useGeneratorDialog` only recommends a type when a source token already exists, and the recommendation comes from `detectGeneratorType`, which is based on token type and a basic dimension-size heuristic (`packages/figma-plugin/src/ui/hooks/useGeneratorDialog.ts:216-233`; `packages/figma-plugin/src/ui/components/generators/generatorUtils.ts:26-40`).
- All 11 generator types are available in code, but they are still grouped as primary and advanced technical types rather than user goals (`packages/figma-plugin/src/ui/hooks/useGenerators.ts:9-20`; `packages/figma-plugin/src/ui/components/generators/generatorUtils.ts:101-129`).

### 3. Preview is live, but the draft and save systems do not surface the same risk model at the same time

- `useGeneratorPreview` continuously fetches preview tokens and computes created, updated, deleted, and unchanged diff buckets against the current target set (`packages/figma-plugin/src/ui/hooks/useGeneratorPreview.ts:80-138`, `:206-272`).
- `StepReview` is the first place where overwrite warnings, manual-edit conflict warnings, and the modified/new token breakdown are shown together (`packages/figma-plugin/src/ui/components/generator-steps/StepReview.tsx:74-158`).
- `useGeneratorSave` only runs the manual-edit overwrite check for existing generators, only after review data exists, and still flips the flow into an explicit confirmation state with `setShowConfirmation(true)` before commit (`packages/figma-plugin/src/ui/hooks/useGeneratorSave.ts:415-463`, `:473-510`).
- On the server, `checkOverwrites()` can detect manual edits against generator-owned outputs and `dryRun()` can compute full diff buckets, but the UI uses those results late and asymmetrically across create vs edit flows (`packages/server/src/services/generator-service.ts:1497-1630`).

### 4. Status and dependency data exist, but the dashboard only shows a shallow slice

- Individual cards already show `isStale`, `lastRunError`, pause state, semantic layer presence, and quick re-run actions (`packages/figma-plugin/src/ui/components/GeneratorPipelineCard.tsx:998-1006`, `:1304-1566`).
- The higher-level dashboard in `GraphPanel` only aggregates stale count plus search and type filters; it does not present dependency chains, blocked descendants, or run history as a first-class summary (`packages/figma-plugin/src/ui/components/GraphPanel.tsx:633-790`).
- `useGenerators` fetches the raw generator list and derives only simple lookup maps by source token, target group, and derived token path (`packages/figma-plugin/src/ui/hooks/useGenerators.ts:285-354`).
- The server already computes topological dependency order, blocks downstream generators when an upstream fails, and stores `blockedBy` information in `lastRunError`, but that richer dependency state is not exposed as dashboard-ready metadata (`packages/server/src/services/generator-service.ts:1637-1758`, `:1761-1815`).

### 5. Semantic aliases are partially integrated, but still feel optional and late

- New-generator semantic setup in `StepWhere` only appears when preview tokens already exist and the user is not editing. That makes alias planning contingent on having already configured the scale (`packages/figma-plugin/src/ui/components/generator-steps/StepWhere.tsx:143-156`, `:249-320`).
- `useGeneratorSave` auto-populates suggested semantic mappings when the user initiates save, but it also explicitly leaves `semanticEnabled` off, so discovery happens right before confirmation instead of during planning (`packages/figma-plugin/src/ui/hooks/useGeneratorSave.ts:480-507`).
- Existing generators push semantic editing back into `GeneratorPipelineCard` through a secondary “Add layer / Edit layer” action, which reinforces the idea that aliases are an add-on rather than part of the generator plan (`packages/figma-plugin/src/ui/components/GeneratorPipelineCard.tsx:1511-1565`).
- The template system already knows how to describe semantic layers ahead of time, including previewable alias mappings, but that planning information is not reused as a dedicated step in the default composer (`packages/figma-plugin/src/ui/components/TemplatePicker.tsx:191-239`; `packages/figma-plugin/src/ui/components/graph-templates.ts:27-234`).

## Friction Matrix By Generator Type

| Generator type | Designer intent | Current friction | Recommended starter model |
| --- | --- | --- | --- |
| `colorRamp` | “Create a brand palette” | Buried behind the type dropdown; the best template content lives outside the main composer; lightness curve and chroma controls are expert-first even though presets exist (`StepWhat.tsx:157-215`; `ColorRampGenerator.tsx:357-470`). | Outcome cards such as Brand palette, Neutral ramp, Status palette, Semantic color system. |
| `typeScale` | “Create a typography scale” | Ratio math is still a parameter-first concept; token-linked ratios exist but are tucked inside the expanded editor (`TypeScaleGenerator.tsx:357-430`). | Presets such as App UI, Editorial, Marketing, Dense dashboard. |
| `spacingScale` | “Create a spacing system” | Designers think in 4pt/8pt systems, but the flow still starts from generator type plus multipliers. | Presets such as 4pt compact, 8pt product, Tailwind-style spacing. |
| `borderRadiusScale` | “Create corner radii” | Feels like a minor variant of spacing but is presented as a separate technical type with no goal guidance. | Presets such as Sharp-to-soft, iOS rounded, Data table controls. |
| `opacityScale` | “Define reusable opacity steps” | Standalone flow is mixed into the same chooser even though it behaves more like a mini token set starter than a source-driven generator. | Presets such as overlays, disabled states, elevation overlays. |
| `zIndexScale` | “Define layer ordering” | Read as generator plumbing, not as a UI-layering outcome. No early explanation of how the output will be used. | Presets such as App shell layers, modal stack, popover stack. |
| `shadowScale` | “Create elevation levels” | Standalone generator, but still sits beside source-driven flows; token-linked shadow color is supported but hidden in advanced controls (`graph-templates.ts:121-150`; `GeneratorPipelineCard.tsx:1441-1509`). | Presets such as product elevation, hard shadow, soft ambient. |
| `customScale` | “Generate a bespoke numeric system” | Starts at raw formula syntax, which is the highest-friction entry of all 11 types. | Recipe templates such as timing durations, motion easing steps, dense index scale. |
| `accessibleColorPair` | “Make a readable brand-on-surface pair” | This is really an outcome or validation flow, not a generic generator class; it should not compete equally with spacing or z-index in the default chooser. | Intent card: Contrast-safe pair, with AA/AAA quick presets. |
| `darkModeInversion` | “Create dark-mode counterparts” | Designers think in light/dark theme pairing, but the current label is algorithm-first. | Intent card: Dark-mode counterpart, with semantic theme follow-up built in. |
| `contrastCheck` | “Audit contrast for candidate combinations” | This is closer to an evaluation workflow than token generation; it belongs in a guided audit or QA lane, not buried under “Advanced”. | Intent card: Contrast audit, with presets for text-on-surface, brand-on-surface, and state colors. |

## Recommendations

### A. Replace type-first creation with an intent-first composer

Use one shared entry surface across `GraphPanel`, token quick actions, and guided setup:

- Stage 0 should ask “What do you want to create?” rather than “Which generator type?”
- Each card should be phrased in designer outcomes:
  - Create a brand palette
  - Create a spacing system
  - Create a typography scale
  - Create elevation levels
  - Create semantic color roles
  - Create a dark-mode counterpart
  - Create a contrast-safe pair
  - Audit contrast
  - Create layer ordering
  - Create corner radii
  - Build a custom numeric system
- Source context should rank cards rather than pre-commit a type. If the user launched from a color token, palette, dark-mode, and accessible-pair intents should float to the top, but the user should still see the broader goal list.
- Existing `GraphTemplate` metadata is the right substrate for this because it already contains `whenToUse`, stage labels, semantic layers, and starter config. The current gap is that templates are optional browsing content instead of the default discovery model.

### B. Split configuration into starter presets first, advanced tuning second

The composer should default to a two-layer model:

- Layer 1: “Choose a starter”
  - one-click presets with output preview, when-to-use copy, and expected token count
  - one preset family for every generator type, not only the currently templated ones
- Layer 2: “Tune the details”
  - advanced fields, curves, formulas, exact step editing, and token refs
  - only opened after a preset is chosen or when the user explicitly expands advanced controls

This matters most for:

- `colorRamp`, `typeScale`, and `spacingScale`, where presets already exist in the component editors but are framed as parameter presets rather than outcome presets.
- `customScale`, where recipe templates should replace the blank-formula starting point.
- `contrastCheck`, `accessibleColorPair`, and `darkModeInversion`, where the user should not have to translate desired outcomes into generator mechanics.

### C. Surface token-linked parameters as part of guided setup, not expert discovery

- The system already supports `$tokenRefs` in type definitions and resolves them on the server before execution (`packages/figma-plugin/src/ui/hooks/useGenerators.ts:22-50`; `packages/server/src/services/generator-service.ts:2415-2495`).
- Relevant editors already have `TokenRefInput`, but those controls are inside expanded customize panels for key fields such as color-ramp endpoints and type-scale ratio (`packages/figma-plugin/src/ui/components/generators/ColorRampGenerator.tsx:397-470`; `packages/figma-plugin/src/ui/components/generators/TypeScaleGenerator.tsx:407-417`).
- Recommended direction:
  - show a visible “Link this to another token” affordance next to token-ref-capable fields even before advanced disclosure
  - show a plain-language explanation such as “Keep this ratio driven by another token”
  - let presets declare token-ref-friendly fields so the UI can highlight them consistently

### D. Move semantic alias planning into an explicit output-planning step

Current semantic mapping is too late because it depends on preview output already existing and is still toggled off by default during save preparation (`StepWhere.tsx:143-156`, `:249-320`; `useGeneratorSave.ts:480-507`).

Recommended flow:

1. Intent
2. Output plan
3. Semantic plan
4. Fine tune
5. Confirm

Semantic plan should:

- appear before final review
- show starter patterns immediately after the preset determines step names
- let the user pick “No semantic aliases”, “Suggested pattern”, or “Custom mapping”
- preview resulting alias paths next to the generated scale
- keep review focused on confirmation, not discovery

This would also let the template layer reuse its existing semantic preview model directly instead of hiding it in a separate library or post-save dialog.

### E. Turn the generator dashboard into an operational surface, not just a card list

The current list and graph views are close, but they stop short of exposing the operational model already present on the server.

Recommended dashboard additions:

- Status column or summary chips:
  - Up to date
  - Needs re-run
  - Failed
  - Blocked by upstream
  - Paused
  - Detached outputs
  - Multi-brand
- Dependency visibility:
  - upstream generator chips
  - downstream count
  - “If this fails, these generators are affected” summary
- Quick actions from the dashboard row:
  - Re-run
  - Retry failed chain
  - View affected outputs
  - View dependents
- Run-history context:
  - last run time
  - last source change time or stale reason
  - last error message inline, not tooltip-only

Server/API implication:

- expose dependency relationships and blocked state directly instead of forcing the client to reverse-engineer them from raw generators
- include stale reason and blocked-by metadata in the main generator payload
- optionally expose a small dashboard DTO if the existing raw generator model should stay lean

### F. Close the preview-to-save gap with live conflict state and pre-commit revalidation

The current model already has the ingredients for safer confirmation, but they are split across preview diff, manual-edit checking, and confirmation-only UI.

Recommended behavior:

- show collisions and manual-edit conflicts in the live preview pane while the draft changes, not only in `StepReview`
- distinguish four categories throughout the flow:
  - safe creates
  - safe updates
  - overwrites of non-generator tokens
  - overwrites of manually edited generator outputs
- store a preview revision or fingerprint so save can quickly detect if the token store changed after the preview was rendered
- revalidate conflicts immediately before commit and report “preview changed since you reviewed it” instead of silently surprising the user
- apply the same conflict language to both create and edit flows so users do not have to learn two different overwrite models

## Recommended Implementation Order

1. Unify creation entry points behind an intent-first composer.
2. Expand preset coverage across all 11 generator types and make token refs discoverable earlier.
3. Move semantic alias planning into a dedicated plan step before review.
4. Expose dependency/status metadata and redesign the generator dashboard around operational status.
5. Tighten preview/save conflict handling with live conflict state plus pre-commit revalidation.

## Follow-up Seeds

- Unify generator entry points behind one goal-first composer.
- Add outcome presets and token-ref guidance across every generator type.
- Promote semantic alias planning into a dedicated planning step.
- Expose dependency graph metadata and blocked-state summaries for the generator dashboard.
- Surface overwrite and manual-edit conflicts during live preview, not only at confirmation.
