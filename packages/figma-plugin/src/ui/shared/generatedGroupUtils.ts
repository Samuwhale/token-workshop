import {
  readTokenCollectionModeValues,
  type TokenCollection,
} from "@tokenmanager/core";
import type { TokenMapEntry } from "../../shared/types";
import type { TokenGenerator, GeneratorType } from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import { stableStringify } from "./utils";

export type DashboardStatus = ReturnType<typeof getGeneratorDashboardStatus>;
export type SimplifiedStatus = "ready" | "needsRun" | "error";

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

export function formatRelativeTimestamp(value?: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const diffMinutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function getGeneratedGroupStatusDetail(generator: TokenGenerator, status: DashboardStatus): string {
  if (status === "blocked") {
    const blockedBy = generator.blockedByGenerators?.filter((dependency) => dependency.name) ?? [];
    if (blockedBy.length > 0) {
      return `${blockedBy.length} blocked`;
    }
  }
  if (generator.lastRunError?.message) return generator.lastRunError.message;
  if (generator.lastRunSummary?.message) return generator.lastRunSummary.message;
  if (generator.staleReason) return generator.staleReason;
  return "";
}

export function getSimplifiedStatus(status: DashboardStatus): SimplifiedStatus {
  switch (status) {
    case "upToDate":
      return "ready";
    case "stale":
    case "neverRun":
      return "needsRun";
    case "failed":
    case "blocked":
      return "error";
    default:
      return "needsRun";
  }
}

export function getStatusDotClass(simpleStatus: SimplifiedStatus, isPaused: boolean): string {
  if (isPaused) return "border-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-text-tertiary)]/20";
  switch (simpleStatus) {
    case "ready":
      return "border-[var(--color-figma-success,#22c55e)] bg-[var(--color-figma-success,#22c55e)]";
    case "needsRun":
      return "border-[var(--color-figma-warning,#f59e0b)] bg-[var(--color-figma-warning,#f59e0b)]";
    case "error":
      return "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]";
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
