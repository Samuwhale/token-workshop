# Figma Plugin — Token Application Roadmap

## Goal

Make tokens a live, usable part of the designer workflow: apply token values to layers, show what's bound, and keep everything in sync when tokens change.

## Completed

### Token Application & Selection Inspector (2026-03-23)

- **Property application engine** in `controller.ts`: `applyTokenValue()` handles all 15 bindable properties (fill, stroke, width, height, padding, itemSpacing, cornerRadius, strokeWeight, opacity, typography, shadow, visible). Guard-checks node capabilities before mutation. Typography uses `loadFontAsync` with fallback.
- **Property picker** (`PropertyPicker.tsx`): Dropdown for ambiguous token types (color -> fill/stroke, dimension -> 9 targets, number -> 3 targets). Filters by node capabilities. Unambiguous types (typography, shadow, boolean) apply directly.
- **Selection inspector** (`SelectionInspector.tsx`): Collapsible panel at bottom of Tokens tab. Shows bindings grouped by category (Appearance, Size, Layout, Shape, Text, Effects, Other). Supports multi-select with "Mixed" display. Remove binding button per property.
- **Shared types** (`shared/types.ts`): `BindableProperty` union, `TOKEN_PROPERTY_MAP`, `PROPERTY_LABELS`, message interfaces.
- **Backward compat**: Legacy plugin data keys (`color`, `dimension`, `typography`, `shadow`, `border`) remapped to new property keys in `getSelection`.
- **`useSelection` hook** lifted to `App.tsx`, passed as props to `TokenList` and `SelectionInspector`.

### Key files

| File | Role |
|------|------|
| `src/plugin/controller.ts` | Figma sandbox: apply engine, selection, bindings |
| `src/shared/types.ts` | Shared types and constants |
| `src/ui/components/PropertyPicker.tsx` | Target property dropdown |
| `src/ui/components/SelectionInspector.tsx` | Binding inspector panel |
| `src/ui/hooks/useSelection.ts` | Selection state from controller |
| `src/ui/hooks/useTokens.ts` | Token fetching, tree building, flat token map for sync |
| `src/ui/components/TokenList.tsx` | Token tree with apply action |
| `src/ui/App.tsx` | Layout: tokens tab split with inspector |

### Sync Bindings (2026-03-23)

- **`syncBindings()` in `controller.ts`**: Walks all nodes on the current page (or selection) that have `tokenmanager` shared plugin data. For each binding, looks up the token in a flat map sent from the UI and calls `applyTokenValue()`. Batches 50 nodes per tick with `setTimeout` yield for responsiveness. Sends `sync-progress` and `sync-complete` messages back to UI. Also migrates legacy keys to current property names during sync.
- **`fetchAllTokensFlat()` in `useTokens.ts`**: Fetches ALL token sets from the server and flattens into `Record<string, TokenMapEntry>` so cross-set bindings resolve correctly.
- **`useSyncBindings` hook in `App.tsx`**: Manages sync lifecycle (syncing, progress, result). Fetches token map, posts message to plugin, listens for progress/complete. Auto-clears result after 3 seconds.
- **Sync UI in `SelectionInspector.tsx`**: "Sync Selection" button (visible when bindings exist and server is connected), "Sync Page" button (always visible when connected). Shows progress during sync and result summary after. Buttons hidden when server is offline.
- **New types in `shared/types.ts`**: `TokenMapEntry`, `SyncBindingsMessage`, `SyncProgressMessage`, `SyncCompleteMessage`.

### Token Alias Resolution (2026-03-23)

- **`resolveAlias.ts` utility** in `src/shared/`: `isAlias()`, `extractAliasPath()`, `resolveTokenValue()` with recursive resolution and cycle detection (visited Set + maxDepth=10), `resolveAllAliases()` for batch resolution. Returns structured `ResolveResult` with error info.
- **Apply flow** (`TokenList.tsx`): `applyWithProperty()` resolves alias values via `resolveTokenValue()` before sending to controller. Shows notification on resolution error. `handleApplyVariables`/`handleApplyStyles` also resolve before sending.
- **Sync flow** (`App.tsx`): `useSyncBindings` calls `resolveAllAliases()` on the flat token map before posting to controller, so all synced values are concrete.
- **Display**: `TokenTreeNode` resolves alias values for `ValuePreview` and `formatValue` display. Shows arrow indicator on alias tokens. `SelectionInspector` shows resolved value alongside token path (e.g. `color.brand.primary → #3B82F6`) with resolved color swatch.
- **`allTokensFlat` state** in `App.tsx`: Pre-resolved flat map of all tokens across all sets, refreshed when tokens or connection change. Passed to `TokenList` and `SelectionInspector`.

## Next Steps (priority order)

### 1. Highlight Applied Tokens in Token List

**Why**: No visual indication of which tokens are currently applied to the selection. Designer has to open inspector to check.

**What**:
- In `TokenTreeNode`, check if `node.path` appears in any `selectedNodes[].bindings` values
- Show a small indicator (dot, highlight, or "applied" badge) on matching rows
- Data is already available via `selectedNodes` prop

### 2. Undo Grouping

**Why**: Applying a token to multi-select creates N separate undo entries. Should be one Cmd+Z.

**What**:
- Wrap the apply loop in `applyToSelection` with Figma's undo API
- Likely: call operations within a single `figma.commitUndo()` scope (check Figma plugin API for current undo grouping mechanism)

## Build

```sh
npx pnpm build   # from packages/figma-plugin/
```

esbuild for controller (Figma sandbox), Vite + singlefile for UI.
