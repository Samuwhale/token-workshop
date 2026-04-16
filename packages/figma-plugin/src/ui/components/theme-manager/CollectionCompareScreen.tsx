import type { CollectionDefinition } from "@tokenmanager/core";
import { UnifiedComparePanel } from "../UnifiedComparePanel";
import type { CompareMode } from "../UnifiedComparePanel";

interface CollectionCompareScreenProps {
  focusLabel: string | null;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;
  tokenPath: string;
  onClearTokenPath: () => void;
  allTokensFlat: Record<string, any>;
  pathToSet: Record<string, string>;
  dimensions: CollectionDefinition[];
  sets: string[];
  modeOptionsKey: number;
  modeOptionsDefaultA: string;
  modeOptionsDefaultB: string;
  onEditToken: (setName: string, tokenPath: string) => void;
  onCreateToken: (tokenPath: string, setName: string) => void;
  onGoToTokens: () => void;
  serverUrl: string;
  onTokensCreated: () => void;
  onBack: () => void;
}

export function CollectionCompareScreen({
  focusLabel,
  mode,
  onModeChange,
  tokenPaths,
  onClearTokenPaths,
  tokenPath,
  onClearTokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  sets,
  modeOptionsKey,
  modeOptionsDefaultA,
  modeOptionsDefaultB,
  onEditToken,
  onCreateToken,
  onGoToTokens,
  serverUrl,
  onTokensCreated,
  onBack,
}: CollectionCompareScreenProps) {
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5">
          <button
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to collections
          </button>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-[var(--color-figma-text)]">
                Preview Review
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Compare how tokens resolve across collection modes before publish.
              </p>
            </div>
            {focusLabel ? (
              <div className="max-w-[120px] truncate text-[9px] text-[var(--color-figma-text-secondary)]">
                {focusLabel}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <UnifiedComparePanel
          mode={mode}
          onModeChange={onModeChange}
          tokenPaths={tokenPaths}
          onClearTokenPaths={onClearTokenPaths}
          tokenPath={tokenPath}
          onClearTokenPath={onClearTokenPath}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          dimensions={dimensions}
          sets={sets}
          modeOptionsKey={modeOptionsKey}
          modeOptionsDefaultA={modeOptionsDefaultA}
          modeOptionsDefaultB={modeOptionsDefaultB}
          onEditToken={onEditToken}
          onCreateToken={onCreateToken}
          onGoToTokens={onGoToTokens}
          serverUrl={serverUrl}
          onTokensCreated={onTokensCreated}
          onBack={onBack}
          backLabel="Back to review"
        />
      </div>
    </>
  );
}
