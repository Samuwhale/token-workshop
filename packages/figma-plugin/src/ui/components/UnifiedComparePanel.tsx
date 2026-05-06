/**
 * UnifiedComparePanel — wrapper for the three-mode comparison UI shown in
 * the Tokens workspace contextual panel.
 */

import { CompareView } from './CompareView';
export type { CompareMode } from './CompareView';
import type { TokenCollection } from '@token-workshop/core';
import type { TokenMapEntry } from '../../shared/types';
import type { CompareMode } from './CompareView';

export interface UnifiedComparePanelProps {
  mode: CompareMode;
  onModeChange: (mode: CompareMode) => void;

  tokenPaths: Set<string>;
  onClearTokenPaths: () => void;

  tokenPath: string;
  onClearTokenPath: () => void;

  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collections: TokenCollection[];
  collectionIds: string[];

  modeOptionsKey: number;
  modeOptionsDefaultA: string;
  modeOptionsDefaultB: string;

  onEditToken: (collectionId: string, path: string) => void;
  onCreateToken: (path: string, collectionId: string, type: string, value?: string) => void;

  onGoToTokens: () => void;

  serverUrl?: string;
  onTokensCreated?: () => void;

  /** Called when the user clicks the back button. */
  onBack: () => void;
  /** Label shown next to the back chevron. Defaults to "Back". */
  backLabel?: string;
}

export function UnifiedComparePanel({
  onBack,
  backLabel = 'Back',
  ...compareProps
}: UnifiedComparePanelProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--color-figma-bg)]">
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-[var(--color-figma-border)] px-3 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          aria-label={backLabel}
        >
          <svg width="6" height="10" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 1L2 6l4 5" />
          </svg>
          {backLabel}
        </button>
        <span className="text-body font-semibold text-[color:var(--color-figma-text)]">
          Compare
        </span>
        <div className="w-12 shrink-0" aria-hidden />
      </div>

      <div className="flex-1 overflow-hidden">
        <CompareView {...compareProps} />
      </div>
    </div>
  );
}
