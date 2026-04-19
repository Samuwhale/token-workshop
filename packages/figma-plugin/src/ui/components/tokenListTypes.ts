import type React from "react";
import type { TokenNode } from "../hooks/useTokens";
import type {
  NodeCapabilities,
  SelectionNodeInfo,
  TokenMapEntry,
} from "../../shared/types";
import type { UndoSlot } from "../hooks/useUndo";
import type { TokenGenerator } from "../hooks/useGenerators";
import type { LintViolation } from "../hooks/useLint";
import type { RecentlyTouchedState } from "../hooks/useRecentlyTouched";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../shared/navigationTypes";
import type { StartHereBranch } from "./WelcomePrompt";
import type { TokenCollection } from "@tokenmanager/core";

/** Per-option resolved value for a single token in multi-mode view */
export interface MultiModeValue {
  optionName: string;
  collectionId: string;
  resolved: TokenMapEntry | undefined;
  /** The set name to target when inline-editing this option's value */
  targetCollectionId: string | null;
}

// ---------------------------------------------------------------------------
// Density preference
// ---------------------------------------------------------------------------
export type Density = "compact" | "comfortable";

/** Row height (px) per density level */
export const DENSITY_ROW_HEIGHT: Record<Density, number> = {
  compact: 28,
  comfortable: 34,
};

/** Swatch / preview size (px) per density level */
export const DENSITY_SWATCH_SIZE: Record<Density, number> = {
  compact: 16,
  comfortable: 20,
};

/** Tailwind py class per density level */
export const DENSITY_PY_CLASS: Record<Density, string> = {
  compact: "py-0.5",
  comfortable: "py-1",
};

// ---------------------------------------------------------------------------
// Depth indicator & condensed view
// ---------------------------------------------------------------------------

/** Single source of truth for indentation per nesting level (px) */
export const INDENT_PER_LEVEL = 8;

/** Maximum depth shown as distinct indent levels when condensed view is on */
export const CONDENSED_MAX_DEPTH = 3;

/**
 * Colors for the per-depth guide bar. Cycles for depth >= length.
 * depth 0 → transparent (category headers get no bar).
 */
export const DEPTH_COLORS: readonly string[] = [
  "var(--color-depth-0)", // depth 0 — transparent (category headers get no bar)
  "var(--color-depth-1)", // depth 1 — accent blue
  "var(--color-depth-2)", // depth 2 — green
  "var(--color-depth-3)", // depth 3 — amber
  "var(--color-depth-4)", // depth 4 — coral
  "var(--color-depth-5)", // depth 5 — purple
];

// ---------------------------------------------------------------------------
// Virtual scroll constants
// ---------------------------------------------------------------------------
export const VIRTUAL_ITEM_HEIGHT = 30; // px per row base height (default density — overridden at runtime)
export const VIRTUAL_CHAIN_EXPAND_HEIGHT = 24; // extra px when the alias chain panel is expanded
export const VIRTUAL_OVERSCAN = 8; // extra rows rendered above and below the viewport

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export type SortOrder = "default" | "alpha-asc" | "by-type";

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
  generators?: TokenGenerator[];
  generatorsByTargetGroup?: Map<string, TokenGenerator>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  cascadeDiff?: Record<string, { before: any; after: any }>;
  tokenUsageCounts?: Record<string, number>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  /** Collections available for multi-mode column view */
  collections?: TokenCollection[];
  /** Raw allTokensFlat before applying collection mode selections */
  unresolvedAllTokensFlat?: Record<string, TokenMapEntry>;
  /** Maps token paths to their collection id */
  pathToCollectionId?: Record<string, string>;
  /** Currently selected collection modes (collectionId → modeName) */
  selectedModes?: Record<string, string>;
}

export interface TokenListActions {
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onCreateNew?: (
    initialPath?: string,
    initialType?: string,
    initialValue?: string,
  ) => void;
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
  onCreateGeneratedGroupFromGroup?: (
    groupPath: string,
    tokenType: string | null,
  ) => void;
  onRefreshGeneratedGroups?: () => void;
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
  onEditGeneratedGroup?: (generatorId: string) => void;
  onOpenGeneratedGroupEditor?: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
  /** Open the generator editor to create a new generator */
  onNavigateToNewGeneratedGroup?: () => void;
  /** Navigate to Token Flow panel with this token pre-selected */
  onShowReferences?: (path: string) => void;
  /** Called whenever the filtered/visible leaf node list changes — used by parent to track navigation targets */
  onDisplayedLeafNodesChange?: (nodes: TokenNode[]) => void;
  /** Called whenever the multi-selection changes — exposes selection to parent (e.g. command palette bulk-delete) */
  onSelectionChange?: (paths: string[]) => void;
  /** Open the unified compare view with the given token paths pre-loaded (navigates away from Tokens tab) */
  onOpenCompare?: (paths: Set<string>) => void;
  /** Open the unified compare view in cross-collection mode for a specific token path */
  onOpenCrossCollectionCompare?: (path: string) => void;
  /** Open the command palette in token-search mode pre-populated with the given query ("> query") */
  onOpenCommandPaletteWithQuery?: (query: string) => void;
  /** Open the global paste tokens modal */
  onShowPasteModal?: () => void;
  /** Open the import surface from the Tokens workspace */
  onOpenImportPanel?: () => void;
  /** Open the collection creation flow */
  onOpenCreateCollection?: () => void;
  /** Open the cross-collection "where is this token defined" overlay for the given path */
  onFindInAllCollections?: (path: string) => void;
  /** Open the unified start-here flow from token-level empty states */
  onOpenStartHere?: (branch?: StartHereBranch) => void;
  onTogglePreviewSplit?: () => void;
}

/** Imperative handle allowing a parent to trigger compare-panel actions from outside TokenList */
export interface TokenListImperativeHandle {
  /** Enter multi-select mode (no navigation — user selects tokens then clicks Compare) */
  openCompareMode: () => void;
  /** Expand the parent chain for a token/group and scroll it into view */
  revealPath: (path: string) => void;
  /** Enable the recently touched filter inside the token list */
  showRecentlyTouched: () => void;
  /** Toggle between tree and JSON views */
  toggleJsonView: () => void;
  /** Toggle the token stats bar */
  toggleStatsBar: () => void;
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
  defaultCreateOpen?: boolean;
  highlightedToken?: string | null;
  showIssuesOnly?: boolean;
  showPreviewSplit?: boolean;
  /** Path of the token currently open in the editor — enables Cmd+]/[ navigation shortcuts */
  editingTokenPath?: string | null;
  /** Optional ref populated by TokenList so the parent can imperatively trigger compare actions */
  compareHandle?: React.MutableRefObject<TokenListImperativeHandle | null>;
  toolbarScenarioControl?: React.ReactNode;
}

export interface AffectedRef {
  path: string;
  collectionId: string;
}

export interface GeneratorImpact {
  generatorId: string;
  generatorName: string;
  generatorType: string;
  /** 'source' = sourceToken match; 'config-ref' = $tokenRefs match */
  role: "source" | "config-ref";
  /** The config field key that references the token (only when role === 'config-ref') */
  configField?: string;
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
      generatorImpacts: GeneratorImpact[];
      modeImpacts: ModeImpact[];
    }
  | {
      type: "group";
      path: string;
      name: string;
      tokenCount: number;
      orphanCount: number;
      affectedRefs: AffectedRef[];
      generatorImpacts: GeneratorImpact[];
      modeImpacts: ModeImpact[];
    }
  | {
      type: "bulk";
      paths: string[];
      orphanCount: number;
      affectedRefs: AffectedRef[];
      generatorImpacts: GeneratorImpact[];
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

/** Types that can be edited inline in the list row (without opening the drawer). Boolean uses a staged true/false toggle. */
export const INLINE_SIMPLE_TYPES = new Set([
  "color",
  "dimension",
  "number",
  "string",
  "boolean",
  "fontFamily",
  "fontWeight",
  "duration",
  "asset",
]);

/** Types that open the inline value popover on double-click (not handled by INLINE_SIMPLE_TYPES). */
export const INLINE_POPOVER_TYPES = new Set([
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
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  collections?: TokenCollection[];
}

export interface TokenTreeGroupStateContextType {
  density: Density;
  collectionId: string;
  /** Active mode for the current collection in the Tokens view, when that collection has modes. */
  activeCollectionModeLabel?: string | null;
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
  generatorsByTargetGroup?: Map<string, TokenGenerator>;
  /** Pre-computed collection mode coverage per group: groupPath → { configured, total, totalMissing } */
  collectionCoverage?: Map<string, { configured: number; total: number; totalMissing: number }>;
  /** When true, indentation is capped at CONDENSED_MAX_DEPTH levels to prevent deep nesting from pushing content off-screen */
  condensedView?: boolean;
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
  onSyncGroup?: (groupPath: string, tokenCount: number) => void;
  onSyncGroupStyles?: (groupPath: string, tokenCount: number) => void;
  onSetGroupScopes?: (groupPath: string) => void;
  onCreateGeneratedGroupFromGroup?: (
    groupPath: string,
    tokenType: string | null,
  ) => void;
  onZoomIntoGroup?: (groupPath: string) => void;
  onDragOverGroup?: (groupPath: string | null, invalid?: boolean) => void;
  onDropOnGroup?: (groupPath: string) => void;
  onEditGeneratedGroup?: (generatorId: string) => void;
  onDuplicateGeneratedGroup?: (generatorId: string) => void;
  onDeleteGeneratedGroup?: (generatorId: string) => Promise<void>;
  /** Open the generated-group editor for the given group */
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
  /** One-click regenerate a specific generated group (by id) — runs POST /api/generators/:id/run */
  onRunGeneratedGroup?: (generatorId: string) => Promise<void>;
  /** Toggle background upkeep for a generated group. */
  onToggleGeneratedGroupEnabled?: (
    generatorId: string,
    enabled: boolean,
  ) => Promise<void>;
  onDetachGeneratedGroup?: (
    generatorId: string,
    groupPath: string,
  ) => Promise<void>;
  /** Navigate to a token by path (used for generator source token navigation) */
  onNavigateToToken?: (path: string) => void;
  /** Called when a row receives focus — updates the roving tabindex position */
  onRovingFocus: (path: string) => void;
}

export interface TokenTreeLeafStateContextType {
  density: Density;
  serverUrl: string;
  collectionId: string;
  collectionIds: string[];
  selectionCapabilities: NodeCapabilities | null;
  duplicateCounts: Map<string, number>;
  selectMode: boolean;
  highlightedToken: string | null;
  /** Path currently being previewed in the side panel / split preview */
  previewedPath: string | null;
  inspectMode?: boolean;
  syncSnapshot?: Record<string, string>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  /** Parsed highlight terms from search query */
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  /** Selected Figma nodes — used for quick-bind scope narrowing */
  selectedNodes: SelectionNodeInfo[];
  dragOverReorder?: { path: string; position: "before" | "after" } | null;
  selectedLeafNodes?: TokenNode[];
  /** When true, tree view shows fully resolved values instead of alias references */
  showResolvedValues?: boolean;
  /** When true, indentation is capped at CONDENSED_MAX_DEPTH levels to prevent deep nesting from pushing content off-screen */
  condensedView?: boolean;
  /** Starred token paths for the current collection — for fast O(1) lookup */
  starredPaths?: Set<string>;
  /** Collections used for resolution-chain debugging */
  collections?: TokenCollection[];
  /** Currently selected collection modes (collectionId → modeName) — for resolution chain debugger */
  selectedModes?: Record<string, string>;
  /** Path of a token that should enter inline rename mode as soon as it renders */
  pendingRenameToken: string | null;
  /** Tab navigation: token + optional multi-mode column that should enter edit mode */
  pendingTabEdit: { path: string; columnId: string | null } | null;
  /** Roving tabindex: path of the currently keyboard-navigable row (tabIndex=0); all others are -1 */
  rovingFocusPath: string | null;
  /** When true, the duplicate-values filter is active — show duplicate count badges on token rows */
  showDuplicatesFilter?: boolean;
  /** Token paths that have different values across mode variants (for indicator when columns are hidden) */
  modeVariantPaths?: Set<string>;
  /** Per-token missing mode value count — tokenPath → number of missing mode values */
  tokenModeMissing?: Map<string, number>;
  /** When true, the token list is showing collection-mode-resolved values instead of base values */
  modeLensEnabled?: boolean;
}

export interface TokenTreeLeafActionsContextType {
  onEdit: (path: string, name?: string) => void;
  onPreview?: (path: string, name?: string) => void;
  onDelete: (path: string) => void;
  onToggleSelect: (
    path: string,
    modifiers?: { shift: boolean; ctrl: boolean },
  ) => void;
  onNavigateToAlias?: (path: string, fromPath?: string) => void;
  onRefresh: () => void;
  onPushUndo?: (slot: UndoSlot) => void;
  onRequestMoveToken?: (tokenPath: string) => void;
  onRequestCopyToken?: (tokenPath: string) => void;
  onDuplicateToken?: (path: string) => void;
  onDetachFromGenerator?: (path: string) => Promise<boolean>;
  onSaveGeneratedException?: (
    path: string,
    newValue: unknown,
  ) => Promise<boolean>;
  onExtractToAlias?: (path: string, $type?: string, $value?: any) => void;
  onHoverToken?: (path: string) => void;
  onFilterByType?: (type: string) => void;
  onInlineSave?: (
    path: string,
    type: string,
    newValue: any,
    previousState?: { type?: string; value: unknown },
  ) => void;
  onRenameToken?: (oldPath: string, newPath: string) => void;
  /** Navigate to History panel filtered to this token path */
  onViewTokenHistory?: (path: string) => void;
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
    newValue: any,
    targetCollectionId: string,
    collectionId: string,
    optionName: string,
    previousState?: { type?: string; value: unknown },
    options?: { allowGeneratedEdit?: boolean },
  ) => void;
  onOpenGeneratedGroupEditor?: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
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
  isPinned?: boolean;
  chainExpanded?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Per-option resolved values for multi-mode column view */
  multiModeValues?: MultiModeValue[];
}
