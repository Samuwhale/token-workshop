import type { ColorModifierOp, TokenValue } from '@tokenmanager/core';

export type TokenEditorValue = unknown;

export type TokenEditorLifecycle = 'draft' | 'published' | 'deprecated';

export type TokenEditorModeValues = Record<string, Record<string, unknown>>;

export const TOKEN_EDITOR_RESERVED_EXTENSION_KEYS = new Set([
  'com.figma.scopes',
  'tokenmanager',
  'com.tokenmanager.generator',
]);

export interface TokenEditorTokenManagerExtension {
  colorModifier?: ColorModifierOp[];
  modes?: TokenEditorModeValues;
  lifecycle?: TokenEditorLifecycle;
  extends?: string;
  [key: string]: unknown;
}

export function omitTokenEditorReservedExtensions(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key]) => !TOKEN_EDITOR_RESERVED_EXTENSION_KEYS.has(key),
    ),
  );
}

export function splitTokenManagerExtension(
  value: unknown,
): {
  managed: TokenEditorTokenManagerExtension;
  passthrough: Record<string, unknown>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { managed: {}, passthrough: {} };
  }

  const source = value as Record<string, unknown>;
  const passthrough: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(source)) {
    if (
      key !== 'colorModifier' &&
      key !== 'modes' &&
      key !== 'lifecycle' &&
      key !== 'extends'
    ) {
      passthrough[key] = entryValue;
    }
  }

  return {
    managed: source as TokenEditorTokenManagerExtension,
    passthrough,
  };
}

export interface TokenEditorSnapshot {
  value: TokenEditorValue;
  description: string;
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
  tokenmanager?: TokenEditorTokenManagerExtension;
  [key: string]: unknown;
}

export interface TokenEditorServerToken {
  $value?: TokenValue;
  $type?: string;
  $description?: string;
  $extensions?: TokenEditorServerExtensions;
}

export interface TokenEditorTokenResponse {
  token?: TokenEditorServerToken | null;
}
