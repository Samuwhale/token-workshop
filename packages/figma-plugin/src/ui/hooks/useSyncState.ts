import { useState, useEffect, useRef } from "react";
import { useFigmaSync } from "./useFigmaSync";
import {
  DEFAULT_PUBLISH_PREFLIGHT_STATE,
  type PublishPreflightState,
} from "../shared/syncWorkflow";
import {
  PUBLISH_PENDING_COUNT_EVENT,
  PUBLISH_PREFLIGHT_STATE_EVENT,
  normalizePublishPreflightState,
  readPublishPendingCountEvent,
} from "../shared/publishStatusEvents";
import type { PublishPanelHandle } from "../components/PublishPanel";
import type { TokenCollection } from "@token-workshop/core";
import type { TokenMapEntry } from "../../shared/types";

interface UseSyncStateParams {
  connected: boolean;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  setErrorToast: (msg: string) => void;
}

export function useSyncState({
  connected,
  collections,
  perCollectionFlat,
  collectionMap,
  modeMap,
  setErrorToast,
}: UseSyncStateParams) {
  const figmaSync = useFigmaSync(
    connected,
    collections,
    perCollectionFlat,
    collectionMap,
    modeMap,
  );

  const [pendingPublishCount, setPendingPublishCount] = useState(0);
  const [publishPreflightState, setPublishPreflightState] =
    useState<PublishPreflightState>(DEFAULT_PUBLISH_PREFLIGHT_STATE);
  const publishPanelHandleRef = useRef<PublishPanelHandle | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      setPendingPublishCount(readPublishPendingCountEvent(event));
    };
    window.addEventListener(PUBLISH_PENDING_COUNT_EVENT, handler);
    return () => window.removeEventListener(PUBLISH_PENDING_COUNT_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      setPublishPreflightState(
        normalizePublishPreflightState(
          (event as CustomEvent<unknown>).detail,
        ),
      );
    };
    window.addEventListener(PUBLISH_PREFLIGHT_STATE_EVENT, handler);
    return () => window.removeEventListener(PUBLISH_PREFLIGHT_STATE_EVENT, handler);
  }, []);

  useEffect(() => {
    if (connected) return;
    setPendingPublishCount(0);
    setPublishPreflightState(DEFAULT_PUBLISH_PREFLIGHT_STATE);
  }, [connected]);

  useEffect(() => {
    if (figmaSync.publishError) setErrorToast(figmaSync.publishError);
  }, [figmaSync.publishError, setErrorToast]);

  return {
    ...figmaSync,
    pendingPublishCount,
    publishPreflightState,
    publishPanelHandleRef,
  };
}
