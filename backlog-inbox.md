- [ ] Duplicate token set — there's no way to clone an entire token set with all its tokens and metadata; users who want to create a variant (e.g., "brand-B" from "brand-A") must create a new set and manually copy groups over; add a "Duplicate set" option to the set context menu and a POST /api/sets/:name/duplicate server route

- [ ] Quick-fix actions from HealthPanel and AnalyticsPanel — both panels identify issues (broken aliases, type mismatches, naming violations) but require the user to navigate away to fix them; add inline fix buttons for automatable issues like "delete broken alias", "update type to match referenced token", and "rename to match convention" directly in the issue list

- [ ] Generator search/filter in GraphPanel — the generator card list has no search or filter; with 10+ generators it becomes hard to find a specific one; add a search input and optional type filter (color-ramp, type-scale, etc.) to the GraphPanel header

- [ ] Merge ComparePanel's cross-theme comparison into the theme manager — ComparePanel (Define > Compare sub-tab) and the "Compare across themes" context menu action both show token value differences across theme options, but ComparePanel is a standalone sub-tab that duplicates theme-aware resolution logic; fold this into ThemeManager as a "Compare" view within the theme context where users already have mental model of dimensions and options, eliminating a separate concept to discover

- [ ] Preview before publish — the Publish panel applies variables/styles to Figma without showing a concrete preview of what will be created or updated; add a dry-run step that shows "will create N variables, update M, skip K" with expandable details before the user confirms, similar to how git push preview already works

- [ ] No way to filter or search within the History timeline — the merged timeline (actions + commits + snapshots) can grow long and has no search, type filter, or date range filter; add a search input and type-pill toggles (Action | Commit | Snapshot) to the HistoryPanel header so users can quickly find a specific change

- [ ] Validation suppressions are session-only and not shared — AnalyticsPanel allows suppressing individual lint violations, but suppressions are stored in local sessionStorage and lost on reload; persist suppressions server-side (e.g., in $extensions.tokenmanager.suppressions on the token or in a lint config allowlist) so the team shares a consistent view of acknowledged issues

- [ ] Batch delete from multi-select mode — multi-select mode (M key) offers batch edit, move, copy, and rename but no batch delete; users must exit multi-select and delete tokens one-by-one from the context menu; add a "Delete selected" action to the BatchEditor toolbar with a confirmation dialog showing the count and any dependent tokens

- [ ] No zoom/pan on TokenFlowPanel dependency graph — the dependency graph uses a fixed 3-column SVG layout that can't be zoomed or panned; for tokens with many references (20+ upstream, 30+ downstream), the graph overflows or truncates; add mouse-wheel zoom and drag-to-pan using the same SVG transform pattern already used in the node graph editor (GraphPanel)

- [ ] Inline alias creation from token tree — creating an alias currently requires opening the token editor, toggling alias mode (Cmd+L), then typing the reference path; add a drag-and-drop interaction where dragging one token onto another creates an alias, or add an "Alias to..." quick action in the context menu that opens a single-field autocomplete popover without opening the full editor

- [ ] Export panel has no "copy to clipboard" option — ExportPanel generates platform files (CSS, SCSS, JSON, etc.) but the only output is a ZIP download; for single-platform exports or quick copy-paste workflows, add a "Copy to clipboard" button next to each platform preview that copies the generated output directly

- [ ] Set-level diff before git pull — git pull applies remote changes immediately with no preview of which tokens in which sets will change; the push preview exists (GET /sync/push/preview) but pull only shows file-level diffs; add a token-level pull preview that shows "set X: 5 tokens added, 3 modified, 1 deleted" before the user confirms the pull
