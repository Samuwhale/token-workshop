import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  Layers,
  MousePointer2,
  Plus,
  Settings2,
  X,
} from "lucide-react";
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
import { useModeColumnWidths } from "../../hooks/useModeColumnWidths";
import { Button, TextInput } from "../../primitives";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  addCollectionMode,
  DUPLICATE_MODE_NAME_MESSAGE,
  EMPTY_MODE_SOURCE,
  MODE_STARTING_VALUES_LABEL,
  formatModeCopyOption,
  getDefaultModeSourceName,
  getModeSourcePayloadValue,
  isModeNameTaken,
} from "../../shared/collectionModes";
import { getErrorMessage } from "../../shared/utils";
import { AUTHORING } from "../../shared/editorClasses";
import { getCollectionDisplayName } from "../../shared/libraryCollections";

type VisibleTokenRow = {
  node: TokenNode;
  depth: number;
  ancestorPathLabel?: string;
};

interface CrossCollectionResult {
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
  searchQuery: string;
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
  active: boolean;
  hasCriteria: boolean;
  loading: boolean;
  error: string | null;
  results: CrossCollectionResult[] | null;
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
  onManageCollectionModes?: (collectionId: string) => void;
  onCreateNew?: (initialPath?: string) => void;
  onCreateGroup?: () => void;
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

  selectionActive: boolean;
  inspectMode: boolean;
  selectedNodes: { id: string }[];
  tokens: TokenNode[];
  displayedTokens: TokenNode[];
  selectedPaths: Set<string>;
  displayedLeafPaths: Set<string>;
  onSelectAll: () => void;
  sortOrder: string;
  connected: boolean;
  siblingOrderMap: Map<string, string[]>;
  showRecentlyTouched: boolean;
  showFlatSearchResults: boolean;
  lintViolationsMap: Map<string, LintViolation[]>;
  expandedChains: Set<string>;
  handleMoveTokenInGroup: (path: string, name: string, dir: "up" | "down") => void;
  clearFilters: () => void;
  collectionDisplayNames?: Record<string, string>;
}

const EMPTY_LINT_VIOLATIONS: LintViolation[] = [];
export function TokenListTreeBody(props: TokenListTreeBodyProps) {
  const {
    viewMode,
    jsonEditorProps,
    selectionActive,
    inspectMode,
    selectedNodes,
    tokens,
    displayedTokens,
    selectedPaths,
    displayedLeafPaths,
    onSelectAll,
    sortOrder,
    connected,
    siblingOrderMap,
    showRecentlyTouched,
    showFlatSearchResults,
    lintViolationsMap,
    expandedChains,
    handleMoveTokenInGroup,
    clearFilters,
    collectionDisplayNames,
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
    active: crossCollectionActive,
    hasCriteria: hasCrossCollectionCriteria,
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
    onCreateGroup,
    onOpenImportPanel,
    onExtractFromSelection,
    hasSelection,
  } = props.navigation;

  const [newModeName, setNewModeName] = useState("");
  const [newModeSourceName, setNewModeSourceName] =
    useState(EMPTY_MODE_SOURCE);
  const [addModeError, setAddModeError] = useState("");
  const [addingModeSaving, setAddingModeSaving] = useState(false);
  const [addModeMenuOpen, setAddModeMenuOpen] = useState(false);
  const addModeMenuContainerRef = useRef<HTMLDivElement>(null);
  const addModeTriggerRef = useRef<HTMLButtonElement>(null);
  const addModeInputRef = useRef<HTMLInputElement>(null);
  const addModeTargetId = multiModeData?.collection.id ?? null;
  const modeNames = useMemo(
    () => multiModeData?.results.map((result) => result.optionName) ?? [],
    [multiModeData?.results],
  );
  const defaultModeSourceName = getDefaultModeSourceName(modeNames);
  useEffect(() => {
    setNewModeSourceName((current) =>
      modeNames.includes(current)
        ? current
        : defaultModeSourceName,
    );
  }, [defaultModeSourceName, modeNames]);

  const handleAddMode = useCallback(async () => {
    const name = newModeName.trim();
    if (!name || !addModeTargetId) return;
    if (isModeNameTaken(modeNames, name)) {
      setAddModeError(DUPLICATE_MODE_NAME_MESSAGE);
      return;
    }
    setAddingModeSaving(true);
    setAddModeError("");
    try {
      await addCollectionMode({
        serverUrl,
        collectionId: addModeTargetId,
        name,
        sourceModeName: getModeSourcePayloadValue(newModeSourceName),
      });
      setNewModeName("");
      setNewModeSourceName(defaultModeSourceName);
      setAddModeError("");
      setAddModeMenuOpen(false);
      onModeMutated?.();
    } catch (error) {
      setAddModeError(getErrorMessage(error, "Could not add this mode."));
    } finally {
      setAddingModeSaving(false);
    }
  }, [
    addModeTargetId,
    modeNames,
    newModeName,
    newModeSourceName,
    defaultModeSourceName,
    onModeMutated,
    serverUrl,
  ]);

  const widthsCollectionId = multiModeData?.collection.id ?? null;
  const {
    widths: modeColumnWidths,
    setWidth: setModeColumnWidth,
    resetWidth: resetModeColumnWidth,
  } = useModeColumnWidths(widthsCollectionId, modeNames);
  const gridTemplate = getGridTemplate(modeColumnWidths);
  const tableMinWidth = multiModeData
    ? getGridMinWidth(modeColumnWidths)
    : null;
  const treeTableStyle =
    tableMinWidth && viewMode === "tree"
      ? { minWidth: `${tableMinWidth}px` }
      : undefined;
  const visibleSelectedCount = useMemo(
    () => [...displayedLeafPaths].filter((path) => selectedPaths.has(path)).length,
    [displayedLeafPaths, selectedPaths],
  );
  const allDisplayedSelected =
    displayedLeafPaths.size > 0 &&
    visibleSelectedCount === displayedLeafPaths.size;
  const partiallyDisplayedSelected =
    visibleSelectedCount > 0 && !allDisplayedSelected;
  const crossCollectionSections = useMemo(() => {
    if (!crossCollectionResults) {
      return [];
    }
    const sections = new Map<string, CrossCollectionResult[]>();
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
      setNewModeSourceName(defaultModeSourceName);
      setAddModeError("");
    };
    window.addEventListener("mousedown", onDocMouseDown);
    return () => window.removeEventListener("mousedown", onDocMouseDown);
  }, [addModeMenuOpen, defaultModeSourceName]);

  const closeAddModeMenu = useCallback(() => {
    setAddModeMenuOpen(false);
    setNewModeName("");
    setNewModeSourceName(defaultModeSourceName);
    setAddModeError("");
  }, [defaultModeSourceName]);
  useFocusTrap(addModeMenuContainerRef, {
    enabled: addModeMenuOpen,
    initialFocusRef: addModeInputRef,
  });

  // Unified table header — always shown for the tree view. Mode columns keep
  // readable widths and intentionally overflow horizontally when space is tight.
  const tableHeader = multiModeData && viewMode === "tree" ? (
    <div
      className="tm-token-table__header bg-[var(--color-figma-bg-secondary)]"
      style={{ display: "grid", gridTemplateColumns: gridTemplate }}
    >
      <div
        ref={addModeMenuContainerRef}
        className="tm-token-table__token-header sticky left-0 z-[1] min-w-0 bg-[var(--color-figma-bg-secondary)]"
      >
        {!selectionActive ? (
          <input
            type="checkbox"
            checked={allDisplayedSelected}
            disabled={displayedLeafPaths.size === 0}
            ref={(element) => {
              if (element) {
                element.indeterminate = partiallyDisplayedSelected;
              }
            }}
            onChange={onSelectAll}
            aria-label={
              allDisplayedSelected
                ? "Clear visible token selection"
                : "Select all visible tokens"
            }
            className="tm-token-selection-checkbox shrink-0"
          />
        ) : null}
        <span className="min-w-0 flex-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          Token
        </span>
        <div className="tm-token-table__header-actions">
          <Button
            ref={addModeTriggerRef}
            onClick={() => {
              if (addModeMenuOpen) {
                closeAddModeMenu();
                return;
              }
              setAddModeMenuOpen(true);
              setAddModeError("");
            }}
            disabled={!connected}
            variant="ghost"
            size="sm"
            className="tm-token-table__header-action tm-token-table__add-mode text-[color:var(--color-figma-text-secondary)]"
            title={
              connected
                ? "Add mode"
                : "Connect to the token library before adding modes"
            }
            aria-label="Add mode"
            aria-controls={
              addModeMenuOpen ? "token-table-add-mode-dialog" : undefined
            }
            aria-haspopup="dialog"
            aria-expanded={addModeMenuOpen}
          >
            <Plus size={12} strokeWidth={2} aria-hidden />
          </Button>
          {props.navigation.onManageCollectionModes ? (
            <Button
              onClick={() =>
                props.navigation.onManageCollectionModes?.(
                  multiModeData.collection.id,
                )
              }
              disabled={!connected}
              variant="ghost"
              size="sm"
              className="tm-token-table__header-action text-[color:var(--color-figma-text-secondary)]"
              title={
                connected
                  ? "Edit modes"
                  : "Connect to the token library before managing modes"
              }
              aria-label="Edit modes"
            >
              <Settings2 size={12} strokeWidth={1.5} aria-hidden />
            </Button>
          ) : null}
        </div>
        {addModeMenuOpen && (
          <div
            id="token-table-add-mode-dialog"
            className="absolute right-2 top-full z-30 mt-0.5 w-52 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-[var(--shadow-popover)]"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Add mode"
            onKeyDown={(event) => {
              if (event.key !== "Escape") {
                return;
              }
              event.preventDefault();
              closeAddModeMenu();
              requestAnimationFrame(() => addModeTriggerRef.current?.focus());
            }}
          >
            <div className="flex flex-col gap-2 px-2 py-2">
              <label
                htmlFor="token-table-new-mode-name"
                className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]"
              >
                Add mode
              </label>
              <TextInput
                id="token-table-new-mode-name"
                ref={addModeInputRef}
                size="sm"
                value={newModeName}
                onChange={(e) => {
                  setNewModeName(e.target.value);
                  setAddModeError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAddMode();
                  }
                  if (e.key === "Escape") closeAddModeMenu();
                }}
                onBlur={(event) => {
                  if (
                    addModeMenuContainerRef.current?.contains(
                      event.relatedTarget as Node | null,
                    )
                  ) {
                    return;
                  }
                  if (!newModeName.trim()) closeAddModeMenu();
                }}
                autoFocus
                disabled={addingModeSaving}
                placeholder="Mode name"
                aria-label="New mode name"
                invalid={Boolean(addModeError)}
                className={
                  addModeError ? "" : "focus-visible:border-[var(--color-figma-accent)]"
                }
              />
              {addModeError ? (
                <p className="px-0.5 text-secondary text-[color:var(--color-figma-text-error)]">
                  {addModeError}
                </p>
              ) : (
                <>
                  {modeNames.length > 0 ? (
                    <label className="flex flex-col gap-1 px-0.5 text-secondary text-[color:var(--color-figma-text-secondary)]">
                      {MODE_STARTING_VALUES_LABEL}
                      <select
                        value={newModeSourceName}
                        onChange={(event) =>
                          setNewModeSourceName(event.target.value)
                        }
                        disabled={addingModeSaving}
                        className={AUTHORING.select}
                      >
                        {modeNames.map((modeName) => (
                          <option key={modeName} value={modeName}>
                            {formatModeCopyOption(modeName)}
                          </option>
                        ))}
                        <option value={EMPTY_MODE_SOURCE}>Leave empty</option>
                      </select>
                    </label>
                  ) : null}
                  <p className="px-0.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                    {tokens.length === 0
                      ? "New tokens in this collection will include this mode."
                      : newModeSourceName === EMPTY_MODE_SOURCE
                        ? "Existing tokens in this collection will show this mode with no value until each one is filled."
                        : `Existing tokens in this collection will start with editable copies of their ${newModeSourceName} values.`}
                  </p>
                </>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={closeAddModeMenu}
                  disabled={addingModeSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleAddMode()}
                  disabled={!newModeName.trim() || addingModeSaving}
                >
                  Add mode
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      {multiModeData.results.map((r, idx) => (
        <ModeColumnHeader
          key={r.optionName}
          modeName={r.optionName}
          width={modeColumnWidths[idx] ?? 0}
          hasLeadingResizeHandle={idx === 0}
          onResize={(w) => setModeColumnWidth(idx, w)}
          onReset={() => resetModeColumnWidth(idx)}
        />
      ))}
    </div>
  ) : null;
  const breadcrumbBar = zoomBreadcrumb ? (
    <div className="bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-secondary">
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomUpOneLevel}
          disabled={!zoomParentPath}
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)] disabled:cursor-default disabled:opacity-40"
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
          className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
          title="Clear the scoped branch (Esc)"
        >
          <X size={10} strokeWidth={2} aria-hidden />
          <span>All tokens</span>
        </button>
        <div className="min-w-0 flex flex-wrap items-center gap-0.5">
          {zoomBreadcrumb.map((seg, i) => (
            <span
              key={seg.path}
              className="flex min-w-0 items-center gap-0.5"
            >
              {i > 0 && <span className="mx-0.5 opacity-40">›</span>}
              {i < zoomBreadcrumb.length - 1 ? (
                <button
                  className="min-w-0 max-w-full text-left text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:underline [overflow-wrap:anywhere]"
                  title={seg.path}
                  onClick={() => handleZoomToAncestor(seg.path)}
                >
                  {seg.name}
                </button>
              ) : (
                <span
                  className="min-w-0 max-w-full font-medium text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]"
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
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="shrink-0 text-secondary text-[color:var(--color-figma-text-tertiary)]">
            Other branches
          </span>
          {zoomSiblingBranches.map((branch) => (
            <button
              key={branch.path}
              onClick={() => handleZoomToAncestor(branch.path)}
              className="min-w-0 max-w-full text-left text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:underline [overflow-wrap:anywhere]"
              title={`Scope to ${branch.path}`}
            >
              {branch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  ) : !showFlatSearchResults && breadcrumbSegments.length > 0 ? (
    <div className="flex flex-wrap items-center gap-0.5 bg-[var(--color-figma-bg-secondary)] px-2 py-1 text-secondary text-[color:var(--color-figma-text-secondary)]">
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
        className="mr-0.5 shrink-0 opacity-40"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      {breadcrumbSegments.map((seg, i) => (
        <span key={seg.path} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <span className="mx-0.5 opacity-40">›</span>}
          {i < breadcrumbSegments.length - 1 ? (
            <button
              className="min-w-0 max-w-full text-left hover:text-[color:var(--color-figma-text)] hover:underline [overflow-wrap:anywhere]"
              title={`Jump to ${seg.path}`}
              onClick={() => handleJumpToGroup(seg.path)}
            >
              {seg.name}
            </button>
          ) : (
            <span
              className="min-w-0 max-w-full font-medium text-[color:var(--color-figma-text)] [overflow-wrap:anywhere]"
              title={seg.path}
            >
              {seg.name}
            </span>
          )}
        </span>
      ))}
      <button
        className="ml-auto flex shrink-0 items-center gap-0.5 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]"
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
  ) : null;
  const stickyTreeHeader =
    tableHeader || breadcrumbBar ? (
      <div className="sticky top-0 z-20 flex flex-col bg-[var(--color-figma-bg-secondary)]">
        {tableHeader}
        {breadcrumbBar}
      </div>
    ) : null;

  // Cross-collection search results
  if (
    crossCollectionActive &&
    !hasCrossCollectionCriteria &&
    crossCollectionResults === null
  ) {
    return (
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        title="Search all collections"
        description="Search by name, value, type, or filter."
      />
    );
  }

  if (crossCollectionLoading && crossCollectionResults === null) {
    return (
      <FeedbackPlaceholder
        variant="empty"
        size="section"
        icon={<Spinner size="sm" />}
        title="Searching all collections"
        description="Results will appear here."
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
            description="Try a broader search or search one collection."
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
                    <Button
                      onClick={() => {
                        setSearchQuery("");
                        setTypeFilter(matchingType);
                      }}
                      variant="secondary"
                      size="sm"
                      className="max-w-full"
                    >
                      Filter by type: {matchingType}{" "}
                      <span aria-hidden="true">&rarr;</span>
                    </Button>
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
        {crossCollectionSections.map(([collectionId, collectionResults]) => {
          const collectionLabel = getCollectionDisplayName(
            collectionId,
            collectionDisplayNames,
          );
          return (
          <div key={collectionId}>
            <div
              className="px-2 py-1 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] sticky top-0 z-10"
              title={collectionId === collectionLabel ? undefined : collectionId}
            >
              {collectionLabel}{" "}
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
                  className="flex-1 min-w-0 font-mono text-secondary text-[color:var(--color-figma-text)] truncate"
                  title={r.path}
                >
                  {highlightMatch(
                    r.path,
                    searchHighlight?.nameTerms ?? [],
                  )}
                </span>
                <span
                  className={`shrink-0 text-[var(--font-size-xs)] px-1 py-0.5 rounded ${tokenTypeBadgeClass(r.entry.$type)}`}
                >
                  {r.entry.$type}
                </span>
              </button>
            ))}
          </div>
          );
        })}
        {(crossCollectionError || crossCollectionTotal > crossCollectionResults.length) && (
          <div className="px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 text-secondary text-[color:var(--color-figma-text-secondary)]">
              {crossCollectionError ? (
                <span className="text-[color:var(--color-figma-text-error)]">
                  {crossCollectionError}
                </span>
              ) : (
                `${crossCollectionResults.length} of ${crossCollectionTotal} shown`
              )}
            </div>
            <button
              className="shrink-0 text-secondary text-[color:var(--color-figma-text-accent)] hover:underline disabled:opacity-50"
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
      <div className="min-w-0" style={treeTableStyle}>
        {tableHeader}
        <FeedbackPlaceholder
          variant="empty"
          title="Select a layer to inspect"
          description="Bound tokens appear here."
          icon={<MousePointer2 size={18} strokeWidth={1.5} aria-hidden />}
        />
      </div>
    );
  }

  // JSON editor
  if (viewMode === "json") {
    return (
      <div className="min-w-0" style={treeTableStyle}>
        {tableHeader}
        <JsonEditorView
          jsonText={jsonEditorProps.jsonText}
          jsonDirty={jsonEditorProps.jsonDirty}
          jsonError={jsonEditorProps.jsonError}
          jsonSaving={jsonEditorProps.jsonSaving}
          jsonBrokenRefs={jsonEditorProps.jsonBrokenRefs}
          jsonTextareaRef={jsonEditorProps.jsonTextareaRef}
          searchQuery={jsonEditorProps.searchQuery}
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
        label: "Create token",
        onClick: () => onCreateNew(),
        disabled: !connected,
        tone: "primary",
      });
    }

    if (onCreateGroup) {
      emptyCollectionActions.push({
        label: "Create group",
        onClick: onCreateGroup,
        disabled: !connected,
        tone: "secondary",
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
      <div className="min-w-0" style={treeTableStyle}>
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
                ? "Add a token, import tokens, or extract selected layer values."
                : "Add a token or import tokens."
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
      <div className="min-w-0" style={treeTableStyle}>
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
      className="min-w-full"
      style={treeTableStyle}
      role="tree"
      aria-label="Token tree"
      aria-multiselectable="true"
    >
      {stickyTreeHeader}
      <div className="py-1">
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
