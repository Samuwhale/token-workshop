import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import type { UndoSlot } from "../components/history/types";
import { GitRepositoryPanel } from "../components/publish/GitRepositoryPanel";
import { useNavigationContext } from "../contexts/NavigationContext";

interface GitRouterProps {
  serverUrl: string;
  connected: boolean;
  onPushUndo?: (slot: UndoSlot) => void;
  onRefreshTokens?: () => void;
}

export function GitRouter({
  serverUrl,
  connected,
  onPushUndo,
  onRefreshTokens,
}: GitRouterProps): ReactNode {
  const { navigateTo } = useNavigationContext();

  return (
    <ErrorBoundary
      panelName="Publish · Repository"
      onReset={() => navigateTo("publish", "publish-repository")}
    >
      <GitRepositoryPanel
        serverUrl={serverUrl}
        connected={connected}
        onPushUndo={onPushUndo}
        onRefreshTokens={onRefreshTokens}
      />
    </ErrorBoundary>
  );
}
