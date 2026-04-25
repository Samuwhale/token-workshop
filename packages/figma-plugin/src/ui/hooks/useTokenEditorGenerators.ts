import { useMemo } from 'react';
import {
  createGeneratorSourceKeys,
  hasGeneratorSourceKeyMatch,
} from '@tokenmanager/core';
import type { TokenGenerator } from './useGenerators';

interface UseTokenEditorGeneratorsParams {
  tokenPath: string;
  tokenCollectionId: string;
  tokenType: string;
  generators: TokenGenerator[];
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}

export function useTokenEditorGenerators({
  tokenPath,
  tokenCollectionId,
  tokenType,
  generators,
  pathToCollectionId,
  collectionIdsByPath,
}: UseTokenEditorGeneratorsParams) {
  const existingGeneratorsForToken = useMemo(() => {
    const sourceKeys = new Set(createGeneratorSourceKeys({
      sourceTokenPath: tokenPath,
      sourceCollectionId: tokenCollectionId,
      pathToCollectionId,
      collectionIdsByPath,
    }));
    if (sourceKeys.size === 0) {
      return [];
    }

    return generators.filter((generator) =>
      hasGeneratorSourceKeyMatch({
        sourceTokenPath: generator.sourceToken,
        sourceCollectionId: generator.sourceCollectionId,
        targetSourceKeys: sourceKeys,
        pathToCollectionId,
        collectionIdsByPath,
      }),
    );
  }, [
    collectionIdsByPath,
    generators,
    pathToCollectionId,
    tokenCollectionId,
    tokenPath,
  ]);
  const canBeGeneratorSource = ['color', 'dimension', 'number', 'fontSize'].includes(tokenType);

  return {
    existingGeneratorsForToken,
    canBeGeneratorSource,
  };
}
