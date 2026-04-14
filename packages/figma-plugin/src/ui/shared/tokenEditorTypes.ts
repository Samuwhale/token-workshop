import type { ColorModifierOp, TokenValue } from '@tokenmanager/core';

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

export interface TokenEditorDraftData {
  tokenType: string;
  value: TokenEditorValue;
  description: string;
  reference: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: TokenEditorModeValues;
  extensionsJsonText: string;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
  savedAt: number;
}

export interface TokenEditorServerExtensions {
  'com.figma.scopes'?: string[];
  tokenmanager?: {
    colorModifier?: ColorModifierOp[];
    modes?: TokenEditorModeValues;
    lifecycle?: TokenEditorLifecycle;
    extends?: string;
  };
  [key: string]: unknown;
}

export interface TokenEditorServerToken {
  $value?: TokenValue;
  $type?: string;
  $description?: string;
  $extensions?: TokenEditorServerExtensions;
  $scopes?: string[];
}

export interface TokenEditorTokenResponse {
  token?: TokenEditorServerToken | null;
}
