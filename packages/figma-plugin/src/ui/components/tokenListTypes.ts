import type { TokenNode } from '../hooks/useTokens';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';
import type { SortOrder } from './tokenListUtils';
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
// Virtual scroll constants
// ---------------------------------------------------------------------------
export const VIRTUAL_ITEM_HEIGHT = 28; // px per row base height
export const VIRTUAL_CHAIN_EXPAND_HEIGHT = 24; // extra px when the alias chain panel is expanded
export const VIRTUAL_OVERSCAN = 8; // extra rows rendered above and below the viewport

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

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
}

export interface TokenListProps {
  ctx: TokenListCtx;
  data: TokenListData;
  actions: TokenListActions;
  defaultCreateOpen?: boolean;
  highlightedToken?: string | null;
  showIssuesOnly?: boolean;
}

export type DeleteConfirm =
  | { type: 'token'; path: string; orphanCount: number }
  | { type: 'group'; path: string; name: string; tokenCount: number }
  | { type: 'bulk'; paths: string[]; orphanCount: number };

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
  onToggleExpand: (path: string) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onCreateSibling?: (groupPath: string, tokenType: string) => void;
  onCreateGroup?: (parentGroupPath: string) => void;
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onUpdateGroupMeta?: (groupPath: string, meta: { $type?: string | null; $description?: string | null }) => Promise<void>;
  onRequestMoveGroup?: (groupPath: string) => void;
  onRequestMoveToken?: (tokenPath: string) => void;
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
  onDragStart?: (paths: string[], names: string[]) => void;
  onDragEnd?: () => void;
  onDragOverGroup?: (groupPath: string | null, invalid?: boolean) => void;
  onDropOnGroup?: (groupPath: string) => void;
  onDragOverToken?: (path: string, name: string, position: 'before' | 'after') => void;
  onDragLeaveToken?: () => void;
  onDropOnToken?: (path: string, name: string, position: 'before' | 'after') => void;
  onMultiModeInlineSave?: (path: string, type: string, newValue: any, targetSet: string) => void;
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
