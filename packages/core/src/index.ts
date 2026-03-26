/**
 * @tokenmanager/core — shared token engine
 *
 * Re-exports all public types, constants, utilities, and classes.
 */

// Constants
export {
  TOKEN_TYPES,
  TOKEN_TYPE_VALUES,
  DIMENSION_UNITS,
  FONT_WEIGHT_NAMES,
  STROKE_STYLE_KEYWORDS,
  DEFAULTS,
  REFERENCE_REGEX,
  REFERENCE_GLOBAL_REGEX,
} from './constants.js';
export type { DimensionUnit, StrokeStyleKeyword } from './constants.js';

// Types
export type {
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
  ThemeSetStatus,
  ThemeSetConfig,
  ThemeOption,
  ThemeDimension,
  ActiveThemes,
  ThemesFile,
  ResolvedToken,
} from './types.js';

// DTCG file-format types & utilities
export type { DTCGToken, DTCGGroup, DTCGFile } from './dtcg-types.js';
export {
  isDTCGToken,
  isDTCGGroup,
  isReference,
  isFormula,
  parseReference,
} from './dtcg-types.js';

// Expression evaluator
export { evalExpr, substituteVars } from './eval-expr.js';

// Color math & modifiers
export { hexToLab, labToHex } from './color-math.js';
export { applyColorModifiers } from './color-modifier.js';

// Resolver
export { TokenResolver } from './resolver.js';

// Validator
export { TokenValidator } from './validator.js';
export type { ValidationResult } from './validator.js';

// Generator types & engine
export type {
  GeneratorType,
  ColorRampConfig,
  TypeScaleStep,
  TypeScaleConfig,
  SpacingStep,
  SpacingScaleConfig,
  OpacityScaleConfig,
  BorderRadiusStep,
  BorderRadiusScaleConfig,
  ZIndexScaleConfig,
  CustomScaleStep,
  CustomScaleConfig,
  AccessibleColorPairConfig,
  DarkModeInversionConfig,
  ResponsiveScaleStep,
  ResponsiveScaleConfig,
  GeneratorConfig,
  TokenGenerator,
  GeneratedTokenResult,
} from './generator-types.js';
export {
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
  DEFAULT_ACCESSIBLE_COLOR_PAIR_CONFIG,
  DEFAULT_DARK_MODE_INVERSION_CONFIG,
  DEFAULT_RESPONSIVE_SCALE_CONFIG,
} from './generator-types.js';

// Generator engine
export {
  runColorRampGenerator,
  runTypeScaleGenerator,
  runSpacingScaleGenerator,
  runOpacityScaleGenerator,
  runBorderRadiusScaleGenerator,
  runZIndexScaleGenerator,
  runCustomScaleGenerator,
  runAccessibleColorPairGenerator,
  runDarkModeInversionGenerator,
  runResponsiveScaleGenerator,
  applyOverrides,
} from './generator-engine.js';
