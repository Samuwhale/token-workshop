import type { ThemeDimension } from "@tokenmanager/core";
import { UnifiedComparePanel } from "../UnifiedComparePanel";
import type { CompareMode } from "../UnifiedComparePanel";

interface ThemeCompareScreenProps {
  compareFocusDimension: ThemeDimension | null;
  compareFocusOptionName: string | null;
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;
  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;
  tokenPath: string;
  onClearTokenPath: () => void;
  allTokensFlat: Record<string, any>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];
  sets: string[];
  themeOptionsKey: number;
  themeOptionsDefaultA: string;
  themeOptionsDefaultB: string;
  onEditToken: (setName: string, tokenPath: string) => void;
  onCreateToken: (tokenPath: string, setName: string) => void;
  onGoToTokens: () => void;
  serverUrl: string;
  onTokensCreated: () => void;
  onBack: () => void;
}

export function ThemeCompareScreen({
  compareFocusDimension,
  compareFocusOptionName,
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
  themeOptionsKey,
  themeOptionsDefaultA,
  themeOptionsDefaultB,
  onEditToken,
  onCreateToken,
  onGoToTokens,
  serverUrl,
  onTokensCreated,
  onBack,
}: ThemeCompareScreenProps) {
  const focusLabel = compareFocusDimension
    ? compareFocusOptionName
      ? `${compareFocusDimension.name}: ${compareFocusOptionName}`
      : compareFocusDimension.name
    : null;

  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2">
          <div className="flex items-center gap-2">
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
              Theme setup
            </button>
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
                Compare mode values
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
                Review how token values change across mode options before you publish or map more sets.
              </p>
            </div>
            {focusLabel ? (
              <div className="max-w-[120px] truncate rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)]">
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
          themeOptionsKey={themeOptionsKey}
          themeOptionsDefaultA={themeOptionsDefaultA}
          themeOptionsDefaultB={themeOptionsDefaultB}
          onEditToken={onEditToken}
          onCreateToken={onCreateToken}
          onGoToTokens={onGoToTokens}
          serverUrl={serverUrl}
          onTokensCreated={onTokensCreated}
          onBack={onBack}
          backLabel="Back"
        />
      </div>
    </>
  );
}
