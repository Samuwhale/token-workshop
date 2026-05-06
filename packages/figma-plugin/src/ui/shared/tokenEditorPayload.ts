import { type DerivationOp, type TokenCollection } from "@token-workshop/core";
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
  type TokenEditorTokenWorkshopExtension,
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
  passthroughTokenWorkshop: Record<string, unknown> | null | undefined;
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
  passthroughTokenWorkshop,
  lifecycle,
  extendsPath,
  extensionsJsonText,
  ignoreInvalidExtensionsJson,
}: Omit<
  BuildTokenEditorValueBodyParams,
  "tokenType" | "description" | "clearEmptyDescription" | "clearEmptyExtensions"
>): Record<string, unknown> {
  let extensions: Record<string, unknown> | undefined;
  const tokenWorkshopExtensions: TokenEditorTokenWorkshopExtension =
    passthroughTokenWorkshop ? { ...passthroughTokenWorkshop } : {};
  // Per the design brief: a derivation requires `$value` to be an alias `{path}`.
  // Strip the derivation field on save when the value is no longer an alias so
  // changing `$value` from `{x}` to `#hex` cleanly drops orphaned ops.
  const valueIsAlias =
    typeof value === 'string' && value.startsWith('{') && value.endsWith('}');
  if (derivationOps.length > 0 && valueIsAlias) {
    tokenWorkshopExtensions.derivation = { ops: derivationOps };
  } else {
    delete tokenWorkshopExtensions.derivation;
  }

  const cleanModes = sanitizeEditorCollectionModeValues(modeValues, collection);
  if (Object.keys(cleanModes).length > 0) {
    tokenWorkshopExtensions.modes = cleanModes;
  } else {
    delete tokenWorkshopExtensions.modes;
  }
  if (lifecycle !== "published") {
    tokenWorkshopExtensions.lifecycle = lifecycle;
  } else {
    delete tokenWorkshopExtensions.lifecycle;
  }
  if (extendsPath) {
    tokenWorkshopExtensions.extends = extendsPath;
  } else {
    delete tokenWorkshopExtensions.extends;
  }
  if (Object.keys(tokenWorkshopExtensions).length > 0) {
    extensions = {
      ...(extensions ?? {}),
      tokenworkshop: tokenWorkshopExtensions,
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
