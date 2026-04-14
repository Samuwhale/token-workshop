import type { ThemeSetStatus } from "@tokenmanager/core";

export type SetStructuralOperation = "delete" | "merge" | "split";

export interface SetThemeImpact {
  dimensionId: string;
  dimensionName: string;
  optionName: string;
  status: ThemeSetStatus;
}

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
  name: string;
  tokenCount: number;
  metadata: {
    description?: string;
    collectionName?: string;
    modeName?: string;
  };
  themeOptions: SetThemeImpact[];
  resolverRefs: SetResolverImpact[];
  generatedOwnership: SetRecipeOwnershipImpact[];
  recipeTargets: SetRecipeTargetImpact[];
}

export interface SetPreflightBlocker {
  id: string;
  code:
    | "generated-token-ownership"
    | "recipe-target-set"
    | "resolver-set-ref"
    | "theme-option-set";
  setName: string;
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
  newName: string;
  count: number;
  existing: boolean;
}

export interface SetStructuralPreflight {
  operation: SetStructuralOperation;
  affectedSets: SetPreflightImpact[];
  blockers: SetPreflightBlocker[];
  warnings: string[];
  mergeConflicts?: SetMergeConflict[];
  splitPreview?: SetSplitPreviewItem[];
}
