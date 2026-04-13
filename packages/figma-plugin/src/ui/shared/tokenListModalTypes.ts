export interface VariableDiffFlatEntry {
  path: string;
  action: string;
  value: unknown;
  variableId?: string;
}

export interface VariableDiffPendingState {
  added: number;
  modified: number;
  unchanged: number;
  flat: VariableDiffFlatEntry[];
}

export interface ExtractAliasTokenDraft {
  path: string;
  $type?: string;
  $value: unknown;
}
