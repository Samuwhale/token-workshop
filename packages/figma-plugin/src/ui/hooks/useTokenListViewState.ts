import { useState, useCallback, useEffect } from "react";
import { STORAGE_KEY_BUILDERS, STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { VIRTUAL_ITEM_HEIGHT } from "../components/tokenListTypes";
import type { SortOrder } from "../components/tokenListUtils";
import type { TokenGroupBy } from "../components/tokenListTypes";
import type { TokenCollection } from "@tokenmanager/core";

const VALID_SORT_ORDERS: SortOrder[] = ["default", "alpha-asc", "by-type"];
const VALID_GROUP_BY: TokenGroupBy[] = ["path", "type"];

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
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);

  const [viewMode, setViewModeState] = useState<"tree" | "json">("tree");
  const [groupBy, setGroupByState] = useState<TokenGroupBy>("path");

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

  useEffect(() => {
    const stored = lsGet(STORAGE_KEY_BUILDERS.tokenGroupBy(collectionId));
    setGroupByState(
      VALID_GROUP_BY.includes(stored as TokenGroupBy)
        ? (stored as TokenGroupBy)
        : "path",
    );
  }, [collectionId]);

  const setGroupBy = useCallback(
    (value: TokenGroupBy) => {
      setGroupByState(value);
      lsSet(STORAGE_KEY_BUILDERS.tokenGroupBy(collectionId), value);
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

  const rowHeight = VIRTUAL_ITEM_HEIGHT;

  // Mode columns are always shown — one column per mode. For single-mode
  // collections this is one column; multi-mode collections get N.
  const [multiModeDimId, setMultiModeDimId] = useState<string | null>(null);

  useEffect(() => {
    const activeCollection = collections.find((c) => c.id === collectionId);
    if (activeCollection) {
      setMultiModeDimId(collectionId);
      return;
    }
    setMultiModeDimId(collections[0]?.id ?? null);
  }, [collectionId, collections]);

  return {
    showRecentlyTouched,
    setShowRecentlyTouched,
    showStarredOnly,
    setShowStarredOnly,
    inspectMode,
    setInspectMode,
    viewMode,
    setViewMode,
    groupBy,
    setGroupBy,
    sortOrder,
    setSortOrder,
    showResolvedValues,
    setShowResolvedValues,
    statsBarOpen,
    setStatsBarOpen,
    rowHeight,
    multiModeDimId,
    setMultiModeDimId,
  };
}
