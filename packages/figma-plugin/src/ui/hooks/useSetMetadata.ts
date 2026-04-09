import { useEffect, useMemo, useRef, useState } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";

interface SetMappingDraft {
  collectionName: string;
  modeName: string;
}

export interface SetMetadataManagerRow extends SetMappingDraft {
  setName: string;
  description: string;
  sourceCollectionName: string;
  sourceModeName: string;
  isDirty: boolean;
}

interface UseSetMetadataParams {
  serverUrl: string;
  connected: boolean;
  setDescriptions: Record<string, string>;
  setCollectionNames: Record<string, string>;
  setModeNames: Record<string, string>;
  updateSetMetadataInState: (
    name: string,
    description: string,
    collectionName: string,
    modeName: string,
  ) => void;
  onError: (msg: string) => void;
  onSuccess?: (msg: string) => void;
  sets?: string[];
}

function buildMappingDraft(
  collectionName = "",
  modeName = "",
): SetMappingDraft {
  return { collectionName, modeName };
}

function draftsEqual(
  a: SetMappingDraft | undefined,
  b: SetMappingDraft | undefined,
): boolean {
  return (
    (a?.collectionName ?? "") === (b?.collectionName ?? "") &&
    (a?.modeName ?? "") === (b?.modeName ?? "")
  );
}

export function useSetMetadata({
  serverUrl,
  connected,
  setDescriptions,
  setCollectionNames,
  setModeNames,
  updateSetMetadataInState,
  onError,
  onSuccess,
  sets = [],
}: UseSetMetadataParams) {
  const [editingMetadataSet, setEditingMetadataSet] = useState<string | null>(
    null,
  );
  const [metadataDescription, setMetadataDescription] = useState("");
  const [metadataCollectionName, setMetadataCollectionName] = useState("");
  const [metadataModeName, setMetadataModeName] = useState("");
  const [managerDrafts, setManagerDrafts] = useState<
    Record<string, SetMappingDraft>
  >({});
  const [managerSaving, setManagerSaving] = useState(false);

  const sourceDrafts = useMemo<Record<string, SetMappingDraft>>(() => {
    const next: Record<string, SetMappingDraft> = {};
    for (const setName of sets) {
      next[setName] = buildMappingDraft(
        setCollectionNames[setName] || "",
        setModeNames[setName] || "",
      );
    }
    return next;
  }, [sets, setCollectionNames, setModeNames]);

  const sourceDraftsRef = useRef(sourceDrafts);

  useEffect(() => {
    setManagerDrafts((prev) => {
      const previousSource = sourceDraftsRef.current;
      const next: Record<string, SetMappingDraft> = {};
      for (const setName of sets) {
        const currentDraft = prev[setName];
        const previousDraft = previousSource[setName];
        next[setName] =
          currentDraft && !draftsEqual(currentDraft, previousDraft)
            ? currentDraft
            : sourceDrafts[setName];
      }
      return next;
    });
    sourceDraftsRef.current = sourceDrafts;
  }, [sets, sourceDrafts]);

  const metadataManagerRows = useMemo<SetMetadataManagerRow[]>(
    () =>
      sets.map((setName) => {
        const source = sourceDrafts[setName] ?? buildMappingDraft();
        const draft = managerDrafts[setName] ?? source;
        return {
          setName,
          description: setDescriptions[setName] || "",
          collectionName: draft.collectionName,
          modeName: draft.modeName,
          sourceCollectionName: source.collectionName,
          sourceModeName: source.modeName,
          isDirty: !draftsEqual(draft, source),
        };
      }),
    [managerDrafts, setDescriptions, sets, sourceDrafts],
  );

  const metadataManagerDirtyCount = useMemo(
    () => metadataManagerRows.filter((row) => row.isDirty).length,
    [metadataManagerRows],
  );

  const openSetMetadata = (setName: string) => {
    setEditingMetadataSet(setName);
    setMetadataDescription(setDescriptions[setName] || "");
    setMetadataCollectionName(setCollectionNames[setName] || "");
    setMetadataModeName(setModeNames[setName] || "");
  };

  const closeSetMetadata = () => {
    setEditingMetadataSet(null);
  };

  const handleSaveMetadata = async () => {
    if (!editingMetadataSet || !connected) {
      setEditingMetadataSet(null);
      return;
    }
    try {
      await apiFetch(
        `${serverUrl}/api/sets/${encodeURIComponent(editingMetadataSet)}/metadata`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: metadataDescription,
            figmaCollection: metadataCollectionName,
            figmaMode: metadataModeName,
          }),
        },
      );
    } catch (err) {
      onError(`Save metadata failed: ${getErrorMessage(err)}`);
      return;
    }
    updateSetMetadataInState(
      editingMetadataSet,
      metadataDescription,
      metadataCollectionName,
      metadataModeName,
    );
    setEditingMetadataSet(null);
  };

  const updateMetadataManagerField = (
    setName: string,
    field: keyof SetMappingDraft,
    value: string,
  ) => {
    setManagerDrafts((prev) => ({
      ...prev,
      [setName]: {
        ...(prev[setName] ?? sourceDrafts[setName] ?? buildMappingDraft()),
        [field]: value,
      },
    }));
  };

  const resetMetadataManager = (setName?: string) => {
    if (!setName) {
      setManagerDrafts(sourceDrafts);
      sourceDraftsRef.current = sourceDrafts;
      return;
    }
    setManagerDrafts((prev) => ({
      ...prev,
      [setName]: sourceDrafts[setName] ?? buildMappingDraft(),
    }));
  };

  const saveMetadataManager = async (targetSetNames?: string[]) => {
    const targets = targetSetNames?.length
      ? targetSetNames
      : metadataManagerRows
          .filter((row) => row.isDirty)
          .map((row) => row.setName);
    if (!targets.length) {
      return { saved: 0, failed: 0 };
    }
    if (!connected) {
      onError("Save metadata failed: not connected to the token server");
      return { saved: 0, failed: targets.length };
    }

    setManagerSaving(true);
    let saved = 0;
    const failures: string[] = [];

    for (const setName of targets) {
      const draft =
        managerDrafts[setName] ?? sourceDrafts[setName] ?? buildMappingDraft();
      try {
        await apiFetch(
          `${serverUrl}/api/sets/${encodeURIComponent(setName)}/metadata`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              figmaCollection: draft.collectionName,
              figmaMode: draft.modeName,
            }),
          },
        );
        updateSetMetadataInState(
          setName,
          setDescriptions[setName] || "",
          draft.collectionName,
          draft.modeName,
        );
        saved += 1;
      } catch (err) {
        failures.push(`${setName}: ${getErrorMessage(err)}`);
      }
    }

    setManagerSaving(false);

    if (failures.length > 0) {
      const firstFailure = failures[0];
      onError(
        failures.length === 1
          ? `Save metadata failed: ${firstFailure}`
          : `Save metadata failed for ${failures.length} sets. First error: ${firstFailure}`,
      );
    } else if (saved > 0) {
      onSuccess?.(
        `Saved Figma mappings for ${saved} set${saved === 1 ? "" : "s"}`,
      );
    }

    return { saved, failed: failures.length };
  };

  return {
    editingMetadataSet,
    metadataDescription,
    setMetadataDescription,
    metadataCollectionName,
    setMetadataCollectionName,
    metadataModeName,
    setMetadataModeName,
    closeSetMetadata,
    openSetMetadata,
    handleSaveMetadata,
    metadataManagerRows,
    metadataManagerDirtyCount,
    metadataManagerSaving: managerSaving,
    updateMetadataManagerField,
    resetMetadataManager,
    saveMetadataManager,
  };
}
