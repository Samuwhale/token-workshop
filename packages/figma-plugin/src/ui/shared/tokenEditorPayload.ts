import { type ColorModifierOp, type TokenCollection } from "@tokenmanager/core";
import {
  createTokenValueBody,
  type TokenMutationBody,
} from "./tokenMutations";
import {
  completeEditorCollectionModeValues,
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
  colorModifiers: ColorModifierOp[];
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
  colorModifiers,
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
  if (colorModifiers.length > 0) {
    tokenManagerExtensions.colorModifier = colorModifiers;
  } else {
    delete tokenManagerExtensions.colorModifier;
  }

  const cleanModes = sanitizeEditorCollectionModeValues(
    completeEditorCollectionModeValues(modeValues, collection, value),
    collection,
  );
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
