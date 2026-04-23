export type HealthView =
  | "dashboard"
  | "issues"
  | "unused"
  | "deprecated"
  | "alias-opportunities"
  | "duplicates"
  | "hidden";

export type HealthScopeMode = "rollup" | "collection";

export interface HealthViewRequest {
  scopeMode: HealthScopeMode;
  collectionId?: string;
  tokenPath?: string;
  view?: HealthView;
  nonce: number;
}
