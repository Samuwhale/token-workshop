# Full Icon Suite Plan

Token Workshop should manage icons as first-class design-system assets alongside tokens, Figma publishing, export, audit, and git workflows. This is not an MVP plan. The goal is the full icon suite: a complete workflow for sourcing, normalizing, publishing, using, auditing, repairing, exporting, and governing icons in a way that feels native to Figma designers and meaningfully benefits from the rest of Token Workshop.

Icons are not scalar tokens. They should not live inside token collections, and they should not be modeled as Figma variables. Icons project into Figma as components, instances, nested instance swaps, preferred values, plugin metadata, exports, audits, and review workflows. Tokens still matter deeply: icon color, size, spacing, mode behavior, usage rules, and handoff metadata should align with the same semantic token system designers already manage in Token Workshop.

## Research Anchors

- [Figma instance swapping](https://help.figma.com/hc/en-us/articles/360039150413-Swap-components-and-instances): Figma groups related components by hierarchy and slash naming, and designers use native instance menus, assets, quick insert, and right-click swaps.
- [Figma variants guidance](https://www.figma.com/best-practices/creating-and-organizing-variants/): icons should not become one giant variant set; nested icon instances and instance swap are the scalable pattern.
- [Figma component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties): boolean properties, instance swap properties, preferred values, and exposed nested instances are the native way to make component icon slots usable.
- [Figma variable types](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/): variables support boolean, color, float, and string values; they do not provide an icon value type or drive instance swaps.
- [Iconify color cleanup](https://iconify.design/docs/articles/cleaning-up-icons/palette.html): monotone icons should be normalized so they can inherit color, while palette icons need explicit handling.

## Product Position

Add an **Icons** workspace to Token Workshop.

The workspace should feel like a Figma-native curation and governance surface, not a developer metadata browser. Designers should be able to visually browse icons, find the right asset, understand whether it is safe to use, publish it to Figma, place it into components, and repair existing canvas usage without translating between token internals and component internals.

Keep the canonical token model unchanged: collections contain modes, modes belong to collections, and tokens vary only by their own collection modes. Icon state is asset governance and Figma component state, not token collection state. `asset` tokens can still reference assets where useful, but the main icon workflow belongs in the Icons workspace.

## Current Progress

Implemented:

- Early Icons workspace with registry-backed grid and inspector.
- SVG import from browser files, pasted SVG, and workspace-relative SVG paths, including atomic multi-file import.
- Core icon naming, path normalization, SVG viewBox validation, and hashing.
- Server-side icon registry storage and basic read/import routes.
- Navigation entry for the Icons workspace.
- Basic Figma component publishing for managed icons, including a typed UI-to-plugin publish message, dedicated icon page creation for new components, registry persistence of Figma component links, batched SVG/link server APIs, durable icon page lookup, progress reporting, and stale hash detection.
- Initial safe-update behavior for published icon components: matching vector structures update in place to preserve instance override targets, while structural replacements are surfaced as warnings.
- Exact SVG duplicate detection during import.
- Initial SVG color behavior analysis at import time, with registry metadata for inheritable, hardcoded monotone, multicolor, and unknown paint behavior.
- Icons inspector color behavior visibility and monotone publish normalization so inheritable and hardcoded monotone icons publish with a single editable solid paint while multicolor artwork keeps source paints.
- Initial canvas usage actions from the Icons workspace: insert a published managed icon as a Figma component instance, replace selected icon instances through Figma's instance-swap behavior, replace selected raw layers with positioned managed icon instances, and set exposed icon instance-swap slots on selected component instances without replacing the parent component.
- Initial import from selected Figma layers, including component and instance adoption that preserves Figma component links, file/page source metadata, and editable path/name review before import.
- Initial selected-layer import previews with duplicate path blocking, existing-icon update visibility, adopted component-link visibility, SVG viewBox mismatch guidance, unsupported layer rejection, and warnings for hidden or locked layers, flattened non-vector descendants, masks, effects, strokes, or image fills.
- Initial SVG viewBox origin and dimension metadata with inspector visibility and source-frame warnings when an icon's SVG viewBox differs from the configured library frame size.
- Core SVG import validation that rejects active content, event handlers, external references, and style imports before icons enter the registry.
- Initial Icons workspace health summary and filtering for publish drift, non-standard frames, and unknown color behavior, with selected-icon guidance in the inspector.
- Registry-level icon quality metadata with ready, review, and blocked states for reliable SVG checks, including frame origin/size, color ambiguity, inline styles, paint servers, opacity, strokes, masks, clipping, filters, and raster images; blocked icons are excluded from publish and canvas placement.
- Initial icon usage audit from the Icons workspace for current selection or current page, grouped by repair action and covering managed usage counts, missing linked components, duplicate managed components, stale component hashes, renamed icon components, deprecated icon usage, unmanaged icon-like components, raw icon-layer candidates, and unknown managed component metadata.
- Icon usage audit now also supports current-file scanning and reports published managed icons with zero file usage as lifecycle review candidates before deprecation or removal.
- Icon usage audit findings now support progressive review in the Icons workspace, including canvas focus actions for node-backed findings across selection, page, and file scans.
- Initial static geometry quality metadata for imported SVGs, including geometry bounds with explicit exact/estimated/unknown precision, configurable keyline padding, keyline overflow warnings, and off-center artwork warnings surfaced in library health and the inspector.
- Initial token-aware icon usage audit checks for managed instances with non-standard icon frame sizes or component-authored monotone icon color without a Token Workshop token binding or Figma variable color binding.
- Initial component icon slot setup from the Icons workspace: selected raw or unmanaged icon-like layers inside main components can be replaced with a managed icon instance and exposed as an instance-swap component property, with collision-safe property names and audit visibility for unpromoted icon slots.
- Component icon slot setup now creates designer-facing boolean visibility properties, exposes the nested icon instance, attaches governed icon preferred values from the active published library, reuses matching existing slot properties, and handles component-set variants through the shared component-set property owner instead of duplicating per-variant slot properties.
- Icon usage audit now detects stale governed preferred values on broad Token Workshop icon slots when new usable icons are missing from the slot menu or inactive governed icons remain listed.
- Stale governed preferred-value findings now include removed or unmanaged preferred values and provide a focused repair action that refreshes the slot menu from the current active governed icon library.
- Initial governed public icon browsing and import through Iconify-backed public libraries, including server-side search, SVG fetch/import through the registry quality path, source URL capture, required collection license metadata, attribution flags, and a Library import tab in the Icons workspace.
- Public icon source governance now includes explicit provider discovery/search validation, selected-import license and attribution review, source links before import, UI request timeouts, and bounded server-side collection metadata caching.
- Public icon attribution can be exported from the Icons workspace as a grouped JSON manifest for handoff, including provider, collection, license, source URL, status, and attribution-required summaries for every public-library icon.
- Initial developer handoff export from the Icons workspace, including a server-generated zip with raw SVGs, normalized SVGs, React TypeScript components, a typed icon index, a full icon manifest, and attribution metadata for active non-blocked icons.

Missing:

- Rich publish review and richer component reconciliation for substantial SVG structure changes.
- Richer selected-layer quality gates and normalization guidance for raw canvas vectors beyond initial frame, layer-type, visibility, mask, effect, stroke, and image-fill checks.
- Broader public source governance beyond the initial Iconify browser, including multi-provider configuration and source update checks.
- Near-duplicate geometry review beyond exact SVG hash matches.
- Token color guidance, broader canvas color audits, and guided hardcoded fill repair beyond initial publish normalization and component-authored unmanaged monotone color findings.
- Richer geometry bounding-box and keyline checks beyond initial static SVG primitive/path bounds, including transformed geometry and stronger curve handling.
- Richer replacement previews and multi-slot selection controls from the Icons workspace.
- Richer component icon slot setup with curated restricted preferred values, broader preferred-value repair previews, and multi-slot previews.
- Richer icon usage audit, guided repair, configurable raw-icon heuristics, and full deprecation workflows beyond the initial selection/page/file audit, unused-icon lifecycle findings, node-backed finding navigation, and unpromoted-slot detection.
- Richer icon exports beyond the initial SVG, React TypeScript, manifest, and attribution bundle, including platform-specific bundles and deeper token-aligned handoff.
- Integration with review, publish, health, history, and git workflows.

## Experience Principles

- **Figma-native first:** Use the same mental models designers already use: components, instances, slash names, asset browsing, nested properties, and preferred values.
- **Visual before textual:** Prefer compact previews, source comparison, usage previews, and repair affordances over JSON, IDs, or route-shaped language.
- **Governed, not locked down:** The plugin cannot and should not pretend to prevent every manual override in Figma. It should make correct usage easy, detect drift, and repair issues quickly.
- **Tokens strengthen icons:** Icon workflows should reuse semantic color, size, spacing, mode, review, export, and git concepts from Token Workshop instead of becoming a standalone icon manager.
- **No giant variant sets:** Publish one component per icon. Use nested instances, instance swap properties, preferred values, and exposed nested instances for component usage.
- **Safe updates:** Updating an icon should refresh the managed Figma component without breaking existing instances, component slots, or designer swaps.
- **No legacy ballast:** There is no shipped userbase. Optimize for the clean final model, not compatibility layers.

## Full Suite Capabilities

### 1. Governed Icon Library

Designers can curate one canonical icon library inside Token Workshop.

The library supports imports from:

- SVG files and folders.
- Pasted SVG.
- Existing Figma selection, including components, instances, vectors, and SVG-like groups when they can be normalized.
- Approved public free sources with reliable license metadata.

The workspace should support:

- Visual grid browsing that works at narrow Figma plugin widths.
- Search by name, path, tag, source, category, and status.
- Fast filtering by status, source, category, license, style, size, and usage.
- Side-by-side duplicate review before import.
- Draft, published, deprecated, and blocked states.
- Source history for local files, Figma selection, pasted SVG, and public source imports.
- Attribution and license visibility before import and in export manifests.

Public source browsing should be deliberate and governed:

- Search enabled providers from inside the plugin.
- Show provider, collection, license, attribution requirement, style, and source URL before import.
- Allow importing individual icons, a filtered result set, or a complete collection.
- Reject unavailable sources when license metadata is missing, ambiguous, proprietary, paid, or not representable in the registry.
- Store enough source metadata to support audits, attribution, update checks, and handoff.

### 2. Normalization And Quality Gates

Imported icons should become predictable design-system assets, not arbitrary SVG blobs.

The suite should check and clearly report:

- Valid SVG root and viewBox.
- Expected frame size, defaulting to a 24px icon grid.
- Configurable allowed sizes, such as 12, 16, 20, 24, 32, and 40 when the design system enables them.
- Whether geometry fits the configured keyline region.
- Whether the icon is centered and visually safe within its bounds.
- Hardcoded fills, strokes, inline styles, opacity, masks, gradients, clipping, and unsupported SVG features.
- Whether a monotone icon can inherit color reliably.
- Whether a multicolor icon is intentionally categorized as illustrative/icon art.
- Stroke scaling risks that can cause swapped icons to change weight or distort.
- Duplicate or near-duplicate geometry under different names.
- Naming collisions, inconsistent slash paths, and code export naming conflicts.

The UI should offer designer-safe fixes where possible:

- Normalize names and slash paths.
- Wrap geometry in the configured icon frame.
- Center geometry within the frame.
- Convert obvious black monotone fills/strokes to inherited color.
- Flag risky multicolor or mixed `currentColor` icons instead of silently changing meaning.
- Mark icons as blocked when they cannot meet library quality rules.

The suite should not become a vector editor. If the underlying artwork is wrong, the user should fix the source SVG or Figma component and re-import.

### 3. Token-Aware Icon Color

Icon color should align with the token system without pretending Figma can dynamically infer intent from placement.

For normal UI icons:

- Monotone icons should default to inherited color or a designated semantic icon color variable, depending on the design-system policy.
- Icon components should be compatible with mode-aware color variables.
- Component slots should make the parent component's intended icon color clear.
- Audits should flag icon instances whose bound color variable fights the parent component's semantic color.
- Hardcoded colors should be treated as repairable issues unless the icon is explicitly categorized as multicolor.

For multicolor icons:

- Multicolor assets are supported as a deliberate category for brand marks, badges, logos, and illustrative icon art.
- Normal UI icon slots should treat multicolor usage as a policy issue unless that slot explicitly allows it.
- Audits should explain the issue as design-system governance, not as a technical error.

### 4. Predictable Sizing And Swapping

Icons should swap without jumping, cropping, changing stroke weight unexpectedly, or breaking layout.

The suite should make sizing predictable by:

- Defaulting to a 24px component frame.
- Supporting a configured allowed size scale.
- Showing whether each icon conforms to the selected grid and keyline policy.
- Distinguishing source viewBox, component frame, and intended usage size in UI language designers understand.
- Checking nested icon slots for correct frame size and resizing behavior.
- Flagging icons whose strokes, bounds, or constraints will behave badly when swapped.
- Supporting multiple published size families only when the design system intentionally uses them.

### 5. Figma Component Publishing

Designers can publish managed icons into Figma as clean components.

Publishing should:

- Create or reuse a dedicated icon page.
- Use one component per icon, named with stable slash paths such as `Icon/Navigation/Home`.
- Preserve source geometry while enforcing the configured component frame.
- Link each component to its managed icon record.
- Update existing managed components in place when source content changes.
- Avoid creating duplicates during re-sync.
- Keep existing instances and component slots working after updates.
- Show which icons are unpublished, synced, stale, blocked, deprecated, or missing from the current Figma file.

Publishing should also support library-oriented workflows:

- Icons may live in a foundation library while consuming components live elsewhere.
- The suite should make it clear whether a component slot is using current-file icons or published library icons.
- Preferred values should point designers toward governed icon components, not arbitrary local duplicates.

### 6. Insert, Replace, And Swap

Designers should be able to use icons directly from the Icons workspace without fighting Figma's native model.

Core actions:

- Insert a managed icon instance onto the canvas.
- Replace selected raw vectors or unmanaged icon components with a managed icon.
- Swap selected managed icon instances.
- Swap nested icon slots when a selected component instance exposes an icon instance-swap property.
- Preserve appropriate overrides where Figma can preserve them.
- Explain when a swap cannot preserve color, size, or nested properties and offer a repair path.

The plugin should enhance Figma's native instance menu rather than competing with it. Managed icons should still be organized so Figma's own Assets panel, quick insert, and instance menu remain useful.

### 7. Component Icon Slots

Component authors can prepare buttons, inputs, navigation items, menu rows, empty states, and other reusable components for governed icon usage.

Slot setup should help designers:

- Detect existing raw icon placeholders, nested icon instances, and missing icon slots.
- Convert usable placeholders to managed icon instances.
- Add leading, trailing, icon-only, or custom named icon slots.
- Add boolean visibility properties where optional icons are expected.
- Add instance swap properties to nested icons.
- Set curated preferred values for each slot.
- Expose nested instances only where it improves top-level component usability.
- Keep slot naming clear and designer-facing, such as `Leading icon`, `Trailing icon`, or `Icon`.
- Review anything the plugin cannot safely change before it mutates the component.

Preferred values should support both broad and curated use:

- Broad slots can allow the full governed icon library through naming and hierarchy.
- Restricted slots can use curated preferred values, such as only directional arrows for a disclosure button.
- Audits should find slots whose preferred values are stale after new icons are added, renamed, deprecated, or removed.

### 8. Audit, Repair, And Health

The suite should turn icon drift into a clear repair workflow.

Audit scopes:

- Current selection.
- Current page.
- Current file.
- Managed icon page.
- Published library usage when available through Figma/library context.

Audit should find:

- Raw vectors that match managed icons.
- Raw vectors that look like unmanaged icons.
- Detached icon instances.
- Unmanaged icon components.
- Managed icons whose source hash differs from the registry.
- Managed icons whose Figma component is missing, duplicated, stale, or renamed incorrectly.
- Wrong icon frame size, viewBox, keyline fit, constraints, or slot size.
- Hardcoded fills/strokes where the icon should inherit color.
- Multicolor icons used in restricted monotone UI slots.
- Component slots missing instance swap properties.
- Component slots missing or carrying stale preferred values.
- Deprecated icons still used.
- Managed icons with zero usage.
- Duplicate icons with different names.
- Export names or paths that would confuse developers.

Findings should be grouped by likely action:

- Replace with managed icon.
- Sync component.
- Fix color behavior.
- Fix size or bounds.
- Set up slot.
- Update preferred values.
- Deprecate or remove.
- Review manually.
- Ignore by policy.

Repairs should be explicit and reviewable. The suite should offer one-click fixes for safe cases and batch repair for repeated issues, while refusing to silently mutate ambiguous artwork or unrelated layers.

### 9. Token Workflow Integration

Icons should benefit from Token Workshop instead of becoming a separate tool.

Integration points:

- Semantic icon color tokens guide monotone icon defaults and slot usage.
- Size and spacing tokens define allowed icon sizes, component slot dimensions, and icon/text gap policy.
- Modes influence color review, audits, and Figma variable bindings.
- Token review surfaces icon-specific health alongside token health.
- Publish workflows include icon readiness, stale components, and export completeness.
- Git/history workflows include icon registry changes, SVG source changes, source updates, and generated export diffs.
- Export presets include icons alongside token outputs when appropriate.
- Audit reports connect icon issues to token issues, such as a component using a deprecated icon color token and a deprecated icon at the same time.

### 10. Export And Developer Handoff

Developer handoff should be deterministic and match what designers see in Figma.

Exports should support:

- Raw SVG directory.
- Optimized SVG directory.
- React TypeScript components.
- Typed icon-name union.
- JSON manifest with name, path, status, category, size, source, license, attribution, hashes, and Figma component metadata.
- Optional platform-specific bundles when the project adds them.

Export behavior should:

- Preserve stable names unless the designer intentionally renames an icon.
- Make renamed, deprecated, and blocked icons obvious.
- Include license and attribution requirements where needed.
- Use inherited color for monotone UI icons.
- Keep multicolor icons distinct from monotone icons in manifests.
- Avoid injecting attribution into every generated file unless a license requires it.

### 11. Governance And Lifecycle

Icons need lifecycle management, not just import and export.

The suite should support:

- Draft icons before they are published to Figma.
- Published icons synced to managed Figma components.
- Deprecated icons that remain visible in audits and usage reports.
- Blocked icons that cannot be used until quality or license issues are resolved.
- Explicit update checks for local or public-source icons.
- Reviewable upstream changes before replacing source artwork.
- Usage count and usage location summaries.
- Safe deprecation prompts that show where an icon is still used.
- Source/license changes as first-class review items.

## Acceptance Scenarios

- A designer imports a public icon set, reviews license requirements, removes duplicates, fixes color inheritance issues, and publishes clean Figma icon components.
- A designer imports icons from a local folder and sees which files fail viewBox, keyline, hardcoded color, or size checks before publishing.
- A designer selects an existing Figma icon component, imports it as managed, and re-syncs it without creating duplicate components.
- A designer updates an SVG source and refreshes the existing Figma component without breaking existing instances, swaps, or component slots.
- A designer inserts a managed icon, replaces selected raw vectors with the managed equivalent, and swaps a selected managed icon instance.
- A button component gains leading and trailing icon slots with boolean visibility, instance swap properties, curated preferred values, and token-aligned icon color behavior.
- A component author updates a governed icon set and the suite identifies component slots whose preferred values need refreshing.
- An audit finds raw SVGs, stale managed components, wrong bounds, hardcoded colors, disallowed multicolor usage, deprecated icon usage, and zero-usage icons, then groups findings by repair action.
- A developer exports SVGs, typed React components, an icon-name union, and a manifest that matches Figma naming and token policy.
- A publish/review pass shows icon readiness beside token readiness before design-system changes are committed.

## Non-Goals

- Do not represent icons as Figma variables or string-token-driven swaps.
- Do not place the main icon workflow inside normal token collections.
- Do not create one giant icon component set or icon-name variant matrix.
- Do not store large icon libraries as data URIs in token JSON.
- Do not build a full vector drawing editor.
- Do not silently import paid, proprietary, or ambiguous public-source icons.
- Do not add legacy compatibility shims or migration layers.
- Do not add tests unless explicitly requested.

## Assumptions

- Token Workshop is still in rapid active development with no shipped userbase, so breaking changes are acceptable.
- Normal UI icons are monotone by default.
- Multicolor icons are supported as deliberate managed assets but are governed separately from normal UI icon slots.
- Figma cannot enforce every policy at edit time; Token Workshop should make correct usage easy, detect drift, and repair issues.
- Manual/product acceptance scenarios are the primary verification method unless tests are explicitly requested.
