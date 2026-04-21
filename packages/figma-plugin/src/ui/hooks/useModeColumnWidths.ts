import { useCallback, useState } from "react";
import { STORAGE_KEY_BUILDERS, lsGet, lsSet } from "../shared/storage";
import {
  DEFAULT_MODE_COL_PX,
  MAX_MODE_COL_PX,
  MIN_MODE_COL_PX,
} from "../components/tokenListTypes";

function clampWidth(n: number): number {
  return Math.max(MIN_MODE_COL_PX, Math.min(MAX_MODE_COL_PX, n));
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
): UseModeColumnWidthsResult {
  const [overrides, setOverrides] = useState<
    Record<string, Record<string, number>>
  >({});

  const widths = !collectionId
    ? modeNames.map(() => DEFAULT_MODE_COL_PX)
    : modeNames.map(
        (name) =>
          overrides[collectionId]?.[name] ?? readStoredWidth(collectionId, name),
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
