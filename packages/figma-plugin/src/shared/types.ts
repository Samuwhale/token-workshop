// Shared types used by both controller (plugin sandbox) and UI
import type { TokenValue, TokenReference } from '@tokenmanager/core';
import type { TokenExtensions } from '@tokenmanager/core';

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

/** Maps each known token type to its CSS badge class defined in styles.css.
 *  Add new types here AND in styles.css to keep badge styling in sync. */
export const TOKEN_TYPE_BADGE_CLASS: Record<string, string> = {
  color: 'token-type-color',
  dimension: 'token-type-dimension',
  typography: 'token-type-typography',
  shadow: 'token-type-shadow',
  border: 'token-type-border',
  number: 'token-type-number',
  string: 'token-type-string',
  boolean: 'token-type-boolean',
  gradient: 'token-type-gradient',
  duration: 'token-type-duration',
  fontFamily: 'token-type-fontFamily',
  composition: 'token-type-composition',
  asset: 'token-type-asset',
  cubicBezier: 'token-type-cubicBezier',
  transition: 'token-type-transition',
  fontStyle: 'token-type-fontStyle',
  lineHeight: 'token-type-lineHeight',
  letterSpacing: 'token-type-letterSpacing',
  percentage: 'token-type-percentage',
  link: 'token-type-link',
  textDecoration: 'token-type-textDecoration',
  textTransform: 'token-type-textTransform',
  custom: 'token-type-custom',
  fontWeight: 'token-type-fontWeight',
  strokeStyle: 'token-type-strokeStyle',
};

export const TOKEN_PROPERTY_MAP: Record<string, BindableProperty[]> = {
  color: ['fill', 'stroke'],
  dimension: ['width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'itemSpacing', 'cornerRadius', 'strokeWeight'],
  typography: ['typography'],
  shadow: ['shadow'],
  border: ['stroke'],
  number: ['opacity', 'cornerRadius', 'strokeWeight'],
  boolean: ['visible'],
};

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
  visible?: boolean;
}

export interface SelectionNodeInfo {
  id: string;
  name: string;
  type: string;
  /** Maps BindableProperty name → token path for each active binding. */
  bindings: Record<string, string>;
  capabilities: NodeCapabilities;
  currentValues: NodeCurrentValues;
  /** 0 = directly selected, 1+ = nested descendant (deep inspect mode). */
  depth?: number;
  /** ID of the parent node; only set for depth > 0. */
  parentId?: string;
}

export interface SetDeepInspectMessage {
  type: 'set-deep-inspect';
  enabled: boolean;
}

export interface ApplyToSelectionMessage {
  type: 'apply-to-selection';
  tokenPath: string;
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
  /** DTCG leaf key (segment name) — may contain dots, e.g. "1.5". */
  $name?: string;
  $extensions?: TokenExtensions;
  /** Figma variable scopes from $extensions['com.figma.scopes']. Empty/undefined = unrestricted. */
  $scopes?: string[];
  /** Lifecycle stage from $extensions.tokenmanager.lifecycle. Undefined means 'published'. */
  $lifecycle?: 'draft' | 'published' | 'deprecated';
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
  figmaCollection?: string;
  figmaMode?: string;
  $extensions?: {
    'com.figma.scopes'?: string[];
    [key: string]: unknown;
  };
  /** Legacy scopes field */
  $scopes?: string[];
}

// ─── Variable read-back types ─────────────────────────────────────────────────

/** A single token read back from a Figma variable in read-variables operations. */
export interface ReadVariableToken {
  path: string;
  $type: string;
  $value: string | number | boolean | null;
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
}

export interface ReadGradientStyleToken {
  path: string;
  $type: 'gradient';
  $value: {
    type: string;
    stops: Array<{ color: string; position: number }>;
  };
  _warning?: string;
}

export interface ReadTypographyStyleToken {
  path: string;
  $type: 'typography';
  $value: {
    fontFamily: string;
    fontSize: { value: number; unit: 'px' };
    fontWeight: number;
    lineHeight: { value: number; unit: 'px' } | number | 'auto';
    letterSpacing: { value: number; unit: 'px' };
    fontStyle: 'italic' | 'normal';
  };
}

export interface ReadShadowStyleToken {
  path: string;
  $type: 'shadow';
  $value: Array<{
    color: string;
    offsetX: { value: number; unit: 'px' };
    offsetY: { value: number; unit: 'px' };
    blur: { value: number; unit: 'px' };
    spread: { value: number; unit: 'px' };
    type: 'innerShadow' | 'dropShadow';
  }>;
}

export type ReadStyleToken =
  | ReadColorStyleToken
  | ReadGradientStyleToken
  | ReadTypographyStyleToken
  | ReadShadowStyleToken;

// ─── Consistency scanner types ────────────────────────────────────────────────

/** A single node that nearly matches a token value but is not bound to it. */
export interface ConsistencyMatch {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  property: string;
  actualValue: string | number;
  tokenValue: string | number;
}

/** A token that has near-matches across canvas nodes (consistency scanner result). */
export interface ConsistencySuggestion {
  tokenPath: string;
  tokenType: string;
  tokenValue: ResolvedTokenValue;
  property: string;
  matches: ConsistencyMatch[];
}

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

export interface ScanComponentCoverageMessage {
  type: 'scan-component-coverage';
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

export interface ScanCanvasHeatmapMessage {
  type: 'scan-canvas-heatmap';
  scope?: ScanScope;
  requestId?: string;
}

export interface SelectHeatmapNodesMessage {
  type: 'select-heatmap-nodes';
  nodeIds: string[];
}

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

export interface GetSelectedModesMessage {
  type: 'get-selected-modes';
}

export interface SetSelectedModesMessage {
  type: 'set-selected-modes';
  selectedModes: Record<string, string>;
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
  tokenType: string;
  targetProperty: string;
  resolvedValue: ResolvedTokenValue;
}

// --- Consistency scanner ---

export type ConsistencyScope = 'selection' | 'page' | 'all-pages';

export interface ScanConsistencyMessage {
  type: 'scan-consistency';
  /** Flat resolved token map (path → {$value, $type}) */
  tokenMap: Record<string, TokenMapEntry>;
  scope: ConsistencyScope;
}

export interface GetAvailableFontsMessage {
  type: 'get-available-fonts';
}

export interface CancelScanMessage {
  type: 'cancel-scan';
  requestId?: string;
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
  pluginData: { tokenPath: string; tokenCollection: string };
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

export interface SelectedModesLoadedMessage {
  type: 'selected-modes-loaded';
  selectedModes: Record<string, string>;
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

export interface CanvasHeatmapProgressMessage {
  type: 'canvas-heatmap-progress';
  processed: number;
  total: number;
}

export interface CanvasHeatmapResultMessage {
  type: 'canvas-heatmap-result';
  total: number;
  green: number;
  yellow: number;
  red: number;
  nodes: {
    id: string;
    name: string;
    type: string;
    pageName?: string;
    status: string;
    boundCount: number;
    totalCheckable: number;
    missingProperties?: BindableProperty[];
    missingValueEntries?: { property: BindableProperty; value: ResolvedTokenValue }[];
  }[];
}

export interface ComponentCoverageResultMessage {
  type: 'component-coverage-result';
  correlationId?: string;
  totalComponents: number;
  tokenizedComponents: number;
  untokenized: { id: string; name: string; hardcodedCount: number }[];
  totalUntokenized: number;
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

export interface TokenUsageResultMessage {
  type: 'token-usage-result';
  tokenPath: string;
  layers: { id: string; name: string; type: string; componentName: string | null; properties: string[] }[];
  total: number;
  componentNames: string[];
  error?: string;
}

export interface CanvasHeatmapErrorMessage {
  type: 'canvas-heatmap-error';
  error: string;
}

export interface ComponentCoverageErrorMessage {
  type: 'component-coverage-error';
  error: string;
  correlationId?: string;
}

export interface ConsistencyScanProgressMessage {
  type: 'consistency-scan-progress';
  processed: number;
  total: number;
}

export interface ConsistencyScanResultMessage {
  type: 'consistency-scan-result';
  suggestions: ConsistencySuggestion[];
  totalNodes: number;
}

export interface ConsistencyScanErrorMessage {
  type: 'consistency-scan-error';
  error: string;
}

/** Discriminated union of all Controller→UI (plugin sandbox → iframe) messages */
export type ControllerMessage =
  | ControllerErrorMessage
  | FontsLoadedMessage
  | SelectedModesLoadedMessage
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
  | CanvasHeatmapProgressMessage
  | CanvasHeatmapResultMessage
  | CanvasHeatmapErrorMessage
  | ComponentCoverageResultMessage
  | ComponentCoverageErrorMessage
  | ExtractedTokensResponseMessage
  | SelectionResponseMessage
  | LayerSearchResultMessage
  | TokenVariableBindingsMessage
  | AvailableFontsMessage
  | FindPeersResultMessage
  | TokenUsageMapMessage
  | TokenUsageResultMessage
  | ConsistencyScanProgressMessage
  | ConsistencyScanResultMessage
  | ConsistencyScanErrorMessage
  | VariablesRevertedMessage
  | StylesRevertedMessage;

/** Runtime set of all known Controller→UI message type strings.
 *  Keep in sync with the `ControllerMessage` union above. */
export const KNOWN_CONTROLLER_MESSAGE_TYPES = new Set<ControllerMessage['type']>([
  'error',
  'fonts-loaded',
  'selected-modes-loaded',
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
  'canvas-heatmap-progress',
  'canvas-heatmap-result',
  'canvas-heatmap-error',
  'component-coverage-result',
  'component-coverage-error',
  'extracted-tokens',
  'selection',
  'search-layers-result',
  'token-variable-bindings-result',
  'available-fonts',
  'peers-for-property-result',
  'token-usage-map',
  'token-usage-result',
  'consistency-scan-progress',
  'consistency-scan-result',
  'consistency-scan-error',
  'variables-reverted',
  'styles-reverted',
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
  | ScanComponentCoverageMessage
  | SelectNodeMessage
  | ScanTokenUsageMessage
  | ScanCanvasHeatmapMessage
  | SelectHeatmapNodesMessage
  | BatchBindHeatmapNodesMessage
  | EyedropperMessage
  | GetSelectedModesMessage
  | SetSelectedModesMessage
  | ScanSingleTokenUsageMessage
  | ScanTokenVariableBindingsMessage
  | ExtractTokensFromSelectionMessage
  | SelectNextSiblingMessage
  | ScanConsistencyMessage
  | GetAvailableFontsMessage
  | FindPeersForPropertyMessage
  | ApplyToNodesMessage
  | RemoveBindingFromNodeMessage
  | SearchLayersMessage
  | CancelScanMessage
  | RevertVariablesMessage
  | RevertStylesMessage;
