# Phase 2: Migration Inventory — Recipes Workspace → Tokens Section

## Decision: Keep Both Entry Points

**Listing/browsing** → section under Tokens (renders `GraphPanel` inline)
**Editing** → contextual panel overlay (renders `TokenRecipeDialog`, already correct)

These map to distinct intents. The contextual surface seam (`TokensLibraryContextualSurface: "recipe-editor"`) already exists and works. No unification needed.

---

## Inventory

All paths relative to `packages/figma-plugin/src/ui/`.

### A. Type System

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| A1 | `shared/navigationTypes.ts` | 11 | `TopTab` includes `"recipes"` | **Keep** — internal routing key. `PANEL_MAP` depends on this. |
| A2 | `shared/navigationTypes.ts` | 13 | `RecipesSubTab = "recipes"` | **Keep** — same reasoning. |
| A3 | `shared/navigationTypes.ts` | 17 | `SubTab` union includes `RecipesSubTab` | **Keep** — follows from A1/A2. |
| A4 | `shared/navigationTypes.ts` | 138 | `WorkspaceId` includes `"recipes"` | **Remove** — no longer a top-level workspace. |
| A5 | `components/HealthPanel.tsx` | 52 | `PriorityIssue.action` includes `"recipes"` | **Keep** — action key stable, only handler target changes. |
| A6 | `components/HealthPanel.tsx` | 249 | `onNavigateTo` topTab union includes `"recipes"` | **Keep** — topTab value stays `"recipes"`, resolution layer handles mapping. |
| A7 | `components/NotificationsPanel.tsx` | 17-28 | `ActionTarget` includes `topTab: "recipes"` | **Keep** — route target stays `"recipes"`. |

### B. Navigation Configuration

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| B1 | `shared/navigationTypes.ts` | 88-92 | `TOP_TABS` array has recipes entry | **Keep** — internal routing table for `PANEL_MAP` compatibility. |
| B2 | `shared/navigationTypes.ts` | 120 | `DEFAULT_SUB_TABS` maps `recipes: "recipes"` | **Keep** — follows from B1. |
| B3 | `shared/navigationTypes.ts` | 128 | `SUB_TAB_STORAGE` maps `recipes` key | **Keep** — typed as `Record<TopTab, string>`. Removing this entry while `"recipes"` remains in `TopTab` causes a TS error. `NavigationContext.tsx:190` reads `SUB_TAB_STORAGE[topTab]` inside `navigateTo`. |
| B4 | `shared/navigationTypes.ts` | 409-415 | `WORKSPACE_TABS` has standalone recipes entry | **Replace** — remove standalone entry. Add `sections` array to the `tokens` workspace entry: `{ id: "recipes", label: "Recipes", topTab: "recipes", subTab: "recipes", ... }`. This is the single structural change that cascades everywhere. |

### C. Panel Routing

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| C1 | `panels/PanelRouter.tsx` | 1141-1142 | `PANEL_MAP.recipes.recipes = renderDefineRecipes` | **Keep** — keyed by `TopTab`/`SubTab`, unchanged. |
| C2 | `panels/PanelRouter.tsx` | 1359-1394 | `renderDefineRecipes()` renders `GraphPanel` | **Keep unchanged**. |
| C3 | `panels/PanelRouter.tsx` | 779-790 | Contextual panel renders `TokenRecipeDialog` for `"recipe-editor"` | **Keep unchanged** — already inside Tokens. |

### D. Navigation Calls (`navigateTo`)

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| D1 | `panels/PanelRouter.tsx` | 549 | `navigateTo("recipes","recipes")` — generate scale from group | **Keep** — `resolveWorkspace` finds `"recipes"` in Tokens' `sections`. |
| D2 | `panels/PanelRouter.tsx` | 553 | `navigateTo("recipes","recipes")` — navigate to new recipe | **Keep**. |
| D3 | `panels/PanelRouter.tsx` | 1454-1456 | `navigateTo("recipes","recipes", { preserveHandoff })` — from Themes | **Keep** — handoff is workspace-structure-independent. |
| D4 | `App.tsx` | 750 | `navigateTo("recipes","recipes")` — `handleNavigateToRecipe` | **Keep**. |
| D5 | `App.tsx` | 1654 | `navigateTo("recipes","recipes")` — `onOpenRecipes` for SetManager | **Keep**. |
| D6 | `hooks/useCommandPaletteCommands.ts` | 258 | `navigateTo("recipes")` — recipe template commands | **Keep**. |

All 6 calls remain stable. `navigateTo` (NavigationContext.tsx:180) validates against `TOP_TABS` (not `WORKSPACE_TABS`), so keeping `"recipes"` in `TOP_TABS` (B1) is sufficient for navigation. `PANEL_MAP` (PanelRouter.tsx:1174) looks up renderers by `TopTab`/`SubTab` directly. The shell tab highlight derives from `resolveWorkspace` (line 733) which searches `workspace.sections` — so the Tokens tab highlights correctly when `activeTopTab` is `"recipes"`.

### E. Cross-Cutting Navigators

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| E1 | `components/HealthPanel.tsx` | 993-1001 | Error recipe health check `action: "recipes"` | **Keep** — action key stable. |
| E2 | `components/HealthPanel.tsx` | 1049-1057 | Stale recipe health check `action: "recipes"` | **Keep**. |
| E3 | `components/HealthPanel.tsx` | 1113-1114 | Handler maps `"recipes"` → `onNavigateTo("recipes","recipes")` | **Keep** — route-stable. |
| E4 | `components/NotificationsPanel.tsx` | 129-133 | `inferWorkspaceAction` creates `topTab: "recipes"` target | **Keep** — route-stable. |
| E5 | `components/SetSwitcher.tsx` | 2158-2166 | "Create recipe" button triggers `onOpenRecipes` callback | **Keep** — fires callback, no workspace identity. |

### F. Storage

| # | File | Line(s) | Reference | Action |
|---|------|---------|-----------|--------|
| F1 | `shared/storage.ts` | 138 | `ACTIVE_SUB_TAB_RECIPES: 'tm_sub_tab_recipes'` | **Keep** — `SUB_TAB_STORAGE` (typed `Record<TopTab, string>`) references this constant. Removing it while `"recipes"` stays in `TopTab` breaks the type. The key becomes inert (recipes has one sub-tab so the stored value is always `"recipes"`) but must exist. |
| F2 | `shared/storage.ts` | 205 | Key in `WORKSPACE_RECOVERY_RESET_KEYS` | **Keep** — harmless. On recovery the inert key gets cleared. No cost to keeping it. |

### G. State / Controller (no changes)

| # | File | Reference | Action |
|---|------|-----------|--------|
| G1 | `contexts/WorkspaceControllerContext.tsx` | `handleNavigateToRecipe`, graph state hooks, `onOpenRecipes` | **No change**. |
| G2 | `hooks/useGraphState.ts` | `pendingGraphTemplate`, `focusRecipeId`, `pendingOpenPicker`, `pendingGraphFromGroup` | **No change**. |

### H. UI Components (no changes)

| # | File | Reference | Action |
|---|------|-----------|--------|
| H1 | `components/GraphPanel.tsx` | Recipe list/management panel | **No change**. |
| H2 | `components/RecipePipelineCard.tsx` | Recipe row component | **No change**. |

---

## Summary

**Changes required (2 touchpoints):**

1. **B4** — Move recipes from standalone `WORKSPACE_TABS` entry to a `sections` entry under the `tokens` workspace
2. **A4** — Remove `"recipes"` from `WorkspaceId` union

**Unchanged (29 touchpoints):**

All `navigateTo("recipes", ...)` calls, all `PANEL_MAP` routing, all state/controller hooks, all UI components, all storage keys. The internal routing layer stays stable because:

- `navigateTo` (NavigationContext.tsx:180) sets `activeTopTab`/`activeSubTab` directly and validates against `TOP_TABS` (not `WORKSPACE_TABS`). Since `"recipes"` stays in `TOP_TABS` (B1), all navigation calls work.
- `PANEL_MAP[activeTopTab]?.[activeSubTab]` (PanelRouter.tsx:1174) looks up the renderer directly by `TopTab`/`SubTab` key. Since the `PANEL_MAP.recipes.recipes` entry stays (C1), rendering works.
- `resolveWorkspaceSummary` → `resolveWorkspace` (navigationTypes.ts:733) finds the matching workspace by searching `workspace.sections`. This drives `activeWorkspaceId` (App.tsx:390), so the **Tokens** shell tab highlights correctly when `activeTopTab` is `"recipes"`.
- Storage keys (`SUB_TAB_STORAGE`, `DEFAULT_SUB_TABS`) are typed `Record<TopTab, ...>` and must keep their `"recipes"` entries while `TopTab` includes `"recipes"`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **First consumer of `sections`** — no workspace currently uses the `sections` property. Resolution logic exists but rendering path (section switcher UI) does not. | Phase 3 defines the section switcher as new UI. Verify `resolveWorkspaceSection` returns the correct section before building it. |
| **Handoff from Themes** — D3 navigates to recipes with `preserveHandoff`. Post-migration the user lands in Tokens (Recipes section). Return bar must say "Return to Themes". | Handoff stores origin workspace, not destination. Verify return bar renders correctly when destination is a section within another workspace. |
| **Shell tab count 5→4** — layout spacing changes. | Verify shell tab row renders cleanly with 4 tabs. |
| **Command palette labels** — `category: "Recipes"` at `useCommandPaletteCommands.ts:256`. | No change needed — category is a logical grouping, not a workspace label. |
| **Storage type constraint** — `SUB_TAB_STORAGE` and `DEFAULT_SUB_TABS` are `Record<TopTab, ...>`. Removing `"recipes"` from these while keeping it in `TopTab` causes TS errors. | Keep all `Record<TopTab, ...>` entries intact. The storage key becomes inert but is required by the type system. |

---

## Existing Seam

Recipe editing already works inside Tokens:

- `TokensLibraryContextualSurface` includes `"recipe-editor"` (`navigationTypes.ts:45`)
- `TOKENS_LIBRARY_SURFACE_CONTRACT` defines `recipe-editor` as contextual panel (`navigationTypes.ts:356-359`)
- `PanelRouter.tsx:381-390` — `openRecipeEditor()` calls `switchContextualSurface({ surface: "recipe-editor" })`
- `PanelRouter.tsx:779-790` — renders `TokenRecipeDialog` when `activeTokensContextualSurface === "recipe-editor"`

The migration extends this pattern: recipe browsing joins recipe editing under the Tokens workspace, using sections for the list and the existing contextual panel for focused editing.

---

## Phase 3 Implementation Order

1. **B4** — Modify `WORKSPACE_TABS`: add `sections` to tokens entry, remove standalone recipes entry
2. **A4** — Remove `"recipes"` from `WorkspaceId`
3. Build section switcher UI (`activeTokensSection` state in `WorkspaceControllerContext`)
4. Verify all 6 `navigateTo` call sites resolve correctly (shell tab highlights Tokens)
5. Test Themes handoff (D3) end-to-end
