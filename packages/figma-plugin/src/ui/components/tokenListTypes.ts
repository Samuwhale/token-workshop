import type React from "react";
import type { TokenNode } from "../hooks/useTokens";
import type {
  NodeCapabilities,
  SelectionNodeInfo,
  TokenMapEntry,
} from "../../shared/types";
import type { UndoSlot } from "../hooks/useUndo";
import type { LintViolation } from "../hooks/useLint";
import type { RecentlyTouchedState } from "../hooks/useRecentlyTouched";
import type { TokenCollection } from "@tokenmanager/core";

/** Per-option resolved value for a single token in multi-mode view */
export interface MultiModeValue {
  optionName: string;
  collectionId: string;
  resolved: TokenMapEntry | undefined;
  /** The collection to target when inline-editing this mode's value. */
  targetCollectionId: string | null;
}

// ---------------------------------------------------------------------------
// Depth indicator
// ---------------------------------------------------------------------------

/** Single source of truth for indentation per nesting level (px) */
export const INDENT_PER_LEVEL = 8;

/**
 * Single neutral guide color for the depth bar. Depth is communicated by
 * indentation; the bar is a subtle structural cue, not a color-coded index.
 */
export const DEPTH_GUIDE_COLOR = "var(--color-figma-border)";

// ---------------------------------------------------------------------------
// Table grid template
// ---------------------------------------------------------------------------

/** Width of the trailing add-mode slot in the header (icon-only action). */
export const ADD_MODE_SLOT_PX = 28;
export const TOKEN_COLUMN_MIN_PX = 104;

/** Default / min / max widths for individual mode columns (px). */
export const DEFAULT_MODE_COL_PX = 104;
export const MIN_MODE_COL_PX = 88;
export const MAX_MODE_COL_PX = 480;

/** Shared by the table header and every row so columns always align. */
export function getGridTemplate(modeWidths: number[]): string {
  const widths = modeWidths.length > 0 ? modeWidths : [DEFAULT_MODE_COL_PX];
  const modeCols = widths
    .map((width) => `minmax(${MIN_MODE_COL_PX}px, ${width}px)`)
    .join(" ");
  return `minmax(${TOKEN_COLUMN_MIN_PX}px, 2.1fr) ${modeCols} minmax(${ADD_MODE_SLOT_PX}px, ${ADD_MODE_SLOT_PX}px)`;
}

export function getGridMinWidth(modeWidths: number[]): number {
  const widths = modeWidths.length > 0 ? modeWidths : [DEFAULT_MODE_COL_PX];
  return (
    TOKEN_COLUMN_MIN_PX +
    widths.reduce((sum, width) => sum + width, 0) +
    ADD_MODE_SLOT_PX
  );
}

// ---------------------------------------------------------------------------
// Virtual scroll constants
// ---------------------------------------------------------------------------
export const VIRTUAL_ITEM_HEIGHT = 30; // px per row base height
export const VIRTUAL_CHAIN_EXPAND_HEIGHT = 24; // extra px when the alias chain panel is expanded
export const VIRTUAL_OVERSCAN = 8; // extra rows rendered above and below the viewport

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type SortOrder = "default" | "alpha-asc" | "by-type";
export type TokenGroupBy = "path" | "type";

export interface TokenListCtx {
  collectionId: string;
  collectionIds: string[];
  serverUrl: string;
  connected: boolean;
  selectedNodes: SelectionNodeInfo[];
}

export interface TokenListData {
  tokens: TokenNode[];
  allTokensFlat: Record<string, TokenMapEntry>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  tokenUsageCounts?: Record<string, number>;
  tokenUsageReady?: boolean;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  collectionMap?: Record<string, string>;
  collectionTokenCounts?: Record<string, number>;
  modeMap?: Record<string, string>;
  /** Collections available for multi-mode column view */
  collections?: TokenCollection[];
  /** Maps token paths to their collection id */
  pathToCollectionId?: Record<string, string>;
  /** Maps token paths to every collection that currently defines them */
  collectionIdsByPath?: Record<string, string[]>;
}

export interface TokenListActions {
  onEdit: (path: string, name?: string) => void;
  onCreateNew?: (
    initialPath?: string,
    initialType?: string,
    initialValue?: string,
  ) => void;
  onCreateGenerator?: (initialOutputPrefix?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onTokenCreated?: (path: string) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onNavigateBack?: () => void;
  navHistoryLength?: number;
  onClearHighlight?: () => void;
  onPublishGroup?: (groupPath: string, tokenCount: number) => void;
  onToggleIssuesOnly?: () => void;
  onFilteredCountChange?: (count: number | null) => void;
  onNavigateToCollection?: (collectionId: string, tokenPath: string) => void;
  onTokenTouched?: (path: string) => void;
  onToggleStar?: (path: string) => void;
  /** Pre-filtered starred token paths for the current collection */
  starredPaths?: Set<string>;
  /** Remove multiple starred tokens after a delete action. */
  onRemoveStarredTokens?: (paths: string[], collectionId: string) => void;
  /** Keep starred token paths in sync after a rename action. */
  onRenameStarredToken?: (
    oldPath: string,
    newPath: string,
    collectionId: string,
  ) => void;
  /** Keep starred token paths in sync after a cross-collection move action. */
  onMoveStarredToken?: (
    oldPath: string,
    newPath: string,
    sourceCollectionId: string,
    targetCollectionId: string,
  ) => void;
  onError?: (msg: string) => void;
  onViewTokenHistory?: (path: string) => void;
  /** Open Health → Issues scoped to a specific token */
  onOpenTokenIssues?: (path: string, collectionId: string) => void;
  /** Called whenever the filtered/visible leaf node list changes — used by parent to track navigation targets */
  onDisplayedLeafNodesChange?: (nodes: TokenNode[]) => void;
  /** Called whenever the multi-selection changes — exposes selection to parent (e.g. command palette bulk-delete) */
  onSelectionChange?: (paths: string[]) => void;
  /** Open the unified compare view with the given token paths pre-loaded (navigates away from Tokens tab) */
  onOpenCompare?: (paths: Set<string>) => void;
  /** Open the unified compare view in cross-collection mode for a specific token path */
  onOpenCrossCollectionCompare?: (path: string) => void;
  /** Open the global paste tokens modal */
  onShowPasteModal?: () => void;
  /** Open the import surface from the Tokens workspace */
  onOpenImportPanel?: () => void;
  /** Jump to Canvas → Selection and open the extract-tokens surface */
  onExtractFromSelection?: () => void;
}

/** Imperative handle allowing a parent to trigger compare-panel actions from outside TokenList */
export interface TokenListImperativeHandle {
  openCompareMode: () => void;
  /** Expand the parent chain for a token/group and scroll it into view */
  revealPath: (path: string) => void;
  /** Enable the recently touched filter inside the token list */
  showRecentlyTouched: () => void;
  /** Toggle between tree and JSON views */
  toggleJsonView: () => void;
  /** Toggle alias resolution in tree rows */
  toggleResolvedValues: () => void;
  /** Trigger inline rename mode for the given token path */
  triggerInlineRename: (path: string) => void;
  /** Open the move-to-collection dialog for the given token path */
  triggerMoveToken: (path: string) => void;
  /** Open the extract-to-alias dialog for the given token */
  triggerExtractToAlias: (
    path: string,
    $type?: string,
    $value?: unknown,
  ) => void;
}

export interface TokenListProps {
  ctx: TokenListCtx;
  data: TokenListData;
  actions: TokenListActions;
  recentlyTouched: RecentlyTouchedState;
  highlightedToken?: string | null;
  focusGroupPath?: string | null;
  onFocusGroupHandled?: () => void;
  showIssuesOnly?: boolean;
  /** Path of the token currently open in the editor — enables Cmd+]/[ navigation shortcuts */
  editingTokenPath?: string | null;
  /** Optional ref populated by TokenList so the parent can imperatively trigger compare actions */
  compareHandle?: React.MutableRefObject<TokenListImperativeHandle | null>;
}

export interface AffectedRef {
  path: string;
  collectionId: string;
}

export interface ModeImpact {
  collectionName: string;
  optionName: string;
}

export type DeleteConfirm =
  | {
      type: "token";
      path: string;
      orphanCount: number;
      affectedRefs: AffectedRef[];
      modeImpacts: ModeImpact[];
    }
  | {
      type: "group";
      path: string;
      name: string;
      tokenCount: number;
      orphanCount: number;
      affectedRefs: AffectedRef[];
      modeImpacts: ModeImpact[];
    }
  | {
      type: "bulk";
      paths: string[];
      orphanCount: number;
      affectedRefs: AffectedRef[];
      modeImpacts: ModeImpact[];
    };

export interface PromoteRow {
  path: string;
  $type: string;
  $value: unknown;
  proposedAlias: string | null;
  deltaE?: number;
  accepted: boolean;
}

/**
 * Types that open the quick value editor popover on click in the token list.
 * Every entry must have a matching case in `InlineValuePopover`'s `TypeEditor`.
 */
export const QUICK_EDITABLE_TYPES = new Set([
  "color",
  "dimension",
  "number",
  "string",
  "boolean",
  "fontFamily",
  "fontWeight",
  "duration",
  "asset",
  "shadow",
  "border",
  "typography",
  "gradient",
  "transition",
  "cubicBezier",
  "composition",
  "strokeStyle",
  "fontStyle",
  "lineHeight",
  "letterSpacing",
  "textDecoration",
  "textTransform",
  "percentage",
  "link",
  "custom",
]);

// ---------------------------------------------------------------------------
// Table view sort types
// ---------------------------------------------------------------------------

export type TableSortField =
  | "name"
  | "type"
  | "value"
  | "resolvedValue"
  | "description";
export type TableSortDir = "asc" | "desc";
export interface TableSort {
  field: TableSortField;
  dir: TableSortDir;
}

// ---------------------------------------------------------------------------
// TokenTreeContext — split into smaller subscriptions so rows only re-render
// for the state they actually consume.
// ---------------------------------------------------------------------------

export interface TokenTreeSharedDataContextType {
  allTokensFlat: Record<string, TokenMapEntry>;
  modeResolvedTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  collections?: TokenCollection[];
}

export interface TokenTreeGroupStateContextType {
  collectionId: string;
  groupBy: TokenGroupBy;
  selectMode: boolean;
  expandedPaths: Set<string>;
  highlightedToken: string | null;
  /** Path currently being previewed in the side panel / split preview */
  previewedPath: string | null;
  /** Parsed highlight terms from search query */
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  dragOverGroup?: string | null;
  dragOverGroupIsInvalid?: boolean;
  dragSource?: { paths: string[]; names: string[] } | null;
  /** Pre-computed active-collection mode gaps per group. */
  collectionCoverage?: Map<
    string,
    { total: number; totalMissing: number }
  >;
  /** Roving tabindex: path of the currently keyboard-navigable row (tabIndex=0); all others are -1 */
  rovingFocusPath: string | null;
}

export interface TokenTreeGroupActionsContextType {
  onToggleExpand: (path: string) => void;
  onDeleteGroup: (path: string, name: string, tokenCount: number) => void;
  onCreateSibling?: (groupPath: string, tokenType: string) => void;
  onCreateGroup?: (parentGroupPath: string) => void;
  onRenameGroup?: (oldGroupPath: string, newGroupPath: string) => void;
  onUpdateGroupMeta?: (
    groupPath: string,
    meta: { $type?: string | null; $description?: string | null },
  ) => Promise<void>;
  onRequestMoveGroup?: (groupPath: string) => void;
  onRequestCopyGroup?: (groupPath: string) => void;
  onDuplicateGroup?: (groupPath: string) => void;
  onPublishGroup?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onZoomIntoGroup?: (groupPath: string) => void;
  onDragOverGroup?: (groupPath: string | null, invalid?: boolean) => void;
  onDropOnGroup?: (groupPath: string) => void;
  onSelectGroupChildren?: (groupNode: TokenNode) => void;
  /** Called when a row receives focus — updates the roving tabindex position */
  onRovingFocus: (path: string) => void;
}

export interface TokenTreeLeafStateContextType {
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  groupBy: TokenGroupBy;
  selectionCapabilities: NodeCapabilities | null;
  duplicateCounts: Map<string, number>;
  selectMode: boolean;
  highlightedToken: string | null;
  /** Path currently being previewed in the side panel / split preview */
  previewedPath: string | null;
  inspectMode?: boolean;
  syncSnapshot?: Record<string, string>;
  /** Parsed highlight terms from search query */
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  /** Selected Figma nodes — used for quick-bind scope narrowing */
  selectedNodes: SelectionNodeInfo[];
  /** Token paths bound to the current Figma selection — used to render a row-level cue */
  boundTokenPaths?: Set<string>;
  dragOverReorder?: { path: string; position: "before" | "after" } | null;
  selectedLeafNodes?: TokenNode[];
  /** When true, tree view shows fully resolved values instead of alias references */
  showResolvedValues?: boolean;
  /** Starred token paths for the current collection — for fast O(1) lookup */
  starredPaths?: Set<string>;
  /** Collections used for resolution-chain debugging */
  collections?: TokenCollection[];
  /** Path of a token that should enter inline rename mode as soon as it renders */
  pendingRenameToken: string | null;
  /** Tab navigation: token + optional multi-mode column that should enter edit mode */
  pendingTabEdit: { path: string; columnId: string | null } | null;
  /** Roving tabindex: path of the currently keyboard-navigable row (tabIndex=0); all others are -1 */
  rovingFocusPath: string | null;
  /** When true, the duplicate-values filter is active — show duplicate count badges on token rows */
  showDuplicatesFilter?: boolean;
  /** Per-token missing mode value count — tokenPath → number of missing mode values */
  tokenModeMissing?: Map<string, number>;
}

export interface TokenTreeLeafActionsContextType {
  onEdit: (path: string, name?: string) => void;
  onDelete: (path: string) => void;
  onToggleSelect: (path: string, modifiers?: { shift: boolean }) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRequestMoveToken?: (tokenPath: string) => void;
  onRequestCopyToken?: (tokenPath: string) => void;
  onDuplicateToken?: (path: string) => void;
  onExtractToAlias?: (path: string, $type?: string, $value?: unknown) => void;
  onHoverToken?: (path: string) => void;
  onFilterByType?: (type: string) => void;
  onInlineSave?: (
    path: string,
    type: string,
    newValue: unknown,
    previousState?: { type?: string; value: unknown },
  ) => void;
  onRenameToken?: (oldPath: string, newPath: string) => void;
  /** Navigate to History panel filtered to this token path */
  onViewTokenHistory?: (path: string) => void;
  /** Open Health → Issues scoped to this token (and its collection) */
  onOpenTokenIssues?: (path: string, collectionId: string) => void;
  /** Open cross-collection comparison panel for this token */
  onCompareAcrossCollections?: (path: string) => void;
  onDragStart?: (paths: string[], names: string[]) => void;
  onDragEnd?: () => void;
  onDragOverToken?: (
    path: string,
    name: string,
    position: "before" | "after",
  ) => void;
  onDragLeaveToken?: () => void;
  onDropOnToken?: (
    path: string,
    name: string,
    position: "before" | "after",
  ) => void;
  onMultiModeInlineSave?: (
    path: string,
    type: string,
    newValue: unknown,
    targetCollectionId: string,
    collectionId: string,
    optionName: string,
    previousState?: { type?: string; value: unknown },
  ) => void;
  /** Copy a token's first-mode value to every other mode in its collection */
  onCopyValueToAllModes?: (path: string, targetCollectionId: string) => void;
  /** Toggle starred (cross-collection favorites) for the current token */
  onToggleStar?: (path: string) => void;
  /** Clear the pending rename (called by the node once it activates rename mode) */
  clearPendingRename: () => void;
  /** Clear the pending tab-edit (called by the node once it activates edit mode) */
  clearPendingTabEdit: () => void;
  /** Navigate to next/prev inline-editable cell on Tab key press */
  onTabToNext: (
    currentPath: string,
    columnId: string | null,
    direction: 1 | -1,
  ) => void;
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
  ancestorPathLabel?: string;
  chainExpanded?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Per-mode resolved values for the token. Always length ≥ 1; single-mode collections have one entry. */
  multiModeValues: MultiModeValue[];
  /** Grid template shared between the table header and every row so columns align. */
  gridTemplate: string;
  /** Resolve multi-mode values for any token path — used by group rows to aggregate descendant previews. */
  getValuesForPath?: (tokenPath: string) => MultiModeValue[];
}
