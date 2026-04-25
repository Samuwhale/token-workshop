import { useMemo } from "react";
import {
  buildGraph,
  type GraphModel,
  type GraphValidationIssue,
  type TokenCollection,
  type TokenGenerator,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import { projectTokenEntriesToGraphTokens } from "../shared/graphTokens";

interface UseGraphDataParams {
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  generators: TokenGenerator[];
  derivedTokenPaths: Map<string, TokenGenerator>;
  validationIssues?: GraphValidationIssue[];
}

export function useGraphData({
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
  generators,
  derivedTokenPaths,
  validationIssues,
}: UseGraphDataParams): GraphModel {
  const tokensByCollection = useMemo(
    () => projectTokenEntriesToGraphTokens(perCollectionFlat),
    [perCollectionFlat],
  );

  return useMemo(
    () =>
      buildGraph({
        collections,
        tokensByCollection,
        pathToCollectionId,
        collectionIdsByPath,
        generators,
        derivedTokenPaths,
        validationIssues,
      }),
    [
      collections,
      tokensByCollection,
      pathToCollectionId,
      collectionIdsByPath,
      generators,
      derivedTokenPaths,
      validationIssues,
    ],
  );
}
