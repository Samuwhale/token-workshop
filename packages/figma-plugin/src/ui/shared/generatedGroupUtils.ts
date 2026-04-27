import {
  getGeneratorSourceCollectionIds,
  getGeneratorSourceCollectionId,
  tokenChangesAcrossModesInCollection,
  type TokenCollection,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import type { GeneratorType } from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import { isAlias, resolveTokenValue } from "../../shared/resolveAlias";

export type DashboardStatus = ReturnType<typeof getGeneratorDashboardStatus>;

export interface GeneratedGroupKeepUpdatedAvailability {
  supported: boolean;
  reason: string | null;
}

export interface ResolvedGeneratedGroupSourceContext {
  sourceTokenPath?: string;
  collectionId?: string;
  entry?: TokenMapEntry;
  value: unknown;
  sourceCollectionExplicit: boolean;
  isAmbiguous: boolean;
}

function hasExplicitSourceCollectionId(sourceCollectionId?: string): boolean {
  return Boolean(sourceCollectionId?.trim());
}

function getGeneratedGroupSourceFallbackEntry(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  sourceTokenEntry?: TokenMapEntry;
  sourceValuesFlat?: Record<string, TokenMapEntry>;
}): TokenMapEntry | undefined {
  if (params.sourceTokenEntry) {
    return params.sourceTokenEntry;
  }

  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath || hasExplicitSourceCollectionId(params.sourceCollectionId)) {
    return undefined;
  }

  return params.sourceValuesFlat?.[sourceTokenPath];
}

function resolveGeneratedGroupSourceEntry(params: {
  sourceTokenPath: string;
  sourceCollectionId?: string;
  sourceTokenEntry?: TokenMapEntry;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  sourceValuesFlat?: Record<string, TokenMapEntry>;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  sourceCollectionExplicit: boolean;
  isAmbiguous: boolean;
}): {
  collectionId?: string;
  entry?: TokenMapEntry;
} {
  const sourceCollectionIds = getGeneratorSourceCollectionIds({
    sourceTokenPath: params.sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
  const collectionId = params.isAmbiguous ? undefined : sourceCollectionIds[0];

  if (collectionId) {
    const collectionEntry =
      params.perCollectionFlat?.[collectionId]?.[params.sourceTokenPath];
    if (collectionEntry) {
      return { collectionId, entry: collectionEntry };
    }

    if (params.sourceTokenEntry) {
      return { collectionId, entry: params.sourceTokenEntry };
    }
  }

  if (!params.sourceCollectionExplicit && !params.isAmbiguous) {
    return {
      collectionId,
      entry:
        params.sourceTokenEntry ??
        params.sourceValuesFlat?.[params.sourceTokenPath] ??
        params.allTokensFlat?.[params.sourceTokenPath],
    };
  }

  return { collectionId, entry: params.sourceTokenEntry };
}

export function getGeneratedGroupSourceTokenEntry(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  sourceTokenEntry?: TokenMapEntry;
  allTokensFlat?: Record<string, TokenMapEntry>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
}): TokenMapEntry | undefined {
  return resolveGeneratedGroupSourceContext(params).entry;
}

export function resolveGeneratedGroupSourceContext(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  sourceTokenEntry?: TokenMapEntry;
  sourceValuesFlat?: Record<string, TokenMapEntry>;
  allTokensFlat?: Record<string, TokenMapEntry>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  fallbackValue?: unknown;
}): ResolvedGeneratedGroupSourceContext {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  const sourceCollectionExplicit = hasExplicitSourceCollectionId(
    params.sourceCollectionId,
  );

  if (!sourceTokenPath) {
    return {
      value: params.fallbackValue,
      sourceCollectionExplicit,
      isAmbiguous: false,
    };
  }

  const sourceTokenEntry = getGeneratedGroupSourceFallbackEntry({
    sourceTokenPath: params.sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    sourceTokenEntry: params.sourceTokenEntry,
    sourceValuesFlat: params.sourceValuesFlat,
  });
  const sourceCollectionIds = getGeneratorSourceCollectionIds({
    sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
  const isAmbiguous =
    !sourceCollectionExplicit && sourceCollectionIds.length > 1;
  const { collectionId, entry } = resolveGeneratedGroupSourceEntry({
    sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    sourceTokenEntry,
    perCollectionFlat: params.perCollectionFlat,
    sourceValuesFlat: params.sourceValuesFlat,
    allTokensFlat: params.allTokensFlat,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
    sourceCollectionExplicit,
    isAmbiguous,
  });

  if (!entry) {
    return {
      sourceTokenPath,
      collectionId,
      value: params.fallbackValue,
      sourceCollectionExplicit,
      isAmbiguous,
    };
  }

  const value = entry.$value;
  if (!isAlias(value)) {
    return {
      sourceTokenPath,
      collectionId,
      entry,
      value,
      sourceCollectionExplicit,
      isAmbiguous,
    };
  }

  const collectionFlat =
    collectionId != null ? params.perCollectionFlat?.[collectionId] : undefined;
  if (collectionFlat) {
    const resolved = resolveTokenValue(value, entry.$type, collectionFlat);
    if (resolved.value != null) {
      return {
        sourceTokenPath,
        collectionId,
        entry,
        value: resolved.value,
        sourceCollectionExplicit,
        isAmbiguous,
      };
    }
  }

  if (!sourceCollectionExplicit && !isAmbiguous && params.allTokensFlat) {
    const resolved = resolveTokenValue(value, entry.$type, params.allTokensFlat);
    if (resolved.value != null) {
      return {
        sourceTokenPath,
        collectionId,
        entry,
        value: resolved.value,
        sourceCollectionExplicit,
        isAmbiguous,
      };
    }
  }

  return {
    sourceTokenPath,
    collectionId,
    entry,
    value,
    sourceCollectionExplicit,
    isAmbiguous,
  };
}

export function getGeneratedGroupKeepUpdatedAvailability(params: {
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  sourceTokenEntry?: TokenMapEntry;
  collections?: TokenCollection[];
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
}): GeneratedGroupKeepUpdatedAvailability {
  const sourceTokenPath = params.sourceTokenPath?.trim();
  if (!sourceTokenPath) {
    return {
      supported: false,
      reason:
        "Keep updated is unavailable because this generated group has no source token.",
    };
  }
  const sourceCollectionExplicit = hasExplicitSourceCollectionId(
    params.sourceCollectionId,
  );
  const resolvedSourceCollectionIds = getGeneratorSourceCollectionIds({
    sourceTokenPath: params.sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
  if (!sourceCollectionExplicit && resolvedSourceCollectionIds.length > 1) {
    return {
      supported: false,
      reason:
        "Keep updated is unavailable because this source token path exists in multiple collections. Pick a specific source collection first.",
    };
  }
  const resolvedSourceCollectionId = getGeneratorSourceCollectionId({
    sourceTokenPath: params.sourceTokenPath,
    sourceCollectionId: params.sourceCollectionId,
    pathToCollectionId: params.pathToCollectionId,
    collectionIdsByPath: params.collectionIdsByPath,
  });
  const sourceDefinitions = Object.entries(params.perCollectionFlat ?? {}).flatMap(
    ([collectionId, collectionTokens]) => {
      if (
        resolvedSourceCollectionId &&
        collectionId !== resolvedSourceCollectionId
      ) {
        return [];
      }
      const token = collectionTokens[sourceTokenPath];
      return token ? [{ collectionId, token }] : [];
    },
  );
  if (
    sourceDefinitions.length === 0 &&
    params.sourceTokenEntry &&
    resolvedSourceCollectionId
  ) {
    sourceDefinitions.push({
      collectionId: resolvedSourceCollectionId,
      token: params.sourceTokenEntry,
    });
  }

  for (const sourceDefinition of sourceDefinitions) {
    const sourceCollection = params.collections?.find(
      (collection) => collection.id === sourceDefinition.collectionId,
    );
    const collectionModeCount = sourceCollection?.modes.length ?? 0;
    if (collectionModeCount <= 1) {
      continue;
    }
    if (
      tokenChangesAcrossModesInCollection(
        sourceDefinition.token,
        sourceDefinition.collectionId,
      )
    ) {
      return {
        supported: false,
        reason:
          "Keep updated is unavailable because this source token changes across modes. Rerun from the current view so the active mode stays explicit.",
      };
    }
  }
  return { supported: true, reason: null };
}

export function getGeneratedGroupTypeLabel(type: GeneratorType): string {
  switch (type) {
    case "colorRamp":
      return "Palette";
    case "spacingScale":
      return "Spacing scale";
    case "typeScale":
      return "Type scale";
    case "opacityScale":
      return "Opacity scale";
    case "borderRadiusScale":
      return "Radius scale";
    case "zIndexScale":
      return "Layer order scale";
    case "shadowScale":
      return "Shadow scale";
    case "customScale":
      return "Custom scale";
    default:
      return type;
  }
}

export function getStatusLabel(status: DashboardStatus, isPaused: boolean): string {
  if (isPaused) return "Keep updated off";
  switch (status) {
    case "upToDate":
      return "Up to date";
    case "stale":
      return "Stale";
    case "failed":
      return "Failed";
    case "blocked":
      return "Blocked";
    case "neverRun":
      return "Never run";
    default:
      return "Generated";
  }
}
