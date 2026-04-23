import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import type { ValidationIssue } from "./useValidationCache";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { hexToLuminance } from "../shared/colorUtils";
import {
  buildReferencedTokenPathSetFromEntries,
  isTokenEntryUnused,
} from "../shared/tokenUsage";
import { normalizeHex } from "@tokenmanager/core";
import type { TokenValue } from "@tokenmanager/core";
import {
  ensureUniqueSharedAliasPath,
  suggestSharedAliasPath,
} from "./useExtractToAlias";

export interface UnifiedTokenEntry {
  $value: unknown;
  $type: string;
  collectionId: string;
  $extensions?: TokenMapEntry["$extensions"];
  $scopes?: string[];
  $lifecycle?: TokenMapEntry["$lifecycle"];
}

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
  $lifecycle?: "draft" | "published" | "deprecated";
}

export interface ColorScale {
  parent: string;
  steps: { path: string; label: string; hex: string }[];
}

interface DuplicateTokenCandidate {
  path: string;
  collectionId: string;
  type: string;
  lifecycle?: "draft" | "published" | "deprecated";
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

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface UseHealthDataParams {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  tokenUsageCounts: Record<string, number>;
  tokenUsageReady?: boolean;
  validationIssues: ValidationIssue[] | null;
  currentCollectionId: string;
}

export interface HealthDataResult {
  allTokensUnified: Record<string, UnifiedTokenEntry>;
  resolveColorHex: (path: string, visited?: Set<string>) => string | null;
  colorTokens: { path: string; hex: string }[];
  allColorTokens: { path: string; collectionId: string; hex: string }[];
  colorScales: ColorScale[];
  lintDuplicateGroups: DuplicateGroup[];
  aliasOpportunityGroups: AliasOpportunityGroup[];
  unusedTokens: UnusedToken[];
}

export function useHealthData({
  allTokensFlat,
  pathToCollectionId,
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

  const allTokensUnified = useMemo(() => {
    const result: Record<string, UnifiedTokenEntry> = {};
    for (const [path, entry] of Object.entries(allTokensFlat)) {
      result[path] = {
        $value: entry.$value,
        $type: entry.$type,
        collectionId: pathToCollectionId[path] ?? "",
        $extensions: entry.$extensions,
        $scopes: entry.$scopes,
        $lifecycle: entry.$lifecycle,
      };
    }
    return result;
  }, [allTokensFlat, pathToCollectionId]);

  const resolveColorHex = useMemo(() => {
    return (path: string, visited = new Set<string>()): string | null => {
      if (visited.has(path)) return null;
      visited.add(path);
      const entry = allTokensUnified[path];
      if (!entry || entry.$type !== "color") return null;
      const v = entry.$value as TokenValue;
      if (isAlias(v)) {
        const aliasPath = extractAliasPath(v);
        return aliasPath ? resolveColorHex(aliasPath, visited) : null;
      }
      return typeof v === "string" && HEX_RE.test(v) ? v : null;
    };
  }, [allTokensUnified]);

  const colorTokens = useMemo((): { path: string; hex: string }[] => {
    const colors: { path: string; hex: string }[] = [];
    for (const [path, entry] of Object.entries(allTokensUnified)) {
      if (entry.$type !== "color") continue;
      if (isAlias(entry.$value as TokenValue)) continue;
      const v = entry.$value;
      if (typeof v !== "string" || !HEX_RE.test(v)) continue;
      colors.push({ path, hex: normalizeHex(v) });
    }
    return colors.sort(
      (a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0),
    );
  }, [allTokensUnified]);

  const allColorTokens = useMemo((): {
    path: string;
    collectionId: string;
    hex: string;
  }[] => {
    const resolveScopedColorHex = (
      path: string,
      collectionId: string,
      visited = new Set<string>(),
    ): string | null => {
      const scopedKey = `${collectionId}::${path}`;
      if (visited.has(scopedKey)) return null;
      visited.add(scopedKey);
      const entry = perCollectionFlat[collectionId]?.[path];
      if (!entry || entry.$type !== "color") return null;
      const value = entry.$value as TokenValue;
      if (isAlias(value)) {
        const aliasPath = extractAliasPath(value);
        return aliasPath
          ? resolveScopedColorHex(aliasPath, collectionId, visited)
          : null;
      }
      return typeof value === "string" && HEX_RE.test(value) ? value : null;
    };

    const colors: { path: string; collectionId: string; hex: string }[] = [];
    for (const [collectionId, collectionFlat] of Object.entries(
      perCollectionFlat,
    )) {
      for (const [path, entry] of Object.entries(collectionFlat)) {
        if (entry.$type !== "color") continue;
        const hex = resolveScopedColorHex(path, collectionId);
        if (hex) {
          colors.push({
            path,
            collectionId,
            hex: normalizeHex(hex),
          });
        }
      }
    }
    return colors;
  }, [perCollectionFlat]);

  const lintDuplicateGroups = useMemo((): DuplicateGroup[] => {
    if (!validationIssues) return [];
    const dupViolations = validationIssues.filter(
      (v) => v.rule === "no-duplicate-values" && v.group,
    );
    if (dupViolations.length === 0) return [];
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
    return [...byGroup.entries()]
      .filter(([, g]) => g.tokens.length > 1)
      .filter(([, g]) =>
        g.tokens.some((t) => t.collectionId === currentCollectionId),
      )
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
  }, [currentCollectionId, getTokenEntry, validationIssues]);

  const aliasOpportunityGroups = useMemo((): AliasOpportunityGroup[] => {
    if (!validationIssues) return [];
    const groupedIssues = validationIssues.filter(
      (issue) => issue.rule === "alias-opportunity" && issue.group,
    );
    if (groupedIssues.length === 0) return [];

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

    return [...groups.entries()]
      .filter(([, tokens]) => tokens.length > 1)
      .filter(([, tokens]) =>
        tokens.some((t) => t.collectionId === currentCollectionId),
      )
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
  }, [currentCollectionId, getTokenEntry, perCollectionFlat, validationIssues]);

  const colorScales = useMemo((): ColorScale[] => {
    const parentGroups = new Map<
      string,
      { path: string; label: string; hex: string }[]
    >();
    for (const t of allColorTokens) {
      const parts = t.path.split(".");
      const last = parts[parts.length - 1];
      if (!/^\d+$/.test(last)) continue;
      const parent = parts.slice(0, -1).join(".");
      const list = parentGroups.get(parent) ?? [];
      list.push({ path: t.path, label: last, hex: t.hex });
      parentGroups.set(parent, list);
    }
    return [...parentGroups.entries()]
      .filter(([, steps]) => steps.length >= 3)
      .map(([parent, steps]) => ({
        parent,
        steps: steps.sort((a, b) => Number(a.label) - Number(b.label)),
      }));
  }, [allColorTokens]);

  const unusedTokens = useMemo((): UnusedToken[] => {
    const currentCollectionFlat = perCollectionFlat[currentCollectionId] ?? {};
    if (!tokenUsageReady || Object.keys(currentCollectionFlat).length === 0) {
      return [];
    }

    const referencedPaths = buildReferencedTokenPathSetFromEntries(
      Object.values(perCollectionFlat).flatMap((collectionFlat) =>
        Object.values(collectionFlat),
      ),
    );

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
  }, [currentCollectionId, perCollectionFlat, tokenUsageCounts, tokenUsageReady]);

  return {
    allTokensUnified,
    resolveColorHex,
    colorTokens,
    allColorTokens,
    colorScales,
    lintDuplicateGroups,
    aliasOpportunityGroups,
    unusedTokens,
  };
}
