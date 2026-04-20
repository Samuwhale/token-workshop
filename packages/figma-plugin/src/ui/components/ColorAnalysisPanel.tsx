import type { TokenMapEntry } from "../../shared/types";
import type { TokenCollection } from "@tokenmanager/core";
import { useHealthData } from "../hooks/useHealthData";
import { ContrastMatrixPanel } from "./ContrastMatrixPanel";
import { LightnessInspectorPanel } from "./LightnessInspectorPanel";

export interface ColorAnalysisPanelProps {
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  collections: TokenCollection[];
  currentCollectionId: string;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onClose: () => void;
}

export function ColorAnalysisPanel({
  allTokensFlat,
  pathToCollectionId,
  collections,
  currentCollectionId,
  onNavigateToToken,
  onClose,
}: ColorAnalysisPanelProps) {
  const { colorTokens, colorScales } = useHealthData({
    allTokensFlat,
    pathToCollectionId,
    tokenUsageCounts: {},
    validationIssues: null,
    currentCollectionId,
  });

  const hasContent = colorTokens.length >= 2 || colorScales.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
        >
          &larr; Back
        </button>
        <span className="ml-auto text-[11px] font-semibold text-[var(--color-figma-text)]">
          Color Analysis
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
            <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
              Add at least 2 color tokens to use contrast checking, or create
              numeric color scales (3+ steps) for lightness analysis.
            </p>
          </div>
        ) : (
          <>
            <ContrastMatrixPanel
              colorTokens={colorTokens}
              collections={collections}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              onNavigateToToken={onNavigateToToken}
            />

            <LightnessInspectorPanel
              colorScales={colorScales}
              onNavigateToToken={
                onNavigateToToken
                  ? (path) => {
                      const collectionId = pathToCollectionId[path];
                      if (!collectionId) return;
                      onNavigateToToken(path, collectionId);
                    }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
