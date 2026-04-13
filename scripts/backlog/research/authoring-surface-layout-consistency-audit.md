# Authoring surface layout consistency audit

## Scope

Assigned touch paths partly drifted in the current tree:

- `packages/figma-plugin/src/ui/components/GeneratorStepWhat.tsx`, `GeneratorStepWhere.tsx`, and `GeneratorStepReview.tsx` now live under `packages/figma-plugin/src/ui/components/generator-steps/`.
- `packages/figma-plugin/src/ui/components/TokenCreateLauncher.tsx` does not exist; the quick-create launcher currently lives inside `TokenEditor.tsx` via `createPresentation === "launcher"`.

This audit covers the active authoring surfaces that designers hit during token and generator work:

- `EditorShell` shared frame: `packages/figma-plugin/src/ui/components/EditorShell.tsx:26`
- generator dialog: `packages/figma-plugin/src/ui/components/TokenGeneratorDialog.tsx:193`
- generator authoring steps: `packages/figma-plugin/src/ui/components/generator-steps/StepWhat.tsx:313`, `StepWhere.tsx:110`, `StepReview.tsx:84`
- generator pipeline card and inline editors: `packages/figma-plugin/src/ui/components/GeneratorPipelineCard.tsx:799`, `:1372`, `:2001`, `:2079`
- token editor and quick-create launcher: `packages/figma-plugin/src/ui/components/TokenEditor.tsx:1566`, `:1631`, `:1741`
- canvas quick-create dialog: `packages/figma-plugin/src/ui/components/CanvasCreateTokenDialog.tsx:167`
- batch editor: `packages/figma-plugin/src/ui/components/BatchEditor.tsx:991`
- generator responsive layout CSS: `packages/figma-plugin/src/ui/styles.css:196`

## Current surface inventory

| Surface | Current shell/layout | Width handling today | Main consistency problem |
| --- | --- | --- | --- |
| `EditorShell` | Shared header/body/footer frame | Fills parent, no opinionated spacing/density contract | Good structural base, but it stops at chrome and leaves every surface to invent its own padding, text scale, and footer behavior |
| `TokenGeneratorDialog` | `EditorShell` inside modal or full panel | Modal uses `max-w-[min(56rem,95vw)]`; panel uses `w-full h-full` | Same component serves two very different hosts without a plugin-panel-specific width contract |
| `StepWhat` | Custom two-column config/preview layout | Single column by default; two columns at `min-width: 600px` | Dense preview cards, metrics, and risk lists still use modal-oriented spacing and truncation-heavy rows |
| `StepWhere` | Stacked cards and inline rows | `sm:` inline layouts and fixed row widths inside multi-brand editor | Brand row editor and name/path pairings get cramped fast below ~320px |
| `StepReview` | Stacked summary cards and diff lists | `sm:` metric grids, many truncated mono rows | Review is readable at 360px, but long paths and repeated risk groups collapse into one narrow column of clipped text |
| `CanvasCreateTokenDialog` | Standalone modal, not `EditorShell` | Hard-coded `w-[360px]` | Overflows narrow plugin panels and visually reads as a different app |
| `TokenEditor` | `EditorShell` plus custom banners/footer | Parent-sized; no explicit panel-width behavior | Footer action row and quick-create banner do not adapt when the panel gets very narrow |
| `BatchEditor` | Custom dense panel, no shared shell | Parent-sized; all controls stay in inline rows | The 72px label rail plus `ml-[88px]` preview offsets are effectively desktop assumptions |
| `GeneratorPipelineCard` | Dense card with nested quick-edit/clone/preview sections | Card compresses in parent column; many `max-w-[100px]` truncations | Card chrome, metadata chips, and inline edit panels all compete for the same narrow width |

## Shared layout contract

### Recommended shell

Use one authoring-shell contract for every create/edit/configure surface, whether it is modal, contextual panel, or inline takeover:

- Base on `EditorShell`, but add a thin shared preset for authoring surfaces instead of repeating `headerClassName`, `bodyClassName`, and `footerClassName` per feature.
- Header zone:
  - Height target: `40-44px`
  - Padding: `px-3 py-2` at compact widths, `px-4 py-2.5` at standard widths
  - Title line: `12px semibold`
  - Optional supporting copy or banners must live in `afterHeader`, not inside the body’s first card
- Body zone:
  - Compact spacing scale: `4 / 8 / 12 / 16`
  - Outer padding: `12px` below 360px, `16px` at 360px+
  - Forms should be card-stacked by default, with each section using one shared secondary-surface treatment: rounded border, secondary background, `12px` padding
- Footer zone:
  - Sticky bottom inside the shell
  - Primary action always last in DOM and visual order
  - At narrow widths, actions stack vertically or into a `2 x n` wrap layout; do not require one horizontal row

### Typography and control sizes

Adopt a single authoring scale across generator, token, batch, and quick-create surfaces:

- Screen title: `12px semibold`
- Section title: `11px semibold`
- Field label: `10px medium`
- Body/help text: `10px`
- Mono/path/value rows: `10px`
- Dense metric value: `12-13px semibold`
- Minimum interactive control height: `32px`
- Minimum icon button size: `28px`

Anything below `10px` should be limited to passive badges. The current mix of `9px`, `9.5px`, `10px`, `11px`, `12px`, and `13px` makes the authoring surfaces feel unrelated.

### Field composition rules

- Default to stacked labels above controls below `480px`
- Reserve side-by-side field pairs for `360px+` and only when each field can remain at least `140px` wide
- Do not use fixed left label rails inside forms; use stacked groups instead
- When a control needs helper preview text, keep it directly under the field instead of offsetting it with hard-coded left margins
- Preview lists and conflict lists must wrap token paths with `break-all` or `overflow-wrap:anywhere` once space drops below `320px`

### Shared visual treatments

- One card style for section containers, summary cards, and contextual warnings
- One badge style family for state pills like `Paused`, `Needs re-run`, `Saved scope`, `Multi-brand`
- One button hierarchy:
  - primary filled
  - secondary outline/soft
  - tertiary text
- One empty/loading/error block treatment for preview panes and inline warnings

## Viewport contract

### Plugin-wide widths

- Minimum supported width: `240px`
  - No horizontal overflow
  - No hidden primary actions
  - Long paths may wrap to multiple lines
- Target working width: `320px`
  - All create/edit/configure flows must remain comfortable without opening Figma wider
- Comfortable width: `360-400px`
  - Preferred default for day-to-day authoring
- Enhanced width: `600px+`
  - Generator config may unlock split config/preview layout here

### Required surface behavior by width band

| Width | Required behavior |
| --- | --- |
| `240-279px` | Single-column only; footer buttons stacked; icon actions collapse into overflow menus; preview and diff rows wrap instead of truncate |
| `280-359px` | Single-column section stack; paired fields may become vertical; quick-create and batch-edit controls must avoid fixed label rails and fixed-width summary rows |
| `360-599px` | Standard authoring width; paired fields allowed when they fit; generator preview remains below config, not beside it |
| `600px+` | Optional split layout for generator config vs preview; review metrics can use multi-column grids; sticky side preview allowed |

### Surface-specific breakpoint behavior

| Surface | `240-279px` | `280-359px` | `360-599px` | `600px+` |
| --- | --- | --- | --- | --- |
| `CanvasCreateTokenDialog` | Use full available width minus safe inset; stack footer buttons | Same, with wrapped summary row | Compact modal or panel card | No special change |
| `TokenEditor` | Header banner CTA moves below copy; footer stacks | Quick-create remains single-column | Normal editor layout | No special change |
| `BatchEditor` | Every operation becomes stacked label + control group; previews inline under group | Same, with optional paired inputs for simple rows | Allow short paired rows | No special change |
| `TokenGeneratorDialog` | Single-column shell; preview/risk cards stay in flow | Same | Single-column config then preview | Split config/preview |
| `StepWhere` multi-brand table | Replace grid-like rows with cards per brand row | Same | Optional two-field row per brand | Optional compact table if needed |
| `StepReview` | Summary cards become one per row; long paths wrap | Same | Metric cards can be two-up | Metric cards can be three-up |
| `GeneratorPipelineCard` | Demote source/target chips and semantic details into vertical stacks; card actions collapse cleanly | Same | Normal compact card | No special change |

## Concrete findings and recommended fixes

### 1. Canvas quick-create still assumes a desktop modal width

Observed:

- `CanvasCreateTokenDialog` hard-codes `w-[360px]` at the dialog root: `packages/figma-plugin/src/ui/components/CanvasCreateTokenDialog.tsx:176-181`
- The summary row keeps property, preview value, and type badge inline with no wrap handling: `CanvasCreateTokenDialog.tsx:205-219`
- Footer actions stay in one row: `CanvasCreateTokenDialog.tsx:295-310`

Impact:

- At `240-320px`, the dialog can overflow the Figma panel or force the panel wider than the rest of the plugin
- The inline summary row becomes the first clipping point for long values

Recommended fix:

- Move this surface onto the shared authoring shell
- Replace the fixed width with panel-safe width logic
- Let the summary row become a stacked `label/value/badge` block below `320px`
- Stack footer actions below `280px`

### 2. BatchEditor is the least small-viewport-safe surface in scope

Observed:

- The surface is not using `EditorShell`; it starts from a custom bordered container: `BatchEditor.tsx:991-1014`
- Almost every operation uses a fixed `w-[72px]` label rail plus inline controls: `BatchEditor.tsx:1016-1043`, `1157-1189`, `1295-1334`, `1699-1743`, `1834-1861`
- Follow-up help and previews are positioned with hard-coded `ml-[88px]` offsets: `BatchEditor.tsx:1059`, `1193`, `1259`, `1337`, `1751`, `1807`, `1864`
- Several subsections combine multiple fields and CTA buttons on one row, for example rename, alias replace, and move-to-set: `BatchEditor.tsx:1699-1743`, `1774-1804`, `1834-1861`

Impact:

- The left label rail consumes a third of the panel at `240-280px`
- Preview blocks feel detached from the control they describe
- Inline CTA clusters are the first place where buttons crowd each other or force aggressive truncation

Recommended fix:

- Convert BatchEditor into stacked operation cards
- Replace the left label rail with per-group labels above the controls
- Keep preview, warning, and help text directly under the operation group that owns it
- Split advanced operations such as rename, alias replace, and move/delete into their own compact sections rather than one continuous control sheet

### 3. TokenEditor has shared shell chrome but not shared narrow-width action behavior

Observed:

- `TokenEditor` already uses `EditorShell`: `TokenEditor.tsx:1741-1755`
- The quick-create launcher banner uses side-by-side explanatory copy and CTA: `TokenEditor.tsx:1606-1625`
- The footer can contain delete, cancel, revert, full editor, create-and-new, and primary save in one horizontal row: `TokenEditor.tsx:1631-1735`

Impact:

- The editor looks closer to the desired standard than other surfaces, but its footer is still width-fragile
- Quick create reads like a shell add-on, not the same authoring system as generator creation or canvas quick create

Recommended fix:

- Keep `EditorShell` as the shared frame baseline
- Define a shared authoring footer component with narrow-width wrapping rules
- Pull the quick-create banner into the same authoring-surface primitives as canvas quick create so both entry points share spacing, hierarchy, and CTA placement

### 4. Generator authoring is closer to the target, but still reads like a modal adapted into a panel

Observed:

- Modal host allows very large widths while panel host uses the full panel, with no plugin-panel-specific density mode: `TokenGeneratorDialog.tsx:193-199`
- `StepWhat` uses a single-column stack until `600px`, then a split config/preview layout: `styles.css:196-216`, `StepWhat.tsx:313-385`
- Preview impact cards and many risk lists still rely on truncation-heavy mono rows: `StepWhat.tsx:493-530`, `540-640`
- `StepWhere` multi-brand editing uses fixed 24px brand-column widths and inline row controls: `StepWhere.tsx:39-69`
- `StepReview` repeats several similar warning and diff groups with long path rows rendered as `truncate`: `StepReview.tsx:206-304`

Impact:

- The generator flow is already organized into sections, but the details still optimize for a roomy modal instead of a persistent narrow panel
- Multi-brand and review states become text-dense before they become visually structured

Recommended fix:

- Keep the current section breakdown, but normalize it onto the shared authoring contract
- Treat `600px+` as the only split-view breakpoint for config/preview
- Convert preview impact cards and review summaries into a reusable authoring-metrics component
- Replace truncation-first path rows with wrapping rows in review/risk states
- Rebuild the multi-brand editor as stacked brand cards below `360px`

### 5. Generator pipeline cards compress too much information into the card header and inline expansions

Observed:

- The card header mixes type pill, name, paused/stale/blocked pills, error icon, and enable toggle in one row: `GeneratorPipelineCard.tsx:1374-1493`
- Source and target values truncate at `max-w-[100px]`: `GeneratorPipelineCard.tsx:1532-1588`
- Semantic layer summary, run buttons, more-actions menu, preview, step-values, quick edit, and clone panel all hang off the same card: `GeneratorPipelineCard.tsx:1652-2143`
- `QuickEditPanel` uses paired `Name` and `Target group` fields in one row and a single-row footer with `Save & re-run` plus `Full settings`: `GeneratorPipelineCard.tsx:897-987`
- The action menu is fixed at `w-44`, which is serviceable, but the card relies on the menu to hide overflow rather than simplifying the default visible chrome: `GeneratorPipelineCard.tsx:1779-1987`

Impact:

- The card is scan-friendly at wider widths but becomes a stack of clipped chips and abbreviated values in narrow columns
- Quick edit feels visually detached from the full generator dialog

Recommended fix:

- Reduce the default visible header to `type + name + primary status + overflow`
- Move secondary provenance details into the body stack instead of the first row
- Reuse the same field, label, and footer primitives as `TokenGeneratorDialog`
- Keep inline quick edit intentionally narrow in scope; everything beyond the most common fields should open the full authoring surface

## Visual consistency pass proposal

Run the consistency pass in this order:

1. Introduce shared authoring tokens and shell presets
   - spacing
   - typography
   - field heights
   - card treatments
   - footer behavior
2. Unify quick-create entry points
   - canvas quick create
   - token quick-create launcher inside `TokenEditor`
3. Refactor BatchEditor onto stacked compact operation groups
4. Align generator dialog, review, and pipeline quick-edit/clone panels to the same field and summary primitives
5. Sweep overflow handling
   - path wrapping
   - badge wrapping
   - footer wrapping
   - list rows that currently depend on `truncate`

## Follow-up backlog split

The implementation work should be split into focused tasks rather than one broad visual pass:

- shared authoring-surface layout primitives
- quick-create surface alignment
- batch editor narrow-width refactor
- generator dialog and inline quick-edit alignment
- overflow and truncation cleanup across authoring lists

## Key takeaways

- The repo already has the right structural seed in `EditorShell`, but the shell is currently too low-level to guarantee consistency.
- `320px` should be treated as the real target width for all authoring flows, with `240px` as the no-overflow minimum.
- The biggest narrow-width liability is not the generator dialog; it is the batch editor’s label-rail layout and the canvas quick-create dialog’s fixed width.
- Generator authoring should keep its current section model, but it needs panel-first density and wrapping rules so it stops feeling like a large modal squeezed into a plugin column.
