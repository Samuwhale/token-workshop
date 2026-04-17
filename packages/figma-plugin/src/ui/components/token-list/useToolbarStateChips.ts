import { useMemo } from "react";

export interface ToolbarStateChip {
  key: string;
  label: string;
  tone: "filter" | "view";
  onRemove?: () => void;
}

interface StructuredFilterChip {
  token: string;
  label: string;
}

interface ToolbarStateChipsConfig {
  structuredFilterChips: StructuredFilterChip[];
  removeQueryToken: (token: string) => void;
  sortOrder: string;
  setSortOrder: (v: "default" | "alpha-asc" | "by-type") => void;
  refFilter: "all" | "aliases" | "direct";
  setRefFilter: (v: "all" | "aliases" | "direct") => void;
  showDuplicates: boolean;
  setShowDuplicates: (v: boolean) => void;
  showIssuesOnly?: boolean;
  onToggleIssuesOnly?: () => void;
  lintViolationsLength: number;
  showRecentlyTouched: boolean;
  setShowRecentlyTouched: (v: boolean) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  inspectMode: boolean;
  setInspectMode: (v: boolean) => void;
  crossCollectionSearch: boolean;
  setCrossCollectionSearch: (v: boolean) => void;
  multiModeEnabled: boolean;
  multiModeDimensionName: string | null;
  toggleMultiMode: () => void;
  modeLensEnabled: boolean;
  setModeLensEnabled: (v: boolean) => void;
  condensedView: boolean;
  setCondensedView: (v: boolean) => void;
  showPreviewSplit: boolean;
  onTogglePreviewSplit?: () => void;
  showFlatSearchResults: boolean;
  setSearchResultPresentation: (v: "grouped" | "flat") => void;
  activeFilterCount: number;
}

export function useToolbarStateChips(config: ToolbarStateChipsConfig) {
  const {
    structuredFilterChips, removeQueryToken, sortOrder, setSortOrder,
    refFilter, setRefFilter, showDuplicates, setShowDuplicates,
    showIssuesOnly, onToggleIssuesOnly, lintViolationsLength,
    showRecentlyTouched, setShowRecentlyTouched, typeFilter, setTypeFilter,
    inspectMode, setInspectMode, crossCollectionSearch, setCrossCollectionSearch,
    multiModeEnabled, multiModeDimensionName, toggleMultiMode,
    modeLensEnabled, setModeLensEnabled, condensedView, setCondensedView,
    showPreviewSplit, onTogglePreviewSplit, showFlatSearchResults,
    setSearchResultPresentation, activeFilterCount,
  } = config;

  const viewOptionsActiveCount = useMemo(() => {
    let count = activeFilterCount;
    if (sortOrder !== "default") count += 1;
    if (inspectMode) count += 1;
    if (crossCollectionSearch) count += 1;
    if (multiModeEnabled) count += 1;
    if (modeLensEnabled) count += 1;
    if (condensedView) count += 1;
    if (showPreviewSplit) count += 1;
    if (showFlatSearchResults) count += 1;
    return count;
  }, [
    activeFilterCount, condensedView, crossCollectionSearch, inspectMode,
    multiModeEnabled, modeLensEnabled, showFlatSearchResults,
    showPreviewSplit, sortOrder,
  ]);

  const activeFilterSummary = useMemo(() => {
    const items: string[] = [];
    if (sortOrder !== "default")
      items.push(sortOrder === "alpha-asc" ? "Sorted A to Z" : "Sorted by type");
    if (refFilter !== "all")
      items.push(refFilter === "aliases" ? "Alias tokens only" : "Direct values only");
    if (showDuplicates) items.push("Duplicate values");
    if (showIssuesOnly)
      items.push(
        lintViolationsLength > 0
          ? `Issues only (${lintViolationsLength})`
          : "Issues only",
      );
    if (showRecentlyTouched) items.push("Recently touched");
    if (typeFilter !== "") items.push(`Type: ${typeFilter}`);
    if (inspectMode) items.push("Bound to selection");
    if (crossCollectionSearch) items.push("Search all collections");
    return items;
  }, [
    crossCollectionSearch, inspectMode, lintViolationsLength, refFilter,
    showDuplicates, showIssuesOnly, showRecentlyTouched, sortOrder, typeFilter,
  ]);

  const toolbarStateChips = useMemo(() => {
    const chips: ToolbarStateChip[] = [];

    for (const chip of structuredFilterChips) {
      chips.push({
        key: `query:${chip.token}`,
        label: chip.label,
        tone: "filter",
        onRemove: () => removeQueryToken(chip.token),
      });
    }

    if (sortOrder !== "default") {
      chips.push({
        key: `sort:${sortOrder}`,
        label: sortOrder === "alpha-asc" ? "Sorted A to Z" : "Sorted by type",
        tone: "view",
        onRemove: () => setSortOrder("default"),
      });
    }
    if (refFilter !== "all") {
      chips.push({
        key: `refs:${refFilter}`,
        label: refFilter === "aliases" ? "Alias tokens only" : "Direct values only",
        tone: "filter",
        onRemove: () => setRefFilter("all"),
      });
    }
    if (showDuplicates) {
      chips.push({
        key: "duplicates",
        label: "Duplicate values",
        tone: "filter",
        onRemove: () => setShowDuplicates(false),
      });
    }
    if (showIssuesOnly && onToggleIssuesOnly) {
      chips.push({
        key: "issues-only",
        label:
          lintViolationsLength > 0
            ? `Issues only (${lintViolationsLength})`
            : "Issues only",
        tone: "filter",
        onRemove: onToggleIssuesOnly,
      });
    }
    if (showRecentlyTouched) {
      chips.push({
        key: "recent",
        label: "Recently touched",
        tone: "filter",
        onRemove: () => setShowRecentlyTouched(false),
      });
    }
    if (typeFilter !== "") {
      chips.push({
        key: `type:${typeFilter}`,
        label: `Type: ${typeFilter}`,
        tone: "filter",
        onRemove: () => setTypeFilter(""),
      });
    }
    if (inspectMode) {
      chips.push({
        key: "inspect",
        label: "Bound to selection",
        tone: "filter",
        onRemove: () => setInspectMode(false),
      });
    }
    if (crossCollectionSearch) {
      chips.push({
        key: "cross-set",
        label: "Search all collections",
        tone: "filter",
        onRemove: () => setCrossCollectionSearch(false),
      });
    }
    if (multiModeEnabled) {
      chips.push({
        key: "view:modes",
        label:
          multiModeDimensionName
            ? `Mode columns: ${multiModeDimensionName}`
            : "Mode columns",
        tone: "view",
        onRemove: toggleMultiMode,
      });
    }
    if (modeLensEnabled) {
      chips.push({
        key: "view:mode-values",
        label: "Resolved values",
        tone: "view",
        onRemove: () => setModeLensEnabled(false),
      });
    }
    if (condensedView) {
      chips.push({
        key: "view:condensed",
        label: "Condensed rows",
        tone: "view",
        onRemove: () => setCondensedView(false),
      });
    }
    if (showPreviewSplit && onTogglePreviewSplit) {
      chips.push({
        key: "view:split",
        label: "Preview pane",
        tone: "view",
        onRemove: onTogglePreviewSplit,
      });
    }
    if (showFlatSearchResults) {
      chips.push({
        key: "view:flat-results",
        label: "Flat search results",
        tone: "view",
        onRemove: () => setSearchResultPresentation("grouped"),
      });
    }

    return chips;
  }, [
    condensedView, crossCollectionSearch, inspectMode, lintViolationsLength,
    multiModeDimensionName, multiModeEnabled, onToggleIssuesOnly,
    onTogglePreviewSplit, refFilter, removeQueryToken, setCondensedView,
    setCrossCollectionSearch, setInspectMode, setRefFilter,
    setSearchResultPresentation, setModeLensEnabled, setShowDuplicates,
    setShowRecentlyTouched, setSortOrder, setTypeFilter, showDuplicates,
    showFlatSearchResults, showIssuesOnly, showPreviewSplit,
    showRecentlyTouched, sortOrder, structuredFilterChips, modeLensEnabled,
    toggleMultiMode, typeFilter,
  ]);

  return {
    viewOptionsActiveCount,
    activeFilterSummary,
    toolbarStateChips,
  };
}
