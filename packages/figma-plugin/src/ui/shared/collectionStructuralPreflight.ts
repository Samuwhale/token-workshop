export type CollectionStructuralOperation = "delete" | "merge" | "split";

export interface CollectionResolverImpact {
  name: string;
}

export interface CollectionGeneratorImpact {
  generatorId: string;
  generatorName: string;
}

export interface CollectionPreflightImpact {
  collectionId: string;
  tokenCount: number;
  metadata: {
    description?: string;
  };
  resolverRefs: CollectionResolverImpact[];
  generatorRefs: CollectionGeneratorImpact[];
}

export interface CollectionPreflightBlocker {
  id: string;
  code: "resolver-collection-ref" | "generator-collection-ref";
  collectionId: string;
  message: string;
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
