import { normalizeHex, type TokenValue } from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { hexToLuminance } from "./colorUtils";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export interface ColorToken {
  path: string;
  collectionId: string;
  hex: string;
}

export interface ColorScaleStep extends ColorToken {
  label: string;
}

export interface ColorScale {
  parent: string;
  collectionId: string;
  steps: ColorScaleStep[];
}

export function isHexColorLiteral(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

export function listLiteralColorTokens(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): ColorToken[] {
  const colors: ColorToken[] = [];
  for (const [collectionId, collectionFlat] of Object.entries(
    perCollectionFlat,
  )) {
    for (const [path, entry] of Object.entries(collectionFlat)) {
      if (entry.$type !== "color" || isAlias(entry.$value as TokenValue)) {
        continue;
      }
      if (!isHexColorLiteral(entry.$value)) {
        continue;
      }
      colors.push({
        path,
        collectionId,
        hex: normalizeHex(entry.$value),
      });
    }
  }

  return colors.sort(
    (a, b) => (hexToLuminance(a.hex) ?? 0) - (hexToLuminance(b.hex) ?? 0),
  );
}

export function listResolvableColorTokens(
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
): ColorToken[] {
  const colors: ColorToken[] = [];
  const resolvedHexByScopedPath = new Map<string, string | null>();
  for (const [collectionId, collectionFlat] of Object.entries(
    perCollectionFlat,
  )) {
    for (const [path, entry] of Object.entries(collectionFlat)) {
      if (entry.$type !== "color") {
        continue;
      }
      const hex = resolveCollectionColorHex(
        path,
        collectionId,
        perCollectionFlat,
        resolvedHexByScopedPath,
      );
      if (hex) {
        colors.push({ path, collectionId, hex: normalizeHex(hex) });
      }
    }
  }
  return colors;
}

export function buildColorScales(colorTokens: ColorToken[]): ColorScale[] {
  const parentGroups = new Map<string, ColorScale>();

  for (const token of colorTokens) {
    const parts = token.path.split(".");
    const last = parts[parts.length - 1];
    if (!/^\d+$/.test(last)) {
      continue;
    }

    const parent = parts.slice(0, -1).join(".");
    const groupKey = `${token.collectionId}::${parent}`;
    const group = parentGroups.get(groupKey) ?? {
      parent,
      collectionId: token.collectionId,
      steps: [],
    };
    group.steps.push({
      path: token.path,
      collectionId: token.collectionId,
      label: last,
      hex: token.hex,
    });
    parentGroups.set(groupKey, group);
  }

  return [...parentGroups.values()]
    .filter((group) => group.steps.length >= 3)
    .map((group) => ({
      parent: group.parent,
      collectionId: group.collectionId,
      steps: group.steps.sort((a, b) => Number(a.label) - Number(b.label)),
    }));
}

function resolveCollectionColorHex(
  path: string,
  collectionId: string,
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  resolvedHexByScopedPath: Map<string, string | null>,
  visited = new Set<string>(),
): string | null {
  const scopedKey = `${collectionId}::${path}`;
  if (resolvedHexByScopedPath.has(scopedKey)) {
    return resolvedHexByScopedPath.get(scopedKey) ?? null;
  }
  if (visited.has(scopedKey)) {
    return null;
  }
  visited.add(scopedKey);

  const entry = perCollectionFlat[collectionId]?.[path];
  if (!entry || entry.$type !== "color") {
    resolvedHexByScopedPath.set(scopedKey, null);
    return null;
  }

  const value = entry.$value as TokenValue;
  let resolvedHex: string | null;
  if (isAlias(value)) {
    const aliasPath = extractAliasPath(value);
    resolvedHex = aliasPath
      ? resolveCollectionColorHex(
          aliasPath,
          collectionId,
          perCollectionFlat,
          resolvedHexByScopedPath,
          visited,
        )
      : null;
  } else {
    resolvedHex = isHexColorLiteral(value) ? value : null;
  }

  resolvedHexByScopedPath.set(scopedKey, resolvedHex);
  return resolvedHex;
}
