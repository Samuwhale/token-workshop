/**
 * Core TypeScript types for the TokenManager token system.
 *
 * These types model the W3C DTCG token format as used throughout
 * TokenManager — from file I/O to the in-memory resolved graph.
 */

import { TOKEN_TYPES, DimensionUnit } from './constants.js';
import type { DTCGGroup } from './dtcg-types.js';

// ---------------------------------------------------------------------------
// Primitive / Composite Token Value Types
// ---------------------------------------------------------------------------

/** Token lifecycle state for multi-team workflows. */
export type TokenLifecycle = 'draft' | 'published' | 'deprecated';

/** Hex (#RGB, #RRGGBB, #RRGGBBAA) or CSS color string. */
export type ColorValue = string;

export type DimensionValue = { value: number; unit: DimensionUnit };

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
  $extensions?: TokenExtensions;
}

export interface TokenGroup {
  $type?: TokenType;
  $description?: string;
  $figmaCollection?: string;
  $figmaMode?: string;
  [key: string]: Token | TokenGroup | TokenType | string | undefined;
}

// ---------------------------------------------------------------------------
// Collections & Modes
// ---------------------------------------------------------------------------

export interface CollectionMode {
  name: string;
}

export interface CollectionPublishRouting {
  collectionName?: string;
  modeName?: string;
}

export interface TokenCollection {
  id: string;
  description?: string;
  publishRouting?: CollectionPublishRouting;
  modes: CollectionMode[];
}

/** One selected mode per collection. Key = collection id, value = mode name. */
export type SelectedModes = Record<string, string>;

export interface ViewPreset {
  id: string;
  name: string;
  selections: SelectedModes;
}

/** Serialized file shape for `$collections.json`. */
export interface SerializedTokenCollection {
  id: string;
  description?: string;
  publishRouting?: CollectionPublishRouting;
  modes: CollectionMode[];
}

export interface CollectionsFile {
  $collections: SerializedTokenCollection[];
  $views?: ViewPreset[];
}

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

/**
 * A single derivation operation, stored under
 * `$extensions.tokenmanager.derivation.ops` and applied in order during
 * resolution. See `derivation-ops.ts` for the math and registry.
 */
export type DerivationOp =
  | { kind: 'alpha'; amount: number }                                        // 0..1
  | { kind: 'lighten'; amount: number }                                      // L* delta 0..100
  | { kind: 'darken'; amount: number }                                       // L* delta 0..100
  | { kind: 'mix'; with: string; ratio: number }                             // ratio 0..1; with = hex literal or "{path}"
  | { kind: 'invertLightness'; chromaBoost?: number }                        // mirror L* around 50%; chroma scale (default 1)
  | { kind: 'scaleBy'; factor: number }                                      // value *= factor
  | { kind: 'add'; delta: DimensionValue | DurationValue | number };         // value += delta (units must match)

export interface Derivation {
  ops: DerivationOp[];
}

// ---------------------------------------------------------------------------
// TokenManager Extensions
// ---------------------------------------------------------------------------

/** Fields stored under `$extensions.tokenmanager` by the TokenManager engine. */
export type TokenModeValues = Record<string, Record<string, unknown>>;

export interface TokenManagerExtensions {
  /** Formula expression string, e.g. "{spacing.base} * 2". Set by resolver/store for formula tokens. */
  formula?: string;
  /**
   * Per-token 1→1 derivation: an ordered list of ops applied to the resolved
   * `$value` during resolution. The token's `$value` must be an alias
   * (`{path}`); the derivation transforms the source value into the derived
   * value. See `derivation-ops.ts` for the op registry.
   */
  derivation?: Derivation;
  /** Token lifecycle state for multi-team workflows. */
  lifecycle?: TokenLifecycle;
  /** Provenance: how the token was imported. */
  source?: 'figma-variables' | 'figma-styles' | 'json' | 'css' | 'tailwind' | (string & {});
  /** Dot-path to a base token this token inherits from (composite inheritance). */
  extends?: string;
  /** Per-collection mode overrides keyed by collection id, then mode name. */
  modes?: TokenModeValues;
  /** Graph provenance for tokens managed by a graph document. */
  graph?: {
    graphId: string;
    outputNodeId: string;
    outputKey: string;
    lastAppliedHash: string;
  };
  /** Resolver-driven Figma publish configuration for mapping contexts to modes. */
  resolverPublish?: ResolverFigmaPublishConfig;
}

/** Generator provenance stored under `$extensions['com.tokenmanager.generator']`. */
export interface TokenManagerGeneratorExtension {
  generatorId: string;
  sourceToken: string;
  brand?: string;
  outputKind?: "scale" | "semantic";
}

export interface ResolverFigmaModeMapping {
  contexts: ResolverInput;
  collectionName?: string;
  modeName: string;
}

export interface ResolverFigmaPublishConfig {
  modeMappings: ResolverFigmaModeMapping[];
}

/** Typed `$extensions` object for tokens and groups. */
export interface TokenExtensions {
  tokenmanager?: TokenManagerExtensions;
  'com.figma.scopes'?: string[];
  'com.tokenmanager.generator'?: TokenManagerGeneratorExtension;
  [key: string]: unknown;
}

/**
 * Get the `tokenmanager` extension from a token, typed.
 * Returns `undefined` if the extension is absent.
 */
export function getTokenManagerExt(token: { $extensions?: TokenExtensions | Record<string, unknown> }): TokenManagerExtensions | undefined {
  return (token.$extensions as TokenExtensions | undefined)?.tokenmanager;
}

/**
 * Read the normalized lifecycle for a token or token-like object.
 * Defaults to `published` when the lifecycle metadata is absent or invalid.
 */
export function getTokenLifecycle(
  token: { $extensions?: TokenExtensions | Record<string, unknown> },
): TokenLifecycle {
  const lifecycle = getTokenManagerExt(token)?.lifecycle;
  return lifecycle === 'draft' || lifecycle === 'deprecated' || lifecycle === 'published'
    ? lifecycle
    : 'published';
}

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
  $extensions?: TokenExtensions;
  /** Original value before resolution (may contain references). */
  rawValue: TokenValue | TokenReference;
  /** Canonical collection identifier for the token. */
  collectionId: string;
}

// ---------------------------------------------------------------------------
// DTCG Resolver (v2025.10)
// ---------------------------------------------------------------------------

/** A JSON Pointer or file-path reference. */
export interface ResolverRef {
  $ref: string;
}

/** A source: either a file/pointer reference or inline tokens. */
export type ResolverSource = ResolverRef | DTCGGroup;

/** A named set of token sources in the resolver. */
export interface ResolverSet {
  description?: string;
  sources: ResolverSource[];
  $extensions?: TokenExtensions;
}

/** A modifier: named dimension with multiple contexts, each mapping to token sources. */
export interface ResolverModifier {
  description?: string;
  contexts: Record<string, ResolverSource[]>;
  default?: string;
  $extensions?: TokenExtensions;
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
  $extensions?: TokenExtensions;
}

/** Input to the resolver: modifier name -> selected context name. */
export type ResolverInput = Record<string, string>;
