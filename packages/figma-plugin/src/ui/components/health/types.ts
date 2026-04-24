export type HealthView =
  | "dashboard"
  | "issues"
  | "unused"
  | "deprecated"
  | "alias-opportunities"
  | "duplicates"
  | "hidden"
  | "rules";

export type HealthScopeMode = "current" | "all";

export interface HealthScope {
  mode: HealthScopeMode;
  collectionId: string | null;
  tokenPath: string | null;
  issueKey?: string | null;
  view?: HealthView;
  nonce: number;
}
