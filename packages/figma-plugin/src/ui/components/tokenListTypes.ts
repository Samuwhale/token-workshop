import type React from 'react';
import type { TokenNode } from '../hooks/useTokens';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';
import type { ThemeDimension } from '@tokenmanager/core';

/** Per-option resolved value for a single token in multi-mode view */
export interface MultiModeValue {
  optionName: string;
  dimId: string;
  resolved: TokenMapEntry | undefined;
  /** The set name to target when inline-editing this option's value */
  targetSet: string | null;
}

// ---------------------------------------------------------------------------
// Density preference
// ---------------------------------------------------------------------------
export type Density = 'compact' | 'default' | 'comfortable';

/** Row height (px) per density level */
export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 22,
  default: 28,
  comfortable: 36,
};

/** Swatch / preview size (px) per density level */
export const DENSITY_SWATCH_SIZE: Record<Density, number> = {
  compact: 16,
  default: 24,
  comfortable: 32,
};

/** Tailwind py class per density level */
export const DENSITY_PY_CLASS: Record<Density, string> = {
  compact: 'py-px',
  default: 'py-1',
  comfortable: 'py-2',
};

// ---------------------------------------------------------------------------
// Depth indicator & condensed view
// ---------------------------------------------------------------------------

/** Single source of truth for indentation per nesting level (px) */
export const INDENT_PER_LEVEL = 16;

/** Maximum depth shown as distinct indent levels when condensed view is on */
export const CONDENSED_MAX_DEPTH = 3;

/**
 * Colors for the per-depth guide bar. Cycles for depth >= length.
 * depth 0 → transparent (category headers get no bar).
 */
export const DEPTH_COLORS: readonly string[] = [
  'transparent',
  'rgba(24,160,251,0.55)',   // depth 1 — accent blue
  'rgba(90,210,140,0.55)',   // depth 2 — green
  'rgba(255,180,50,0.55)',   // depth 3 — amber
  'rgba(230,100,80,0.55)',   // depth 4 — coral
  'rgba(170,100,240,0.55)',  // depth 5 — purple
];

// ---------------------------------------------------------------------------
// Virtual scroll constants
// ---------------------------------------------------------------------------
export const VIRTUAL_ITEM_HEIGHT = 28; // px per row base height (default density — overridden at runtime)
export const VIRTUAL_CHAIN_EXPAND_HEIGHT = 24; // extra px when the alias chain panel is expanded
export const VIRTUAL_OVERSCAN = 8; // extra rows rendered above and below the viewport

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type SortOrder = 'default' | 'alpha-asc' | 'alpha-desc' | 'by-type' | 'by-value' | 'by-usage';

export interface TokenListCtx {
  setName: string;
  sets: string[];
  serverUrl: string;
  connected: boolean;
  selectedNodes: SelectionNodeInfo[];
}

export interface TokenListData {
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  generators?: TokenGenerator[];
  derivedTokenPaths?: Map<string, TokenGenerator>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  tokenUsageCounts?: Record<string, number>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  /** Theme dimensions for multi-mode column view */
  dimensions?: ThemeDimension[];
  /** Unthemed (raw) allTokensFlat — needed for per-option resolution */
  unthemedAllTokensFlat?: Record<string, TokenMapEntry>;
  /** Maps token paths to their source set name */
  pathToSet?: Record<string, string>;
  /** Currently active theme selections (dimId → optionName) */
  activeThemes?: Record<string, string>;
}

export interface TokenListActions {
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onCreateNew?: (initialPath?: string, initialType?: string, initialValue?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onNavigateBack?: () => void;
  navHistoryLength?: number;
  onClearHighlight?: () => void;
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  onRefreshGenerators?: () => void;
  onToggleIssuesOnly?: () => void;
  onFilteredCountChange?: (count: number | null) => void;
  onNavigateToSet?: (setName: string, tokenPath: string) => void;
  onTokenTouched?: (path: string) => void;
  onError?: (msg: string) => void;
  onViewTokenHistory?: (path: string) => void;
  onNavigateToGenerator?: (generatorId: string) => void;
  /** Navigate to Token Flow panel with this token pre-selected */
  onShowReferences?: (path: string) => void;
  /** Called whenever the filtered/visible leaf node list changes — used by parent to track navigation targets */
  onDisplayedLeafNodesChange?: (nodes: TokenNode[]) => void;
  /** Called whenever the multi-select set changes — exposes selection to parent (e.g. command palette bulk-delete) */
  onSelectionChange?: (paths: string[]) => void;
  /** Open the unified compare view with the given token paths pre-loaded (navigates away from Tokens tab) */
  onOpenCompare?: (paths: Set<string>) => void;
  /** Open the unified compare view in cross-theme mode for a specific token path */
  onOpenCrossThemeCompare?: (path: string) => void;
  /** Open the command palette in token-search mode pre-populated with the given query ("> query") */
  onOpenCommandPaletteWithQuery?: (query: string) => void;
  /** Open the cross-set "where is this token defined" overlay for the given path */
  onFindInAllSets?: (path: string) => void;
  /** Called when a cross-set token drag starts — lets the parent expose drop zones on set tabs */
  onTokenDragStart?: (paths: string[], fromSet: string) => void;
  /** Called when a token drag ends (drop or cancel) — lets the parent hide drop zones */
  onTokenDragEnd?: () => void;
}

/** Imperative handle allowing a parent to trigger compare-panel actions from outside TokenList */
export interface TokenListImperativeHandle {
  /** Enter multi-select mode (no navigation — user selects tokens then clicks Compare) */
  openCompareMode: () => void;
  /** Trigger inline rename mode for the given token path */
  triggerInlineRename: (path: string) => void;
  /** Open the move-to-set dialog for the given token path */
  triggerMoveToken: (path: string) => void;
  /** Open the extract-to-alias dialog for the given token */
  triggerExtractToAlias: (path: string, $type?: string, $value?: unknown) => void;
}

export interface TokenListProps {
  ctx: TokenListCtx;
  data: TokenListData;
  actions: TokenListActions;
  defaultCreateOpen?: boolean;
  highlightedToken?: string | null;
  showIssuesOnly?: boolean;
  /** Path of the token currently open in the editor — enables Cmd+]/[ navigation shortcuts */
  editingTokenPath?: string | null;
  /** Optional ref populated by TokenList so the parent can imperatively trigger compare actions */
  compareHandle?: React.MutableRefObject<TokenListImperativeHandle | null>;
}

export interface AffectedRef {
  path: string;
  setName: string;
}

export interface GeneratorImpact {
  generatorId: string;
  generatorName: string;
  generatorType: string;
  /** 'source' = sourceToken match; 'config-ref' = $tokenRefs match */
  role: 'source' | 'config-ref';
  /** The config field key that references the token (only when role === 'config-ref') */
  configField?: string;
}

export interface ThemeImpact {
  dimName: string;
  optionName: string;
  setName: string;
}

export type DeleteConfirm =
  | { type: 'token'; path: string; orphanCount: number; affectedRefs: AffectedRef[]; generatorImpacts: GeneratorImpact[]; themeImpacts: ThemeImpact[] }
  | { type: 'group'; path: string; name: string; tokenCount: number; orphanCount: number; affectedRefs: AffectedRef[]; generatorImpacts: GeneratorImpact[]; themeImpacts: ThemeImpact[] }
  | { type: 'bulk'; paths: string[]; orphanCount: number; affectedRefs: AffectedRef[]; generatorImpacts: GeneratorImpact[]; themeImpacts: ThemeImpact[] };

export interface PromoteRow {
  path: string;
  $type: string;
  $value: unknown;
  proposedAlias: string | null;
  deltaE?: number;
  accepted: boolean;
}

/** Types that can be edited inline in the list row (without opening the drawer). */
export const INLINE_SIMPLE_TYPES = new Set(['color', 'dimension', 'number', 'string', 'boolean', 'fontFamily', 'fontWeight', 'duration', 'asset']);

/** Types that open the inline value popover on double-click (not handled by INLINE_SIMPLE_TYPES). */
export const INLINE_POPOVER_TYPES = new Set([
  'shadow', 'border', 'typography', 'gradient',
  'transition', 'cubicBezier', 'composition', 'strokeStyle',
  'fontStyle', 'lineHeight', 'letterSpacing', 'textDecoration', 'textTransform',
  'percentage', 'link', 'custom',
]);

// ---------------------------------------------------------------------------
// Table view sort types
// ---------------------------------------------------------------------------

export type TableSortField = 'name' | 'type' | 'value' | 'resolvedValue' | 'description';
export type TableSortDir = 'asc' | 'desc';
export interface TableSort {
  field: TableSortField;
  dir: TableSortDir;
}

// ---------------------------------------------------------------------------
// TokenTreeContext — shared state & callbacks provided via React context
// ---------------------------------------------------------------------------

export interface TokenTreeContextType {
  // --- Shared data ---
  density: Density;
  setName: string;
  selectionCapabilities: NodeCapabilities | null;
  allTokensFlat: Record<string, TokenMapEntry>;
  selectMode: boolean;
  expandedPaths: Set<string>;
  duplicateCounts: Map<string, number>;
  highlightedToken: string | null;
  inspectMode?: boolean;
  syncSnapshot?: Record<string, string>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  generatorsBySource?: Map<string, TokenGenerator[]>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  tokenUsageCounts?: Record<string, number>;
  /** Parsed highlight terms from search query */
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  /** Selected Figma nodes — used for quick-bind scope narrowing */
  selectedNodes: SelectionNodeInfo[];

  // --- Drag state ---
  dragOverGroup?: string | null;
  dragOverGroupIsInvalid?: boolean;
  dragSource?: { paths: string[]; names: string[] } | null;
  dragOverReorder?: { path: string; position: 'before' | 'after' } | null;
  selectedLeafNodes?: TokenNode[];

  // --- Action callbacks ---
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onDelete: (path: string) => void;
  onDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  onToggleSelect: (path: string, modifiers?: { shift: boolean; ctrl: boolean }) => void;
  onSelectGroupChildren?: (groupNode: TokenNode) => void;
  onToggleExpand: (path: string) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onCreateSibling?: (groupPath: string, tokenType: string) => void;
  onCreateGroup?: (parentGroupPath: string) => void;
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onUpdateGroupMeta?: (groupPath: string, meta: { $type?: string | null; $description?: string | null }) => Promise<void>;
  onRequestMoveGroup?: (groupPath: string) => void;
  onRequestCopyGroup?: (groupPath: string) => void;
  onRequestMoveToken?: (tokenPath: string) => void;
  onRequestCopyToken?: (tokenPath: string) => void;
  onDuplicateGroup?: (groupPath: string) => void;
  onDuplicateToken?: (path: string) => void;
  onExtractToAlias?: (path: string, $type?: string, $value?: any) => void;
  onHoverToken?: (path: string) => void;
  onExtractToAliasForLint?: (path: string, $type?: string, $value?: any) => void;
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  onFilterByType?: (type: string) => void;
  onJumpToGroup?: (path: string) => void;
  onZoomIntoGroup?: (groupPath: string) => void;
  onInlineSave?: (path: string, type: string, newValue: any) => void;
  onRenameToken?: (oldPath: string, newPath: string) => void;
  onDetachFromGenerator?: (path: string) => void;
  onToggleChain?: (path: string) => void;
  onTogglePin?: (path: string) => void;
  /** Enter select mode with this token pre-selected and open ComparePanel */
  onCompareToken?: (path: string) => void;
  /** Navigate to History panel filtered to this token path */
  onViewTokenHistory?: (path: string) => void;
  /** Navigate to Token Flow panel with this token pre-selected */
  onShowReferences?: (path: string) => void;
  /** Open cross-theme comparison panel for this token */
  onCompareAcrossThemes?: (path: string) => void;
  /** Open the cross-set "where is this token defined" overlay for the given path */
  onFindInAllSets?: (path: string) => void;
  onDragStart?: (paths: string[], names: string[]) => void;
  onDragEnd?: () => void;
  onDragOverGroup?: (groupPath: string | null, invalid?: boolean) => void;
  onDropOnGroup?: (groupPath: string) => void;
  onDragOverToken?: (path: string, name: string, position: 'before' | 'after') => void;
  onDragLeaveToken?: () => void;
  onDropOnToken?: (path: string, name: string, position: 'before' | 'after') => void;
  onMultiModeInlineSave?: (path: string, type: string, newValue: any, targetSet: string) => void;
  onNavigateToGenerator?: (generatorId: string) => void;
  /** When true, tree view shows fully resolved values instead of alias references */
  showResolvedValues?: boolean;
  /** When true, indentation is capped at CONDENSED_MAX_DEPTH levels to prevent deep nesting from pushing content off-screen */
  condensedView?: boolean;
  /** Path of a token that should enter inline rename mode as soon as it renders */
  pendingRenameToken: string | null;
  /** Clear the pending rename (called by the node once it activates rename mode) */
  clearPendingRename: () => void;
  /** Tab navigation: token + optional multi-mode column that should enter edit mode */
  pendingTabEdit: { path: string; columnId: string | null } | null;
  /** Clear the pending tab-edit (called by the node once it activates edit mode) */
  clearPendingTabEdit: () => void;
  /** Navigate to next/prev inline-editable cell on Tab key press */
  onTabToNext: (currentPath: string, columnId: string | null, direction: 1 | -1) => void;
  /** Pre-computed theme coverage per group: groupPath → { themed, total } */
  themeCoverage?: Map<string, { themed: number; total: number }>;
  /** Maps token paths to their source set name — for resolution chain debugger */
  pathToSet?: Record<string, string>;
  /** Theme dimensions — for resolution chain debugger */
  dimensions?: ThemeDimension[];
  /** Currently active theme selections (dimId → optionName) — for resolution chain debugger */
  activeThemes?: Record<string, string>;
  /** Roving tabindex: path of the currently keyboard-navigable row (tabIndex=0); all others are -1 */
  rovingFocusPath: string | null;
  /** Called when a row receives focus — updates the roving tabindex position */
  onRovingFocus: (path: string) => void;
}

// ---------------------------------------------------------------------------
// TokenTreeNode props — per-node values only (shared state comes from context)
// ---------------------------------------------------------------------------

export interface TokenTreeNodeProps {
  node: TokenNode;
  depth: number;
  isSelected: boolean;
  lintViolations?: LintViolation[];
  skipChildren?: boolean;
  showFullPath?: boolean;
  isPinned?: boolean;
  chainExpanded?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Per-option resolved values for multi-mode column view */
  multiModeValues?: MultiModeValue[];
}
