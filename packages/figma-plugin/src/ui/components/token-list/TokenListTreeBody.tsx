import type React from "react";
import { useCallback, useState } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type { LintViolation } from "../../hooks/useLint";
import type { MultiModeValue } from "../tokenListTypes";
import { TOKEN_TYPE_BADGE_CLASS } from "../../../shared/types";
import { highlightMatch } from "../tokenListHelpers";
import { nodeParentPath } from "../tokenListUtils";
import { TokenTreeNode } from "../TokenTreeNode";
import {
  FeedbackPlaceholder,
  type FeedbackPlaceholderAction,
} from "../FeedbackPlaceholder";
import { JsonEditorView } from "../JsonEditorView";
import { TokenListFilteredEmptyState } from "./TokenListStates";
import type { FilterBuilderSection } from "../TokenSearchFilterBuilder";
import { ModeColumnHeader } from "./ModeColumnHeader";
import { apiFetch } from "../../shared/apiFetch";

type VisibleTokenRow = {
  node: TokenNode;
  depth: number;
  ancestorPathLabel?: string;
};

interface CrossSetResult {
  path: string;
  collectionId: string;
  entry: { $type: string; $value: unknown };
}

interface ZoomBreadcrumbSegment {
  name: string;
  path: string;
}

interface MultiModeDataResult {
  optionName: string;
  collectionId: string;
}

interface MultiModeData {
  collection: { id: string; modes: { name: string }[] };
  results: MultiModeDataResult[];
}

interface JsonEditorProps {
  jsonText: string;
  jsonDirty: boolean;
  jsonError: string | null;
  jsonSaving: boolean;
  jsonBrokenRefs: string[];
  jsonTextareaRef: React.RefObject<HTMLTextAreaElement>;
  connected: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

interface TokenListTreeBodyProps {
  // View mode
  viewMode: "tree" | "json";

  // Cross-collection search
  crossCollectionResults: CrossSetResult[] | null;
  crossCollectionTotal: number;
  setCrossCollectionOffset: (v: number) => void;
  CROSS_COLLECTION_PAGE_SIZE: number;
  collectionIds: string[];

  // Search
  searchQuery: string;
  searchHighlight?: { nameTerms: string[]; valueTerms: string[] };
  availableTypes: string[];
  typeFilter: string;
  filtersActive: boolean;
  setSearchQuery: (v: string) => void;
  setTypeFilter: (v: string) => void;
  addQueryQualifierValue: (key: FilterBuilderSection, value: string) => void;
  insertSearchQualifier: (qualifier: FilterBuilderSection) => void;

  // Inspect mode
  inspectMode: boolean;
  selectedNodes: { id: string }[];

  // JSON editor
  jsonEditorProps: JsonEditorProps;

  // Tokens
  tokens: TokenNode[];
  displayedTokens: TokenNode[];

  // Virtual scroll
  flatItems: VisibleTokenRow[];
  virtualStartIdx: number;
  virtualEndIdx: number;
  virtualTopPad: number;
  virtualBottomPad: number;

  // Multi-mode
  multiModeData: MultiModeData | null;
  multiModeDimId: string | null;
  multiModeDimensionName: string | null;
  collections: { id: string; modes: { name: string }[] }[];
  setMultiModeDimId: (v: string) => void;
  getMultiModeValues: (tokenPath: string) => MultiModeValue[] | undefined;
  serverUrl: string;
  onModeMutated?: () => void;

  // Selection
  selectedPaths: Set<string>;
  sortOrder: string;
  connected: boolean;
  siblingOrderMap: Map<string, string[]>;
  showRecentlyTouched: boolean;
  showFlatSearchResults: boolean;

  // Lint
  lintViolationsMap: Map<string, LintViolation[]>;
  expandedChains: Set<string>;

  // Move operations
  handleMoveTokenInGroup: (path: string, name: string, dir: "up" | "down") => void;

  // Zoom
  zoomBreadcrumb: ZoomBreadcrumbSegment[] | null;
  zoomParentPath: string | null;
  zoomSiblingBranches: ZoomBreadcrumbSegment[];
  handleZoomUpOneLevel: () => void;
  handleZoomOut: () => void;
  handleZoomToAncestor: (path: string) => void;

  // Breadcrumb
  breadcrumbSegments: ZoomBreadcrumbSegment[];
  handleJumpToGroup: (path: string) => void;
  handleCollapseBelow: (path: string) => void;

  // Navigation
  onNavigateToCollection?: (collectionId: string, tokenPath: string) => void;
  onCreateNew?: (initialPath?: string) => void;
  onCreateGeneratedGroup?: () => void;
  onOpenImportPanel?: () => void;

  // Filters
  clearFilters: () => void;

  // Empty state
  onOpenStartHere?: () => void;
}

const EMPTY_LINT_VIOLATIONS: LintViolation[] = [];

export function TokenListTreeBody(props: TokenListTreeBodyProps) {
  const {
    viewMode,
    crossCollectionResults,
    crossCollectionTotal,
    setCrossCollectionOffset,
    CROSS_COLLECTION_PAGE_SIZE,
    collectionIds,
    searchQuery,
    searchHighlight,
    availableTypes,
    typeFilter,
    filtersActive,
    setSearchQuery,
    setTypeFilter,
    addQueryQualifierValue,
    insertSearchQualifier,
    inspectMode,
    selectedNodes,
    jsonEditorProps,
    tokens,
    displayedTokens,
    flatItems,
    virtualStartIdx,
    virtualEndIdx,
    virtualTopPad,
    virtualBottomPad,
    multiModeData,
    multiModeDimId,
    multiModeDimensionName,
    collections,
    setMultiModeDimId,
    getMultiModeValues,
    selectedPaths,
    sortOrder,
    connected,
    siblingOrderMap,
    showRecentlyTouched,
    showFlatSearchResults,
    lintViolationsMap,
    expandedChains,
    handleMoveTokenInGroup,
    zoomBreadcrumb,
    zoomParentPath,
    zoomSiblingBranches,
    handleZoomUpOneLevel,
    handleZoomOut,
    handleZoomToAncestor,
    breadcrumbSegments,
    handleJumpToGroup,
    handleCollapseBelow,
    onNavigateToCollection,
    onCreateNew,
    onCreateGeneratedGroup,
    onOpenImportPanel,
    clearFilters,
  } = props;
  const { serverUrl, onModeMutated } = props;

  const [addingMode, setAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [addingModeSaving, setAddingModeSaving] = useState(false);

  const handleAddMode = useCallback(async () => {
    const name = newModeName.trim();
    if (!name || !multiModeDimId) return;
    setAddingModeSaving(true);
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(multiModeDimId)}/modes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setNewModeName("");
      setAddingMode(false);
      onModeMutated?.();
    } catch {
      // keep input open on error
    } finally {
      setAddingModeSaving(false);
    }
  }, [multiModeDimId, newModeName, onModeMutated, serverUrl]);

  // Multi-mode column headers
  const multiModeHeaders = multiModeData && viewMode === "tree" ? (
    <div className="sticky top-0 z-20 flex items-center border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
      <div className="flex-1 min-w-0 px-2 py-1 flex items-center gap-1">
        {collections.length > 1 ? (
          <select
            value={multiModeDimId ?? ""}
            onChange={(e) => setMultiModeDimId(e.target.value)}
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
            {multiModeDimensionName ?? "Token"}
          </span>
        )}
      </div>
      {multiModeData.results.map((r) => (
        <ModeColumnHeader
          key={r.optionName}
          modeName={r.optionName}
          collectionId={r.collectionId}
          serverUrl={serverUrl}
          connected={connected}
          onMutated={() => onModeMutated?.()}
        />
      ))}
      {addingMode ? (
        <div className="w-[48px] shrink-0 px-0.5 py-0.5 border-l border-[var(--color-figma-border)]">
          <input
            type="text"
            value={newModeName}
            onChange={(e) => setNewModeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddMode();
              if (e.key === "Escape") {
                setAddingMode(false);
                setNewModeName("");
              }
            }}
            onBlur={() => {
              if (!newModeName.trim()) {
                setAddingMode(false);
                setNewModeName("");
              }
            }}
            autoFocus
            disabled={addingModeSaving}
            placeholder="Name"
            className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-0.5 py-0.5 text-[9px] text-[var(--color-figma-text)] outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingMode(true)}
          disabled={!connected}
          className="w-[24px] shrink-0 flex items-center justify-center py-1 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors disabled:opacity-30"
          title="Add mode"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
      )}
    </div>
  ) : null;

  // Cross-collection search results
  if (crossCollectionResults !== null) {
    if (crossCollectionResults.length === 0) {
      return (
        <>
          {multiModeHeaders}
        <div className="py-3">
          <FeedbackPlaceholder
              variant="no-results"
              size="section"
              title="No tokens found across all collections"
              description="Try a broader search or switch to a specific collection."
            />
            {searchQuery &&
              (() => {
                const q = searchQuery.trim();
                const qLower = q.toLowerCase();
                const matchingType =
                  availableTypes.find((t) => t.toLowerCase() === qLower) ||
                  availableTypes.find((t) =>
                    t.toLowerCase().startsWith(qLower),
                  );
                if (matchingType && typeFilter !== matchingType) {
                  return (
                    <div className="mt-2 text-center">
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setTypeFilter(matchingType);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors"
                      >
                        Filter by type: {matchingType}{" "}
                        <span aria-hidden="true">&rarr;</span>
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
          </div>
        </>
      );
    }

    return (
      <>
        {multiModeHeaders}
        <div>
          {collectionIds
            .filter((sn) => crossCollectionResults.some((r) => r.collectionId === sn))
            .map((sn) => {
              const collectionResults = crossCollectionResults.filter(
                (r) => r.collectionId === sn,
              );
              return (
                <div key={sn}>
                  <div className="px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] sticky top-0 z-10">
                    {sn}{" "}
                    <span className="font-normal opacity-60">
                      ({collectionResults.length})
                    </span>
                  </div>
                  {collectionResults.map((r) => (
                    <button
                      key={r.path}
                      onClick={() => onNavigateToCollection?.(r.collectionId, r.path)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] border-b border-[var(--color-figma-border)]/50"
                    >
                      {r.entry.$type === "color" &&
                        typeof r.entry.$value === "string" &&
                        (r.entry.$value as string).startsWith("#") && (
                          <span
                            className="shrink-0 w-3 h-3 rounded-sm border border-[var(--color-figma-border)]"
                            style={{ background: r.entry.$value as string }}
                          />
                        )}
                      <span
                        className="flex-1 min-w-0 font-mono text-[10px] text-[var(--color-figma-text)] truncate"
                        title={r.path}
                      >
                        {highlightMatch(
                          r.path,
                          searchHighlight?.nameTerms ?? [],
                        )}
                      </span>
                      <span
                        className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${TOKEN_TYPE_BADGE_CLASS[r.entry.$type] ?? "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]"}`}
                      >
                        {r.entry.$type}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          {crossCollectionTotal > crossCollectionResults.length && (
            <div className="px-3 py-2 flex items-center justify-between border-t border-[var(--color-figma-border)]">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {crossCollectionResults.length} of {crossCollectionTotal} shown
              </span>
              <button
                className="text-[10px] text-[var(--color-figma-accent)] hover:underline"
                onClick={() => setCrossCollectionOffset(crossCollectionResults.length)}
              >
                Load{" "}
                {Math.min(
                  CROSS_COLLECTION_PAGE_SIZE,
                  crossCollectionTotal - crossCollectionResults.length,
                )}{" "}
                more
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  // Inspect mode with no selection
  if (inspectMode && selectedNodes.length === 0) {
    return (
      <>
        {multiModeHeaders}
        <FeedbackPlaceholder
          variant="empty"
          title="Select a layer to inspect"
          description="Bound tokens will appear here."
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <path d="M10 17l5-5-5-5" />
              <path d="M13 12H3" />
            </svg>
          }
        />
      </>
    );
  }

  // JSON editor
  if (viewMode === "json") {
    return (
      <>
        {multiModeHeaders}
        <JsonEditorView
          jsonText={jsonEditorProps.jsonText}
          jsonDirty={jsonEditorProps.jsonDirty}
          jsonError={jsonEditorProps.jsonError}
          jsonSaving={jsonEditorProps.jsonSaving}
          jsonBrokenRefs={jsonEditorProps.jsonBrokenRefs}
          jsonTextareaRef={jsonEditorProps.jsonTextareaRef}
          connected={jsonEditorProps.connected}
          hasTokens={tokens.length > 0}
          onChange={jsonEditorProps.onChange}
          onSave={jsonEditorProps.onSave}
          onRevert={jsonEditorProps.onRevert}
        />
      </>
    );
  }

  // Empty collection
  if (tokens.length === 0) {
    const emptyCollectionActions: FeedbackPlaceholderAction[] = [
      onCreateGeneratedGroup
        ? {
            label: "Generate group…",
            onClick: onCreateGeneratedGroup,
            disabled: !connected,
            tone: "secondary",
          }
        : null,
      onOpenImportPanel
        ? {
            label: "Import tokens",
            onClick: onOpenImportPanel,
            disabled: !connected,
            tone: "secondary",
          }
        : null,
      onCreateNew
        ? {
            label: "New token",
            onClick: () => onCreateNew(),
            disabled: !connected,
            tone: "primary",
          }
        : null,
    ].filter((action): action is FeedbackPlaceholderAction => action !== null);

    return (
      <>
        {multiModeHeaders}
        <div className="flex flex-col items-center justify-center gap-3 px-3 py-3 text-center">
          <FeedbackPlaceholder
            variant="empty"
            size="section"
            className="w-full max-w-[360px]"
            icon={
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
              </svg>
            }
            title="This collection is empty"
            description="Create a token, generate a starter group, or import tokens into this collection."
            actions={emptyCollectionActions}
          />
        </div>
      </>
    );
  }

  // Filtered empty state
  if (displayedTokens.length === 0 && filtersActive) {
    return (
      <>
        {multiModeHeaders}
        <TokenListFilteredEmptyState
          searchQuery={searchQuery}
          availableTypes={availableTypes}
          typeFilter={typeFilter}
          connected={connected}
          onClearFilters={clearFilters}
          onSetSearchQuery={setSearchQuery}
          onSetTypeFilter={setTypeFilter}
          onCreateNew={onCreateNew}
          onAddQueryQualifierValue={addQueryQualifierValue}
          onInsertSearchQualifier={insertSearchQualifier}
        />
      </>
    );
  }

  // Tree view with virtual scroll
  return (
    <>
      {multiModeHeaders}
      <div className="py-1">
        {zoomBreadcrumb ? (
          <div className="sticky top-0 z-10 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px]">
            <div className="flex items-center gap-1">
              <button
                onClick={handleZoomUpOneLevel}
                disabled={!zoomParentPath}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:cursor-default disabled:opacity-40"
                title={
                  zoomParentPath
                    ? "Move up one group"
                    : "Already at the top scoped branch"
                }
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
                <span>Up</span>
              </button>
              <button
                onClick={handleZoomOut}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                title="Clear the scoped branch (Esc)"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
                <span>All tokens</span>
              </button>
              <div className="min-w-0 flex items-center gap-0.5 overflow-x-auto">
                {zoomBreadcrumb.map((seg, i) => (
                  <span
                    key={seg.path}
                    className="flex items-center gap-0.5 shrink-0"
                  >
                    {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                    {i < zoomBreadcrumb.length - 1 ? (
                      <button
                        className="truncate text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline max-w-[200px]"
                        title={seg.path}
                        onClick={() => handleZoomToAncestor(seg.path)}
                      >
                        {seg.name}
                      </button>
                    ) : (
                      <span
                        className="truncate font-medium text-[var(--color-figma-text)] max-w-[200px]"
                        title={seg.path}
                      >
                        {seg.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
            {zoomSiblingBranches.length > 0 && (
              <div className="mt-1 flex items-center gap-1 overflow-x-auto">
                <span className="shrink-0 text-[10px] text-[var(--color-figma-text-tertiary)]">
                  Other branches
                </span>
                {zoomSiblingBranches.map((branch) => (
                  <button
                    key={branch.path}
                    onClick={() => handleZoomToAncestor(branch.path)}
                    className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:underline"
                    title={`Scope to ${branch.path}`}
                  >
                    {branch.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !showFlatSearchResults && breadcrumbSegments.length > 0 ? (
          <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] group/breadcrumb">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 opacity-40 mr-0.5"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {breadcrumbSegments.map((seg, i) => (
              <span key={seg.path} className="flex items-center gap-0.5">
                {i > 0 && <span className="opacity-40 mx-0.5">›</span>}
                {i < breadcrumbSegments.length - 1 ? (
                  <button
                    className="hover:text-[var(--color-figma-text)] hover:underline truncate max-w-[200px]"
                    title={`Jump to ${seg.path}`}
                    onClick={() => handleJumpToGroup(seg.path)}
                  >
                    {seg.name}
                  </button>
                ) : (
                  <span
                    className="font-medium text-[var(--color-figma-text)] truncate max-w-[200px]"
                    title={seg.path}
                  >
                    {seg.name}
                  </span>
                )}
              </span>
            ))}
            <button
              className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/breadcrumb:opacity-100 group-focus-within/breadcrumb:opacity-100 transition-opacity text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
              title="Collapse and jump to group"
              onClick={() =>
                handleCollapseBelow(
                  breadcrumbSegments[breadcrumbSegments.length - 1].path,
                )
              }
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 15l-6-6-6 6" />
              </svg>
              <span>Collapse</span>
            </button>
          </div>
        ) : null}
        <div style={{ height: virtualTopPad }} aria-hidden="true" />
        {flatItems
          .slice(virtualStartIdx, virtualEndIdx)
          .map(({ node, depth, ancestorPathLabel }) => {
            const moveEnabled = sortOrder === "default" && connected;
            const parentPath = moveEnabled
              ? (nodeParentPath(node.path, node.name) ?? "")
              : "";
            const siblings = moveEnabled
              ? (siblingOrderMap.get(parentPath) ?? [])
              : [];
            const sibIdx = moveEnabled ? siblings.indexOf(node.name) : -1;
            return (
              <TokenTreeNode
                key={node.path}
                node={node}
                depth={depth}
                skipChildren
                isSelected={
                  node.isGroup ? false : selectedPaths.has(node.path)
                }
                lintViolations={
                  lintViolationsMap.get(node.path) ??
                  EMPTY_LINT_VIOLATIONS
                }
                chainExpanded={expandedChains.has(node.path)}
                ancestorPathLabel={ancestorPathLabel}
                showFullPath={showRecentlyTouched}
                onMoveUp={
                  moveEnabled && sibIdx > 0
                    ? () =>
                        handleMoveTokenInGroup(node.path, node.name, "up")
                    : undefined
                }
                onMoveDown={
                  moveEnabled &&
                  sibIdx >= 0 &&
                  sibIdx < siblings.length - 1
                    ? () =>
                        handleMoveTokenInGroup(
                          node.path,
                          node.name,
                          "down",
                        )
                    : undefined
                }
                multiModeValues={
                  multiModeData
                    ? getMultiModeValues(node.path)
                    : undefined
                }
              />
            );
          })}
        <div style={{ height: virtualBottomPad }} aria-hidden="true" />
      </div>
    </>
  );
}
