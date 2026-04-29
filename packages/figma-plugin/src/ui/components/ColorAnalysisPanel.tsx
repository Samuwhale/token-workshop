import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import {
  hexToLuminance,
} from "../shared/colorUtils";
import { isAlias } from "../../shared/resolveAlias";
import {
  normalizeHex,
  type TokenCollection,
  type TokenValue,
} from "@tokenmanager/core";
import { useHealthData } from "../hooks/useHealthData";
import { ContrastMatrixPanel } from "./ContrastMatrixPanel";
import { LightnessInspectorPanel } from "./LightnessInspectorPanel";

export interface ColorAnalysisPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collections: TokenCollection[];
  currentCollectionId: string;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onClose: () => void;
}

export function ColorAnalysisPanel({
  allTokensFlat,
  perCollectionFlat,
  collections,
  currentCollectionId,
  onNavigateToToken,
  onClose,
}: ColorAnalysisPanelProps) {
  const { allColorTokens } = useHealthData({
    allTokensFlat,
    perCollectionFlat,
    tokenUsageCounts: {},
    validationIssues: null,
    currentCollectionId,
  });

  const colorTokens = useMemo(() => {
    const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    const colors: { path: string; collectionId: string; hex: string }[] = [];
    for (const [collectionId, collectionFlat] of Object.entries(
      perCollectionFlat,
    )) {
      for (const [path, entry] of Object.entries(collectionFlat)) {
        if (entry.$type !== "color" || isAlias(entry.$value as TokenValue)) {
          continue;
        }
        if (typeof entry.$value !== "string" || !HEX_RE.test(entry.$value)) {
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
  }, [perCollectionFlat]);

  const colorScales = useMemo(() => {
    const parentGroups = new Map<
      string,
      {
        parent: string;
        collectionId: string;
        steps: { path: string; collectionId: string; label: string; hex: string }[];
      }
    >();

    for (const token of allColorTokens) {
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
  }, [allColorTokens]);

  const hasContent = colorTokens.length >= 2 || colorScales.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-secondary text-[color:var(--color-figma-text-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          &larr; Back
        </button>
        <span className="ml-auto text-body font-medium text-[color:var(--color-figma-text)]">
          Color analysis
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-body text-[color:var(--color-figma-text-secondary)]">
              Add at least 2 color tokens to use contrast checking, or create
              numeric color scales (3+ steps) for lightness analysis.
            </p>
          </div>
        ) : (
          <>
            <ContrastMatrixPanel
              colorTokens={colorTokens}
              collections={collections}
              perCollectionFlat={perCollectionFlat}
              onNavigateToToken={onNavigateToToken}
            />

            <LightnessInspectorPanel
              colorScales={colorScales}
              onNavigateToToken={onNavigateToToken}
            />
          </>
        )}
      </div>
    </div>
  );
}
