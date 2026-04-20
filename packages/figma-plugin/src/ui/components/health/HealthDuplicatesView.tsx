import { DuplicateDetectionPanel } from "../DuplicateDetectionPanel";
import type { DuplicateGroup } from "../../hooks/useHealthData";

export interface HealthDuplicatesViewProps {
  serverUrl: string;
  lintDuplicateGroups: DuplicateGroup[];
  totalDuplicateAliases: number;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void;
  onRefreshValidation: () => void;
  onBack: () => void;
}

export function HealthDuplicatesView({
  serverUrl,
  lintDuplicateGroups,
  totalDuplicateAliases,
  onNavigateToToken,
  onError,
  onMutate,
  onRefreshValidation,
  onBack,
}: HealthDuplicatesViewProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-1.5">
        <button
          onClick={onBack}
          className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Duplicates</span>
        {lintDuplicateGroups.length > 0 && (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] ml-auto">
            {lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? "s" : ""} · {totalDuplicateAliases} redundant
          </span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <DuplicateDetectionPanel
          serverUrl={serverUrl}
          lintDuplicateGroups={lintDuplicateGroups}
          totalDuplicateAliases={totalDuplicateAliases}
          onNavigateToToken={onNavigateToToken}
          onError={onError}
          onMutate={onMutate}
          onRefreshValidation={onRefreshValidation}
          embedded
        />
      </div>
    </div>
  );
}
