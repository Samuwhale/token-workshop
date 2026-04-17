/**
 * UnifiedComparePanel — wrapper for the three-mode comparison UI shown in
 * the Tokens workspace contextual panel.
 */

import { CompareView } from './CompareView';
export type { CompareMode } from './CompareView';
import type { TokenCollection } from '@tokenmanager/core';
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
  pathToStorageCollectionId: Record<string, string>;
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
    <>
      {/* Back button bar */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          aria-label={backLabel}
        >
          <svg width="6" height="10" viewBox="0 0 8 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 1L2 6l4 5" />
          </svg>
          {backLabel}
        </button>
      </div>

      {/* The shared comparison UI */}
      <div className="flex-1 overflow-hidden">
        <CompareView {...compareProps} />
      </div>
    </>
  );
}
