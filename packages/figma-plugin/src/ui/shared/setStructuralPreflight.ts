export type SetStructuralOperation = "delete" | "merge" | "split";

export interface SetResolverImpact {
  name: string;
}

export interface SetRecipeOwnershipImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
  tokenCount: number;
  samplePaths: string[];
}

export interface SetRecipeTargetImpact {
  recipeId: string;
  recipeName: string;
  targetGroup: string;
}

export interface SetPreflightImpact {
  collectionId: string;
  tokenCount: number;
  metadata: {
    description?: string;
  };
  resolverRefs: SetResolverImpact[];
  generatedOwnership: SetRecipeOwnershipImpact[];
  recipeTargets: SetRecipeTargetImpact[];
}

export interface SetPreflightBlocker {
  id: string;
  code: "generated-token-ownership" | "recipe-target-collection" | "resolver-collection-ref";
  collectionId: string;
  message: string;
  recipeId?: string;
  recipeName?: string;
}

export interface SetMergeConflict {
  path: string;
  sourceValue: unknown;
  targetValue: unknown;
}

export interface SetSplitPreviewItem {
  key: string;
  newCollectionId: string;
  count: number;
  existing: boolean;
}

export interface SetStructuralPreflight {
  operation: SetStructuralOperation;
  affectedCollections: SetPreflightImpact[];
  blockers: SetPreflightBlocker[];
  warnings: string[];
  mergeConflicts?: SetMergeConflict[];
  splitPreview?: SetSplitPreviewItem[];
}
