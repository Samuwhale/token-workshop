# Token Library Browsing And Inspection UX Audit

## Scope

- Reviewed the current token tree rows in `packages/figma-plugin/src/ui/components/TokenTreeNode.tsx`.
- Reviewed the current search and filter flow in `packages/figma-plugin/src/ui/components/TokenList.tsx`, `packages/figma-plugin/src/ui/hooks/useTokenSearch.ts`, `packages/figma-plugin/src/ui/components/TokenSearchFilterBuilder.tsx`, and `packages/figma-plugin/src/ui/components/tokenListUtils.ts`.
- Reviewed the current detail preview surface in `packages/figma-plugin/src/ui/components/TokenDetailPreview.tsx` and its routing in `packages/figma-plugin/src/ui/panels/PanelRouter.tsx`.
- Declared touch paths `TokenSearchInput.tsx`, `useTokenFilters.ts`, and `useTokenTree.ts` are stale in the current codebase. Their responsibilities now live in `TokenList.tsx`, `useTokenSearch.ts`, `tokenListUtils.ts`, and `TokenTreeNode.tsx`.

## Current Audit

### 1. Token rows hide key metadata until the row is already active

- `TokenTreeNode` computes `showSecondaryMeta` from row-active state only, so the type badge and alias target chip appear only for the selected, focused, or previewed row (`packages/figma-plugin/src/ui/components/TokenTreeNode.tsx:2280-2285`, `:3098-3140`).
- Generator ownership is reduced to a glyph with no name or count (`TokenTreeNode.tsx:3089-3096`).
- Duplicate, lint, sync, and applied state are compressed into a single trailing status slot, so only one status family can stay visible at a time (`TokenTreeNode.tsx:466-531`, `:3425-3450`).
- The value lane is capped to a narrow truncated text slot, which is efficient for dense browsing but leaves no room for alias source, generator owner, or usage signal unless the row becomes active (`TokenTreeNode.tsx:3366-3424`).

Impact:

- Designers cannot scan type, alias status, generator ownership, or usage patterns across a long list without moving focus row by row.
- The current row treatment optimizes for low clutter, but it over-relies on the detail panel for common browse decisions.

### 2. The detail preview is rich, but it is a secondary contextual surface

- `TokenDetailPreview` contains most of the metadata designers need: issues, alias target, generator source, lifecycle, provenance, usage, dependency trace, and history (`packages/figma-plugin/src/ui/components/TokenDetailPreview.tsx:300-560`).
- That preview is mounted only through the contextual surface router (`packages/figma-plugin/src/ui/panels/PanelRouter.tsx:754-786`).
- The main list can run without split preview, so metadata remains effectively hidden unless the user explicitly previews a token or opens the wider contextual surface (`packages/figma-plugin/src/ui/panels/PanelRouter.tsx:1257-1281`).

Impact:

- The detail panel is good for deep inspection, but it is too expensive as the primary browse affordance for large libraries.
- The current design makes scanning a list and understanding a token two separate steps.

### 3. Search has grammar power, but discovery is still syntax-first

- `useTokenSearch` supports structured qualifiers for `type`, `has`, `value`, `desc`, `path`, `name`, and `generator`, with suggestion logic keyed off typed prefixes (`packages/figma-plugin/src/ui/hooks/useTokenSearch.ts:266-438`).
- The main search box hints only through tooltip text and colon-triggered autocomplete (`packages/figma-plugin/src/ui/components/TokenList.tsx:3895-4008`).
- There is already a builder, but it is hidden behind an icon-only filter button and opens as a secondary editor beneath the toolbar (`packages/figma-plugin/src/ui/components/TokenList.tsx:4202-4365`).
- The builder itself is mechanically capable but low-discoverability: it starts as chips plus a small “Filter” add button, with no suggested entry states or first-run guidance (`packages/figma-plugin/src/ui/components/TokenSearchFilterBuilder.tsx:77-241`).

Impact:

- Power users can express precise queries, but casual users still need to know the grammar exists before the structured system becomes useful.
- The current builder behaves more like an editor for existing filters than a guided filter authoring surface.

### 4. Filtered search preserves ancestor nodes in data, but loses orientation in presentation

- `filterTokenNodes` and `filterTokenNodesStructured` keep matching descendants under their ancestor groups instead of flattening the underlying data (`packages/figma-plugin/src/ui/components/tokenListUtils.ts:345-466`).
- The rendered tree still depends on the current manual expansion state through `flattenVisible(displayedTokens, expandedPaths)` (`packages/figma-plugin/src/ui/components/TokenList.tsx:1497-1507`).
- Group context in filtered views is therefore fragile: matches can be buried under partially expanded branches, and the visible list does not add per-result ancestry or local result grouping.
- The only always-on breadcrumb helper is derived from the top visible item in the viewport, not from each result or from the active filter scope (`packages/figma-plugin/src/ui/components/TokenList.tsx:3128-3155`, `:5166-5212`).

Impact:

- Designers can lose the “where am I in the tree?” answer while filtering, even though the code still retains some ancestor nodes.
- The current experience feels like hierarchy loss because result rows do not carry enough ancestry context and the tree does not automatically reshape around the search task.

### 5. Deep-hierarchy navigation exists, but the best shortcuts are passive or hidden

- The list already has `zoomRootPath` and zoom breadcrumbs (`packages/figma-plugin/src/ui/components/TokenList.tsx:3128-3131`).
- There is also a sticky breadcrumb for the current scroll position with jump and collapse behavior (`TokenList.tsx:5166-5212`).
- Condensed mode can show hidden ancestor segments once depth exceeds the cap (`packages/figma-plugin/src/ui/components/TokenTreeNode.tsx:145-185`).
- These tools are reactive to current position, not proactive browse controls. There is no obvious “zoom into this group”, “pin this branch”, “recent groups”, or “jump to ancestor/sibling cluster” affordance in the main browsing lane.

Impact:

- The system helps once a user is already inside a branch, but it does not materially reduce the manual expand/collapse work needed to reach that branch in the first place.

## Recommendations

### A. Redesign rows around a stable summary lane plus contextual reveal

Adopt a row model with one always-visible summary lane and one optional contextual lane:

- Always visible:
  - swatch or value preview
  - token name
  - compact type chip
  - one short value text or alias value preview
  - one ownership/state marker slot
- Reveal on row active, preview hover, or keyboard focus:
  - full alias target
  - generator name
  - usage count
  - extra status chips

Specific recommendations:

- Make the type badge always visible for leaf rows instead of gating it behind `showSecondaryMeta`.
- Replace the current generator glyph-only treatment with a compact named chip such as `Generated · Ramp` or `Gen · Ramp`.
- Promote alias state to an always-visible marker, but keep the full target path in the reveal lane or hover card.
- Reserve the trailing status slot for the most important problem state only; move secondary states into the reveal lane so lint does not suppress duplicate or generated context entirely.
- Add lightweight usage presence in-row when count is non-zero, even if the exact count stays in preview.

Why this shape:

- It preserves dense browsing, matches the repo’s list-row density rule, and still surfaces the identity attributes designers repeatedly scan for.

### B. Replace syntax discovery with a search-first builder

Keep the raw query string as the source of truth, but make the builder the primary discovery surface:

- Show a labeled `Add filter` affordance next to the search box instead of an icon-only button.
- On focus, reveal one compact suggestion rail under the input:
  - `Type`
  - `Alias`
  - `Generated`
  - `Unused`
  - `Path`
  - `Description`
- When the query is empty, show 3 to 5 starter filters and recent presets immediately.
- When the query already has text, convert builder actions into chips that write back into the raw query via the existing builder-over-query helpers.
- Add one small help affordance that shows examples like `type:color`, `has:alias`, and `path:colors.brand`, but do not require users to start there.

Why this shape:

- The current architecture already supports builder-over-query updates cleanly.
- The missing piece is entry-point clarity, not query power.

### C. Preserve result hierarchy explicitly during search

Do not switch to a fully flat result list. Instead, add context-preserving filtered presentation:

- Auto-expand ancestor chains for matched results while a search is active.
- Group visible results under retained ancestor headings, even if those groups were collapsed before the search.
- Add an inline ancestor crumb on each matched leaf when the match is more than one level deep.
- Highlight the matched path segment, not only the leaf name and value text.
- For heavy result sets, add a toggle between:
  - `Grouped results`
  - `Flat matches`

Default to grouped results.

Why this shape:

- Designers need orientation first and count second.
- Keeping a grouped default prevents the “I found it, but I still do not know where it lives” problem.

### D. Turn hierarchy navigation into an explicit structural workflow

Add dedicated structural shortcuts instead of relying on generic expand/collapse:

- Add a row-level `Zoom into group` action on groups.
- Show a persistent scope header when zoomed with:
  - current group breadcrumb
  - sibling jump menu
  - `Up one level`
  - `Clear scope`
- Add a command or quick-jump input for group paths using the existing `group:` qualifier vocabulary.
- Add a recent/visited groups list so designers can bounce between active branches without rebuilding expansion state.
- When a filtered result is selected, offer `Reveal in full tree` and `Keep only this branch`.

Why this shape:

- The current breadcrumb and zoom primitives are good building blocks, but they need explicit primary affordances to reduce tree maintenance work.

### E. Rebalance preview vs row responsibilities

Keep the preview panel for deep inspection, but move first-order browse facts into the row and a lighter hover/peek state:

- Row should answer:
  - what is it
  - what type is it
  - is it an alias
  - is it generated
  - roughly what value is it
- Peek card or hover preview should answer:
  - full path
  - alias target
  - generator owner
  - description
  - usage presence
- Full preview panel should remain the place for:
  - issue details
  - dependency trace
  - history
  - lifecycle and provenance
  - canvas actions

Why this shape:

- It reduces click cost without throwing deep metadata into every row.

## Recommended Implementation Order

1. Ship the row summary redesign first.
   - This gives the fastest browse-speed win and reduces preview dependency immediately.
2. Promote the filter builder into the primary search affordance.
   - This addresses the discoverability problem without replacing the existing query system.
3. Add grouped filtered results with auto-expanded match ancestry.
   - This resolves the orientation problem during search.
4. Add explicit group zoom and structural shortcuts.
   - This reduces manual expand/collapse overhead in large trees.
5. Add hover/peek preview only if row changes still leave a browse gap.

## Follow-up Task Seeds

- Token row summary redesign with always-visible type, alias/generated markers, and compact usage signal.
- Search-first filter discovery pass that promotes the builder and starter filters while preserving raw-query editing.
- Context-preserving filtered tree mode with auto-expanded ancestors and grouped results.
- Deep hierarchy navigation pass that formalizes zoom, scope breadcrumbs, and branch jumping.
