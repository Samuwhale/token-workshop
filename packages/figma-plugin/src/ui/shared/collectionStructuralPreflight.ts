export type CollectionStructuralOperation = "delete" | "merge" | "split";

export interface CollectionResolverImpact {
  name: string;
}

export interface CollectionRecipeOwnershipImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
  tokenCount: number;
  samplePaths: string[];
}

export interface CollectionRecipeTargetImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
}

export interface CollectionPreflightImpact {
  collectionId: string;
  tokenCount: number;
  metadata: {
    description?: string;
  };
  resolverRefs: CollectionResolverImpact[];
  generatedOwnership: CollectionRecipeOwnershipImpact[];
  recipeTargets: CollectionRecipeTargetImpact[];
}

export interface CollectionPreflightBlocker {
  id: string;
  code: "generated-token-ownership" | "recipe-target-collection" | "resolver-collection-ref";
  collectionId: string;
  message: string;
  recipeId?: string;
  recipeName?: string;
}

export interface CollectionMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

export interface CollectionSplitPreviewItem {
  key: string;
  newCollectionId: string;
  count: number;
  existing: boolean;
}

export interface CollectionStructuralPreflight {
  operation: CollectionStructuralOperation;
  affectedCollections: CollectionPreflightImpact[];
  blockers: CollectionPreflightBlocker[];
  warnings: string[];
  mergeConflicts?: CollectionMergeConflict[];
  splitPreview?: CollectionSplitPreviewItem[];
}
