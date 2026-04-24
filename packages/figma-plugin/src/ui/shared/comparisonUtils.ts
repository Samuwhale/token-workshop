import type { TokenCollection } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { applyModeSelectionsToTokens } from "./collectionModeUtils";
import { downloadBlob } from "./utils";

export interface ModeComparisonOption {
  collectionId: string;
  optionName: string;
}

export function resolveModeOption(
  option: ModeComparisonOption | null,
  collections: TokenCollection[],
  allTokensFlat: Record<string, TokenMapEntry>,
  pathToCollectionId: Record<string, string>,
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>,
): Record<string, TokenMapEntry> {
  const getScopedTokens = (collectionId: string) => {
    const collectionFlat = perCollectionFlat?.[collectionId];
    if (!collectionFlat) {
      return {
        flatTokens: allTokensFlat,
        flatPathToCollectionId: pathToCollectionId,
      };
    }

    return {
      flatTokens: {
        ...allTokensFlat,
        ...collectionFlat,
      },
      flatPathToCollectionId: {
        ...pathToCollectionId,
        ...Object.fromEntries(
          Object.keys(collectionFlat).map((path) => [path, collectionId]),
        ),
      },
    };
  };

  if (!option) {
    return applyModeSelectionsToTokens(
      allTokensFlat,
      collections,
      {},
      pathToCollectionId,
    );
  }
  const { flatTokens, flatPathToCollectionId } = getScopedTokens(
    option.collectionId,
  );

  return applyModeSelectionsToTokens(
    flatTokens,
    collections,
    {
      [option.collectionId]: option.optionName,
    },
    flatPathToCollectionId,
  );
}

export function exportCsvFile(filename: string, rows: string[][]): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = rows.map((row) => row.map(esc).join(",")).join("\n");
  downloadBlob(new Blob([csv], { type: "text/csv" }), filename);
}

export async function copyToClipboard(
  text: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    onSuccess?.();
  } catch (err) {
    console.warn("[clipboard] write failed:", err);
    onError?.(err);
  }
}
