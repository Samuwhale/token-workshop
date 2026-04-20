import { useState, useEffect, useRef } from "react";
import { useFigmaSync } from "./useFigmaSync";
import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightState,
} from "../shared/syncWorkflow";
import type { PublishPanelHandle } from "../components/PublishPanel";

interface UseSyncStateParams {
  serverUrl: string;
  connected: boolean;
  pathToCollectionId: Record<string, string>;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  currentCollectionId: string;
  setErrorToast: (msg: string) => void;
}

export function useSyncState({
  serverUrl,
  connected,
  pathToCollectionId,
  collectionMap,
  modeMap,
  currentCollectionId,
  setErrorToast,
}: UseSyncStateParams) {
  const figmaSync = useFigmaSync(
    serverUrl,
    connected,
    pathToCollectionId,
    collectionMap,
    modeMap,
    currentCollectionId,
  );

  const [pendingPublishCount, setPendingPublishCount] = useState(0);
  const [publishPreflightState, setPublishPreflightState] =
    useState<PublishPreflightState>(DEFAULT_PUBLISH_PREFLIGHT_STATE);
  const publishPanelHandleRef = useRef<PublishPanelHandle | null>(null);

  useEffect(() => {
    const handler = (e: Event) =>
      setPendingPublishCount(
        (e as CustomEvent<{ total: number }>).detail.total,
      );
    window.addEventListener("publish-pending-count", handler);
    return () => window.removeEventListener("publish-pending-count", handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) =>
      setPublishPreflightState(
        (e as CustomEvent<PublishPreflightState>).detail,
      );
    window.addEventListener("publish-preflight-state", handler);
    return () => window.removeEventListener("publish-preflight-state", handler);
  }, []);

  useEffect(() => {
    if (figmaSync.syncGroupStylesError) setErrorToast(figmaSync.syncGroupStylesError);
  }, [figmaSync.syncGroupStylesError, setErrorToast]);

  useEffect(() => {
    if (figmaSync.syncGroupError) setErrorToast(figmaSync.syncGroupError);
  }, [figmaSync.syncGroupError, setErrorToast]);

  return {
    ...figmaSync,
    pendingPublishCount,
    publishPreflightState,
    publishPanelHandleRef,
  };
}
