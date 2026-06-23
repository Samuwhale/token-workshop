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
  const { collections, workingCollectionId: currentCollectionId } =
    useCollectionStateContext();
  const { perCollectionFlat } = useTokenFlatMapContext();
  const { navigateTo } = useNavigationContext();
  const controller = useSyncWorkspaceController();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelContentHeader title="Figma variables" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ErrorBoundary
          panelName="Handoff · Figma variables"
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
