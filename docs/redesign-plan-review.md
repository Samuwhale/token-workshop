# Tokens / Themes / Recipes IA Redesign

## IA Rules

- Four top-level workspaces: `Tokens`, `Themes`, `Inspect`, `Sync`. Remove `Recipes` as a top-level workspace.
- `Tokens` has two sections: `Library` (default) and `Recipes`. Sections are local UI state, not navigation routes.
- Section-local search — do not merge token and recipe search results.
- Theme `Compare` and `Output` stay secondary to the four-step authoring flow.

## Constraints

Recipes under Tokens must NOT mean:

- one toolbar for both domains
- one shared search result model
- one flattened surface with token rows and recipe rows mixed together

It must mean:

- one top-level workspace
- two clear sections with dedicated controls each
- lightweight switching that preserves active set context

## Phase 1: Shrink Shell Chrome And Token Toolbar Density

Independent of the Recipes structural change. Execute first.

### Post-import banner → toast

Replace the `InlineBanner` in `App.tsx` with a `dispatchToast` call using the existing toast bus (`toastBus.ts`). Use `pushAction` variant so the navigation CTA persists until clicked. Remove the `InlineBanner`, the `postImportBanner` state, and the `LAST_IMPORT_RESULT_DISMISS_MS` timer.

### Handoff return bar

Keep the return bar. Remove the `"From ..."` origin label — the return button alone is sufficient.

### Token toolbar: reduce to two rows

Target: 2 rows at ~60px (down from 3 rows at ~100px).

**Row 1 — Set context + actions:**
- Set name (clickable to open switcher)
- Section switcher (added in Phase 3)
- `Create` button
- `Tools` dropdown
- ViewMenu / FilterMenu overflow

**Remove from row 1:** Ghost buttons (`Sets`, `Recipes`, `Themes`), summary sentence (`"{N} tokens · {N} groups · ..."`).

**Row 2 — Search:** Search input with qualifier hints. No inline view mode segmented control.

**Row 3 — Filter/view chips:** Keep as-is (conditional, only appears when active).

### View mode segmented control

Move `Library | Theme Options | Active Theme | JSON` from inline row 2 into the ViewMenu dropdown as radio items. Show active mode name on the ViewMenu trigger when non-default.

### Expanded theme bar

Cap inline option buttons at 3 per dimension. Beyond 3, use a dropdown.

Relevant files: `App.tsx`, `TokenListToolbar.tsx`, `toastBus.ts`

## Phase 2: Migration Inventory (Complete)

Full inventory: [`docs/phase2-migration-inventory.md`](phase2-migration-inventory.md)

**Decision:** Keep both entry points — section for listing (`GraphPanel`), contextual panel for editing (`TokenRecipeDialog`). Distinct intents, distinct treatments.

**Result:** 31 touchpoints audited across 12 files. Only 2 require changes (both in `navigationTypes.ts`): move recipes from `WORKSPACE_TABS` to a section under tokens, remove `"recipes"` from `WorkspaceId`. All 6 `navigateTo("recipes", ...)` calls, all `PANEL_MAP` routing, and all storage keys remain stable — `navigateTo` validates against `TOP_TABS` (not `WORKSPACE_TABS`), `PANEL_MAP` looks up renderers by `TopTab`/`SubTab` directly, and `resolveWorkspace` searches sections for shell tab highlighting.

Key existing seam: recipe *editing* already lives inside Tokens via `TokensLibraryContextualSurface: "recipe-editor"` and `TokenRecipeDialog` rendered as a contextual panel in `PanelRouter`. The migration is about recipe *listing and management* — moving `GraphPanel` from its own workspace into a section.

## Phase 3: Redesign Tokens As A Two-Section Workspace

### Section switcher

A segmented control with two segments: `Library` and `Recipes`. Replaces the three ghost buttons (net reduction in elements).

**Layout:**
```
[Set name ▾]  [ Library | Recipes ]  [+ Create]  [Tools ▾]  [⋯]
```

**Behavior:**
- Switching preserves active set
- Section is local UI state (`activeTokensSection` in `WorkspaceControllerContext`), not a navigation route — stays on `topTab: "tokens"`
- Persists at top of toolbar, does not scroll
- Contextual surfaces (token editor, recipe editor, compare, preview) overlay whichever section is active
- Transition: 150ms opacity crossfade between sections

**Sizing:** `text-[10px]`, outlined border with filled active state, ~120px total width.

### Section rendering

**Library** (default): Current token list body.

**Recipes**: `GraphPanel` rendered inline, keeping its own search bar, batch actions, and card list. The `Create` button in row 1 adapts contextually — token/group menu in Library, recipe picker in Recipes.

### Navigation model changes

- Remove `"recipes"` from `TopTab` and `WORKSPACE_TABS`
- Add `TokensSection: "library" | "recipes"`
- Store `activeTokensSection` in `WorkspaceControllerContext`
- Update command palette: recipe commands set `activeTokensSection = "recipes"` instead of `navigateTo("recipes")`
- Update set-manager, health, notification deep links to target `tokens` workspace with `activeTokensSection: "recipes"`
- Shell tabs drop from 5 to 4

### Contextual surface relationship

Keep the existing `TokensLibraryContextualSurface` pattern. Recipe editing uses the contextual panel (side panel wide, drawer narrow). The section switcher controls which list is shown; the contextual panel overlays either list for focused editing.

## Phase 4: Preserve Recipe Capabilities Inside Tokens > Recipes

- Carry all existing `GraphPanel` capabilities: search, stale/failed batch actions, row-level actions, active-set scoping
- Recipe search stays local to Recipes section
- "View generated tokens" switches to Library section and scrolls to the generated group
- Active set inherited from shared workspace state
- Empty state: `"No recipes in this set"` + `"Create recipe"` CTA
- Do NOT collapse recipe controls into token controls or mix token/recipe rows

Relevant files: `GraphPanel.tsx`, `RecipePipelineCard.tsx`

## Phase 5: Simplify Theme Chrome

Baseline: keep the four-step authoring structure (`Modes → Values → Set mapping → Preview`).

### Remove the header summary paragraph

`ThemeManager.tsx` renders a `themeHeaderSummary` that changes across 7 states. It duplicates what the stage indicator detail values already communicate. Remove it entirely.

Keep in the header: theme name/status line (simplified — only append `"/ Compare"` or `"/ Output"` for secondary views), stats block, `WorkflowStageIndicators`.

### Deduplicate empty-state messaging

`ThemeOptionWorkspace.tsx` renders two near-identical messages when an option has no set roles (one in the header paragraph, one as a dashed-border box below). Remove the header version, keep the dashed-border empty state.

### Surface the next unresolved action

- Promote `"Auto-fill"` button to primary styling in the workspace header when `fillableCount > 0`
- Add count badge on `Set mapping` stage indicator when options have unresolved gaps (reuse `NoticeCountBadge` pattern)
- Add issue count to stage indicator so users see problems before drilling into a specific option

### Naming cleanup

Rename internal `"resolver"` type to `"output"` for alignment with user-facing label. Low priority.

Relevant files: `ThemeManager.tsx`, `ThemeOptionWorkspace.tsx`, `ThemeAxisCard.tsx`, `themeWorkflow.ts`

## Phase 6: Keep The Recipe Editor Lean

- Keep current two-step creation flow
- Only show overwrite/conflict review when there is an actual overwrite
- Remove helper copy that does not change decisions
- Pre-fill target set from active set

Relevant file: `TokenRecipeDialog.tsx`

## Risks

| Risk | Mitigation |
|---|---|
| Route refactor breaks deep links into Recipes | Migration inventory (Phase 2) before code. Recipe editing already works inside Tokens via contextual surface — migration is about the list only. |
| Section switcher adds chrome | Replaces 3 ghost buttons with 2-segment control — net reduction. |
| Recipe capabilities lost during move | Phase 4 preserves all `GraphPanel` capabilities explicitly. |
| Toolbar cleanup hides controls | View modes move to ViewMenu dropdown with active-mode label on trigger. High-frequency actions stay in rows 1–2. |
| Two recipe entry points confuse | Editing = contextual panel (focused task). Browsing = section (list task). Distinct intents, distinct treatments. |

## Success Criteria

| Metric | Target |
|---|---|
| Toolbar height (no filters) | ≤ 60px (down from ~100px) |
| Shell tab count | 4 (down from 5) |
| Clicks: token group → recipe creation | ≤ 2 |
| Active set preserved on section switch | Always |
| All `GraphPanel` capabilities present in Recipes section | Search, batch actions, row actions, set scoping |
| Theme header vertical space | ≤ 40px (down from ~65px) |
| Gap count visible without drilling into option | Badge on stage indicator |
| Import feedback | Toast with action CTA, 0px after dismissal |

## Execution Order

1. **Phase 0** — Lock IA rules (this document)
2. **Phase 1** — Shrink chrome (independent, immediate visible improvement)
3. **Phase 2** — Migration inventory (audit, no code)
4. **Phase 3** — Two-section workspace (structural change)
5. **Phase 4** — Recipe capabilities carry-over
6. **Phase 5** — Theme chrome simplification (can parallel with Phase 1)
7. **Phase 6** — Recipe editor cleanup
