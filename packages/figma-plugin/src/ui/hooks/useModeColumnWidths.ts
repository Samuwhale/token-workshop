import { useCallback, useMemo, useState } from "react";
import { STORAGE_KEY_BUILDERS, lsGet, lsSet } from "../shared/storage";
import {
  DEFAULT_MODE_COL_PX,
  MAX_MODE_COL_PX,
  MIN_MODE_COL_PX,
  TOKEN_COLUMN_MIN_PX,
} from "../components/tokenListTypes";

function clampWidth(n: number, maxWidth = MAX_MODE_COL_PX): number {
  return Math.max(MIN_MODE_COL_PX, Math.min(maxWidth, n));
}

function getResponsiveModeMax(
  availableWidthPx: number | null | undefined,
  modeCount: number,
): number {
  if (!availableWidthPx || modeCount <= 0) {
    return MAX_MODE_COL_PX;
  }

  const remainingWidth =
    availableWidthPx - TOKEN_COLUMN_MIN_PX;
  if (remainingWidth <= 0) {
    return MIN_MODE_COL_PX;
  }

  return clampWidth(Math.floor(remainingWidth / modeCount));
}

function readStoredWidth(collectionId: string, modeName: string): number {
  const raw = lsGet(STORAGE_KEY_BUILDERS.modeColumnWidth(collectionId, modeName));
  if (raw === null) return DEFAULT_MODE_COL_PX;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT_MODE_COL_PX;
  return clampWidth(n);
}

export interface UseModeColumnWidthsResult {
  widths: number[];
  setWidth: (index: number, width: number) => void;
}

export function useModeColumnWidths(
  collectionId: string | null,
  modeNames: string[],
  availableWidthPx?: number | null,
): UseModeColumnWidthsResult {
  const [overrides, setOverrides] = useState<
    Record<string, Record<string, number>>
  >({});

  const responsiveModeMax = useMemo(
    () => getResponsiveModeMax(availableWidthPx, modeNames.length),
    [availableWidthPx, modeNames.length],
  );

  const widths = !collectionId
    ? modeNames.map(() => clampWidth(DEFAULT_MODE_COL_PX, responsiveModeMax))
    : modeNames.map((name) =>
        clampWidth(
          overrides[collectionId]?.[name] ?? readStoredWidth(collectionId, name),
          responsiveModeMax,
        ),
      );

  const setWidth = useCallback(
    (index: number, width: number) => {
      if (!collectionId) return;
      const modeName = modeNames[index];
      if (!modeName) return;
      const clamped = clampWidth(width);
      lsSet(
        STORAGE_KEY_BUILDERS.modeColumnWidth(collectionId, modeName),
        String(clamped),
      );
      setOverrides((prev) => ({
        ...prev,
        [collectionId]: { ...(prev[collectionId] ?? {}), [modeName]: clamped },
      }));
    },
    [collectionId, modeNames],
  );

  return { widths, setWidth };
}
