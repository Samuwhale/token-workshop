# Codebase Patterns

Reusable patterns discovered during backlog work. This file is injected into every agent session.
Add new patterns here when discovered — keep entries general and reusable, not item-specific.

---

- **Build command**: `cd packages/figma-plugin && npm run build` — the root `npm run build` fails (turbo binary missing). The plugin build succeeds cleanly.
- **SVG chevron pattern**: Expand/collapse arrows use `<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M2 1l4 3-4 3V1z" /></svg>` with a `rotate-90` class toggled for direction. Never use `▶`/`▼` text characters.
- **SVG icon pattern (SyncPanel)**: `width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"`. Checkmark: `M20 6L9 17l-5-5`. X: `M18 6L6 18M6 6l12 12`.
- **`</>` code icon**: `<path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16"/>` with `strokeLinecap="round" strokeLinejoin="round"` on viewBox 0 0 24 24.
- **Context menu positioning**: Clamp raw mouse coords to `window.innerWidth/Height - menuWidth/Height` to prevent off-screen menus.
- **`setActiveTab` vs `setActiveTabState`**: Always use `setActiveTab` — it also persists to localStorage. Don't call `setActiveTabState` directly.
- **ExportPanel `<pre>` overflow**: `max-h-48` is already present. The fix for vertical scroll is `overflow-auto`, not `overflow-x-auto`.
- **Alpha in color pickers**: HTML `<input type="color">` only supports 6-char `#RRGGBB`. Extract `hex.slice(7)` before the picker and re-append on change to preserve 8-char `#RRGGBBAA`.
- **ΔE thresholds**: <1 = "Exact", 1–5 = "Close", ≥5 = "Approximate".
- **Stale backlog references**: Some items reference code that no longer exists (e.g. "Generate Semantic Tokens" greyed menu items at App.tsx ~L687). Skip and pick a different item if the referenced code can't be found.
- **Pre-existing lint**: `TokenList.tsx` ~L1884–1886 has a duplicate `title` attribute on the type badge — pre-existing, not a blocker.
- **`syncSnapshot` comparison**: Use `stableStringify` (exported from `src/ui/shared/colorUtils.ts`) for both snapshot storage (App.tsx) and comparison (TokenList.tsx). `JSON.stringify` key-order is non-deterministic for objects — never use it for token value comparison.
- **Token parent path computation**: Never use `path.lastIndexOf('.')` to find a segment boundary — segment names can contain literal dots (e.g., `"1.5"`). Use `nodeParentPath(node.path, node.name)` which is `path.slice(0, path.length - name.length - 1)`. This helper is now defined at the top of `TokenList.tsx`.
- **Token path display**: When showing a full dotted path as text (tooltips, confirmations), use `formatDisplayPath(path, leafName)` to quote segments containing dots, e.g., `spacing."1.5"` instead of ambiguous `spacing.1.5`.
- **Inline color picker trigger**: Use a `<button>` with `onClick={() => inputRef.current?.click()}` next to a `<input type="color" ref={inputRef} className="sr-only" />`. Save on `onBlur` (fires when picker closes). Use `key={colorHex.slice(0,7)} defaultValue={...}` to reset the uncontrolled input when the external value changes.
- **Faint-always-visible button**: `opacity-40 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity` — button is always dimly visible as a hint but only interactive when the row is hovered. Good for primary actions that should be discoverable without cluttering every row.
- **`handleInlineSave` pattern**: Token inline saves follow the same PATCH + `onPushUndo` + `onRefresh` pattern as other mutations in `TokenList`. Capture the old value from `allTokensFlat[path]` before the request for undo restore.
- **Sidebar layout alongside flex-col content**: Change the outer content wrapper from `flex flex-col` to `flex` (row), add sidebar as first child, wrap the remaining content (scroll div etc.) in a `flex-1 flex flex-col overflow-hidden` right-column div. The right-column takes `flex-1` and behaves identically to the original content area.
- **Set name validation**: Allow `/` for folder hierarchy with regex `^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$` — prevents leading/trailing slashes and double slashes.
- **Folder tree from flat names**: Parse `folder/set` names with `str.indexOf('/')` to build a `Map<folderName, FolderTreeNode>`. The `roots` array contains either plain `string` (unfoldered) or `FolderTreeNode` objects, preserving original order.

- **Token API response format**: `GET /api/tokens/:set` returns flat path-keyed map (from `getFlatTokensForSet`). To get the raw nested DTCG file format, use `GET /api/tokens/:set/raw` which returns `getSet().tokens` (the nested `TokenGroup`). `buildTree` in `useTokens.ts` is designed for nested format; flat input creates all tokens as top-level leaves.
- **Fastify route registration order**: Fixed routes (`/tokens/:set/raw`, `/tokens/:set` PUT) must be registered BEFORE the wildcard `/tokens/:set/*`. Fastify matches in registration order.
- **JSON view in TokenList**: The `'json'` viewMode branch must be checked BEFORE the `tokens.length === 0` guard so empty sets can still show the paste-to-import editor. Hide the filter bar (`viewMode !== 'json'`) since search/type filters are irrelevant for raw JSON editing.

- **Graph/pipeline view pattern**: For "graph" features without a full node editor, use a pipeline visualization: stack generator cards with `[sourceToken] → [generatorName] → [targetGroup.* (N tokens)]` as a horizontal row. Template cards show `stages: string[]` rendered as pills with SVG chevron arrows between them. See `GraphPanel.tsx`.
- **Multi-step template application**: When a template creates multiple things (generator + semantic tokens), create the generator first, then POST semantic alias tokens using `{$type, $value: "{prefix.step}"}`. Best-effort the semantic tokens (log warn on failure, don't abort).
- **Exporting template data for command palette**: Export the template array from the panel component (`export const GRAPH_TEMPLATES`) so App.tsx can map over it for command palette entries without duplicating data.

- **`@tokenmanager/core` build**: `tsc` fails with pre-existing circular type errors in `types.ts`. A TypeScript watch process auto-compiles dist files when src changes. Editing core src is sufficient — dist will be regenerated automatically. Never try to manually patch dist JS files.
- **`flattenTokenGroup` in core**: `flattenTokenGroup(group, prefix?, parentType?): Map<string, DTCGToken>` in `dtcg-types.ts` is the canonical DTCG flattener. It handles `$type` inheritance from parent groups. Use it instead of local flatten implementations. To get `TokenMapEntry` records, iterate the Map: `for (const [path, token] of flattenTokenGroup(group)) { out[path] = { $value: token.$value, $type: token.$type || 'unknown' }; }`.
