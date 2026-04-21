import {
  readTokenCollectionModeValues,
  type TokenCollection,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import type { GeneratorType } from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import { stableStringify } from "./utils";

export type DashboardStatus = ReturnType<typeof getGeneratorDashboardStatus>;

export interface GeneratedGroupKeepUpdatedAvailability {
  supported: boolean;
  reason: string | null;
}

export function getGeneratedGroupKeepUpdatedAvailability(params: {
  sourceTokenPath?: string;
  sourceTokenEntry?: TokenMapEntry;
  collections?: TokenCollection[];
  pathToCollectionId?: Record<string, string>;
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
  const sourceDefinitions = Object.entries(params.perCollectionFlat ?? {}).flatMap(
    ([collectionId, collectionTokens]) => {
      const token = collectionTokens[sourceTokenPath];
      return token ? [{ collectionId, token }] : [];
    },
  );
  if (
    sourceDefinitions.length === 0 &&
    params.sourceTokenEntry &&
    params.pathToCollectionId?.[sourceTokenPath]
  ) {
    sourceDefinitions.push({
      collectionId: params.pathToCollectionId[sourceTokenPath],
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
    const sourceTokenModes = readTokenCollectionModeValues(
      sourceDefinition.token,
    )[sourceDefinition.collectionId];
    if (!sourceTokenModes) {
      continue;
    }
    const baseValue = stableStringify(sourceDefinition.token.$value);
    const hasModeSensitiveSourceValue = Object.values(sourceTokenModes).some(
      (value) =>
        value !== undefined &&
        value !== null &&
        value !== "" &&
        stableStringify(value) !== baseValue,
    );
    if (hasModeSensitiveSourceValue) {
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
    case "darkModeInversion":
      return "Dark mode variant";
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
