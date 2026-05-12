// Shared types used by both controller (plugin sandbox) and UI
import type { IconColorBehavior, TokenLifecycle, TokenReference, TokenValue } from '@token-workshop/core';
import type { TokenExtensions } from '@token-workshop/core';

/** Shape returned by API endpoints on error (e.g. 4xx/5xx). */
export interface ApiErrorBody {
  error?: string;
}

export type BindableProperty =
  | 'fill'
  | 'stroke'
  | 'width'
  | 'height'
  | 'paddingTop'
  | 'paddingRight'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'itemSpacing'
  | 'cornerRadius'
  | 'strokeWeight'
  | 'opacity'
  | 'typography'
  | 'shadow'
  | 'visible';

export const ALL_BINDABLE_PROPERTIES: BindableProperty[] = [
  'fill', 'stroke', 'width', 'height',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'itemSpacing', 'cornerRadius', 'strokeWeight', 'opacity',
  'typography', 'shadow', 'visible',
];

/** Semantic families that group related token types under one color.
 *  Six hues keep the palette readable as a legend instead of a 25-type rainbow. */
export type TokenFamily = 'color' | 'size' | 'type' | 'effect' | 'motion' | 'other';

export const TOKEN_TYPE_FAMILY: Record<string, TokenFamily> = {
  color: 'color',
  gradient: 'color',

  dimension: 'size',
  spacing: 'size',
  fontSize: 'size',
  lineHeight: 'size',
  letterSpacing: 'size',
  percentage: 'size',

  typography: 'type',
  fontFamily: 'type',
  fontStyle: 'type',
  fontWeight: 'type',
  textDecoration: 'type',
  textTransform: 'type',

  shadow: 'effect',
  border: 'effect',
  strokeStyle: 'effect',
  composition: 'effect',
  transition: 'effect',

  duration: 'motion',
  cubicBezier: 'motion',

  number: 'other',
  string: 'other',
  boolean: 'other',
  asset: 'other',
  link: 'other',
  custom: 'other',
};

export const TOKEN_FAMILY_BADGE_CLASS: Record<TokenFamily, string> = {
  color: 'token-family-color',
  size: 'token-family-size',
  type: 'token-family-type',
  effect: 'token-family-effect',
  motion: 'token-family-motion',
  other: 'token-family-other',
};

/** Unknown or missing types fall back to the "other" family so every token
 *  still renders a styled badge. */
export function tokenTypeBadgeClass(tokenType: string | undefined): string {
  const family = (tokenType && TOKEN_TYPE_FAMILY[tokenType]) || 'other';
  return TOKEN_FAMILY_BADGE_CLASS[family];
}

export const ALL_TOKEN_TYPES: string[] = Object.keys(TOKEN_TYPE_FAMILY);

export const TOKEN_PROPERTY_MAP: Record<string, BindableProperty[]> = {
  color: ['fill', 'stroke'],
  dimension: ['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'cornerRadius', 'strokeWeight'],
  typography: ['typography'],
  shadow: ['shadow'],
  border: ['stroke'],
  number: ['opacity', 'cornerRadius', 'strokeWeight'],
  boolean: ['visible'],
};

export const COMPOSITION_PROPERTY_TYPES = {
  fill: 'color',
  stroke: 'color',
  width: 'dimension',
  height: 'dimension',
  paddingTop: 'dimension',
  paddingRight: 'dimension',
  paddingBottom: 'dimension',
  paddingLeft: 'dimension',
  itemSpacing: 'dimension',
  cornerRadius: 'dimension',
  strokeWeight: 'dimension',
  opacity: 'number',
  typography: 'typography',
  shadow: 'shadow',
  visible: 'boolean',
} as const satisfies Record<BindableProperty, string>;

export type CompositionPropertyType =
  (typeof COMPOSITION_PROPERTY_TYPES)[keyof typeof COMPOSITION_PROPERTY_TYPES]
  | 'string';

export function getCompositionPropertyType(property: string): CompositionPropertyType {
  return COMPOSITION_PROPERTY_TYPES[property as BindableProperty] ?? 'string';
}

export const PROPERTY_LABELS: Record<BindableProperty, string> = {
  fill: 'Fill Color',
  stroke: 'Stroke Color',
  width: 'Width',
  height: 'Height',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  itemSpacing: 'Item Spacing',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  opacity: 'Opacity',
  typography: 'Typography',
  shadow: 'Shadow',
  visible: 'Visible',
};

// Property groupings for the inspector
export const PROPERTY_GROUPS: { label: string; properties: BindableProperty[]; condition?: string }[] = [
  { label: 'Appearance', properties: ['fill', 'stroke', 'opacity'] },
  { label: 'Size', properties: ['width', 'height'] },
  { label: 'Layout', properties: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'], condition: 'hasAutoLayout' },
  { label: 'Shape', properties: ['cornerRadius', 'strokeWeight'] },
  { label: 'Text', properties: ['typography'], condition: 'isText' },
  { label: 'Effects', properties: ['shadow'], condition: 'hasEffects' },
  { label: 'Other', properties: ['visible'] },
];

export interface NodeCapabilities {
  hasFills: boolean;
  hasStrokes: boolean;
  hasAutoLayout: boolean;
  isText: boolean;
  hasEffects: boolean;
}

export interface NodeBinding {
  property: BindableProperty;
  tokenPath: string;
  collectionId?: string;
}

/**
 * Current visual property values read from a Figma node.
 * All fields are optional — only populated when the node supports the property.
 * fill/stroke are serialized as hex color strings (e.g. "#RRGGBBAA").
 */
export interface NodeCurrentValues {
  fill?: string;
  stroke?: string;
  width?: number;
  height?: number;
  opacity?: number;
  cornerRadius?: number;
  strokeWeight?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  typography?: TypographyValue;
  shadow?: ShadowTokenValue | ShadowTokenValue[];
  visible?: boolean;
}

export type BindablePropertyValue = NodeCurrentValues[BindableProperty];
export type BindableTokenValue =
  | string
  | number
  | boolean
  | DimensionValue
  | TypographyValue
  | ShadowTokenValue
  | ShadowTokenValue[];

export interface SelectionNodeInfo {
  id: string;
  name: string;
  type: string;
  /** Maps BindableProperty name → token path for each active binding. */
  bindings: Record<string, string>;
  /** Maps BindableProperty name → collection id for collection-scoped bindings. */
  bindingCollections?: Record<string, string>;
  capabilities: NodeCapabilities;
  currentValues: NodeCurrentValues;
  /** 0 = directly selected, 1+ = nested descendant (deep inspect mode). */
  depth?: number;
  /** ID of the parent node; only set for depth > 0. */
  parentId?: string;
  /** Instance-swap properties exposed by a selected component instance. */
  iconSwapProperties?: IconInstanceSwapProperty[];
}

export interface IconInstanceSwapProperty {
  propertyName: string;
  label: string;
  value: string;
  preferredValues?: {
    type: 'COMPONENT' | 'COMPONENT_SET';
    key: string;
  }[];
}

export interface SetDeepInspectMessage {
  type: 'set-deep-inspect';
  enabled: boolean;
}

export interface ApplyToSelectionMessage {
  type: 'apply-to-selection';
  tokenPath: string;
  collectionId?: string;
  tokenType: string;
  targetProperty: BindableProperty;
  resolvedValue: ResolvedTokenValue;
}

export interface RemoveBindingMessage {
  type: 'remove-binding';
  property: BindableProperty;
}

export interface ClearAllBindingsMessage {
  type: 'clear-all-bindings';
}

export interface SelectionMessage {
  type: 'selection';
  nodes: SelectionNodeInfo[];
}

export interface TokenMapEntry {
  $value: TokenValue | TokenReference;
  $type: string;
  /** Original alias reference string when `$value` has been resolved for UI use. */
  reference?: TokenReference;
  /** DTCG leaf key (segment name) — may contain dots, e.g. "1.5". */
  $name?: string;
  $description?: string;
  $extensions?: TokenExtensions;
  /** Figma variable scopes from $extensions['com.figma.scopes']. Empty/undefined = unrestricted. */
  $scopes?: string[];
  /** Lifecycle stage from $extensions.tokenworkshop.lifecycle. Undefined means 'published'. */
  $lifecycle?: TokenLifecycle;
}

// ─── Concrete value types used in the plugin sandbox ─────────────────────────

/** Dimension value shape used in DTCG tokens: `{ value: number; unit: string }` */
export interface DimensionValue {
  value: number;
  unit: string;
}

/** A single shadow layer in a DTCG shadow token value */
export interface ShadowTokenValue {
  color: string;
  offsetX: DimensionValue | number;
  offsetY: DimensionValue | number;
  blur: DimensionValue | number;
  spread?: DimensionValue | number;
  type?: 'innerShadow' | 'dropShadow';
}

/** Typography composite token value */
export interface TypographyValue {
  fontFamily?: string | string[];
  fontWeight?: number | string;
  fontSize?: number | DimensionValue;
  lineHeight?: number | DimensionValue;
  letterSpacing?: number | DimensionValue;
  fontStyle?: string;
}

/** Border composite token value */
export interface BorderValue {
  color: string;
  width: DimensionValue | number;
  style: string;
}

/** Object variant of ResolvedTokenValue — breaks the recursive type alias cycle. */
export interface ResolvedTokenObject {
  [key: string]: unknown;
}

/**
 * Union of all resolved DTCG token values that flow through the plugin sandbox.
 * Covers primitives, dimension objects, composite token shapes, and null.
 */
export type ResolvedTokenValue =
  | string
  | string[]
  | number
  | boolean
  | DimensionValue
  | ShadowTokenValue
  | ShadowTokenValue[]
  | TypographyValue
  | BorderValue
  | ResolvedTokenObject
  | null;

// ─── Variable sync token types ────────────────────────────────────────────────

/**
 * A single token entry for Figma variable sync (applyVariables).
 * Represents a resolved, flat token ready to be written as a Figma variable.
 */
export interface VariableSyncToken {
  path: string;
  $type: string;
  $value: TokenValue | TokenReference | null;
  collectionId?: string;
  aliasTargetCollectionId?: string;
  figmaCollection?: string;
  figmaMode?: string;
  $extensions?: {
    'com.figma.scopes'?: string[];
    [key: string]: unknown;
  };
}

// ─── Variable read-back types ─────────────────────────────────────────────────

/** A single token read back from a Figma variable in read-variables operations. */
export interface ReadVariableToken {
  path: string;
  $type: string;
  $value: string | number | boolean | DimensionValue | null;
  $description: string;
  $scopes: string[];
  /** DTCG reference string e.g. "{colors.primary}", set when the value is an alias. */
  reference?: string;
  /** Indicates that `$value` is a reference string rather than a resolved scalar. */
  isAlias?: boolean;
  /** Mirrors the underlying Figma flag for export/save workflows. */
  hiddenFromPublishing: boolean;
}

/** A mode within a Figma variable collection (read-back). */
export interface ReadVariableMode {
  modeId: string;
  modeName: string;
  tokens: ReadVariableToken[];
}

/** A Figma variable collection with its modes and tokens (read-back). */
export interface ReadVariableCollection {
  name: string;
  modes: ReadVariableMode[];
}

export interface ReadColorStyleToken {
  path: string;
  $type: 'color';
  $value: string;
  _warning?: string;
  $extensions?: Record<string, unknown>;
}

export interface ReadGradientStyleToken {
  path: string;
  $type: 'gradient';
  $value: {
    type: string;
    stops: Array<{ color: string; position: number }>;
  };
  _warning?: string;
  $extensions?: Record<string, unknown>;
}

export interface ReadTypographyStyleToken {
  path: string;
  $type: 'typography';
  $value: {
    fontFamily: string;
    fontSize: string | { value: number; unit: 'px' };
    fontWeight: string | number;
    lineHeight: string | { value: number; unit: 'px' } | number | 'auto';
    letterSpacing: string | { value: number; unit: 'px' | '%' };
    fontStyle: string;
    textDecoration?: string;
    textTransform?: string;
  };
  $extensions?: Record<string, unknown>;
}

export interface ReadShadowStyleToken {
  path: string;
  $type: 'shadow';
  $value: Array<{
    color: string;
    offsetX: string | { value: number; unit: 'px' };
    offsetY: string | { value: number; unit: 'px' };
    blur: string | { value: number; unit: 'px' };
    spread: string | { value: number; unit: 'px' };
    type: 'innerShadow' | 'dropShadow';
  }>;
  $extensions?: Record<string, unknown>;
}

export type ReadStyleToken =
  | ReadColorStyleToken
  | ReadGradientStyleToken
  | ReadTypographyStyleToken
  | ReadShadowStyleToken;

/**
 * Maps Figma variable scope values to the BindableProperty values they allow.
 * Used to filter bind-picker candidates so scoped tokens only appear for
 * compatible properties (e.g. a FILL_COLOR-scoped color token won't show
 * in stroke pickers).
 */
export const SCOPE_TO_PROPERTIES: Record<string, BindableProperty[]> = {
  FILL_COLOR:     ['fill'],
  STROKE_COLOR:   ['stroke'],
  TEXT_FILL:      ['fill'],
  EFFECT_COLOR:   ['fill', 'stroke'],
  WIDTH_HEIGHT:   ['width', 'height'],
  GAP:            ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing'],
  CORNER_RADIUS:  ['cornerRadius'],
  OPACITY:        ['opacity'],
  FONT_SIZE:      ['typography'],
  LINE_HEIGHT:    ['typography'],
  LETTER_SPACING: ['typography'],
  STROKE_FLOAT:   ['strokeWeight'],
  FONT_FAMILY:    ['typography'],
  FONT_STYLE:     ['typography'],
  TEXT_CONTENT:   [],
  SHOW_HIDE:      ['visible'],
};

export interface SyncBindingsMessage {
  type: 'sync-bindings';
  tokenMap: Record<string, TokenMapEntry>;
  scope: 'page' | 'selection';
}

export interface SyncProgressMessage {
  type: 'sync-progress';
  processed: number;
  total: number;
}

export interface SyncCompleteMessage {
  type: 'sync-complete';
  updated: number;
  skipped: number;
  errors: number;
  missingTokens: string[];
}

export interface RemapBindingsMessage {
  type: 'remap-bindings';
  /** Map of old token path → new token path */
  remapMap: Record<string, string>;
  scope: 'selection' | 'page';
}

export interface RemapCompleteMessage {
  type: 'remap-complete';
  updatedBindings: number;
  updatedNodes: number;
  scannedNodes: number;
  nodesWithBindings: number;
  error?: string;
}

// --- Additional UI→Controller message types ---

export interface ApplyVariablesMessage {
  type: 'apply-variables';
  tokens: VariableSyncToken[];
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  correlationId?: string;
  /**
   * Token path rename pairs recorded since the last sync.
   * When provided, the plugin renames existing Figma variables to their new
   * paths instead of creating new ones — preserving variable IDs and all
   * node bindings that reference the old variable.
   */
  renames?: Array<{ oldPath: string; newPath: string }>;
}

export interface ApplyStylesMessage {
  type: 'apply-styles';
  tokens: import('../plugin/styleSync.js').StyleToken[];
  correlationId?: string;
}

export interface ReadVariablesMessage {
  type: 'read-variables';
  correlationId?: string;
}

export interface ReadStylesMessage {
  type: 'read-styles';
  correlationId?: string;
}

export interface GetSelectionMessage {
  type: 'get-selection';
}

export interface HighlightLayerByTokenMessage {
  type: 'highlight-layer-by-token';
  tokenPath: string;
}

export interface NotifyMessage {
  type: 'notify';
  message: string;
}

export interface ResizeMessage {
  type: 'resize';
  width: number;
  height: number;
}

export interface OrphanVariableDeleteTarget {
  path: string;
  collectionName: string;
  modeNames?: string[];
}

export interface DeleteOrphanVariablesMessage {
  type: 'delete-orphan-variables';
  knownPaths: string[];
  collectionMap?: Record<string, string>;
  targets?: OrphanVariableDeleteTarget[];
  correlationId?: string;
}

export interface SelectNodeMessage {
  type: 'select-node';
  nodeId: string;
}

export interface SelectNextSiblingMessage {
  type: 'select-next-sibling';
}

export interface ScanTokenUsageMessage {
  type: 'scan-token-usage';
}

export type ScanScope = 'page' | 'selection' | 'all-pages';

export interface BatchBindHeatmapNodesMessage {
  type: 'batch-bind-heatmap-nodes';
  nodeIds: string[];
  tokenPath: string;
  tokenType: string;
  targetProperty: string;
  resolvedValue: ResolvedTokenValue;
  /** Skip updating the canvas selection and viewport when applying (used for bulk snap) */
  skipNavigation?: boolean;
}

export interface EyedropperMessage {
  type: 'eyedropper';
}

export interface ScanSingleTokenUsageMessage {
  type: 'scan-single-token-usage';
  tokenPath: string;
}

// --- Search layers ---

export interface SearchLayersMessage {
  type: 'search-layers';
  query: string;
  correlationId?: string;
}

// --- Scan token variable bindings ---

export interface ScanTokenVariableBindingsMessage {
  type: 'scan-token-variable-bindings';
  tokenPath: string;
}

// --- Remove binding from node ---

export interface RemoveBindingFromNodeMessage {
  type: 'remove-binding-from-node';
  nodeId: string;
  property: string;
}

export interface LayerSearchResult {
  id: string;
  name: string;
  type: string;
  parentName?: string;
  boundCount: number;
}

// --- Extract tokens from selection ---

export interface ExtractTokensFromSelectionMessage {
  type: 'extract-tokens-from-selection';
}

export interface ExtractedTokenEntry {
  property: BindableProperty | 'border';
  tokenType: string;
  suggestedName: string;
  value: ResolvedTokenValue;
  layerName: string;
  layerId: string;
  /** Number of layers sharing this exact value (for deduplication) */
  layerCount?: number;
  /** All layer IDs that share this exact value (populated during deduplication) */
  layerIds?: string[];
}

export interface ExtractedTokensMessage {
  type: 'extracted-tokens';
  tokens: ExtractedTokenEntry[];
}

// --- Apply to peer layers ---

export interface FindPeersForPropertyMessage {
  type: 'find-peers-for-property';
  nodeId: string;
  property: string;
}

export interface ApplyToNodesMessage {
  type: 'apply-to-nodes';
  nodeIds: string[];
  tokenPath: string;
  collectionId?: string;
  tokenType: string;
  targetProperty: string;
  resolvedValue: ResolvedTokenValue;
}

export interface GetAvailableFontsMessage {
  type: 'get-available-fonts';
}

export interface CancelScanMessage {
  type: 'cancel-scan';
  requestId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Managed icon publishing
// ─────────────────────────────────────────────────────────────────────────────

export interface IconPublishItem {
  id: string;
  path: string;
  componentName: string;
  svgContent: string;
  svgHash: string;
  colorBehavior: IconColorBehavior;
  targetSize: number;
  componentId?: string | null;
}

export interface PublishIconsMessage {
  type: 'publish-icons';
  pageName: string;
  icons: IconPublishItem[];
  correlationId?: string;
}

export interface IconPublishResult {
  id: string;
  componentId?: string;
  componentKey?: string | null;
  lastSyncedHash?: string;
  action?: 'created' | 'updated' | 'skipped';
  warning?: string;
  error?: string;
}

export interface IconPublishProgressMessage {
  type: 'icons-publish-progress';
  current: number;
  total: number;
  correlationId?: string;
}

export interface IconsPublishedMessage {
  type: 'icons-published';
  results: IconPublishResult[];
  correlationId?: string;
}

export interface IconSelectionImportItem {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  fileKey?: string | null;
  pageId: string;
  pageName: string;
  svg: string;
  viewBox: string;
  viewBoxMinX: number;
  viewBoxMinY: number;
  viewBoxWidth: number;
  viewBoxHeight: number;
  suggestedPath: string;
  suggestedName: string;
  width: number;
  height: number;
  warnings: string[];
  componentId?: string | null;
  componentKey?: string | null;
}

export interface ReadIconSelectionMessage {
  type: 'read-icon-selection';
  correlationId?: string;
}

export interface IconSelectionReadMessage {
  type: 'icon-selection-read';
  icons: IconSelectionImportItem[];
  error?: string;
  correlationId?: string;
}

export interface IconCanvasItem {
  id: string;
  path: string;
  componentName: string;
  componentId?: string | null;
  componentKey?: string | null;
}

export interface InsertIconMessage {
  type: 'insert-icon';
  icon: IconCanvasItem;
  correlationId?: string;
}

export interface ReplaceSelectionWithIconMessage {
  type: 'replace-selection-with-icon';
  icon: IconCanvasItem;
  correlationId?: string;
}

export interface SetIconSwapPropertyMessage {
  type: 'set-icon-swap-property';
  icon: IconCanvasItem;
  propertyName: string;
  targetNodeIds: string[];
  correlationId?: string;
}

export interface IconCanvasActionResultMessage {
  type: 'icon-canvas-action-result';
  action: 'insert' | 'replace' | 'set-slot';
  iconId: string;
  count: number;
  skipped: number;
  skippedReason?: string;
  error?: string;
  correlationId?: string;
}

export type IconUsageAuditScope = 'selection' | 'page';

export interface IconUsageAuditInput {
  id: string;
  name: string;
  path: string;
  componentName: string;
  status: 'draft' | 'published' | 'deprecated';
  svgHash: string;
  componentId?: string | null;
  componentKey?: string | null;
  lastSyncedHash?: string | null;
}

export interface ScanIconUsageMessage {
  type: 'scan-icon-usage';
  scope: IconUsageAuditScope;
  icons: IconUsageAuditInput[];
  correlationId?: string;
}

export type IconUsageAuditAction =
  | 'publish'
  | 'sync'
  | 'replace'
  | 'repair'
  | 'deprecate'
  | 'review';

export type IconUsageAuditSeverity = 'info' | 'warning' | 'error';

export type IconUsageAuditFindingType =
  | 'missing-component'
  | 'duplicate-component'
  | 'stale-component'
  | 'renamed-component'
  | 'deprecated-usage'
  | 'unmanaged-icon-component'
  | 'raw-icon-layer'
  | 'unknown-managed-component';

export interface IconUsageAuditFinding {
  id: string;
  type: IconUsageAuditFindingType;
  action: IconUsageAuditAction;
  severity: IconUsageAuditSeverity;
  message: string;
  iconId?: string;
  iconName?: string;
  iconPath?: string;
  nodeId?: string;
  nodeName?: string;
  nodeType?: string;
  pageName?: string;
}

export interface IconUsageAuditSummary {
  managedInstances: number;
  unmanagedComponents: number;
  rawIconLayers: number;
  deprecatedUsages: number;
  staleComponents: number;
  missingComponents: number;
}

export interface IconUsageAuditResultMessage {
  type: 'icon-usage-audit-result';
  scope: IconUsageAuditScope;
  findings: IconUsageAuditFinding[];
  summary: IconUsageAuditSummary;
  scannedNodes: number;
  error?: string;
  correlationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Revert snapshot shapes — shared between plugin sandbox and UI
// ─────────────────────────────────────────────────────────────────────────────

/** Per-variable state captured before an applyVariables() call, used for revert. */
export interface VarSnapshotRecord {
  valuesByMode: Record<string, unknown>;
  name: string;
  description: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  pluginData: {
    tokenPath: string;
    tokenCollection: string;
    styleBacking?: string;
  };
}

/** Full variable snapshot sent from plugin → UI after a successful apply. */
export interface VarSnapshot {
  records: Record<string, VarSnapshotRecord>;
  createdIds: string[];
}

/** Per-style state captured before an applyStyles() call, used for revert. */
export interface StyleSnapshotEntry {
  id: string;
  type: 'paint' | 'text' | 'effect';
  /** Serialisable style data: Paint[], text style fields, or Effect[]. */
  data: unknown;
}

/** Full style snapshot sent from plugin → UI after a successful apply. */
export interface StyleSnapshot {
  snapshots: StyleSnapshotEntry[];
  createdIds: string[];
  backingVariables?: {
    records: Record<string, VarSnapshotRecord>;
    createdIds: string[];
    createdCollectionIds: string[];
  };
}

export interface RevertVariablesMessage {
  type: 'revert-variables';
  varSnapshot: VarSnapshot;
  correlationId?: string;
}

export interface RevertStylesMessage {
  type: 'revert-styles';
  styleSnapshot: StyleSnapshot;
  correlationId?: string;
}

export interface VariablesRevertedMessage {
  type: 'variables-reverted';
  failures: string[];
  correlationId?: string;
}

export interface StylesRevertedMessage {
  type: 'styles-reverted';
  failures: string[];
  correlationId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Controller → UI (plugin sandbox → iframe) message types
// ─────────────────────────────────────────────────────────────────────────────

export interface ControllerErrorMessage {
  type: 'error';
  message: string;
  /** Handler name that produced the error, used for debugging */
  handler?: string;
}

export interface FontsLoadedMessage {
  type: 'fonts-loaded';
  families: string[];
  weightsByFamily: Record<string, number[]>;
}

export interface EyedropperResultMessage {
  type: 'eyedropper-result';
  hex: string;
}

export interface VariableSyncProgressMessage {
  type: 'variable-sync-progress';
  current: number;
  total: number;
  correlationId?: string;
}

export interface VariablesAppliedMessage {
  type: 'variables-applied';
  count: number;
  total?: number;
  created?: number;
  overwritten?: number;
  failures?: { path: string; error: string }[];
  /** Tokens that had no Figma variable equivalent or whose value could not be converted. */
  skipped?: Array<{ path: string; $type: string }>;
  /** Pre-sync snapshot for revert support. */
  varSnapshot?: VarSnapshot;
  correlationId?: string;
}

export interface ApplyVariablesErrorMessage {
  type: 'apply-variables-error';
  error: string;
  correlationId?: string;
  rolledBack?: boolean;
  rollbackError?: string;
}

export interface VariablesReadMessage {
  type: 'variables-read';
  collections: ReadVariableCollection[];
  correlationId?: string;
}

/** Sent when reading Figma variables fails. Uses `error` field (not `message`). */
export interface VariablesReadErrorMessage {
  type: 'variables-read-error';
  error: string;
  correlationId?: string;
}

export interface StylesAppliedMessage {
  type: 'styles-applied';
  count: number;
  total: number;
  failures: { path: string; error: string }[];
  skipped?: Array<{ path: string; $type: string }>;
  /** Pre-sync snapshot for revert support. */
  styleSnapshot?: StyleSnapshot;
  correlationId?: string;
}

export interface StylesApplyErrorMessage {
  type: 'styles-apply-error';
  error: string;
  correlationId?: string;
}

export interface StylesReadMessage {
  type: 'styles-read';
  tokens: ReadStyleToken[];
  correlationId?: string;
}

export interface StylesReadErrorMessage {
  type: 'styles-read-error';
  error: string;
  correlationId?: string;
}

export interface SyncProgressResponseMessage {
  type: 'sync-progress';
  processed: number;
  total: number;
}

export interface SyncCompleteResponseMessage {
  type: 'sync-complete';
  updated: number;
  skipped: number;
  errors: number;
  missingTokens: string[];
  error?: string;
  rolledBack?: boolean;
  rollbackError?: string;
}

export interface RemapCompleteResponseMessage {
  type: 'remap-complete';
  updatedBindings: number;
  updatedNodes: number;
  scannedNodes: number;
  nodesWithBindings: number;
  error?: string;
}

export interface AppliedToNodesMessage {
  type: 'applied-to-nodes';
  count: number;
  errors: string[];
}

export interface ApplyProgressMessage {
  type: 'apply-progress';
  processed: number;
  total: number;
}

export interface RemapProgressMessage {
  type: 'remap-progress';
  processed: number;
  total: number;
}

export interface RemovedBindingFromNodeMessage {
  type: 'removed-binding-from-node';
  success: boolean;
  nodeId?: string;
  property?: string;
  error?: string;
}

export interface SelectNextSiblingResultMessage {
  type: 'select-next-sibling-result';
  found: boolean;
}

export interface ExtractedTokensResponseMessage {
  type: 'extracted-tokens';
  tokens: ExtractedTokenEntry[];
}

export interface SelectionResponseMessage {
  type: 'selection';
  nodes: SelectionNodeInfo[];
}

export interface LayerSearchResultMessage {
  type: 'search-layers-result';
  results: LayerSearchResult[];
  totalSearched?: number;
  correlationId?: string;
}

export interface TokenVariableBindingsMessage {
  type: 'token-variable-bindings-result';
  tokenPath: string;
  variables: { name: string; collection: string; resolvedType: string }[];
  error?: string;
}

export interface AvailableFontsMessage {
  type: 'available-fonts';
  families: string[];
  correlationId?: string;
}

export interface FindPeersResultMessage {
  type: 'peers-for-property-result';
  nodeIds: string[];
  property: string;
  correlationId?: string;
}

export interface AppliedToSelectionMessage {
  type: 'applied-to-selection';
  count: number;
  errors: string[];
  targetProperty: string;
}

export interface OrphansDeletedMessage {
  type: 'orphans-deleted';
  count: number;
  /** Deletion failures: one entry per variable that could not be removed. */
  failures?: string[];
  correlationId?: string;
}

export interface StyleSyncProgressMessage {
  type: 'style-sync-progress';
  current: number;
  total: number;
  correlationId?: string;
}

export interface TokenUsageMapMessage {
  type: 'token-usage-map';
  usageMap: Record<string, number>;
}

export interface TokenUsageMapCancelledMessage {
  type: 'token-usage-map-cancelled';
}

export interface TokenUsageResultMessage {
  type: 'token-usage-result';
  tokenPath: string;
  layers: { id: string; name: string; type: string; componentName: string | null; properties: string[] }[];
  total: number;
  componentNames: string[];
  error?: string;
}

/** Discriminated union of all Controller→UI (plugin sandbox → iframe) messages */
export type ControllerMessage =
  | ControllerErrorMessage
  | FontsLoadedMessage
  | EyedropperResultMessage
  | VariableSyncProgressMessage
  | VariablesAppliedMessage
  | ApplyVariablesErrorMessage
  | VariablesReadMessage
  | VariablesReadErrorMessage
  | StyleSyncProgressMessage
  | StylesAppliedMessage
  | StylesApplyErrorMessage
  | StylesReadMessage
  | StylesReadErrorMessage
  | OrphansDeletedMessage
  | SyncProgressResponseMessage
  | SyncCompleteResponseMessage
  | RemapCompleteResponseMessage
  | AppliedToSelectionMessage
  | AppliedToNodesMessage
  | ApplyProgressMessage
  | RemapProgressMessage
  | RemovedBindingFromNodeMessage
  | SelectNextSiblingResultMessage
  | ExtractedTokensResponseMessage
  | SelectionResponseMessage
  | LayerSearchResultMessage
  | TokenVariableBindingsMessage
  | AvailableFontsMessage
  | FindPeersResultMessage
  | TokenUsageMapMessage
  | TokenUsageMapCancelledMessage
  | TokenUsageResultMessage
  | VariablesRevertedMessage
  | StylesRevertedMessage
  | IconPublishProgressMessage
  | IconsPublishedMessage
  | IconSelectionReadMessage
  | IconCanvasActionResultMessage
  | IconUsageAuditResultMessage;

/** Runtime set of all known Controller→UI message type strings.
 *  Keep in sync with the `ControllerMessage` union above. */
export const KNOWN_CONTROLLER_MESSAGE_TYPES = new Set<ControllerMessage['type']>([
  'error',
  'fonts-loaded',
  'eyedropper-result',
  'variable-sync-progress',
  'variables-applied',
  'apply-variables-error',
  'variables-read',
  'variables-read-error',
  'style-sync-progress',
  'styles-applied',
  'styles-apply-error',
  'styles-read',
  'styles-read-error',
  'orphans-deleted',
  'sync-progress',
  'sync-complete',
  'remap-complete',
  'applied-to-selection',
  'applied-to-nodes',
  'apply-progress',
  'remap-progress',
  'removed-binding-from-node',
  'select-next-sibling-result',
  'extracted-tokens',
  'selection',
  'search-layers-result',
  'token-variable-bindings-result',
  'available-fonts',
  'peers-for-property-result',
  'token-usage-map',
  'token-usage-map-cancelled',
  'token-usage-result',
  'variables-reverted',
  'styles-reverted',
  'icons-publish-progress',
  'icons-published',
  'icon-selection-read',
  'icon-canvas-action-result',
  'icon-usage-audit-result',
]);

/** Discriminated union of all UI→Controller messages */
export type PluginMessage =
  | ApplyVariablesMessage
  | ApplyStylesMessage
  | ReadVariablesMessage
  | ReadStylesMessage
  | ApplyToSelectionMessage
  | GetSelectionMessage
  | SetDeepInspectMessage
  | RemoveBindingMessage
  | ClearAllBindingsMessage
  | SyncBindingsMessage
  | RemapBindingsMessage
  | HighlightLayerByTokenMessage
  | NotifyMessage
  | ResizeMessage
  | DeleteOrphanVariablesMessage
  | SelectNodeMessage
  | ScanTokenUsageMessage
  | BatchBindHeatmapNodesMessage
  | EyedropperMessage
  | ScanSingleTokenUsageMessage
  | ScanTokenVariableBindingsMessage
  | ExtractTokensFromSelectionMessage
  | SelectNextSiblingMessage
  | GetAvailableFontsMessage
  | FindPeersForPropertyMessage
  | ApplyToNodesMessage
  | RemoveBindingFromNodeMessage
  | SearchLayersMessage
  | CancelScanMessage
  | PublishIconsMessage
  | ReadIconSelectionMessage
  | InsertIconMessage
  | ReplaceSelectionWithIconMessage
  | SetIconSwapPropertyMessage
  | ScanIconUsageMessage
  | RevertVariablesMessage
  | RevertStylesMessage;
