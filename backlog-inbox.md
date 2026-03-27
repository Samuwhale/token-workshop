
- [ ] Move single token to a different set — individual tokens can only be moved between groups (by editing the path prefix); there is no action to move a token to an entirely different set, even though group-level move exists (`server/routes/tokens.ts`, `TokenList.tsx` context menu)

- [ ] Duplicate single token — only groups can be duplicated (with `-copy` suffix); there is no way to duplicate an individual token row to a new path, which is a common workflow when creating similar tokens (`TokenList.tsx` context menu)

- [ ] Undo/redo for token edits — `useUndo` exists and works for generator edits but token create/edit/delete/rename operations are not undoable; a user who accidentally deletes or renames a token has no recovery path short of git (`figma-plugin/useUndo.ts`, `TokenList.tsx`)

- [ ] Delete non-empty group — the group context menu only allows deleting empty groups; deleting a group with tokens inside requires deleting each token individually or editing the JSON file directly; should offer "Delete group and all contained tokens" with a confirmation showing the count (`TokenList.tsx` group context menu)

- [ ] Broken alias reference warning in editor — the token editor accepts any `{path}` string without validating whether it resolves; broken references are only surfaced in AnalyticsPanel/lint, not at the point of entry; editor should show an inline warning "Reference does not resolve" when the typed path doesn't match any token (`figma-plugin/TokenEditor.tsx`, alias input)

- [ ] Circular alias reference detection — creating a cycle (token A references B which references A) is not caught at edit time; the resolver silently returns unresolved and lint picks it up later; the editor should detect and block cycles immediately (`core/resolver.ts`, `figma-plugin/TokenEditor.tsx`)

- [ ] Selective export by set or group — `POST /api/export` always exports every token across all sets; there is no way to export a single set or a subtree of tokens; this is a basic workflow when sharing only part of a design system with a team (`server/routes/export.ts`, `figma-plugin/ExportPanel.tsx`)

- [ ] Token ordering within a group — tokens within a group are rendered in whatever order they appear in the JSON file; there is no way to reorder them via the UI, making it hard to control the visual hierarchy of a group (e.g. putting `default` before `hover` before `active`) (`TokenList.tsx`, `server/token-store.ts`)

- [ ] Group $type and $description editing — DTCG allows groups to carry `$type` (inherited by all children) and `$description`; there is no UI to set or edit these on a group, so inherited types must be manually maintained on every leaf token instead (`TokenList.tsx` group header, `server/routes/tokens.ts`)
