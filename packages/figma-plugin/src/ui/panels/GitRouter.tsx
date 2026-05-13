import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { UndoSlot } from "../components/history/types";
import { GitRepositoryPanel } from "../components/publish/GitRepositoryPanel";
import { useNavigationContext } from "../contexts/NavigationContext";

interface GitRouterProps {
  serverUrl: string;
  connected: boolean;
  collectionDisplayNames?: Record<string, string>;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
}

export function GitRouter({
  serverUrl,
  connected,
  collectionDisplayNames,
  onPushUndo,
  onRefreshTokens,
}: GitRouterProps): ReactNode {
  const { navigateTo } = useNavigationContext();

  return (
    <ErrorBoundary
      panelName="Handoff · Repository sync"
      onReset={() => navigateTo("publish", "publish-repository")}
    >
      <GitRepositoryPanel
        serverUrl={serverUrl}
        connected={connected}
        collectionDisplayNames={collectionDisplayNames}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
      />
    </ErrorBoundary>
  );
}
