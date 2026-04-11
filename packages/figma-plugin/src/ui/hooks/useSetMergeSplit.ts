import { useState, useRef } from "react";
import type { UndoSlot } from "./useUndo";
import { apiFetch } from "../shared/apiFetch";
import type { SetStructuralPreflight } from "../shared/setStructuralPreflight";
import { stableStringify } from "../shared/utils";

interface MergeSetResponse {
  ok: true;
  sourceSet: string;
  targetSet: string;
  operationId: string;
}

interface SplitSetResponse {
  ok: true;
  sourceSet: string;
  createdSets: string[];
  deleteOriginal: boolean;
  operationId: string;
}

interface UseSetMergeSplitParams {
  serverUrl: string;
  connected: boolean;
  sets: string[];
  activeSet: string;
  setActiveSet: (set: string) => void;
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

async function fetchSetStructuralPreflight(
  serverUrl: string,
  setName: string,
  body: {
    operation: "merge" | "split";
    targetSet?: string;
    deleteOriginal?: boolean;
  },
): Promise<SetStructuralPreflight> {
  return apiFetch<SetStructuralPreflight>(
    `${serverUrl}/api/sets/${encodeURIComponent(setName)}/preflight`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function useSetMergeSplit({
  serverUrl,
  connected,
  sets,
  activeSet,
  setActiveSet,
  refreshTokens,
  setSuccessToast,
  setErrorToast,
  pushUndo,
}: UseSetMergeSplitParams) {
  // Merge state
  const [mergingSet, setMergingSet] = useState<string | null>(null);
  const [mergeTargetSet, setMergeTargetSet] = useState<string>("");
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
  const [splittingSet, setSplittingSet] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<
    Array<{ key: string; newName: string; count: number }>
  >([]);
  const [splitDeleteOriginal, setSplitDeleteOriginal] = useState(false);
  const [splitLoading, setSplitLoading] = useState(false);

  // --- Merge ---

  const openMergeDialog = (setName: string) => {
    setMergingSet(setName);
    setMergeTargetSet(sets.find((s) => s !== setName) || "");
    setMergeConflicts([]);
    setMergeResolutions({});
    setMergeChecked(false);
  };

  const closeMergeDialog = () => {
    setMergingSet(null);
    setMergeChecked(false);
  };

  const changeMergeTarget = (target: string) => {
    setMergeTargetSet(target);
    setMergeChecked(false);
    setMergeConflicts([]);
    setMergeResolutions({});
  };

  const handleCheckMergeConflicts = async () => {
    if (!mergingSet || !mergeTargetSet || !connected) return;
    const checkTarget = mergeTargetSet;
    mergeCheckTargetRef.current = checkTarget;
    setMergeLoading(true);
    try {
      const preflight = await fetchSetStructuralPreflight(
        serverUrl,
        mergingSet,
        {
          operation: "merge",
          targetSet: checkTarget,
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
    if (!mergingSet || !mergeTargetSet || !connected || !mergeChecked) return;
    setMergeLoading(true);
    try {
      const preflight = await fetchSetStructuralPreflight(
        serverUrl,
        mergingSet,
        {
          operation: "merge",
          targetSet: mergeTargetSet,
        },
      );
      if ((preflight.blockers?.length ?? 0) > 0) {
        const message =
          preflight.blockers[0]?.message ??
          "Merge is blocked by set dependencies.";
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
      const result = await apiFetch<MergeSetResponse>(
        `${serverUrl}/api/sets/${encodeURIComponent(mergingSet)}/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetSet: mergeTargetSet,
            resolutions: mergeResolutions,
          }),
        },
      );
      const srcName = result.sourceSet;
      const targetName = result.targetSet;
      setMergingSet(null);
      setMergeChecked(false);
      setActiveSet(targetName);
      refreshTokens();
      setSuccessToast(`Merged "${srcName}" into "${targetName}"`);
      const opId = result.operationId;
      const url = serverUrl;
      pushUndo({
        description: `Merged "${srcName}" into "${targetName}"`,
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

  const openSplitDialog = async (setName: string) => {
    if (!connected) return;
    try {
      const preflight = await fetchSetStructuralPreflight(serverUrl, setName, {
        operation: "split",
        deleteOriginal: false,
      });
      setSplittingSet(setName);
      setSplitPreview(preflight.splitPreview ?? []);
      setSplitDeleteOriginal(false);
    } catch (err) {
      setErrorToast(
        `Failed to load set for splitting: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const closeSplitDialog = () => {
    setSplittingSet(null);
  };

  const handleConfirmSplit = async () => {
    if (!splittingSet || !connected) return;
    setSplitLoading(true);
    try {
      const preflight = await fetchSetStructuralPreflight(
        serverUrl,
        splittingSet,
        {
          operation: "split",
          deleteOriginal: splitDeleteOriginal,
        },
      );
      if ((preflight.blockers?.length ?? 0) > 0) {
        const message =
          preflight.blockers[0]?.message ??
          "Split is blocked by set dependencies.";
        setErrorToast(message);
        return;
      }
      const effectiveSplitPreview = preflight.splitPreview ?? [];
      setSplitPreview(effectiveSplitPreview);
      if (effectiveSplitPreview.length === 0) {
        setErrorToast(
          "No top-level groups are available to split into new sets.",
        );
        return;
      }
      const result = await apiFetch<SplitSetResponse>(
        `${serverUrl}/api/sets/${encodeURIComponent(splittingSet)}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deleteOriginal: splitDeleteOriginal }),
        },
      );
      const name = result.sourceSet;
      const createdNames = result.createdSets;
      const count = createdNames.length;
      setSplittingSet(null);
      if (result.deleteOriginal && activeSet === name) {
        const remaining = sets.filter((setName) => setName !== name);
        setActiveSet(createdNames[0] ?? remaining[0] ?? "");
      }
      refreshTokens();
      setSuccessToast(`Split "${name}" into ${count} sets`);
      const url = serverUrl;
      const opId = result.operationId;
      pushUndo({
        description: `Split "${name}" into ${count} sets`,
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
    mergingSet,
    mergeTargetSet,
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
    splittingSet,
    splitPreview,
    splitDeleteOriginal,
    splitLoading,
    openSplitDialog,
    closeSplitDialog,
    setSplitDeleteOriginal,
    handleConfirmSplit,
  };
}
