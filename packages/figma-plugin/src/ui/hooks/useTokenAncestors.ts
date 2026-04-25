import { useMemo } from "react";
import {
  resolveTokenAncestors,
  type AncestorChainByMode,
  type AncestorChainRow,
  type AncestorTerminalKind,
  type TokenCollection,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { projectTokenEntriesToGraphTokens } from "../shared/graphTokens";

// Mode-aware upstream alias walker. Dependents are fetched from the server
// (see useTokenDependents); ancestors are derived locally because the server
// resolver in @tokenmanager/core is not mode-aware and we need per-mode chains
// to match the authoring surface. The walker itself lives in @tokenmanager/core
// (resolveTokenAncestors) so DetachConfirm and future server-side rules share
// the same logic.

export type { AncestorChainByMode, AncestorChainRow, AncestorTerminalKind };

interface UseTokenAncestorsParams {
  tokenPath: string;
  collectionId: string;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}

export function useTokenAncestors({
  tokenPath,
  collectionId,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
}: UseTokenAncestorsParams): { chains: AncestorChainByMode[]; isEmpty: boolean } {
  const tokensByCollection = useMemo(
    () => projectTokenEntriesToGraphTokens(perCollectionFlat),
    [perCollectionFlat],
  );

  return useMemo(
    () =>
      resolveTokenAncestors({
        tokenPath,
        collectionId,
        collections,
        tokensByCollection,
        pathToCollectionId,
        collectionIdsByPath,
      }),
    [
      tokenPath,
      collectionId,
      collections,
      tokensByCollection,
      pathToCollectionId,
      collectionIdsByPath,
    ],
  );
}
