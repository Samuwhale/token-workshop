export interface DeprecatedUsageDependent {
  path: string;
  collectionId: string;
}

export interface DeprecatedUsageEntry {
  deprecatedPath: string;
  collectionId: string;
  type: string;
  activeReferenceCount: number;
  dependents: DeprecatedUsageDependent[];
}
