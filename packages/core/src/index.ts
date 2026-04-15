/**
 * @tokenmanager/core — shared token engine
 *
 * Re-exports all public types, constants, utilities, and classes.
 */

// Constants
export {
  TOKEN_TYPES,
  TOKEN_TYPE_VALUES,
  COMPOSITE_TOKEN_TYPES,
  DIMENSION_UNITS,
  FONT_WEIGHT_NAMES,
  STROKE_STYLE_KEYWORDS,
  DEFAULTS,
  REFERENCE_REGEX,
  makeReferenceGlobalRegex,
} from './constants.js';
export type { DimensionUnit, StrokeStyleKeyword } from './constants.js';

// Types
export type {
  TokenManagerExtensions,
  TokenManagerRecipeExtension,
  TokenExtensions,
  ColorModifierOp,
  ColorValue,
  DimensionValue,
  FontFamilyValue,
  FontWeightValue,
  DurationValue,
  CubicBezierValue,
  NumberValue,
  StrokeStyleValue,
  GradientStop,
  GradientValue,
  ShadowValue,
  TypographyValue,
  BorderValue,
  TransitionValue,
  TokenValue,
  TokenType,
  TokenReference,
  Token,
  TokenGroup,
  TokenSet,
  ThemeOption,
  ThemeDimension,
  ActiveThemes,
  ThemeViewPreset,
  ThemesFile,
  ResolvedToken,
  TokenLifecycle,
  ResolverRef,
  ResolverSource,
  ResolverSet,
  ResolverModifier,
  ResolutionOrderEntry,
  ResolverFile,
  ResolverInput,
  ResolverFigmaModeMapping,
  ResolverFigmaPublishConfig,
} from './types.js';
export { getTokenManagerExt } from './types.js';

// DTCG file-format types & utilities
export type { DTCGToken, DTCGGroup, DTCGFile } from './dtcg-types.js';
export {
  isDTCGToken,
  isDTCGGroup,
  isReference,
  isFormula,
  parseReference,
  flattenTokenGroup,
  resolveRefValue,
} from './dtcg-types.js';

// Expression evaluator
export { evalExpr, substituteVars } from './eval-expr.js';

// Color math & modifiers
export {
  srgbToLinear,
  srgbFromLinear,
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToLab,
  hexToLab,
  labToHex,
  wcagLuminance,
  colorDeltaE,
  setHexAlpha,
} from './color-math.js';
export { applyColorModifiers, validateColorModifiers } from './color-modifier.js';

// CSS Color Module 4 parser
export type { ColorSpace, ParsedColor } from './color-parse.js';
export {
  parseAnyColor,
  exceedsSrgb,
  isWideGamut,
  srgbFallbackHex,
  toOklch,
  toSrgb,
  toDisplayP3,
  toHex,
  toOklabColor,
  serializeColor,
  parsedColorLuminance,
  linearSrgbToOklab,
  oklabToLinearSrgb,
  oklabToOklch,
  oklchToOklab,
  hslToSrgb,
  srgbToHsl,
} from './color-parse.js';

// Resolver
export { TokenResolver } from './resolver.js';

// DTCG Resolver (v2025.10)
export {
  validateResolverFile,
  validateResolverInput,
  getDefaultResolverInput,
  resolveTokens as resolveResolverTokens,
  resolveTokensFull as resolveResolverTokensFull,
} from './dtcg-resolver.js';
export type { ExternalFileLoader, ResolverDiagnostic, ResolverResult } from './dtcg-resolver.js';

// Validator
export { TokenValidator } from './validator.js';
export type { ValidationResult } from './validator.js';

// Recipe types & engine
export type {
  RecipeType,
  RecipeManagedOutput,
  ColorRampConfig,
  TypeScaleStep,
  TypeScaleConfig,
  SpacingStep,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusStep,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  ShadowScaleStep,
  ShadowScaleConfig,
  CustomScaleStep,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ContrastCheckStep,
  ContrastCheckConfig,
  RecipeConfig,
  RecipeSemanticLayer,
  SemanticTokenMapping,
  TokenRecipe,
  GeneratedTokenResult,
  InputTableRow,
  InputTable,
} from './recipe-types.js';
export {
  createRecipeOwnershipKey,
  getRecipeManagedOutputPaths,
  getRecipeManagedOutputs,
  getRecipeOutputSetNames,
  getRecipeStepNames,
  validateStepName,
} from './recipe-types.js';
export {
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_ACCESSIBLE_COLOR_PAIR_CONFIG,
  DEFAULT_DARK_MODE_INVERSION_CONFIG,
  DEFAULT_CONTRAST_CHECK_CONFIG,
} from './recipe-types.js';

// Recipe engine
export {
  runColorRampRecipe,
  runTypeScaleRecipe,
  runSpacingScaleRecipe,
  runOpacityScaleRecipe,
  runBorderRadiusScaleRecipe,
  runZIndexScaleRecipe,
  runShadowScaleRecipe,
  runCustomScaleRecipe,
  runAccessibleColorPairRecipe,
  runDarkModeInversionRecipe,
  runContrastCheckRecipe,
  applyOverrides,
} from './recipe-engine.js';
