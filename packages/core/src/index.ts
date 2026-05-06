/**
 * @token-workshop/core — shared token engine
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
export {
  CROSS_COLLECTION_SEARCH_HAS_CANONICAL_SET,
  CROSS_COLLECTION_SEARCH_HAS_CANONICAL_VALUES,
  CROSS_COLLECTION_SEARCH_HAS_VALUES,
  SEARCH_SCOPE_CATEGORIES,
  SEARCH_SCOPE_CATEGORY_KEYS,
  SUPPORTED_SEARCH_SCOPE_VALUES,
  SEARCH_HAS_CANONICAL_VALUES,
  SEARCH_HAS_VALUES,
  SEARCH_HAS_CANONICAL_MAP,
} from './token-search.js';
export type {
  CrossCollectionSearchHasQualifierValue,
  SearchHasQualifierValue,
} from './token-search.js';

// Types
export type {
  TokenWorkshopExtensions,
  TokenExtensions,
  Derivation,
  DerivationOp,
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
  CollectionMode,
  CollectionPublishRouting,
  TokenCollection,
  SerializedTokenCollection,
  CollectionsFile,
  TokenModeValues,
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
export { getTokenWorkshopExt, getTokenLifecycle } from './types.js';
export {
  COLLECTION_NAME_RE,
  isValidCollectionName,
  normalizeCollectionModeName,
  findCollectionById,
  readTokenCollectionModeValues,
  tokenChangesAcrossModesInCollection,
  sanitizeModeValuesForCollection,
  readTokenModeValuesForCollection,
  buildTokenExtensionsWithCollectionModes,
  writeTokenCollectionModeValues,
  writeTokenModeValuesForCollection,
  deserializeTokenCollections,
  serializeTokenCollections,
  readCollectionsFileState,
} from './collections.js';
export type {
  CollectionPathResolutionReason,
  CollectionPathResolution,
} from './collection-paths.js';
export {
  getCollectionIdsForPath,
  pathExistsInCollection,
  resolveCollectionIdForPath,
} from './collection-paths.js';
export { stableStringify } from './stable-stringify.js';
export {
  FIGMA_SCOPE_EXTENSION_KEY,
  buildTokenExtensionsWithScopes,
  normalizeTokenScopeValues,
  readTokenScopes,
  stripTokenScopesFromExtensions,
} from './token-scopes.js';

// DTCG file-format types & utilities
export type { DTCGToken, DTCGGroup, DTCGFile } from './dtcg-types.js';
export {
  isDTCGToken,
  isDTCGGroup,
  isReference,
  isFormula,
  parseReference,
  extractReferencePaths,
  collectReferencePaths,
  flattenTokenGroup,
  resolveRefValue,
} from './dtcg-types.js';
export type { CollectTokenReferencePathsOptions } from './token-references.js';
export { collectTokenReferencePaths } from './token-references.js';

// Expression evaluator
export { evalExpr, substituteVars } from './eval-expr.js';

// Color math
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

// Derivation ops (per-token 1→1 transforms applied during resolution)
export {
  applyDerivation,
  applyDerivationOp,
  validateDerivationOps,
  extractDerivationRefPaths,
  isParamReference,
  paramReferencePath,
  isColorOpKind,
  isNumericOpKind,
  opSupportedTypes,
  opLighten,
  opDarken,
  opAlpha,
  opMix,
  opInvertLightness,
  opScaleBy,
  opAdd,
} from './derivation-ops.js';

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

// Generator types and computations
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
  ShadowScaleStep,
  ShadowScaleConfig,
  CustomScaleStep,
  CustomScaleConfig,
  GeneratorConfig,
  GeneratorTokenResult,
} from './generator-types.js';
export {
  validateStepName,
} from './generator-types.js';
export {
  DEFAULT_COLOR_RAMP_CONFIG,
  DEFAULT_TYPE_SCALE_CONFIG,
  DEFAULT_SPACING_SCALE_CONFIG,
  DEFAULT_OPACITY_SCALE_CONFIG,
  DEFAULT_BORDER_RADIUS_SCALE_CONFIG,
  DEFAULT_Z_INDEX_SCALE_CONFIG,
  DEFAULT_SHADOW_SCALE_CONFIG,
  DEFAULT_CUSTOM_SCALE_CONFIG,
} from './generator-types.js';
export {
  GENERATOR_TEMPLATE_OPTIONS,
  SOURCELESS_GENERATOR_TEMPLATES,
  buildGeneratorNodesFromStructuredDraft,
  generatorDefaultConfig,
  generatorDefaultOutputPrefix,
  generatorDefaultSourceValue,
  generatorTemplateLabel,
  makeDefaultStructuredGeneratorDraft,
  makeGeneratorLiteralData,
  readStructuredGeneratorDraft,
} from './generator-templates.js';
export type {
  GeneratorConfiguredTemplateKind,
  GeneratorSourceMode,
  GeneratorStructuredDraft,
  GeneratorTemplateKind,
} from './generator-templates.js';

// Token resolution (mode-aware ancestor walker)
export { resolveTokenAncestors } from './token-resolve.js';
export type {
  AncestorChainRow,
  AncestorChainByMode,
  AncestorTerminalKind,
  ResolveTokenAncestorsParams,
} from './token-resolve.js';

// Generator engine
export {
  computeColorRampTokens,
  computeTypeScaleTokens,
  computeSpacingScaleTokens,
  computeOpacityScaleTokens,
  computeBorderRadiusScaleTokens,
  computeZIndexScaleTokens,
  computeShadowScaleTokens,
  computeCustomScaleTokens,
} from './generator-engine.js';

// Token generator documents
export {
  checkTokenGeneratorConnection,
  createDefaultTokenGeneratorDocument,
  evaluateTokenGeneratorDocument,
  generatorProvenanceHash,
  getTokenGeneratorInputPorts,
  getTokenGeneratorOutputPorts,
  readGeneratorProvenance,
  tokenFromGeneratorOutput,
} from './token-generator-documents.js';
export type {
  EvaluateTokenGeneratorDocumentInput,
  GeneratorOutputProvenance,
  TokenGeneratorConnectionCheck,
  TokenGeneratorConnectionInput,
  TokenGeneratorDiagnostic,
  TokenGeneratorDocument,
  TokenGeneratorEdge,
  TokenGeneratorNode as TokenGeneratorDocumentNode,
  TokenGeneratorNodeKind,
  TokenGeneratorPortDescriptor,
  TokenGeneratorPortShape,
  TokenGeneratorPortType,
  TokenGeneratorPosition,
  TokenGeneratorNodePreview,
  TokenGeneratorNodePreviewValue,
  TokenGeneratorPreviewOutput,
  TokenGeneratorPreviewResult,
  TokenGeneratorViewport,
} from './token-generator-documents.js';
