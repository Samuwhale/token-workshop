/**
 * Core TypeScript types for the TokenManager token system.
 *
 * These types model the W3C DTCG token format as used throughout
 * TokenManager — from file I/O to the in-memory resolved graph.
 */

import { TOKEN_TYPES } from './constants.js';

// ---------------------------------------------------------------------------
// Primitive / Composite Token Value Types
// ---------------------------------------------------------------------------

/** Token lifecycle state for multi-team workflows. */
export type TokenLifecycle = 'draft' | 'published' | 'deprecated';

/** Hex (#RGB, #RRGGBB, #RRGGBBAA) or CSS color string. */
export type ColorValue = string;

export type DimensionValue = { value: number; unit: 'px' | 'rem' | 'em' | '%' };

export type FontFamilyValue = string | string[];

export type FontWeightValue = number | string;

export type DurationValue = { value: number; unit: 'ms' | 's' };

export type CubicBezierValue = [number, number, number, number];

export type NumberValue = number;

export type StrokeStyleValue =
  | string
  | { dashArray: DimensionValue[]; lineCap: 'round' | 'butt' | 'square' };

export type GradientStop = { color: ColorValue; position: number };
export type GradientValue = GradientStop[];

export type ShadowValue = {
  color: ColorValue;
  offsetX: DimensionValue;
  offsetY: DimensionValue;
  blur: DimensionValue;
  spread: DimensionValue;
  type?: 'dropShadow' | 'innerShadow';
};

export type TypographyValue = {
  fontFamily: FontFamilyValue;
  fontSize: DimensionValue;
  fontWeight: FontWeightValue;
  lineHeight: number | DimensionValue;
  letterSpacing: DimensionValue;
  fontStyle?: string;
  textDecoration?: string;
  textTransform?: string;
};

export type BorderValue = {
  color: ColorValue;
  width: DimensionValue;
  style: string;
};

export type TransitionValue = {
  duration: DurationValue;
  delay: DurationValue;
  timingFunction: CubicBezierValue;
};

/**
 * A composition token value — an object mapping bindable property names
 * (e.g. "fill", "cornerRadius", "paddingTop") to token references or
 * direct values. When applied, all properties are set at once.
 */
export type CompositionValue = Record<string, string | number | boolean | null>;

// ---------------------------------------------------------------------------
// Union of all possible token values
// ---------------------------------------------------------------------------

export type TokenValue =
  | ColorValue
  | DimensionValue
  | FontFamilyValue
  | FontWeightValue
  | DurationValue
  | CubicBezierValue
  | NumberValue
  | StrokeStyleValue
  | GradientValue
  | ShadowValue
  | TypographyValue
  | BorderValue
  | TransitionValue
  | CompositionValue
  | string
  | number
  | boolean;

// ---------------------------------------------------------------------------
// Token Type (derived from the constants object)
// ---------------------------------------------------------------------------

export type TokenType = (typeof TOKEN_TYPES)[keyof typeof TOKEN_TYPES];

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** A DTCG alias reference string, e.g. `"{colors.primary}"`. */
export type TokenReference = `{${string}}`;

// ---------------------------------------------------------------------------
// Token & Group
// ---------------------------------------------------------------------------

export interface Token {
  $value: TokenValue | TokenReference;
  $type?: TokenType;
  $description?: string;
  $extensions?: Record<string, unknown>;
}

export interface TokenGroup {
  $type?: TokenType;
  $description?: string;
  $figmaCollection?: string;
  $figmaMode?: string;
  [key: string]: Token | TokenGroup | TokenType | string | undefined;
}

// ---------------------------------------------------------------------------
// Token Sets
// ---------------------------------------------------------------------------

export interface TokenSet {
  name: string;
  tokens: TokenGroup;
  filePath?: string;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

export type ThemeSetStatus = 'enabled' | 'disabled' | 'source';

export interface ThemeSetConfig {
  [setName: string]: ThemeSetStatus;
}

export interface ThemeOption {
  name: string;
  sets: ThemeSetConfig;
}

export interface ThemeDimension {
  id: string;
  name: string;
  options: ThemeOption[];
}

/** Active themes: one selected option per dimension. Key = dimension id, value = option name. */
export type ActiveThemes = Record<string, string>;

export interface ThemesFile {
  $themes: ThemeDimension[];
}

// ---------------------------------------------------------------------------
// Color Modifiers
// ---------------------------------------------------------------------------

/**
 * A single color modifier operation stored in `$extensions.tokenmanager.colorModifier`.
 * Operations are applied in order using CIELAB math.
 */
export type ColorModifierOp =
  | { type: 'lighten'; amount: number }       // L* += amount (0-100 scale)
  | { type: 'darken'; amount: number }        // L* -= amount
  | { type: 'alpha'; amount: number }         // set alpha channel (0-1)
  | { type: 'mix'; color: string; ratio: number }; // Lab interpolate at ratio

// ---------------------------------------------------------------------------
// Resolved Token (post-alias resolution)
// ---------------------------------------------------------------------------

export interface ResolvedToken {
  /** Dot-delimited path, e.g. `"colors.primary.500"`. */
  path: string;
  $type: TokenType;
  /** Fully resolved value — no references remain. */
  $value: TokenValue;
  $description?: string;
  $extensions?: Record<string, unknown>;
  /** Original value before resolution (may contain references). */
  rawValue: TokenValue | TokenReference;
  /** Name of the token set this token belongs to. */
  setName: string;
}

// ---------------------------------------------------------------------------
// DTCG Resolver (v2025.10)
// ---------------------------------------------------------------------------

/** A JSON Pointer or file-path reference. */
export interface ResolverRef {
  $ref: string;
}

/** A source: either a file/pointer reference or inline tokens. */
export type ResolverSource = ResolverRef | Record<string, unknown>;

/** A named set of token sources in the resolver. */
export interface ResolverSet {
  description?: string;
  sources: ResolverSource[];
  $extensions?: Record<string, unknown>;
}

/** A modifier: named dimension with multiple contexts, each mapping to token sources. */
export interface ResolverModifier {
  description?: string;
  contexts: Record<string, ResolverSource[]>;
  default?: string;
  $extensions?: Record<string, unknown>;
}

/** An entry in the resolutionOrder array — always a $ref to a set or modifier. */
export type ResolutionOrderEntry = ResolverRef;

/** The root structure of a *.resolver.json file (DTCG v2025.10). */
export interface ResolverFile {
  $schema?: string;
  name?: string;
  version: '2025.10';
  description?: string;
  sets?: Record<string, ResolverSet>;
  modifiers?: Record<string, ResolverModifier>;
  resolutionOrder: ResolutionOrderEntry[];
  $extensions?: Record<string, unknown>;
}

/** Input to the resolver: modifier name -> selected context name. */
export type ResolverInput = Record<string, string>;
