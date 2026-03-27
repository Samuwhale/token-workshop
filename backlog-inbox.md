
- [ ] Cross-set token search — the search/filter bar only operates on the active set tab; searching across all sets simultaneously is a basic workflow (e.g. "find every token named `primary`") and currently requires switching tabs manually (`TokenList.tsx:525`, `App.tsx:231`)

- [ ] DTCG JSON file import — importing tokens requires either Figma variables/styles or pasting raw JSON into the hidden JSON editor view; there is no explicit "Import from file" action with file picker or drag-and-drop for `.json` files, making the import path non-obvious (`figma-plugin/ImportPanel.tsx:136-156`)

- [ ] Figma collection name is hardcoded to `'TokenManager'` — all token sets sync into a single Figma variable collection named `'TokenManager'`; users cannot configure which collection a set maps to, meaning they cannot maintain separate collections for e.g. primitives vs semantics vs component tokens (`figma-plugin/controller.ts:7`)

- [ ] Figma variable mode creation during sync — when pushing tokens to Figma, the controller always uses the existing first mode (`collection.modes[0].modeId`) and never creates new modes; users must manually pre-create modes in Figma before syncing multi-mode token sets, which breaks the push-to-Figma workflow for new projects (`figma-plugin/controller.ts:132-152`)

- [ ] Bulk token operations beyond the current three — the batch editor only supports: add description, apply opacity (colors), scale values (dimensions/numbers); missing bulk operations for common tasks: move selection to a different set, rename by find/replace within selection, change `$type` across selection (`figma-plugin/BatchEditor.tsx:47-170`)

- [ ] Arbitrary `$extensions` view and edit — the token editor only exposes `tokenmanager.colorModifier` and `com.figma.scopes`; all other extension data on a token is invisible and uneditable via UI, making it impossible to manage custom tooling extensions without editing the JSON file directly (`figma-plugin/TokenEditor.tsx:154-156`)
