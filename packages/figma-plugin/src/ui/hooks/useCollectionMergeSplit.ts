import { useState, useRef } from "react";
import type { UndoSlot } from "./useUndo";
import {
  apiFetch,
  createFetchSignal,
  isNetworkError,
} from "../shared/apiFetch";
import type { CollectionStructuralPreflight } from "../shared/collectionStructuralPreflight";
import { isAbortError, stableStringify } from "../shared/utils";

interface MergeCollectionResponse {
  ok: true;
  sourceCollection: string;
  targetCollection: string;
  operationId: string;
}

interface SplitCollectionResponse {
  ok: true;
  sourceCollection: string;
  createdCollections: string[];
  deleteOriginal: boolean;
  operationId: string;
}

interface UseCollectionMergeSplitParams {
  serverUrl: string;
  connected: boolean;
  getDisconnectSignal: () => AbortSignal;
  collectionIds: string[];
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  markDisconnected: () => void;
  pushUndo: (slot: UndoSlot) => void;
  onMergeComplete?: (sourceCollectionId: string, targetCollectionId: string) => void;
  onSplitComplete?: (result: {
    sourceCollectionId: string;
    createdCollectionIds: string[];
    deleteOriginal: boolean;
  }) => void;
}

function areMergeConflictsEqual(
  left: Array<{ path: string; sourceValue: unknown; targetValue: unknown }>,
  right: Array<{ path: string; sourceValue: unknown; targetValue: unknown }>,
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (conflict, index) =>
      conflict.path === right[index]?.path &&
      stableStringify(conflict.sourceValue) ===
        stableStringify(right[index]?.sourceValue) &&
      stableStringify(conflict.targetValue) ===
        stableStringify(right[index]?.targetValue),
  );
}

async function fetchCollectionStructuralPreflight(
  serverUrl: string,
  collectionId: string,
  body: {
    operation: "merge" | "split";
    targetCollection?: string;
    deleteOriginal?: boolean;
  },
  signal: AbortSignal,
): Promise<CollectionStructuralPreflight> {
  return apiFetch<CollectionStructuralPreflight>(
    `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/preflight`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
}

export function useCollectionMergeSplit({
  serverUrl,
  connected,
  getDisconnectSignal,
  collectionIds,
  currentCollectionId,
  setCurrentCollectionId,
  refreshTokens,
  setSuccessToast,
  setErrorToast,
  markDisconnected,
  pushUndo,
  onMergeComplete,
  onSplitComplete,
}: UseCollectionMergeSplitParams) {
  // Merge state
  const [mergingCollectionId, setMergingCollectionId] = useState<string | null>(null);
  const [mergeTargetCollectionId, setMergeTargetCollectionId] = useState<string>("");
  const [mergeConflicts, setMergeConflicts] = useState<
    Array<{ path: string; sourceValue: unknown; targetValue: unknown }>
  >([]);
  const [mergeResolutions, setMergeResolutions] = useState<
    Record<string, "source" | "target">
  >({});
  const [mergeChecked, setMergeChecked] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  // Tracks the target that was used for the most recent conflict check,
  // so we can discard stale async results if the user changes target mid-check.
  const mergeCheckTargetRef = useRef<string>("");
  const mergeCheckRequestIdRef = useRef(0);
  const mergeConfirmRequestIdRef = useRef(0);

  // Split state
  const [splittingCollectionId, setSplittingCollectionId] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<
    Array<{ key: string; newCollectionId: string; count: number }>
  >([]);
  const [splitDeleteOriginal, setSplitDeleteOriginal] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);
  const splitOpenRequestIdRef = useRef(0);
  const splitConfirmRequestIdRef = useRef(0);

  const createCollectionOperationSignal = () => createFetchSignal(getDisconnectSignal());

  // --- Merge ---

  const openMergeDialog = (collectionId: string) => {
    mergeCheckRequestIdRef.current += 1;
    mergeConfirmRequestIdRef.current += 1;
    mergeCheckTargetRef.current = "";
    setMergingCollectionId(collectionId);
    setMergeTargetCollectionId(collectionIds.find((candidate) => candidate !== collectionId) || "");
    setMergeConflicts([]);
    setMergeResolutions({});
    setMergeChecked(false);
    setMergeLoading(false);
  };

  const closeMergeDialog = () => {
    mergeCheckRequestIdRef.current += 1;
    mergeConfirmRequestIdRef.current += 1;
    mergeCheckTargetRef.current = "";
    setMergingCollectionId(null);
    setMergeTargetCollectionId("");
    setMergeConflicts([]);
    setMergeResolutions({});
    setMergeChecked(false);
    setMergeLoading(false);
  };

  const changeMergeTarget = (target: string) => {
    mergeCheckRequestIdRef.current += 1;
    setMergeTargetCollectionId(target);
    setMergeChecked(false);
    setMergeConflicts([]);
    setMergeResolutions({});
  };

  const handleCheckMergeConflicts = async () => {
    if (!mergingCollectionId || !mergeTargetCollectionId || !connected) return;
    const requestId = ++mergeCheckRequestIdRef.current;
    const checkTarget = mergeTargetCollectionId;
    mergeCheckTargetRef.current = checkTarget;
    setMergeLoading(true);
    try {
      const preflight = await fetchCollectionStructuralPreflight(
        serverUrl,
        mergingCollectionId,
        {
          operation: "merge",
          targetCollection: checkTarget,
        },
        createCollectionOperationSignal(),
      );
      // Discard results if the target changed while the check was in flight
      if (
        mergeCheckRequestIdRef.current !== requestId ||
        mergeCheckTargetRef.current !== checkTarget
      ) {
        return;
      }
      const conflicts = preflight.mergeConflicts ?? [];
      setMergeConflicts(conflicts);
      const res: Record<string, "source" | "target"> = {};
      for (const c of conflicts) res[c.path] = "target";
      setMergeResolutions(res);
      setMergeChecked(true);
    } catch (err) {
      // Don't show error toast for stale checks
      if (
        mergeCheckRequestIdRef.current !== requestId ||
        mergeCheckTargetRef.current !== checkTarget
      ) {
        return;
      }
      if (isAbortError(err)) return;
      if (isNetworkError(err)) {
        markDisconnected();
        return;
      }
      setErrorToast(
        `Failed to check merge conflicts: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (mergeCheckRequestIdRef.current === requestId) {
        setMergeLoading(false);
      }
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergingCollectionId || !mergeTargetCollectionId || !connected || !mergeChecked) return;
    const requestId = ++mergeConfirmRequestIdRef.current;
    const sourceCollectionId = mergingCollectionId;
    const targetCollectionId = mergeTargetCollectionId;
    setMergeLoading(true);
    try {
      const preflight = await fetchCollectionStructuralPreflight(
        serverUrl,
        sourceCollectionId,
        {
          operation: "merge",
          targetCollection: targetCollectionId,
        },
        createCollectionOperationSignal(),
      );
      if (mergeConfirmRequestIdRef.current !== requestId) return;
      if ((preflight.blockers?.length ?? 0) > 0) {
        const message =
          preflight.blockers[0]?.message ??
          "Merge is blocked by collection dependencies.";
        setErrorToast(message);
        return;
      }
      const latestConflicts = preflight.mergeConflicts ?? [];
      if (!areMergeConflictsEqual(latestConflicts, mergeConflicts)) {
        const nextResolutions: Record<string, "source" | "target"> = {};
        for (const conflict of latestConflicts) {
          nextResolutions[conflict.path] =
            mergeResolutions[conflict.path] ?? "target";
        }
        setMergeConflicts(latestConflicts);
        setMergeResolutions(nextResolutions);
        setMergeChecked(true);
        setErrorToast(
          "Merge preflight changed. Review the current conflicts before merging.",
        );
        return;
      }
      const result = await apiFetch<MergeCollectionResponse>(
        `${serverUrl}/api/collections/${encodeURIComponent(sourceCollectionId)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetCollection: targetCollectionId,
            resolutions: mergeResolutions,
          }),
          signal: createCollectionOperationSignal(),
        },
      );
      if (mergeConfirmRequestIdRef.current !== requestId) return;
      const srcName = result.sourceCollection;
      const targetName = result.targetCollection;
      setMergingCollectionId(null);
      setMergeChecked(false);
      setCurrentCollectionId(targetName);
      onMergeComplete?.(srcName, targetName);
      refreshTokens();
      setSuccessToast(`Merged collection "${srcName}" into "${targetName}"`);
      const opId = result.operationId;
      const url = serverUrl;
      pushUndo({
        description: `Merged collection "${srcName}" into "${targetName}"`,
        restore: async () => {
          await apiFetch(
            `${url}/api/operations/${encodeURIComponent(opId)}/rollback`,
            { method: "POST" },
          );
          refreshTokens();
        },
      });
    } catch (err) {
      if (mergeConfirmRequestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      if (isNetworkError(err)) {
        markDisconnected();
        return;
      }
      setErrorToast(
        `Merge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (mergeConfirmRequestIdRef.current === requestId) {
        setMergeLoading(false);
      }
    }
  };

  // --- Split ---

  const openSplitDialog = async (collectionId: string) => {
    if (!connected) return;
    const requestId = ++splitOpenRequestIdRef.current;
    splitConfirmRequestIdRef.current += 1;
    setSplittingCollectionId(collectionId);
    setSplitPreview([]);
    setSplitDeleteOriginal(false);
    try {
      const preflight = await fetchCollectionStructuralPreflight(serverUrl, collectionId, {
        operation: "split",
        deleteOriginal: false,
      }, createCollectionOperationSignal());
      if (splitOpenRequestIdRef.current !== requestId) return;
      setSplitPreview(preflight.splitPreview ?? []);
      setSplitDeleteOriginal(false);
    } catch (err) {
      if (splitOpenRequestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      if (isNetworkError(err)) {
        markDisconnected();
        return;
      }
      setSplittingCollectionId(null);
      setErrorToast(
        `Failed to load collection for splitting: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const closeSplitDialog = () => {
    splitOpenRequestIdRef.current += 1;
    splitConfirmRequestIdRef.current += 1;
    setSplittingCollectionId(null);
    setSplitPreview([]);
    setSplitDeleteOriginal(false);
    setSplitLoading(false);
  };

  const handleConfirmSplit = async () => {
    if (!splittingCollectionId || !connected) return;
    const requestId = ++splitConfirmRequestIdRef.current;
    const sourceCollectionId = splittingCollectionId;
    setSplitLoading(true);
    try {
      const preflight = await fetchCollectionStructuralPreflight(
        serverUrl,
        sourceCollectionId,
        {
          operation: "split",
          deleteOriginal: splitDeleteOriginal,
        },
        createCollectionOperationSignal(),
      );
      if (splitConfirmRequestIdRef.current !== requestId) return;
      if ((preflight.blockers?.length ?? 0) > 0) {
        const message =
          preflight.blockers[0]?.message ??
          "Split is blocked by collection dependencies.";
        setErrorToast(message);
        return;
      }
      const effectiveSplitPreview = preflight.splitPreview ?? [];
      setSplitPreview(effectiveSplitPreview);
      if (effectiveSplitPreview.length === 0) {
        setErrorToast(
          "No top-level groups are available to split into new collections.",
        );
        return;
      }
      const result = await apiFetch<SplitCollectionResponse>(
        `${serverUrl}/api/collections/${encodeURIComponent(sourceCollectionId)}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteOriginal: splitDeleteOriginal }),
          signal: createCollectionOperationSignal(),
        },
      );
      if (splitConfirmRequestIdRef.current !== requestId) return;
      const name = result.sourceCollection;
      const createdNames = result.createdCollections;
      const count = createdNames.length;
      setSplittingCollectionId(null);
      if (result.deleteOriginal && currentCollectionId === name) {
        const remaining = collectionIds.filter((collectionId) => collectionId !== name);
        setCurrentCollectionId(createdNames[0] ?? remaining[0] ?? "");
      }
      onSplitComplete?.({
        sourceCollectionId: name,
        createdCollectionIds: createdNames,
        deleteOriginal: result.deleteOriginal,
      });
      refreshTokens();
      setSuccessToast(`Split collection "${name}" into ${count} collections`);
      const url = serverUrl;
      const opId = result.operationId;
      pushUndo({
        description: `Split collection "${name}" into ${count} collections`,
        restore: async () => {
          await apiFetch(
            `${url}/api/operations/${encodeURIComponent(opId)}/rollback`,
            { method: "POST" },
          );
          refreshTokens();
        },
      });
    } catch (err) {
      if (splitConfirmRequestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      if (isNetworkError(err)) {
        markDisconnected();
        return;
      }
      setErrorToast(
        `Split failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (splitConfirmRequestIdRef.current === requestId) {
        setSplitLoading(false);
      }
    }
  };

  return {
    // Merge
    mergingCollectionId,
    mergeTargetCollectionId,
    mergeConflicts,
    mergeResolutions,
    mergeChecked,
    mergeLoading,
    openMergeDialog,
    closeMergeDialog,
    changeMergeTarget,
    setMergeResolutions,
    handleCheckMergeConflicts,
    handleConfirmMerge,
    // Split
    splittingCollectionId,
    splitPreview,
    splitDeleteOriginal,
    splitLoading,
    openSplitDialog,
    closeSplitDialog,
    setSplitDeleteOriginal,
    handleConfirmSplit,
  };
}
