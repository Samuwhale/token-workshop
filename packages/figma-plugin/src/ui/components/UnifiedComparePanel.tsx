import type { TokenMapEntry } from '../../shared/types';
import type { ThemeDimension } from '@tokenmanager/core';
import { ComparePanel } from './ComparePanel';
import { CrossThemeComparePanel } from './CrossThemeComparePanel';
import { ThemeCompare } from './ThemeCompare';

export type CompareMode = 'tokens' | 'cross-theme' | 'theme-options';

interface UnifiedComparePanelProps {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;

  /** For 'tokens' mode: token paths to compare */
  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;

  /** For 'cross-theme' mode: single token path */
  tokenPath: string;
  onClearTokenPath: () => void;

  /** Unthemed flat token map — used by 'tokens' and 'cross-theme' modes */
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  dimensions: ThemeDimension[];

  /** For 'theme-options' mode — pre-selected options */
  themeOptionsKey: number;
  themeOptionsDefaultA: string;
  themeOptionsDefaultB: string;

  /** Navigate to a token for editing (used by 'theme-options' mode) */
  onEditToken: (set: string, path: string) => void;
  onCreateToken: (path: string, set: string, type: string, value?: string) => void;

  /** Navigate back to Tokens tab (used in empty-state prompts) */
  onGoToTokens: () => void;

  /** Server URL for bulk token creation actions */
  serverUrl?: string;
  /** Called after tokens are batch-created so the caller can refresh */
  onTokensCreated?: () => void;
}

const MODES: { id: CompareMode; label: string }[] = [
  { id: 'tokens', label: 'Token values' },
  { id: 'cross-theme', label: 'Token × themes' },
  { id: 'theme-options', label: 'Theme options' },
];

export function UnifiedComparePanel({
  mode,
  onModeChange,
  tokenPaths,
  onClearTokenPaths,
  tokenPath,
  onClearTokenPath,
  allTokensFlat,
  pathToSet,
  dimensions,
  themeOptionsKey,
  themeOptionsDefaultA,
  themeOptionsDefaultB,
  onEditToken,
  onCreateToken,
  onGoToTokens,
  serverUrl,
  onTokensCreated,
}: UnifiedComparePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Mode selector */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-1">Compare:</span>
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              mode === m.id
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'tokens' && (
          tokenPaths.size < 2 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                Select 2 or more tokens in the Tokens tab and click <strong>Compare</strong> to see a side-by-side value comparison.
              </p>
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Go to Tokens
              </button>
            </div>
          ) : (
            <ComparePanel
              selectedPaths={tokenPaths}
              allTokensFlat={allTokensFlat}
              onClose={onClearTokenPaths}
            />
          )
        )}

        {mode === 'cross-theme' && (
          tokenPath === '' || dimensions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
              {dimensions.length === 0 ? (
                <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  No theme dimensions are configured. Set up themes first.
                </p>
              ) : (
                <p className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  Right-click any token in the Tokens tab and choose <strong>Compare across themes</strong> to see how its value changes across each theme option.
                </p>
              )}
              <button
                onClick={onGoToTokens}
                className="px-3 py-1 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
              >
                Go to Tokens
              </button>
            </div>
          ) : (
            <CrossThemeComparePanel
              tokenPath={tokenPath}
              allTokensFlat={allTokensFlat}
              pathToSet={pathToSet}
              dimensions={dimensions}
              onClose={onClearTokenPath}
              serverUrl={serverUrl}
              onTokensCreated={onTokensCreated}
            />
          )
        )}

        {mode === 'theme-options' && (
          <ThemeCompare
            key={themeOptionsKey}
            dimensions={dimensions}
            allTokensFlat={allTokensFlat}
            pathToSet={pathToSet}
            initialOptionKeyA={themeOptionsDefaultA}
            initialOptionKeyB={themeOptionsDefaultB}
            onEditToken={onEditToken}
            onCreateToken={onCreateToken}
            serverUrl={serverUrl}
            onTokensCreated={onTokensCreated}
          />
        )}
      </div>
    </div>
  );
}
