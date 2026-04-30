import { type DerivationOp, type TokenCollection } from "@tokenmanager/core";
import {
  createTokenValueBody,
  type TokenMutationBody,
} from "./tokenMutations";
import {
  sanitizeEditorCollectionModeValues,
} from "./collectionModeUtils";
import {
  omitTokenEditorReservedExtensions,
  type TokenEditorLifecycle,
  type TokenEditorModeValues,
  type TokenEditorTokenManagerExtension,
  type TokenEditorValue,
} from "./tokenEditorTypes";

interface BuildTokenEditorValueBodyParams {
  tokenType: string;
  value: TokenEditorValue;
  description: string;
  scopes: string[];
  derivationOps: DerivationOp[];
  modeValues: TokenEditorModeValues;
  collection: TokenCollection | null | undefined;
  passthroughTokenManager: Record<string, unknown> | null | undefined;
  lifecycle: TokenEditorLifecycle;
  extendsPath: string;
  extensionsJsonText: string;
  clearEmptyDescription: boolean;
  clearEmptyExtensions: boolean;
  ignoreInvalidExtensionsJson?: boolean;
}

function buildTokenEditorExtensions({
  derivationOps,
  value,
  modeValues,
  collection,
  passthroughTokenManager,
  lifecycle,
  extendsPath,
  extensionsJsonText,
  ignoreInvalidExtensionsJson,
}: Omit<
  BuildTokenEditorValueBodyParams,
  "tokenType" | "description" | "clearEmptyDescription" | "clearEmptyExtensions"
>): Record<string, unknown> {
  let extensions: Record<string, unknown> | undefined;
  const tokenManagerExtensions: TokenEditorTokenManagerExtension =
    passthroughTokenManager ? { ...passthroughTokenManager } : {};
  // Per the design brief: a derivation requires `$value` to be an alias `{path}`.
  // Strip the derivation field on save when the value is no longer an alias so
  // changing `$value` from `{x}` to `#hex` cleanly drops orphaned ops.
  const valueIsAlias =
    typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
  if (derivationOps.length > 0 && valueIsAlias) {
    tokenManagerExtensions.derivation = { ops: derivationOps };
  } else {
    delete tokenManagerExtensions.derivation;
  }

  const cleanModes = sanitizeEditorCollectionModeValues(modeValues, collection);
  if (Object.keys(cleanModes).length > 0) {
    tokenManagerExtensions.modes = cleanModes;
  } else {
    delete tokenManagerExtensions.modes;
  }
  if (lifecycle !== "published") {
    tokenManagerExtensions.lifecycle = lifecycle;
  } else {
    delete tokenManagerExtensions.lifecycle;
  }
  if (extendsPath) {
    tokenManagerExtensions.extends = extendsPath;
  } else {
    delete tokenManagerExtensions.extends;
  }
  if (Object.keys(tokenManagerExtensions).length > 0) {
    extensions = {
      ...(extensions ?? {}),
      tokenmanager: tokenManagerExtensions,
    };
  }

  const trimmedExtensions = extensionsJsonText.trim();
  if (trimmedExtensions && trimmedExtensions !== "{}") {
    let parsedExtensions: unknown;
    try {
      parsedExtensions = JSON.parse(trimmedExtensions);
      if (
        !parsedExtensions ||
        typeof parsedExtensions !== "object" ||
        Array.isArray(parsedExtensions)
      ) {
        throw new Error("Invalid JSON in Extensions");
      }
    } catch (error) {
      if (ignoreInvalidExtensionsJson) {
        return extensions ?? {};
      }
      throw error;
    }
    Object.assign(
      (extensions ??= {}),
      omitTokenEditorReservedExtensions(parsedExtensions),
    );
  }

  return extensions ?? {};
}

export function buildTokenEditorValueBody(
  params: BuildTokenEditorValueBodyParams,
): TokenMutationBody {
  const {
    tokenType,
    value,
    description,
    scopes,
    clearEmptyDescription,
    clearEmptyExtensions,
  } = params;

  return createTokenValueBody({
    type: tokenType,
    value,
    description:
      clearEmptyDescription || description.length > 0 ? description : undefined,
    scopes,
    extensions: buildTokenEditorExtensions(params),
    clearEmptyDescription,
    clearEmptyExtensions,
  });
}
