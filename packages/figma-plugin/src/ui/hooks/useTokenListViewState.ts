import { useState, useCallback, useEffect } from "react";
import { STORAGE_KEY_BUILDERS, lsGet, lsSet } from "../shared/storage";
import { VIRTUAL_ITEM_HEIGHT } from "../components/tokenListTypes";
import type { SortOrder } from "../components/tokenListUtils";
import type { TokenGroupBy } from "../components/tokenListTypes";

const VALID_SORT_ORDERS: SortOrder[] = ["default", "alpha-asc", "by-type"];
const VALID_GROUP_BY: TokenGroupBy[] = ["path", "type"];

function dispatchTokenListViewChanged(collectionId: string): void {
  window.dispatchEvent(
    new CustomEvent("tm-token-list-view-changed", { detail: { collectionId } }),
  );
}

export interface UseTokenListViewStateParams {
  collectionId: string;
}

export function useTokenListViewState({
  collectionId,
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

  const rowHeight = VIRTUAL_ITEM_HEIGHT;

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
    rowHeight,
  };
}
