import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import type { TokenCollection } from "@token-workshop/core";
import { ContrastMatrixPanel } from "./ContrastMatrixPanel";
import { LightnessInspectorPanel } from "./LightnessInspectorPanel";
import {
  buildColorScales,
  listLiteralColorTokens,
  listResolvableColorTokens,
} from "../shared/colorAnalysis";

export interface ColorAnalysisPanelProps {
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collections: TokenCollection[];
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onClose: () => void;
}

export function ColorAnalysisPanel({
  perCollectionFlat,
  collections,
  onNavigateToToken,
  onClose,
}: ColorAnalysisPanelProps) {
  const colorTokens = useMemo(
    () => listLiteralColorTokens(perCollectionFlat),
    [perCollectionFlat],
  );

  const colorScales = useMemo(
    () => buildColorScales(listResolvableColorTokens(perCollectionFlat)),
    [perCollectionFlat],
  );

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
