import { useState, useCallback, useEffect } from "react";
import { STORAGE_KEY, STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { useSettingsListener } from "../components/SettingsPanel";
import { DENSITY_ROW_HEIGHT } from "../components/tokenListTypes";
import type { Density } from "../components/tokenListTypes";
import type { SortOrder } from "../components/tokenListUtils";
import type { ThemeDimension } from "@tokenmanager/core";

const VALID_SORT_ORDERS: SortOrder[] = ["default", "alpha-asc", "by-type"];

function dispatchTokenListViewChanged(setName: string): void {
  window.dispatchEvent(
    new CustomEvent("tm-token-list-view-changed", { detail: { setName } }),
  );
}

export interface UseTokenListViewStateParams {
  setName: string;
  dimensions: ThemeDimension[];
}

export function useTokenListViewState({
  setName,
  dimensions,
}: UseTokenListViewStateParams) {
  // --- Recently touched filter ---
  const [showRecentlyTouched, setShowRecentlyTouched] = useState(false);

  // --- Inspect mode ---
  const [inspectMode, setInspectMode] = useState(false);

  // --- View mode (tree/json) ---
  const [viewMode, setViewModeState] = useState<"tree" | "json">("tree");

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY.tokenViewMode(setName));
    setViewModeState(stored === "json" ? "json" : "tree");
  }, [setName]);

  const setViewMode = useCallback(
    (mode: "tree" | "json") => {
      setViewModeState(mode);
      lsSet(STORAGE_KEY.tokenViewMode(setName), mode);
      dispatchTokenListViewChanged(setName);
    },
    [setName],
  );

  // --- Sort order ---
  const [sortOrder, setSortOrderState] = useState<SortOrder>("default");

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY.tokenSort(setName));
    setSortOrderState(
      VALID_SORT_ORDERS.includes(stored as SortOrder)
        ? (stored as SortOrder)
        : "default",
    );
  }, [setName]);

  const setSortOrder = useCallback(
    (order: SortOrder) => {
      setSortOrderState(order);
      lsSet(STORAGE_KEY.tokenSort(setName), order);
    },
    [setName],
  );

  // --- Show resolved values ---
  const [showResolvedValues, setShowResolvedValuesState] = useState(false);

  useEffect(() => {
    setShowResolvedValuesState(
      lsGet(STORAGE_KEY.tokenShowResolvedValues(setName)) === "1",
    );
  }, [setName]);

  const setShowResolvedValues = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setShowResolvedValuesState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        lsSet(STORAGE_KEY.tokenShowResolvedValues(setName), next ? "1" : "0");
        dispatchTokenListViewChanged(setName);
        return next;
      });
    },
    [setName],
  );

  // --- Stats bar ---
  const [statsBarOpen, setStatsBarOpenState] = useState(
    () => lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === "true",
  );

  const setStatsBarOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setStatsBarOpenState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        lsSet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN, next ? "true" : "false");
        dispatchTokenListViewChanged(setName);
        return next;
      });
    },
    [setName],
  );

  // --- Density ---
  const [density, setDensityState] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return stored === "compact" ? "compact" : "comfortable";
  });

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    lsSet(STORAGE_KEYS.DENSITY, d);
  }, []);

  // Sync density when changed from Settings panel
  const densityRev = useSettingsListener(STORAGE_KEYS.DENSITY);
  useEffect(() => {
    if (densityRev === 0) return;
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    setDensityState(stored === "compact" ? "compact" : "comfortable");
  }, [densityRev]);

  const rowHeight = DENSITY_ROW_HEIGHT[density];

  // --- Condensed view ---
  const [condensedView, setCondensedViewState] = useState<boolean>(
    () => lsGet(STORAGE_KEYS.CONDENSED_VIEW) === "1",
  );

  const setCondensedView = useCallback((v: boolean) => {
    setCondensedViewState(v);
    lsSet(STORAGE_KEYS.CONDENSED_VIEW, v ? "1" : "0");
  }, []);

  // --- Multi-mode column view ---
  const [multiModeEnabled, setMultiModeEnabled] = useState<boolean>(() => {
    const stored = lsGet("tm_multi_mode");
    if (stored !== null) return stored === "1";
    return dimensions.length > 0;
  });
  const [multiModeDimId, setMultiModeDimId] = useState<string | null>(null);

  const toggleMultiMode = useCallback(() => {
    setMultiModeEnabled((prev) => {
      const next = !prev;
      lsSet("tm_multi_mode", next ? "1" : "0");
      return next;
    });
  }, []);

  // Auto-enable when dimensions appear for the first time (no stored preference)
  useEffect(() => {
    if (dimensions.length > 0 && lsGet("tm_multi_mode") === null) {
      setMultiModeEnabled(true);
    }
  }, [dimensions.length]);

  // Auto-select first dimension when multi-mode is enabled and no dimension is selected
  useEffect(() => {
    if (
      multiModeEnabled &&
      dimensions.length > 0 &&
      (!multiModeDimId || !dimensions.some((d) => d.id === multiModeDimId))
    ) {
      setMultiModeDimId(dimensions[0].id);
    }
  }, [multiModeEnabled, dimensions, multiModeDimId]);

  return {
    showRecentlyTouched,
    setShowRecentlyTouched,
    inspectMode,
    setInspectMode,
    viewMode,
    setViewMode,
    sortOrder,
    setSortOrder,
    showResolvedValues,
    setShowResolvedValues,
    statsBarOpen,
    setStatsBarOpen,
    density,
    setDensity,
    rowHeight,
    condensedView,
    setCondensedView,
    multiModeEnabled,
    multiModeDimId,
    setMultiModeDimId,
    toggleMultiMode,
  };
}
