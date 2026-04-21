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
  showStarredOnly: boolean;
  setShowStarredOnly: (v: boolean | ((prev: boolean) => boolean)) => void;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  inspectMode: boolean;
  setInspectMode: (v: boolean) => void;
  crossCollectionSearch: boolean;
  setCrossCollectionSearch: (v: boolean) => void;
  showFlatSearchResults: boolean;
  setSearchResultPresentation: (v: "grouped" | "flat") => void;
}

export function useToolbarStateChips(config: ToolbarStateChipsConfig) {
  const {
    structuredFilterChips, removeQueryToken, sortOrder, setSortOrder,
    refFilter, setRefFilter, showDuplicates, setShowDuplicates,
    showIssuesOnly, onToggleIssuesOnly, lintViolationsLength,
    showRecentlyTouched, setShowRecentlyTouched,
    showStarredOnly, setShowStarredOnly,
    typeFilter, setTypeFilter,
    inspectMode, setInspectMode, crossCollectionSearch, setCrossCollectionSearch,
    showFlatSearchResults,
    setSearchResultPresentation,
  } = config;

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
    if (showStarredOnly) {
      chips.push({
        key: "starred-only",
        label: "Only starred",
        tone: "filter",
        onRemove: () => setShowStarredOnly(false),
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
        key: "cross-collection",
        label: "Search all collections",
        tone: "filter",
        onRemove: () => setCrossCollectionSearch(false),
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
    crossCollectionSearch, inspectMode, lintViolationsLength,
    onToggleIssuesOnly,
    refFilter, removeQueryToken,
    setCrossCollectionSearch, setInspectMode, setRefFilter,
    setSearchResultPresentation, setShowDuplicates,
    setShowRecentlyTouched, setShowStarredOnly,
    setSortOrder, setTypeFilter, showDuplicates,
    showFlatSearchResults, showIssuesOnly,
    showRecentlyTouched, showStarredOnly, sortOrder, structuredFilterChips,
    typeFilter,
  ]);

  return { toolbarStateChips };
}
