import type { ReactNode } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PanelContentHeader } from "../components/PanelContentHeader";
import { PublishPanel } from "../components/PublishPanel";
import { useConnectionContext } from "../contexts/ConnectionContext";
import { useCollectionStateContext, useTokenFlatMapContext } from "../contexts/TokenDataContext";
import { useNavigationContext } from "../contexts/NavigationContext";
import { useSyncWorkspaceController } from "../contexts/WorkspaceControllerContext";
import type { PublishRoutingDraft } from "../hooks/usePublishRouting";

interface SyncRouterProps {
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  onOpenGenerator?: (
    generatorId: string,
    options?: {
      preserveHandoff?: boolean;
      focus?: {
        diagnosticId?: string;
        nodeId?: string;
        edgeId?: string;
      };
    },
  ) => void;
  savePublishRouting: (
    collectionId: string,
    routing: PublishRoutingDraft,
  ) => Promise<{ collectionName?: string; modeName?: string }>;
}

export function SyncRouter({
  collectionMap,
  modeMap,
  onOpenGenerator,
  savePublishRouting,
}: SyncRouterProps): ReactNode {
  const { serverUrl, connected } = useConnectionContext();
  const { collections, workingCollectionId: currentCollectionId } = useCollectionStateContext();
  const { perCollectionFlat } = useTokenFlatMapContext();
  const { navigateTo } = useNavigationContext();
  const controller = useSyncWorkspaceController();
  const { publishPreflightState, pendingPublishCount, publishPanelHandleRef } = controller;

  let publishAction: { label: string; onClick: () => void; disabled?: boolean };
  if (publishPreflightState.stage === "running") {
    publishAction = { label: "Checking…", onClick: () => {}, disabled: true };
  } else if (publishPreflightState.stage === "blocked") {
    publishAction = {
      label: "Resolve issues",
      onClick: () => publishPanelHandleRef.current?.focusStage("preflight"),
    };
  } else if (publishPreflightState.targetDirty) {
    publishAction = {
      label: "Review target",
      onClick: () => publishPanelHandleRef.current?.focusPublishTarget(),
    };
  } else if (pendingPublishCount > 0) {
    publishAction = {
      label: "Apply changes",
      onClick: () => publishPanelHandleRef.current?.focusStage("compare"),
    };
  } else {
    publishAction = {
      label: "Check for changes",
      onClick: () => publishPanelHandleRef.current?.runReadinessChecks(),
    };
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelContentHeader primaryAction={publishAction} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary
          panelName="Publish · Figma"
          onReset={() => navigateTo("publish", "publish-figma")}
        >
          <PublishPanel
            serverUrl={serverUrl}
            connected={connected}
            currentCollectionId={currentCollectionId}
            collections={collections}
            collectionMap={collectionMap}
            modeMap={modeMap}
            perCollectionFlat={perCollectionFlat}
            savePublishRouting={savePublishRouting}
            refreshValidation={controller.refreshValidation}
            onOpenGenerator={onOpenGenerator}
            tokenChangeKey={controller.tokenChangeKey}
            publishPanelHandle={controller.publishPanelHandleRef}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
