// Shared types and constants for ThemeManager and its extracted hooks

export const STATE_LABELS: Record<string, string> = {
  disabled: 'Excluded',
  source: 'Base',
  enabled: 'Override',
};

export const STATE_DESCRIPTIONS: Record<string, string> = {
  disabled: 'Tokens from this set are not used in this option',
  source: 'Provides default token values — overridden by Override sets',
  enabled: 'Highest priority — these tokens override Base set values',
};

export type CoverageToken = {
  path: string;
  set: string;
  /** The first alias target that cannot be resolved in the active sets */
  missingRef?: string;
  /** A concrete value found in another set that can fill the gap */
  fillValue?: unknown;
  /** $type for the fill token */
  fillType?: string;
};

export type CoverageMap = Record<string, Record<string, { uncovered: CoverageToken[] }>>;

export type AutoFillPendingItem = { path: string; $value: unknown; $type?: string };

export type AutoFillPreview =
  | { mode: 'single-option'; dimId: string; optionName: string; targetSet: string; tokens: AutoFillPendingItem[] }
  | { mode: 'all-options'; dimId: string; perSetBatch: Record<string, AutoFillPendingItem[]>; totalCount: number };

/** A token that exists in a source set but has no counterpart in any enabled/override set */
export type MissingOverrideToken = {
  path: string;
  /** Which source set this token lives in */
  sourceSet: string;
  value: unknown;
  type?: string;
};

/** Maps dimId → optionName → list of tokens missing from override sets */
export type MissingOverridesMap = Record<string, Record<string, { missing: MissingOverrideToken[] }>>;
