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
}

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
  tokens: any[];
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
}

export interface ScanComponentCoverageMessage {
  type: 'scan-component-coverage';
}

export interface SelectNodeMessage {
  type: 'select-node';
  nodeId: string;
}

export interface ScanCanvasHeatmapMessage {
  type: 'scan-canvas-heatmap';
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
  | ScanCanvasHeatmapMessage
  | SelectHeatmapNodesMessage
  | BatchBindHeatmapNodesMessage
  | EyedropperMessage
  | GetActiveThemesMessage
  | SetActiveThemesMessage;
