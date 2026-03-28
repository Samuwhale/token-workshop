import type { TokenNode } from '../hooks/useTokens';
import type { BindableProperty, NodeCapabilities, SelectionNodeInfo, TokenMapEntry } from '../../shared/types';
import type { UndoSlot } from '../hooks/useUndo';
import type { SortOrder } from './tokenListUtils';
import type { TokenGenerator } from '../hooks/useGenerators';
import type { LintViolation } from '../hooks/useLint';

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
  derivedTokenPaths?: Set<string>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  tokenUsageCounts?: Record<string, number>;
  perSetFlat?: Record<string, Record<string, TokenMapEntry>>;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
}

export interface TokenListActions {
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onCreateNew?: (initialPath?: string, initialType?: string, initialValue?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  onNavigateToAlias?: (path: string) => void;
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
// TokenTreeNode props
// ---------------------------------------------------------------------------

export interface TokenTreeNodeProps {
  node: TokenNode;
  depth: number;
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onDelete: (path: string) => void;
  onDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  setName: string;
  selectionCapabilities: NodeCapabilities | null;
  allTokensFlat: Record<string, TokenMapEntry>;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (path: string, modifiers?: { shift: boolean; ctrl: boolean }) => void;
  expandedPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  duplicateCounts: Map<string, number>;
  highlightedToken: string | null;
  onNavigateToAlias?: (path: string) => void;
  onCreateSibling?: (groupPath: string, tokenType: string) => void;
  onCreateGroup?: (parentGroupPath: string) => void;
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onUpdateGroupMeta?: (groupPath: string, meta: { $type?: string | null; $description?: string | null }) => Promise<void>;
  onRequestMoveGroup?: (groupPath: string) => void;
  onRequestMoveToken?: (tokenPath: string) => void;
  onDuplicateGroup?: (groupPath: string) => void;
  onDuplicateToken?: (path: string) => void;
  onExtractToAlias?: (path: string, $type?: string, $value?: any) => void;
  inspectMode?: boolean;
  onHoverToken?: (path: string) => void;
  lintViolations?: LintViolation[];
  onExtractToAliasForLint?: (path: string, $type?: string, $value?: any) => void;
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onGenerateScaleFromGroup?: (groupPath: string, tokenType: string | null) => void;
  syncSnapshot?: Record<string, string>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  onFilterByType?: (type: string) => void;
  generatorsBySource?: Map<string, TokenGenerator[]>;
  derivedTokenPaths?: Set<string>;
  skipChildren?: boolean;
  onJumpToGroup?: (path: string) => void;
  onInlineSave?: (path: string, type: string, newValue: any) => void;
  onRenameToken?: (oldPath: string, newPath: string) => void;
  onDragStart?: (paths: string[], names: string[]) => void;
  onDragEnd?: () => void;
  onDragOverGroup?: (groupPath: string | null, invalid?: boolean) => void;
  onDropOnGroup?: (groupPath: string) => void;
  dragOverGroup?: string | null;
  dragOverGroupIsInvalid?: boolean;
  selectedLeafNodes?: TokenNode[];
  dragSource?: { paths: string[]; names: string[] } | null;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDragOverToken?: (path: string, name: string, position: 'before' | 'after') => void;
  onDragLeaveToken?: () => void;
  onDropOnToken?: (path: string, name: string, position: 'before' | 'after') => void;
  dragOverReorder?: { path: string; position: 'before' | 'after' } | null;
  chainExpanded?: boolean;
  onToggleChain?: (path: string) => void;
  /** Parsed highlight terms from search query */
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  showFullPath?: boolean;
  tokenUsageCounts?: Record<string, number>;
}
