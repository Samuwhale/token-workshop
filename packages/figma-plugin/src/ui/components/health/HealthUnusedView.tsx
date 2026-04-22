import { UnusedTokensPanel } from "../UnusedTokensPanel";
import { Spinner } from "../Spinner";
import type { UnusedToken } from "../../hooks/useHealthData";

export interface HealthUnusedViewProps {
  serverUrl: string;
  loading: boolean;
  unusedTokens: UnusedToken[];
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void;
  onBack: () => void;
}

export function HealthUnusedView({
  serverUrl,
  loading,
  unusedTokens,
  onNavigateToToken,
  onError,
  onMutate,
  onBack,
}: HealthUnusedViewProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          aria-label="Back"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-body font-semibold text-[var(--color-figma-text)]">Unused</span>
        {!loading && unusedTokens.length > 0 && (
          <span className="text-secondary text-[var(--color-figma-text-tertiary)] ml-auto">
            {unusedTokens.length} token{unusedTokens.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <Spinner size="sm" />
            <p className="text-body text-[var(--color-figma-text-secondary)]">
              Scanning Figma usage to find unused tokens.
            </p>
          </div>
        ) : (
          <UnusedTokensPanel
            serverUrl={serverUrl}
            unusedTokens={unusedTokens}
            onNavigateToToken={onNavigateToToken}
            onError={onError}
            onMutate={onMutate}
            embedded
          />
        )}
      </div>
    </div>
  );
}
