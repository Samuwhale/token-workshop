// Shared types used by both controller (plugin sandbox) and UI
import type { TokenValue, TokenReference } from '@tokenmanager/core';

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

// Legacy key mapping for backward compat
export const LEGACY_KEY_MAP: Record<string, BindableProperty> = {
  color: 'fill',
  typography: 'typography',
  dimension: 'width',
  shadow: 'shadow',
  border: 'stroke',
};

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

export interface SelectionNodeInfo {
  id: string;
  name: string;
  type: string;
  bindings: Record<string, string>; // property -> tokenPath
  capabilities: NodeCapabilities;
  currentValues: Record<string, any>;
  depth?: number;   // 0 = directly selected, 1+ = nested descendant
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
  resolvedValue: any;
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
  /** Figma variable scopes from $extensions['com.figma.scopes']. Empty/undefined = unrestricted. */
  $scopes?: string[];
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
  error?: string;
}

// --- Additional UI→Controller message types ---

export interface ApplyVariablesMessage {
  type: 'apply-variables';
  tokens: any[];
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  correlationId?: string;
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

export interface ExportAllVariablesMessage {
  type: 'export-all-variables';
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

export interface DeleteOrphanVariablesMessage {
  type: 'delete-orphan-variables';
  knownPaths: string[];
  collectionMap?: Record<string, string>;
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

export type HeatmapScope = 'page' | 'selection' | 'all-pages';

export interface ScanCanvasHeatmapMessage {
  type: 'scan-canvas-heatmap';
  scope?: HeatmapScope;
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
  resolvedValue: any;
}

export interface EyedropperMessage {
  type: 'eyedropper';
}

export interface GetActiveThemesMessage {
  type: 'get-active-themes';
}

export interface SetActiveThemesMessage {
  type: 'set-active-themes';
  themes: Record<string, string>;
}

export interface ScanSingleTokenUsageMessage {
  type: 'scan-single-token-usage';
  tokenPath: string;
}

// --- Search layers ---

export interface SearchLayersMessage {
  type: 'search-layers';
  query: string;
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
  value: any;
  layerName: string;
  layerId: string;
  /** Number of layers sharing this exact value (for deduplication) */
  layerCount?: number;
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
  resolvedValue: any;
}

// --- Consistency scanner ---

export type ConsistencyScope = 'selection' | 'page' | 'all-pages';

export interface ScanConsistencyMessage {
  type: 'scan-consistency';
  /** Flat resolved token map (path → {$value, $type}) */
  tokenMap: Record<string, { $value: any; $type: string }>;
  scope: ConsistencyScope;
}

export interface GetAvailableFontsMessage {
  type: 'get-available-fonts';
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
}

export interface ActiveThemesLoadedMessage {
  type: 'active-themes-loaded';
  themes: Record<string, string>;
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
  collections: any[];
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
  correlationId?: string;
}

export interface StylesApplyErrorMessage {
  type: 'styles-apply-error';
  error: string;
  correlationId?: string;
}

export interface StylesReadMessage {
  type: 'styles-read';
  tokens: any[];
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
  error?: string;
}

export interface AppliedToNodesMessage {
  type: 'applied-to-nodes';
  count: number;
  errors: string[];
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
  nodes: { id: string; name: string; type: string; status: string; boundCount: number; totalCheckable: number }[];
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
  correlationId?: string;
}

export interface TokenVariableBindingsMessage {
  type: 'token-variable-bindings';
  tokenPath: string;
  bindings: { nodeId: string; nodeName: string; property: string }[];
  correlationId?: string;
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
  correlationId?: string;
}

export interface AllVariablesExportedMessage {
  type: 'all-variables-exported';
  collections: any[];
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
}

export interface ConsistencyScanProgressMessage {
  type: 'consistency-scan-progress';
  processed: number;
  total: number;
}

export interface ConsistencyScanResultMessage {
  type: 'consistency-scan-result';
  suggestions: any[];
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
  | ActiveThemesLoadedMessage
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
  | AllVariablesExportedMessage
  | SyncProgressResponseMessage
  | SyncCompleteResponseMessage
  | RemapCompleteResponseMessage
  | AppliedToSelectionMessage
  | AppliedToNodesMessage
  | RemovedBindingFromNodeMessage
  | SelectNextSiblingResultMessage
  | CanvasHeatmapProgressMessage
  | CanvasHeatmapResultMessage
  | ComponentCoverageResultMessage
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
  | ConsistencyScanErrorMessage;

/** Discriminated union of all UI→Controller messages */
export type PluginMessage =
  | ApplyVariablesMessage
  | ApplyStylesMessage
  | ReadVariablesMessage
  | ReadStylesMessage
  | ExportAllVariablesMessage
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
  | GetActiveThemesMessage
  | SetActiveThemesMessage
  | ScanSingleTokenUsageMessage
  | ScanTokenVariableBindingsMessage
  | ExtractTokensFromSelectionMessage
  | SelectNextSiblingMessage
  | ScanConsistencyMessage
  | GetAvailableFontsMessage
  | FindPeersForPropertyMessage
  | ApplyToNodesMessage
  | RemoveBindingFromNodeMessage
  | SearchLayersMessage;
