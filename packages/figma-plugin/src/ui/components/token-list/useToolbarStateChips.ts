import { useMemo } from "react";

export interface ToolbarStateChip {
  key: string;
  label: string;
  onRemove?: () => void;
}

interface StructuredFilterChip {
  token: string;
  label: string;
}

interface ToolbarStateChipsConfig {
  structuredFilterChips: StructuredFilterChip[];
  removeQueryToken: (token: string) => void;
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
}

export function useToolbarStateChips(config: ToolbarStateChipsConfig) {
  const {
    structuredFilterChips, removeQueryToken,
    refFilter, setRefFilter, showDuplicates, setShowDuplicates,
    showIssuesOnly, onToggleIssuesOnly, lintViolationsLength,
    showRecentlyTouched, setShowRecentlyTouched,
    showStarredOnly, setShowStarredOnly,
    typeFilter, setTypeFilter,
    inspectMode, setInspectMode,
  } = config;

  const toolbarStateChips = useMemo(() => {
    const chips: ToolbarStateChip[] = [];

    for (const chip of structuredFilterChips) {
      chips.push({
        key: `query:${chip.token}`,
        label: chip.label,
        onRemove: () => removeQueryToken(chip.token),
      });
    }

    if (refFilter !== "all") {
      chips.push({
        key: `refs:${refFilter}`,
        label:
          refFilter === "aliases" ? "Alias references" : "Literal values",
        onRemove: () => setRefFilter("all"),
      });
    }
    if (showDuplicates) {
      chips.push({
        key: "duplicates",
        label: "Shared values",
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
        onRemove: onToggleIssuesOnly,
      });
    }
    if (showRecentlyTouched) {
      chips.push({
        key: "recent",
        label: "Recently touched",
        onRemove: () => setShowRecentlyTouched(false),
      });
    }
    if (showStarredOnly) {
      chips.push({
        key: "starred-only",
        label: "Starred",
        onRemove: () => setShowStarredOnly(false),
      });
    }
    if (typeFilter !== "") {
      chips.push({
        key: `type:${typeFilter}`,
        label: `Type: ${typeFilter}`,
        onRemove: () => setTypeFilter(""),
      });
    }
    if (inspectMode) {
      chips.push({
        key: "inspect",
        label: "Used on selection",
        onRemove: () => setInspectMode(false),
      });
    }

    return chips;
  }, [
    inspectMode, lintViolationsLength,
    onToggleIssuesOnly,
    refFilter, removeQueryToken,
    setInspectMode, setRefFilter, setShowDuplicates,
    setShowRecentlyTouched, setShowStarredOnly,
    setTypeFilter, showDuplicates, showIssuesOnly,
    showRecentlyTouched, showStarredOnly, structuredFilterChips,
    typeFilter,
  ]);

  return { toolbarStateChips };
}
