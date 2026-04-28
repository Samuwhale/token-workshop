import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Layers, MousePointer2, X, ChevronUp } from "lucide-react";
import type { TokenNode } from "../../hooks/useTokens";
import type { LintViolation } from "../../hooks/useLint";
import type { MultiModeValue } from "../tokenListTypes";
import { tokenTypeBadgeClass } from "../../../shared/types";
import { highlightMatch } from "../tokenListHelpers";
import { nodeParentPath } from "../tokenListUtils";
import { TokenTreeNode } from "../TokenTreeNode";
import { Spinner } from "../Spinner";
import {
  FeedbackPlaceholder,
  type FeedbackPlaceholderAction,
} from "../FeedbackPlaceholder";
import { JsonEditorView } from "../JsonEditorView";
import { TokenListFilteredEmptyState } from "./TokenListStates";
import type { FilterBuilderSection } from "../TokenSearchFilterBuilder";
import { ModeColumnHeader } from "./ModeColumnHeader";
import { getGridMinWidth, getGridTemplate } from "../tokenListTypes";
import { apiFetch } from "../../shared/apiFetch";
import { useModeColumnWidths } from "../../hooks/useModeColumnWidths";

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

export interface TokenListSearchGroup {
  query: string;
  highlight?: { nameTerms: string[]; valueTerms: string[] };
  availableTypes: string[];
  typeFilter: string;
  filtersActive: boolean;
  setQuery: (v: string) => void;
  setTypeFilter: (v: string) => void;
  addQualifierValue: (key: FilterBuilderSection, value: string) => void;
  insertQualifier: (qualifier: FilterBuilderSection) => void;
}

export interface CrossCollectionSearchGroup {
  loading: boolean;
  error: string | null;
  results: CrossSetResult[] | null;
  total: number;
  setOffset: (v: number) => void;
  retry: () => void;
  pageSize: number;
}

export interface TokenListVirtualScrollGroup {
  items: VisibleTokenRow[];
  startIdx: number;
  endIdx: number;
  topPad: number;
  bottomPad: number;
}

export interface TokenListMultiModeGroup {
  data: MultiModeData | null;
  dimId: string | null;
  collections: { id: string; modes: { name: string }[] }[];
  setDimId: (v: string) => void;
  getValues: (tokenPath: string) => MultiModeValue[];
  serverUrl: string;
  onMutated?: () => void;
}

export interface TokenListZoomGroup {
  breadcrumb: ZoomBreadcrumbSegment[] | null;
  parentPath: string | null;
  siblingBranches: ZoomBreadcrumbSegment[];
  zoomUpOneLevel: () => void;
  zoomOut: () => void;
  zoomToAncestor: (path: string) => void;
  breadcrumbSegments: ZoomBreadcrumbSegment[];
  jumpToGroup: (path: string) => void;
  collapseBelow: (path: string) => void;
}

export interface TokenListNavigationGroup {
  onNavigateToCollection?: (collectionId: string, tokenPath: string) => void;
  onCreateNew?: (initialPath?: string) => void;
  onOpenImportPanel?: () => void;
  onExtractFromSelection?: () => void;
  hasSelection?: boolean;
}

interface TokenListTreeBodyProps {
  viewMode: "tree" | "json";
  jsonEditorProps: JsonEditorProps;
  search: TokenListSearchGroup;
  crossCollection: CrossCollectionSearchGroup;
  virtualScroll: TokenListVirtualScrollGroup;
  multiMode: TokenListMultiModeGroup;
  zoom: TokenListZoomGroup;
  navigation: TokenListNavigationGroup;

  inspectMode: boolean;
  selectedNodes: { id: string }[];
  tokens: TokenNode[];
  displayedTokens: TokenNode[];
  selectedPaths: Set<string>;
  sortOrder: string;
  connected: boolean;
  siblingOrderMap: Map<string, string[]>;
  showRecentlyTouched: boolean;
  showFlatSearchResults: boolean;
  lintViolationsMap: Map<string, LintViolation[]>;
  expandedChains: Set<string>;
  handleMoveTokenInGroup: (path: string, name: string, dir: "up" | "down") => void;
  clearFilters: () => void;
}

const EMPTY_LINT_VIOLATIONS: LintViolation[] = [];
export function TokenListTreeBody(props: TokenListTreeBodyProps) {
  const {
    viewMode,
    jsonEditorProps,
    inspectMode,
    selectedNodes,
    tokens,
    displayedTokens,
    selectedPaths,
    sortOrder,
    connected,
    siblingOrderMap,
    showRecentlyTouched,
    showFlatSearchResults,
    lintViolationsMap,
    expandedChains,
    handleMoveTokenInGroup,
    clearFilters,
  } = props;
  const {
    query: searchQuery,
    highlight: searchHighlight,
    availableTypes,
    typeFilter,
    filtersActive,
    setQuery: setSearchQuery,
    setTypeFilter,
    addQualifierValue: addQueryQualifierValue,
    insertQualifier: insertSearchQualifier,
  } = props.search;
  const {
    loading: crossCollectionLoading,
    error: crossCollectionError,
    results: crossCollectionResults,
    total: crossCollectionTotal,
    setOffset: setCrossCollectionOffset,
    retry: retryCrossCollectionSearch,
    pageSize: CROSS_COLLECTION_PAGE_SIZE,
  } = props.crossCollection;
  const {
    items: flatItems,
    startIdx: virtualStartIdx,
    endIdx: virtualEndIdx,
    topPad: virtualTopPad,
    bottomPad: virtualBottomPad,
  } = props.virtualScroll;
  const {
    data: multiModeData,
    dimId: multiModeDimId,
    collections,
    setDimId: setMultiModeDimId,
    getValues: getMultiModeValues,
    serverUrl,
    onMutated: onModeMutated,
  } = props.multiMode;
  const {
    breadcrumb: zoomBreadcrumb,
    parentPath: zoomParentPath,
    siblingBranches: zoomSiblingBranches,
    zoomUpOneLevel: handleZoomUpOneLevel,
    zoomOut: handleZoomOut,
    zoomToAncestor: handleZoomToAncestor,
    breadcrumbSegments,
    jumpToGroup: handleJumpToGroup,
    collapseBelow: handleCollapseBelow,
  } = props.zoom;
  const {
    onNavigateToCollection,
    onCreateNew,
    onOpenImportPanel,
    onExtractFromSelection,
    hasSelection,
  } = props.navigation;

  const [newModeName, setNewModeName] = useState("");
  const [addingModeSaving, setAddingModeSaving] = useState(false);

  const addModeTargetId = multiModeDimId ?? collections[0]?.id ?? null;

  const handleAddMode = useCallback(async () => {
    const name = newModeName.trim();
    if (!name || !addModeTargetId) return;
    setAddingModeSaving(true);
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(addModeTargetId)}/modes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setNewModeName("");
      setAddModeMenuOpen(false);
      onModeMutated?.();
    } catch {
      // keep input open on error
    } finally {
      setAddingModeSaving(false);
    }
  }, [addModeTargetId, newModeName, onModeMutated, serverUrl]);

  const modeNames = multiModeData?.results.map((r) => r.optionName) ?? [];
  const widthsCollectionId = multiModeData?.collection.id ?? null;
  const tableContentRef = useRef<HTMLDivElement>(null);
  const [tableViewportWidth, setTableViewportWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const viewport = tableContentRef.current?.parentElement;
    if (!viewport) {
      setTableViewportWidth(null);
      return;
    }

    const updateWidth = () => {
      setTableViewportWidth(viewport.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const { widths: modeColumnWidths, setWidth: setModeColumnWidth } =
    useModeColumnWidths(widthsCollectionId, modeNames, tableViewportWidth);
  const gridTemplate = getGridTemplate(modeColumnWidths);
  const tableMinWidth = multiModeData
    ? getGridMinWidth(modeColumnWidths)
    : null;
  const [addModeMenuOpen, setAddModeMenuOpen] = useState(false);
  const addModeMenuContainerRef = useRef<HTMLDivElement>(null);
  const crossCollectionSections = useMemo(() => {
    if (!crossCollectionResults) {
      return [];
    }
    const sections = new Map<string, CrossSetResult[]>();
    for (const result of crossCollectionResults) {
      const existing = sections.get(result.collectionId);
      if (existing) {
        existing.push(result);
        continue;
      }
      sections.set(result.collectionId, [result]);
    }
    return Array.from(sections.entries());
  }, [crossCollectionResults]);

  useEffect(() => {
    if (!addModeMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (addModeMenuContainerRef.current?.contains(e.target as Node)) return;
      setAddModeMenuOpen(false);
      setNewModeName("");
    };
    window.addEventListener("mousedown", onDocMouseDown);
    return () => window.removeEventListener("mousedown", onDocMouseDown);
  }, [addModeMenuOpen]);

  const closeAddModeMenu = useCallback(() => {
    setAddModeMenuOpen(false);
    setNewModeName("");
  }, []);

  // Unified table header — always shown for the tree view. For single-mode
  // collections this renders one mode column; multi-mode collections render
  // one column per mode. The trailing + button adds new modes via a popover.
  const tableHeader = multiModeData && viewMode === "tree" ? (
    <div
      className="sticky top-0 z-20 bg-[var(--color-figma-bg-secondary)]"
      style={{ display: "grid", gridTemplateColumns: gridTemplate }}
    >
      <div className="sticky left-0 z-[1] min-w-0 px-2 py-1 flex items-center gap-1 bg-[var(--color-figma-bg-secondary)]">
        {collections.length > 1 ? (
          <select
            value={multiModeDimId ?? ""}
            onChange={(e) => setMultiModeDimId(e.target.value)}
            className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1 py-0.5 text-secondary font-medium text-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
            Token
          </span>
        )}
      </div>
      {multiModeData.results.map((r, idx) => (
        <ModeColumnHeader
          key={r.optionName}
          modeName={r.optionName}
          modeIndex={idx}
          allModeNames={modeNames}
          collectionId={multiModeData.collection.id}
          serverUrl={serverUrl}
          onMutated={onModeMutated}
          connected={connected}
          width={modeColumnWidths[idx] ?? 0}
          onResize={(w) => setModeColumnWidth(idx, w)}
        />
      ))}
      <div
        ref={addModeMenuContainerRef}
        className="sticky right-0 z-20 bg-[var(--color-figma-bg-secondary)] flex items-stretch"
      >
        <button
          type="button"
          onClick={() => {
            if (addModeMenuOpen) {
              closeAddModeMenu();
              return;
            }
            setAddModeMenuOpen(true);
          }}
          disabled={!connected}
          className="w-full flex items-center justify-center text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors disabled:opacity-30"
          title="Add mode"
          aria-label="Add mode"
          aria-haspopup="menu"
          aria-expanded={addModeMenuOpen}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        {addModeMenuOpen && (
          <div
            className="absolute right-0 top-full z-30 mt-0.5 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-1"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="px-2 py-1">
              <input
                type="text"
                value={newModeName}
                onChange={(e) => setNewModeName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAddMode();
                  }
                  if (e.key === "Escape") closeAddModeMenu();
                }}
                onBlur={() => {
                  if (!newModeName.trim()) closeAddModeMenu();
                }}
                autoFocus
                disabled={addingModeSaving}
                placeholder="Mode name"
                className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-body text-[var(--color-figma-text)] outline-none"
              />
              <p className="mt-1 px-0.5 text-secondary text-[var(--color-figma-text-tertiary)]">
                Name the context this collection needs, such as Desktop, Marketing, or Dark.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Cross-collection search results
  if (crossCollectionLoading && crossCollectionResults === null) {
    return (
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        icon={<Spinner size="sm" />}
        title="Searching all collections"
        description="Matching tokens will appear here."
      />
    );
  }

  if (crossCollectionError && crossCollectionResults !== null && crossCollectionResults.length === 0) {
    return (
      <FeedbackPlaceholder
        variant="error"
        size="section"
        title="Search across collections failed"
        description={crossCollectionError}
        primaryAction={{ label: "Retry", onClick: retryCrossCollectionSearch }}
      />
    );
  }

  if (crossCollectionResults !== null) {
    if (crossCollectionResults.length === 0) {
      return (
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
                availableTypes.find((t) => t.toLowerCase().startsWith(qLower));
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
      );
    }

    return (
      <div>
        {crossCollectionSections.map(([collectionId, collectionResults]) => (
          <div key={collectionId}>
            <div className="px-2 py-1 text-secondary font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] sticky top-0 z-10">
              {collectionId}{" "}
              <span className="font-normal opacity-60">
                ({collectionResults.length})
              </span>
            </div>
            {collectionResults.map((r) => (
              <button
                key={`${r.collectionId}:${r.path}`}
                onClick={() => onNavigateToCollection?.(r.collectionId, r.path)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)]"
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
                  className="flex-1 min-w-0 font-mono text-secondary text-[var(--color-figma-text)] truncate"
                  title={r.path}
                >
                  {highlightMatch(
                    r.path,
                    searchHighlight?.nameTerms ?? [],
                  )}
                </span>
                <span
                  className={`shrink-0 text-[8px] px-1 py-0.5 rounded ${tokenTypeBadgeClass(r.entry.$type)}`}
                >
                  {r.entry.$type}
                </span>
              </button>
            ))}
          </div>
        ))}
        {(crossCollectionError || crossCollectionTotal > crossCollectionResults.length) && (
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 text-secondary text-[var(--color-figma-text-secondary)]">
              {crossCollectionError ? (
                <span className="text-[var(--color-figma-error)]">
                  {crossCollectionError}
                </span>
              ) : (
                `${crossCollectionResults.length} of ${crossCollectionTotal} shown`
              )}
            </div>
            <button
              className="shrink-0 text-secondary text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
              disabled={crossCollectionLoading}
              onClick={() => {
                if (crossCollectionError) {
                  retryCrossCollectionSearch();
                  return;
                }
                setCrossCollectionOffset(crossCollectionResults.length);
              }}
            >
              {crossCollectionLoading ? (
                <span className="inline-flex items-center gap-1">
                  <Spinner size="xs" />
                  Loading more
                </span>
              ) : crossCollectionError ? (
                "Retry"
              ) : (
                <>
                  Load{" "}
                  {Math.min(
                    CROSS_COLLECTION_PAGE_SIZE,
                    crossCollectionTotal - crossCollectionResults.length,
                  )}{" "}
                  more
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Inspect mode with no selection
  if (inspectMode && selectedNodes.length === 0) {
    return (
      <div
        ref={tableContentRef}
        className="min-w-full"
        style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
      >
        {tableHeader}
        <FeedbackPlaceholder
          variant="empty"
          title="Select a layer to inspect"
          description="Bound tokens will appear here."
          icon={<MousePointer2 size={18} strokeWidth={1.5} aria-hidden />}
        />
      </div>
    );
  }

  // JSON editor
  if (viewMode === "json") {
    return (
      <div
        ref={tableContentRef}
        className="min-w-full"
        style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
      >
        {tableHeader}
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
      </div>
    );
  }

  // Empty collection
  if (tokens.length === 0) {
    const emptyCollectionActions: FeedbackPlaceholderAction[] = [];

    if (onCreateNew) {
      emptyCollectionActions.push({
        label: "New token",
        onClick: () => onCreateNew(),
        disabled: !connected,
        tone: "primary",
      });
    }

    if (onOpenImportPanel) {
      emptyCollectionActions.push({
        label: "Import tokens",
        onClick: onOpenImportPanel,
        disabled: !connected,
        tone: "secondary",
      });
    }

    if (onExtractFromSelection && hasSelection) {
      emptyCollectionActions.push({
        label: "Extract from selection",
        onClick: onExtractFromSelection,
        disabled: !connected,
        tone: "secondary",
      });
    }

    return (
      <div
        ref={tableContentRef}
        className="min-w-full"
        style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
      >
        {tableHeader}
        <div className="flex flex-col items-center justify-center gap-3 px-3 py-3 text-center">
          <FeedbackPlaceholder
            variant="empty"
            size="section"
            className="w-full max-w-[360px]"
            icon={<Layers size={20} strokeWidth={1.5} aria-hidden />}
            title="This collection is empty"
            description={
              hasSelection
                ? "Create a token, import from a file, or extract from your Figma selection."
                : "Create a token or import tokens into this collection."
            }
            actions={emptyCollectionActions}
          />
        </div>
      </div>
    );
  }

  // Filtered empty state
  if (displayedTokens.length === 0 && filtersActive) {
    return (
      <div
        ref={tableContentRef}
        className="min-w-full"
        style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
      >
        {tableHeader}
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
      </div>
    );
  }

  // Tree view with virtual scroll
  return (
    <div
      ref={tableContentRef}
      className="min-w-full"
      style={tableMinWidth ? { minWidth: `${tableMinWidth}px` } : undefined}
    >
      {tableHeader}
      <div className="py-1">
        {zoomBreadcrumb ? (
          <div className="sticky top-0 z-10 bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary">
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
                <X size={10} strokeWidth={2} aria-hidden />
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
                <span className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">
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
          <div className="sticky top-0 z-10 flex items-center gap-0.5 px-2 py-1 bg-[var(--color-figma-bg-secondary)] text-secondary text-[var(--color-figma-text-secondary)] group/breadcrumb">
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
              <ChevronUp size={10} strokeWidth={1.5} aria-hidden />
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
                multiModeValues={getMultiModeValues(node.path)}
                gridTemplate={gridTemplate}
                getValuesForPath={getMultiModeValues}
              />
            );
          })}
        <div style={{ height: virtualBottomPad }} aria-hidden="true" />
      </div>
    </div>
  );
}
