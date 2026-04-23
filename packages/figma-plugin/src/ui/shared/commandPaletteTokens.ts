import { createGeneratorOwnershipKey } from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import type { TokenGenerator } from "../hooks/useGenerators";
import { isAlias } from "../../shared/resolveAlias";
import {
  buildReferencedTokenPathSetFromEntries,
  isTokenEntryUnused,
} from "./tokenUsage";
import { stableStringify } from "./utils";

export interface CommandPaletteToken {
  path: string;
  collectionId: string;
  type: string;
  value?: string;
  set?: string;
  isAlias?: boolean;
  description?: string;
  generatorName?: string;
  scopes?: string[];
  hasExtensions?: boolean;
  isDuplicate?: boolean;
  isUnused?: boolean;
}

export interface CommandPaletteTokenSource {
  path: string;
  collectionId: string;
  entry: TokenMapEntry;
}

interface BuildCommandPaletteTokensOptions {
  derivedTokenPaths?: Map<string, TokenGenerator>;
  tokenUsageCounts?: Record<string, number>;
  tokenUsageReady?: boolean;
  duplicateTokenSources?: CommandPaletteTokenSource[];
  referenceTokenSources?: CommandPaletteTokenSource[];
}

function buildDuplicateValueKeySet(
  tokenSources: CommandPaletteTokenSource[],
): Set<string> {
  const countsByValue = new Map<string, number>();

  for (const source of tokenSources) {
    const serializedValue = stableStringify(source.entry.$value);
    countsByValue.set(
      serializedValue,
      (countsByValue.get(serializedValue) ?? 0) + 1,
    );
  }

  const duplicateValueKeys = new Set<string>();
  for (const [serializedValue, count] of countsByValue) {
    if (count > 1) {
      duplicateValueKeys.add(serializedValue);
    }
  }

  return duplicateValueKeys;
}

export function buildCommandPaletteTokens(
  tokenSources: CommandPaletteTokenSource[],
  options: BuildCommandPaletteTokensOptions = {},
): CommandPaletteToken[] {
  const duplicateValueKeys = buildDuplicateValueKeySet(
    options.duplicateTokenSources ?? tokenSources,
  );
  const referencedPaths =
    options.tokenUsageReady &&
    options.tokenUsageCounts &&
    (options.referenceTokenSources ?? tokenSources).length > 0
      ? buildReferencedTokenPathSetFromEntries(
          (options.referenceTokenSources ?? tokenSources).map(
            ({ entry }) => entry,
          ),
        )
      : null;

  return tokenSources.map(({ path, collectionId, entry }) => {
    const generatorName = options.derivedTokenPaths?.get(
      createGeneratorOwnershipKey(collectionId, path),
    )?.name;
    const hasExtensions =
      !!entry.$extensions && Object.keys(entry.$extensions).length > 0;
    const serializedValue = stableStringify(entry.$value);

    return {
      path,
      collectionId,
      type: entry.$type || "unknown",
      value:
        typeof entry.$value === "string"
          ? entry.$value
          : stableStringify(entry.$value),
      set: collectionId,
      isAlias: isAlias(entry.$value),
      description: entry.$description,
      generatorName,
      scopes: entry.$scopes,
      hasExtensions,
      isDuplicate: duplicateValueKeys.has(serializedValue),
      isUnused:
        referencedPaths !== null && options.tokenUsageCounts
          ? isTokenEntryUnused(
              path,
              entry,
              options.tokenUsageCounts,
              referencedPaths,
              { includeDeprecated: false },
            )
          : false,
    };
  });
}
