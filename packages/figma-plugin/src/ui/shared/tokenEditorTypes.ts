import type { ColorModifierOp } from '@tokenmanager/core';

export type TokenEditorValue = unknown;

export type TokenEditorLifecycle = 'draft' | 'published' | 'deprecated';

export type TokenEditorModeValues = Record<string, Record<string, unknown>>;

export interface TokenEditorSnapshot {
  value: TokenEditorValue;
  description: string;
  reference: string;
  scopes: string[];
  type: string;
  colorModifiers: ColorModifierOp[];
  modeValues: TokenEditorModeValues;
  extensionsJsonText: string;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
}

export interface TokenEditorDraftData extends TokenEditorSnapshot {
  tokenType: string;
  savedAt: number;
}

export interface TokenEditorServerToken {
  $value?: TokenEditorValue;
  $type?: string;
  $description?: string;
  $extensions?: Record<string, unknown>;
  $scopes?: string[];
}

export interface TokenEditorTokenResponse {
  token?: TokenEditorServerToken | null;
}
