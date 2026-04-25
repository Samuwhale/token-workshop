import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { resolveCollectionIdForPath } from "@tokenmanager/core";
import { DeliveryStatusStrip } from "../components/DeliveryStatusStrip";
import { SelectionInspector } from "../components/SelectionInspector";
import { CanvasRepairPanel } from "../components/CanvasRepairPanel";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  useConnectionContext,
  useSyncContext,
} from "../contexts/ConnectionContext";
import { useCollectionStateContext, useTokenFlatMapContext } from "../contexts/TokenDataContext";
import { useSelectionContext } from "../contexts/InspectContext";
import {
  useNavigationContext,
  type RepairPrefillEntry,
} from "../contexts/NavigationContext";
import {
  useApplyWorkspaceController,
  useSyncWorkspaceController,
  useTokensWorkspaceController,
} from "../contexts/WorkspaceControllerContext";
import { useSelectionHealth } from "../hooks/useSelectionHealth";
import type { useTokenContextNavigation } from "../hooks/useTokenContextNavigation";
import type { LibraryReviewSummary } from "../shared/reviewSummary";
type SubTab = "inspect" | "repair";

interface CanvasRouterProps {
  subTab: SubTab;
  reviewTotals: LibraryReviewSummary["totals"];
  openScopedHealth: (collectionId: string) => void;
  openTokenInContext: ReturnType<typeof useTokenContextNavigation>;
}

function CanvasRepairPanelMount({
  tokenMap,
  syncResult,
  consumePendingRepairPrefill,
}: {
  tokenMap: Parameters<typeof CanvasRepairPanel>[0]["tokenMap"];
  syncResult: Parameters<typeof CanvasRepairPanel>[0]["syncResult"];
  consumePendingRepairPrefill: () => readonly RepairPrefillEntry[] | null;
}) {
  const [prefillEntries] = useState<readonly RepairPrefillEntry[] | null>(() =>
    consumePendingRepairPrefill(),
  );
  return (
    <CanvasRepairPanel
      tokenMap={tokenMap}
      syncResult={syncResult}
      prefillEntries={prefillEntries}
    />
  );
}

export function CanvasRouter({
  subTab,
  reviewTotals,
  openScopedHealth,
  openTokenInContext,
}: CanvasRouterProps): ReactNode {
  const { serverUrl, connected } = useConnectionContext();
  const { sync, syncing, syncProgress, syncResult, syncError } = useSyncContext();
  const {
    workingCollectionId: currentCollectionId,
    refreshCollections: refreshTokens,
  } = useCollectionStateContext();
  const { allTokensFlat, pathToCollectionId, collectionIdsByPath } = useTokenFlatMapContext();
  const { selectedNodes, selectionLoading } = useSelectionContext();
  const {
    navigateTo,
    pendingRepairPrefill,
    setPendingRepairPrefill,
    consumePendingRepairPrefill,
  } = useNavigationContext();
  const tokens = useTokensWorkspaceController();
  const apply = useApplyWorkspaceController();
  const syncCtrl = useSyncWorkspaceController();

  const selectionHealth = useSelectionHealth(selectedNodes, allTokensFlat);

  useEffect(() => {
    if (subTab !== "repair") return;
    if (!selectionHealth.hasSelection) return;
    const hasWork =
      selectionHealth.staleBindingCount > 0 ||
      (pendingRepairPrefill?.length ?? 0) > 0 ||
      (syncResult?.missingTokens.length ?? 0) > 0;
    if (!hasWork) navigateTo("canvas", "inspect");
  }, [
    subTab,
    selectionHealth.hasSelection,
    selectionHealth.staleBindingCount,
    pendingRepairPrefill,
    syncResult,
    navigateTo,
  ]);

  const deliveryStrip = (
    <DeliveryStatusStrip
      reviewStatus={reviewTotals.status}
      reviewItemCount={reviewTotals.reviewItems}
      pendingPublishCount={syncCtrl.pendingPublishCount}
      publishApplying={syncCtrl.publishApplying}
      syncing={syncing}
      syncError={syncError}
      syncResult={syncResult}
      onOpenHealth={() => openScopedHealth(currentCollectionId)}
      onOpenPublishCompare={() => {
        navigateTo("publish", "publish-figma");
        syncCtrl.publishPanelHandleRef.current?.focusStage("compare");
      }}
      onOpenSync={() => navigateTo("publish", "publish-figma")}
    />
  );

  if (subTab === "inspect") {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        {deliveryStrip}
        <ErrorBoundary
          panelName="Canvas selection"
          onReset={() => navigateTo("library", "tokens")}
        >
          <SelectionInspector
            selectedNodes={selectedNodes}
            selectionLoading={selectionLoading}
            tokenMap={allTokensFlat}
            onSync={sync}
            syncing={syncing}
            syncProgress={syncProgress}
            syncResult={syncResult}
            syncError={syncError}
            connected={connected}
            currentCollectionId={currentCollectionId}
            serverUrl={serverUrl}
            onTokenCreated={refreshTokens}
            onNavigateToToken={(path) => {
              const resolution = resolveCollectionIdForPath({
                path,
                pathToCollectionId,
                collectionIdsByPath,
                preferredCollectionId: currentCollectionId,
              });
              if (!resolution.collectionId) {
                tokens.setErrorToast(
                  resolution.reason === "ambiguous"
                    ? `Token target is ambiguous across collections: ${path}`
                    : `Token target not found: ${path}`,
                );
                return;
              }
              openTokenInContext({
                path,
                collectionId: resolution.collectionId,
                mode: "inspect",
                origin: "canvas",
                returnLabel: "Back to Canvas",
              });
            }}
            onPushUndo={tokens.pushUndo}
            onToast={tokens.setSuccessToast}
            onGoToTokens={() => navigateTo("library", "tokens")}
            triggerCreateToken={apply.triggerCreateToken}
            triggerExtractToken={apply.triggerExtractToken}
            onOpenRepair={(entries) => {
              setPendingRepairPrefill(entries ?? null);
              navigateTo("canvas", "repair");
            }}
          />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {deliveryStrip}
      <ErrorBoundary
        panelName="Canvas repair"
        onReset={() => navigateTo("canvas", "inspect")}
      >
        <CanvasRepairPanelMount
          tokenMap={allTokensFlat}
          syncResult={syncResult}
          consumePendingRepairPrefill={consumePendingRepairPrefill}
        />
      </ErrorBoundary>
    </div>
  );
}
