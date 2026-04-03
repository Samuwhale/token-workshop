// Shared types for ThemeManager and its extracted hooks

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
