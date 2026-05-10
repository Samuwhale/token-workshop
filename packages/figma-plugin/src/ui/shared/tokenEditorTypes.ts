import type { Derivation, DerivationOp, TokenLifecycle, TokenValue } from '@token-workshop/core';

export type TokenEditorValue = unknown;

export type TokenEditorLifecycle = TokenLifecycle;

export type TokenEditorModeValues = Record<string, Record<string, unknown>>;

export const TOKEN_EDITOR_RESERVED_EXTENSION_KEYS = new Set([
  'com.figma.scopes',
  'tokenworkshop',
]);

const TOKEN_WORKSHOP_MANAGED_EXTENSION_KEYS = new Set([
  'derivation',
  'modes',
  'lifecycle',
  'extends',
  'generator',
]);

export interface TokenEditorTokenWorkshopExtension {
  derivation?: Derivation;
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

export function splitTokenWorkshopExtension(
  value: unknown,
): {
  managed: TokenEditorTokenWorkshopExtension;
  passthrough: Record<string, unknown>;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { managed: {}, passthrough: {} };
  }

  const source = value as Record<string, unknown>;
  const passthrough: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(source)) {
    if (!TOKEN_WORKSHOP_MANAGED_EXTENSION_KEYS.has(key)) {
      passthrough[key] = entryValue;
    }
  }

  return {
    managed: source as TokenEditorTokenWorkshopExtension,
    passthrough,
  };
}

export interface TokenEditorSnapshot {
  value: TokenEditorValue;
  description: string;
  scopes: string[];
  type: string;
  derivationOps: DerivationOp[];
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
  derivationOps: DerivationOp[];
  modeValues: TokenEditorModeValues;
  extensionsJsonText: string;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
  savedAt: number;
}

export interface TokenEditorServerExtensions {
  'com.figma.scopes'?: string[];
  tokenworkshop?: TokenEditorTokenWorkshopExtension;
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
