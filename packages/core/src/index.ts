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
  ThemeGroup,
  Theme,
  ThemesFile,
  ResolvedToken,
} from './types.js';

// DTCG file-format types & utilities
export type { DTCGToken, DTCGGroup, DTCGFile } from './dtcg-types.js';
export {
  isDTCGToken,
  isDTCGGroup,
  isReference,
  parseReference,
} from './dtcg-types.js';

// Resolver
export { TokenResolver } from './resolver.js';

// Validator
export { TokenValidator } from './validator.js';
export type { ValidationResult } from './validator.js';
