import { UnusedTokensPanel } from "../UnusedTokensPanel";
import { Spinner } from "../Spinner";
import type { UnusedToken } from "../../hooks/useHealthData";
import { HealthSubViewHeader } from "./HealthSubViewHeader";

export interface HealthUnusedViewProps {
  serverUrl: string;
  loading: boolean;
  unusedTokens: UnusedToken[];
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void | Promise<void>;
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
      <HealthSubViewHeader
        title="Unused"
        onBack={onBack}
        count={
          !loading && unusedTokens.length > 0
            ? `${unusedTokens.length} token${unusedTokens.length !== 1 ? "s" : ""}`
            : undefined
        }
      />

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
