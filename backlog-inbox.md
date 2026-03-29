
- [ ] Multi-selected tokens can't be batch-moved to a different group — selecting 5 tokens and relocating them all requires 5 individual move operations; add a "Move to group…" action in the multi-select toolbar that accepts a target path and moves all selected tokens in a single server call (TokenList.tsx multi-select toolbar, PUT /api/tokens/:path)

- [ ] Token sets have no description or annotation field — designers managing 10+ sets (light, dark, brand, platform overrides) have no way to record why a set exists or what it covers; add an optional description shown as a tooltip in the set picker and editable from the sets management view (sets.ts, SetsPicker component)

- [ ] Theme options have no side-by-side resolved value comparison — verifying a light/dark theme requires switching active option, memorizing values, switching again, and comparing mentally; add a "Compare two options" view in ThemeManager that resolves both options and shows token path / option-A value / option-B value in a diff table (ThemeManager.tsx)

- [ ] Color ramp generator has no per-step WCAG contrast preview — after generating a ramp, users can't see which step pairs pass AA (4.5:1) or AAA (7:1) against white/black without leaving the generator and using the contrast matrix; show a compact contrast grid or pass/fail badges on each step within the generator's preview area (ColorRampGenerator.tsx)

- [ ] Bezier curve generator has no standard easing preset library — configuring a cubic-bezier requires dragging raw control points with no shortcuts for common curves; add a row of preset buttons ("linear", "ease-in", "ease-out", "ease-in-out", "spring") that snap control points to well-known values, matching how browser DevTools presents bezier editors (BezierCurveEditor.tsx, BezierCurveGenerator.tsx)

- [ ] Generators can't be duplicated — creating a second color ramp that's similar to an existing one requires configuring from scratch or starting from a generic template; add a "Duplicate" action on generator cards in GraphPanel so users can clone an existing generator's config as a starting point (GraphPanel.tsx)

- [ ] Generator templates use jargon-heavy descriptions with no guidance — titles like "11-step perceptual color ramp with semantic action map" assume prior knowledge; add a subtitle or tooltip to each template card explaining when to use it (e.g., "Use this for brand primary/secondary colors with semantic aliases like action.hover") (GraphPanel.tsx GRAPH_TEMPLATES)

- [ ] [HIGH] Figma Variables export can get permanently stuck in loading state — handleExportFigmaVariables sends a postMessage and sets figmaLoading=true, but if the plugin never responds (e.g., no active Figma document, wrong context) the spinner never clears and the panel is unusable until the plugin is reloaded; add a timeout (10s) that resets state and shows an error toast (ExportPanel.tsx ~L260-265)

- [ ] Import failed tokens have no recovery action — when some tokens fail to import, failedImportPaths is tracked but the UI only shows a count with no "Retry failed" or "Copy failed paths" button; users must manually identify and re-import the failures with no tooling support (ImportPanel.tsx ~L870-874)

- [ ] Command palette token browse is capped at 100 with no way to see more — when searching tokens and 100+ results exist, the UI shows "100 of 542 shown — refine your search" but provides no "Load more" or pagination; users with large token systems must keep narrowing their query even when they need to browse (CommandPalette.tsx ~L530-534)

- [ ] Command palette qualifier hint chips disappear after any input is entered — chips showing available qualifiers (type:, set:, alias:) vanish once the user starts typing, making it impossible to discover additional qualifiers mid-query; render the chips persistently as a scrollable reference row below the input (CommandPalette.tsx ~L395)

- [ ] Generator templates that require a source token give no upfront signal — templates like "colorRamp" need the user to have a base color token, but this constraint is only surfaced after the user tries to proceed; show a "Requires a color token" badge on template cards at selection time so users know what they need before clicking (GraphPanel.tsx requiresSource property)
