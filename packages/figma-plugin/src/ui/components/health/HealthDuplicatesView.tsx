import { DuplicateDetectionPanel } from "../DuplicateDetectionPanel";
import type { DuplicateGroup } from "../../hooks/useHealthData";
import { HealthSubViewHeader } from "./HealthSubViewHeader";

export interface HealthDuplicatesViewProps {
  serverUrl: string;
  lintDuplicateGroups: DuplicateGroup[];
  totalDuplicateAliases: number;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => Promise<void> | void;
  onBack: () => void;
}

export function HealthDuplicatesView({
  serverUrl,
  lintDuplicateGroups,
  totalDuplicateAliases,
  onNavigateToToken,
  onError,
  onMutate,
  onBack,
}: HealthDuplicatesViewProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <HealthSubViewHeader
        title="Duplicates"
        onBack={onBack}
        count={
          lintDuplicateGroups.length > 0
            ? `${lintDuplicateGroups.length} group${lintDuplicateGroups.length !== 1 ? "s" : ""} · ${totalDuplicateAliases} redundant`
            : undefined
        }
      />

      <div className="flex-1 overflow-hidden">
        <DuplicateDetectionPanel
          serverUrl={serverUrl}
          lintDuplicateGroups={lintDuplicateGroups}
          totalDuplicateAliases={totalDuplicateAliases}
          onNavigateToToken={onNavigateToToken}
          onError={onError}
          onMutate={onMutate}
          embedded
        />
      </div>
    </div>
  );
}
