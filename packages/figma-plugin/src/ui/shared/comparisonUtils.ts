import type { TokenCollection } from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";
import { resolveTokensForModeProjection } from "./collectionModeUtils";
import { downloadBlob } from "./utils";

export interface ModeComparisonTarget {
  collectionId: string;
  modeName: string;
}

export function resolveModeComparisonTarget(
  target: ModeComparisonTarget | null,
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

  if (!target) {
    return resolveTokensForModeProjection(
      allTokensFlat,
      collections,
      {},
      pathToCollectionId,
    );
  }
  const { flatTokens, flatPathToCollectionId } = getScopedTokens(
    target.collectionId,
  );

  return resolveTokensForModeProjection(
    flatTokens,
    collections,
    {
      [target.collectionId]: target.modeName,
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
