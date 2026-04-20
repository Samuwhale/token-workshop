import { useState, useCallback, useEffect, useMemo } from "react";
import { STORAGE_KEY_BUILDERS, STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { useSettingsListener } from "../components/SettingsPanel";
import { DENSITY_ROW_HEIGHT } from "../components/tokenListTypes";
import type { Density } from "../components/tokenListTypes";
import type { SortOrder } from "../components/tokenListUtils";
import type { TokenCollection } from "@tokenmanager/core";

const VALID_SORT_ORDERS: SortOrder[] = ["default", "alpha-asc", "by-type"];

function dispatchTokenListViewChanged(collectionId: string): void {
  window.dispatchEvent(
    new CustomEvent("tm-token-list-view-changed", { detail: { collectionId } }),
  );
}

export interface UseTokenListViewStateParams {
  collectionId: string;
  collections: TokenCollection[];
}

export function useTokenListViewState({
  collectionId,
  collections,
}: UseTokenListViewStateParams) {
  const [showRecentlyTouched, setShowRecentlyTouched] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);

  const [viewMode, setViewModeState] = useState<"tree" | "json">("tree");

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY_BUILDERS.tokenViewMode(collectionId));
    setViewModeState(stored === "json" ? "json" : "tree");
  }, [collectionId]);

  const setViewMode = useCallback(
    (mode: "tree" | "json") => {
      setViewModeState(mode);
      lsSet(STORAGE_KEY_BUILDERS.tokenViewMode(collectionId), mode);
      dispatchTokenListViewChanged(collectionId);
    },
    [collectionId],
  );

  const [sortOrder, setSortOrderState] = useState<SortOrder>("default");

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY_BUILDERS.tokenSort(collectionId));
    setSortOrderState(
      VALID_SORT_ORDERS.includes(stored as SortOrder)
        ? (stored as SortOrder)
        : "default",
    );
  }, [collectionId]);

  const setSortOrder = useCallback(
    (order: SortOrder) => {
      setSortOrderState(order);
      lsSet(STORAGE_KEY_BUILDERS.tokenSort(collectionId), order);
    },
    [collectionId],
  );

  const [showResolvedValues, setShowResolvedValuesState] = useState(false);

  useEffect(() => {
    setShowResolvedValuesState(
      lsGet(STORAGE_KEY_BUILDERS.tokenShowResolvedValues(collectionId)) === "1",
    );
  }, [collectionId]);

  const setShowResolvedValues = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setShowResolvedValuesState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        lsSet(STORAGE_KEY_BUILDERS.tokenShowResolvedValues(collectionId), next ? "1" : "0");
        dispatchTokenListViewChanged(collectionId);
        return next;
      });
    },
    [collectionId],
  );

  const [statsBarOpen, setStatsBarOpenState] = useState(
    () => lsGet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN) === "true",
  );

  const setStatsBarOpen = useCallback(
    (value: boolean | ((current: boolean) => boolean)) => {
      setStatsBarOpenState((current) => {
        const next = typeof value === "function" ? value(current) : value;
        lsSet(STORAGE_KEYS.TOKEN_STATS_BAR_OPEN, next ? "true" : "false");
        dispatchTokenListViewChanged(collectionId);
        return next;
      });
    },
    [collectionId],
  );

  const [density, setDensityState] = useState<Density>(() => {
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    return stored === "compact" ? "compact" : "comfortable";
  });

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    lsSet(STORAGE_KEYS.DENSITY, d);
  }, []);

  const densityRev = useSettingsListener(STORAGE_KEYS.DENSITY);
  useEffect(() => {
    if (densityRev === 0) return;
    const stored = lsGet(STORAGE_KEYS.DENSITY);
    setDensityState(stored === "compact" ? "compact" : "comfortable");
  }, [densityRev]);

  const rowHeight = DENSITY_ROW_HEIGHT[density];

  const [condensedView, setCondensedViewState] = useState<boolean>(
    () => lsGet(STORAGE_KEYS.CONDENSED_VIEW) === "1",
  );

  const setCondensedView = useCallback((v: boolean) => {
    setCondensedViewState(v);
    lsSet(STORAGE_KEYS.CONDENSED_VIEW, v ? "1" : "0");
  }, []);

  // Auto-enabled when active collection has 2+ modes
  const [multiModeDimId, setMultiModeDimId] = useState<string | null>(null);

  useEffect(() => {
    const activeCollection = collections.find((c) => c.id === collectionId);
    if (activeCollection && activeCollection.modes.length >= 2) {
      setMultiModeDimId(collectionId);
      return;
    }
    const firstMultiMode = collections.find((c) => c.modes.length >= 2);
    setMultiModeDimId(firstMultiMode?.id ?? null);
  }, [collectionId, collections]);

  const showModeColumns = useMemo(() => {
    if (!multiModeDimId) return false;
    const collection = collections.find((c) => c.id === multiModeDimId);
    return !!collection && collection.modes.length >= 2;
  }, [collections, multiModeDimId]);

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
    showModeColumns,
    multiModeDimId,
    setMultiModeDimId,
  };
}
