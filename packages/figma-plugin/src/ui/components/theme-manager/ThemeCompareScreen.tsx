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
  return (
    <>
      <div className="shrink-0 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="px-3 py-2.5">
          <p className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            {compareFocusDimension
              ? `Compare from ${compareFocusDimension.name}`
              : "Compare in theme context"}
          </p>
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--color-figma-text-secondary)]">
            {compareFocusDimension && compareFocusOptionName
              ? `Theme option comparison starts from ${compareFocusDimension.name} → ${compareFocusOptionName}. Switch compare modes if you need token-level or set-level analysis without losing this context.`
              : "Compare launches from Advanced setup so you can inspect alternatives without reopening the simple authoring flow."}
          </p>
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
          backLabel={
            compareFocusDimension
              ? `Back to ${compareFocusDimension.name} setup`
              : "Back to advanced setup"
          }
        />
      </div>
    </>
  );
}
