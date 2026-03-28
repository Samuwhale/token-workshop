
## Generators: allow setting base value inline instead of requiring a source token

**Problem:** 7 of 11 generator types (colorRamp, typeScale, spacingScale, borderRadiusScale, accessibleColorPair, darkModeInversion, responsiveScale) are disabled when opened without a source token. This forces users to first create or navigate to an existing token, open its editor, and launch the generator from there — defeating the purpose of generators as a quick way to scaffold token groups.

**Proposed change:** When no source token is provided, show an inline "base value" input instead of disabling the generator type:
- Color-based generators (colorRamp, accessibleColorPair, darkModeInversion): render a color picker input
- Dimension-based generators (spacingScale, borderRadiusScale, responsiveScale): render a number + unit (px/rem) input
- Font-size-based generators (typeScale): render a number + unit input

When a source token IS provided, the current behavior stays the same (source pre-filled, shown in header). The inline input is hidden or shows the source value as read-only with an "unlink" option to override.

**Affected files:**
- `useGeneratorDialog.ts` — remove `typeNeedsSource` gating; add `inlineBaseValue` state that feeds into config the same way `sourceTokenValue` does today
- `TokenGeneratorDialog.tsx` — render the inline base input above the config editor when no source is present
- `generatorUtils.ts` — `availableTypes` should no longer filter out source-required types; `defaultConfigForType` should accept an inline base value
