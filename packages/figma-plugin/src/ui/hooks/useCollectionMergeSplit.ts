import { useState, useRef } from "react";
import type { UndoSlot } from "./useUndo";
import { apiFetch } from "../shared/apiFetch";
import type { CollectionStructuralPreflight } from "../shared/setStructuralPreflight";
import { stableStringify } from "../shared/utils";

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
  collectionIds: string[];
  currentCollectionId: string;
  setCurrentCollectionId: (collectionId: string) => void;
  refreshTokens: () => void;
  setSuccessToast: (msg: string) => void;
  setErrorToast: (msg: string) => void;
  pushUndo: (slot: UndoSlot) => void;
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
): Promise<CollectionStructuralPreflight> {
  return apiFetch<CollectionStructuralPreflight>(
    `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/preflight`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function useCollectionMergeSplit({
  serverUrl,
  connected,
  collectionIds,
  currentCollectionId,
  setCurrentCollectionId,
  refreshTokens,
  setSuccessToast,
  setErrorToast,
  pushUndo,
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

  // Split state
  const [splittingCollectionId, setSplittingCollectionId] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<
    Array<{ key: string; newCollectionId: string; count: number }>
  >([]);
  const [splitDeleteOriginal, setSplitDeleteOriginal] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);

  // --- Merge ---

  const openMergeDialog = (collectionId: string) => {
    setMergingCollectionId(collectionId);
    setMergeTargetCollectionId(collectionIds.find((candidate) => candidate !== collectionId) || "");
    setMergeConflicts([]);
    setMergeResolutions({});
    setMergeChecked(false);
  };

  const closeMergeDialog = () => {
    setMergingCollectionId(null);
    setMergeChecked(false);
  };

  const changeMergeTarget = (target: string) => {
    setMergeTargetCollectionId(target);
    setMergeChecked(false);
    setMergeConflicts([]);
    setMergeResolutions({});
  };

  const handleCheckMergeConflicts = async () => {
    if (!mergingCollectionId || !mergeTargetCollectionId || !connected) return;
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
      );
      // Discard results if the target changed while the check was in flight
      if (mergeCheckTargetRef.current !== checkTarget) return;
      const conflicts = preflight.mergeConflicts ?? [];
      setMergeConflicts(conflicts);
      const res: Record<string, "source" | "target"> = {};
      for (const c of conflicts) res[c.path] = "target";
      setMergeResolutions(res);
      setMergeChecked(true);
    } catch (err) {
      // Don't show error toast for stale checks
      if (mergeCheckTargetRef.current !== checkTarget) return;
      setErrorToast(
        `Failed to check merge conflicts: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setMergeLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergingCollectionId || !mergeTargetCollectionId || !connected || !mergeChecked) return;
    setMergeLoading(true);
    try {
      const preflight = await fetchCollectionStructuralPreflight(
        serverUrl,
        mergingCollectionId,
        {
          operation: "merge",
          targetCollection: mergeTargetCollectionId,
        },
      );
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
        `${serverUrl}/api/collections/${encodeURIComponent(mergingCollectionId)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetCollection: mergeTargetCollectionId,
            resolutions: mergeResolutions,
          }),
        },
      );
      const srcName = result.sourceCollection;
      const targetName = result.targetCollection;
      setMergingCollectionId(null);
      setMergeChecked(false);
      setCurrentCollectionId(targetName);
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
      setErrorToast(
        `Merge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setMergeLoading(false);
    }
  };

  // --- Split ---

  const openSplitDialog = async (collectionId: string) => {
    if (!connected) return;
    try {
      const preflight = await fetchCollectionStructuralPreflight(serverUrl, collectionId, {
        operation: "split",
        deleteOriginal: false,
      });
      setSplittingCollectionId(collectionId);
      setSplitPreview(preflight.splitPreview ?? []);
      setSplitDeleteOriginal(false);
    } catch (err) {
      setErrorToast(
        `Failed to load collection for splitting: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const closeSplitDialog = () => {
    setSplittingCollectionId(null);
  };

  const handleConfirmSplit = async () => {
    if (!splittingCollectionId || !connected) return;
    setSplitLoading(true);
    try {
      const preflight = await fetchCollectionStructuralPreflight(
        serverUrl,
        splittingCollectionId,
        {
          operation: "split",
          deleteOriginal: splitDeleteOriginal,
        },
      );
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
        `${serverUrl}/api/collections/${encodeURIComponent(splittingCollectionId)}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteOriginal: splitDeleteOriginal }),
        },
      );
      const name = result.sourceCollection;
      const createdNames = result.createdCollections;
      const count = createdNames.length;
      setSplittingCollectionId(null);
      if (result.deleteOriginal && currentCollectionId === name) {
        const remaining = collectionIds.filter((collectionId) => collectionId !== name);
        setCurrentCollectionId(createdNames[0] ?? remaining[0] ?? "");
      }
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
      setErrorToast(
        `Split failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setSplitLoading(false);
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
