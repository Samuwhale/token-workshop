import { useMemo } from "react";
import type { TokenLifecycle } from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";
import type { ValidationIssue } from "./useValidationCache";
import {
  buildReferencedTokenPathSetFromEntries,
  isTokenEntryUnused,
} from "../shared/tokenUsage";
import {
  ensureUniqueSharedAliasPath,
  suggestSharedAliasPath,
} from "./useExtractToAlias";

export interface AliasOpportunityToken {
  path: string;
  collectionId: string;
}

export interface AliasOpportunityGroup {
  id: string;
  tokens: AliasOpportunityToken[];
  typeLabel: string;
  valueLabel: string;
  suggestedPrimitivePath: string;
  suggestedPrimitiveCollectionId: string;
  colorHex?: string;
}

export interface UnusedToken {
  path: string;
  collectionId: string;
  $type: string;
  $lifecycle?: TokenLifecycle;
}

interface DuplicateTokenCandidate {
  path: string;
  collectionId: string;
  type: string;
  lifecycle?: TokenLifecycle;
  scopes: string[];
  colorHex?: string;
}

export interface DuplicateGroup {
  id: string;
  valueLabel: string;
  typeLabel: string;
  tokens: DuplicateTokenCandidate[];
  colorHex?: string;
}

function formatDuplicateValue(value: unknown): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[complex value]";
  }
}

export interface UseHealthDataParams {
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  tokenUsageCounts: Record<string, number>;
  tokenUsageReady?: boolean;
  validationIssues: ValidationIssue[] | null;
  currentCollectionId: string;
}

export interface HealthDataResult {
  lintDuplicateGroups: DuplicateGroup[];
  aliasOpportunityGroups: AliasOpportunityGroup[];
  duplicateAliasCountsByCollection: Record<string, number>;
  aliasOpportunityCountsByCollection: Record<string, number>;
  unusedTokenCountsByCollection: Record<string, number>;
  unusedTokens: UnusedToken[];
}

export function useHealthData({
  allTokensFlat,
  perCollectionFlat,
  tokenUsageCounts,
  tokenUsageReady = false,
  validationIssues,
  currentCollectionId,
}: UseHealthDataParams): HealthDataResult {
  const getTokenEntry = useMemo(
    () => (path: string, collectionId?: string): TokenMapEntry | undefined => {
      if (collectionId) {
        const collectionEntry = perCollectionFlat[collectionId]?.[path];
        if (collectionEntry) {
          return collectionEntry;
        }
      }
      return allTokensFlat[path];
    },
    [allTokensFlat, perCollectionFlat],
  );

  const duplicateGroupData = useMemo(() => {
    if (!validationIssues) {
      return {
        groups: [] as DuplicateGroup[],
        duplicateAliasCountsByCollection: {} as Record<string, number>,
      };
    }
    const dupViolations = validationIssues.filter(
      (v) => v.rule === "no-duplicate-values" && v.group,
    );
    if (dupViolations.length === 0) {
      return {
        groups: [] as DuplicateGroup[],
        duplicateAliasCountsByCollection: {} as Record<string, number>,
      };
    }
    const byGroup = new Map<
      string,
      { tokens: { path: string; collectionId: string }[] }
    >();
    for (const v of dupViolations) {
      const groupId = v.group!;
      if (!byGroup.has(groupId)) byGroup.set(groupId, { tokens: [] });
      const entry = byGroup.get(groupId)!;
      if (
        !entry.tokens.some(
          (t) => t.path === v.path && t.collectionId === v.collectionId,
        )
      ) {
        entry.tokens.push({ path: v.path, collectionId: v.collectionId });
      }
    }
    const groups = [...byGroup.entries()]
      .filter(([, g]) => g.tokens.length > 1)
      .map(([id, { tokens }]) => {
        const sampleToken = tokens[0];
        const tokenEntry = sampleToken
          ? getTokenEntry(sampleToken.path, sampleToken.collectionId)
          : undefined;
        const colorHex =
          tokenEntry?.$type === "color" &&
          typeof tokenEntry.$value === "string"
            ? tokenEntry.$value
            : undefined;
        return {
          id,
          valueLabel: tokenEntry
            ? formatDuplicateValue(tokenEntry.$value)
            : "Unknown value",
          typeLabel: tokenEntry?.$type ?? "unknown",
          colorHex,
          tokens: tokens
            .map(({ path, collectionId }) => {
              const duplicateEntry = getTokenEntry(path, collectionId);
              return {
                path,
                collectionId,
                type: duplicateEntry?.$type ?? "unknown",
                lifecycle: duplicateEntry?.$lifecycle,
                scopes: duplicateEntry?.$scopes ?? [],
                colorHex:
                  duplicateEntry?.$type === "color" &&
                  typeof duplicateEntry.$value === "string"
                    ? duplicateEntry.$value
                    : undefined,
              };
            })
            .sort(
              (a, b) =>
                a.path.localeCompare(b.path) ||
                a.collectionId.localeCompare(b.collectionId),
            ),
        };
      })
      .sort((a, b) => b.tokens.length - a.tokens.length);
    const duplicateAliasCountsByCollection: Record<string, number> = {};

    for (const group of groups) {
      const duplicateAliasCount = Math.max(group.tokens.length - 1, 0);
      const collectionIds = new Set(
        group.tokens.map((token) => token.collectionId),
      );

      for (const collectionId of collectionIds) {
        duplicateAliasCountsByCollection[collectionId] =
          (duplicateAliasCountsByCollection[collectionId] ?? 0) +
          duplicateAliasCount;
      }
    }

    return { groups, duplicateAliasCountsByCollection };
  }, [getTokenEntry, validationIssues]);

  const lintDuplicateGroups = useMemo((): DuplicateGroup[] => {
    if (!currentCollectionId) {
      return [];
    }

    return duplicateGroupData.groups.filter((group) =>
      group.tokens.some((token) => token.collectionId === currentCollectionId),
    );
  }, [currentCollectionId, duplicateGroupData]);

  const aliasOpportunityData = useMemo(() => {
    if (!validationIssues) {
      return {
        groups: [] as AliasOpportunityGroup[],
        aliasOpportunityCountsByCollection: {} as Record<string, number>,
      };
    }
    const groupedIssues = validationIssues.filter(
      (issue) => issue.rule === "alias-opportunity" && issue.group,
    );
    if (groupedIssues.length === 0) {
      return {
        groups: [] as AliasOpportunityGroup[],
        aliasOpportunityCountsByCollection: {} as Record<string, number>,
      };
    }

    const groups = new Map<string, AliasOpportunityToken[]>();
    for (const issue of groupedIssues) {
      const groupId = issue.group!;
      const existing = groups.get(groupId) ?? [];
      if (
        !existing.some(
          (token) =>
            token.path === issue.path &&
            token.collectionId === issue.collectionId,
        )
      ) {
        existing.push({ path: issue.path, collectionId: issue.collectionId });
      }
      groups.set(groupId, existing);
    }

    const aliasGroups = [...groups.entries()]
      .filter(([, tokens]) => tokens.length > 1)
      .map(([id, tokens]) => {
        const sortedTokens = [...tokens].sort(
          (a, b) =>
            a.path.localeCompare(b.path) ||
            a.collectionId.localeCompare(b.collectionId),
        );
        const sampleToken = sortedTokens[0];
        const sampleEntry = sampleToken
          ? getTokenEntry(sampleToken.path, sampleToken.collectionId)
          : undefined;
        const sourceCollectionIds = Array.from(
          new Set(sortedTokens.map((token) => token.collectionId)),
        );
        const suggestedPrimitiveCollectionId =
          sourceCollectionIds.includes(currentCollectionId)
            ? currentCollectionId
            : sortedTokens[0]?.collectionId ?? currentCollectionId;
        const suggestedPrimitivePath = ensureUniqueSharedAliasPath(
          suggestSharedAliasPath(
            sortedTokens.map((token) => token.path),
            sampleEntry?.$type,
          ),
          [
            ...Object.values(perCollectionFlat).flatMap((collectionFlat) =>
              Object.keys(collectionFlat),
            ),
            ...sortedTokens.map((token) => token.path),
          ],
        );

        return {
          id,
          tokens: sortedTokens,
          typeLabel: sampleEntry?.$type ?? "unknown",
          valueLabel: sampleEntry
            ? formatDuplicateValue(sampleEntry.$value)
            : "Unknown value",
          suggestedPrimitivePath,
          suggestedPrimitiveCollectionId,
          colorHex:
            sampleEntry?.$type === "color" &&
            typeof sampleEntry.$value === "string"
              ? sampleEntry.$value
              : undefined,
        };
      })
      .sort((a, b) => b.tokens.length - a.tokens.length);
    const aliasOpportunityCountsByCollection: Record<string, number> = {};

    for (const group of aliasGroups) {
      const collectionIds = new Set(
        group.tokens.map((token) => token.collectionId),
      );

      for (const collectionId of collectionIds) {
        aliasOpportunityCountsByCollection[collectionId] =
          (aliasOpportunityCountsByCollection[collectionId] ?? 0) + 1;
      }
    }

    return { groups: aliasGroups, aliasOpportunityCountsByCollection };
  }, [currentCollectionId, getTokenEntry, perCollectionFlat, validationIssues]);

  const aliasOpportunityGroups = useMemo((): AliasOpportunityGroup[] => {
    if (!currentCollectionId) {
      return [];
    }

    return aliasOpportunityData.groups.filter((group) =>
      group.tokens.some((token) => token.collectionId === currentCollectionId),
    );
  }, [aliasOpportunityData, currentCollectionId]);

  const referencedPaths = useMemo(() => {
    if (!tokenUsageReady) {
      return new Set<string>();
    }
    return buildReferencedTokenPathSetFromEntries(
      Object.values(perCollectionFlat).flatMap((collectionFlat) =>
        Object.values(collectionFlat),
      ),
    );
  }, [perCollectionFlat, tokenUsageReady]);

  const unusedTokenCountsByCollection = useMemo((): Record<string, number> => {
    if (!tokenUsageReady) {
      return {};
    }

    const counts: Record<string, number> = {};
    for (const [collectionId, collectionFlat] of Object.entries(perCollectionFlat)) {
      let count = 0;
      for (const [path, entry] of Object.entries(collectionFlat)) {
        if (
          isTokenEntryUnused(path, entry, tokenUsageCounts, referencedPaths, {
            includeDeprecated: false,
          })
        ) {
          count += 1;
        }
      }
      if (count > 0) {
        counts[collectionId] = count;
      }
    }
    return counts;
  }, [perCollectionFlat, referencedPaths, tokenUsageCounts, tokenUsageReady]);

  const unusedTokens = useMemo((): UnusedToken[] => {
    const currentCollectionFlat = perCollectionFlat[currentCollectionId] ?? {};
    if (!tokenUsageReady || Object.keys(currentCollectionFlat).length === 0) {
      return [];
    }

    return Object.entries(currentCollectionFlat)
      .flatMap(([path, entry]) => {
        if (
          !isTokenEntryUnused(path, entry, tokenUsageCounts, referencedPaths, {
            includeDeprecated: false,
          })
        ) {
          return [];
        }
        return [
          {
            path,
            collectionId: currentCollectionId,
            $type: entry.$type,
            $lifecycle: entry.$lifecycle,
          },
        ];
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [
    currentCollectionId,
    perCollectionFlat,
    referencedPaths,
    tokenUsageCounts,
    tokenUsageReady,
  ]);

  return {
    lintDuplicateGroups,
    aliasOpportunityGroups,
    duplicateAliasCountsByCollection:
      duplicateGroupData.duplicateAliasCountsByCollection,
    aliasOpportunityCountsByCollection:
      aliasOpportunityData.aliasOpportunityCountsByCollection,
    unusedTokenCountsByCollection,
    unusedTokens,
  };
}
