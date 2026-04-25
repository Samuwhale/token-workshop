import { useState, useCallback, useRef } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import type { UndoSlot } from "./useUndo";
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratorSemanticLayer,
  GeneratedTokenResult,
} from "./useGenerators";
import { autoNameFromGroup } from "../components/generators/generatorUtils";
import {
  requestGeneratedGroupPreview,
  type GeneratorPreviewAnalysis,
} from "./useGeneratedGroupPreview";

export interface GeneratorSaveSuccessInfo {
  generatorId: string;
  targetGroup: string;
  targetCollection: string;
}

interface GeneratorMutationBody {
  type: GeneratorType;
  name: string;
  sourceToken?: string | null;
  sourceCollectionId?: string | null;
  sourceValue?: unknown;
  inlineValue?: unknown | null;
  targetCollection: string;
  targetGroup: string;
  enabled: boolean;
  config: GeneratorConfig;
  semanticLayer: GeneratorSemanticLayer | null;
  overrides?: Record<string, { value: unknown; locked: boolean }>;
}

interface UseGeneratorSaveParams {
  serverUrl: string;
  isEditing: boolean;
  existingGenerator?: TokenGenerator;
  selectedType: GeneratorType;
  name: string;
  sourceTokenPath?: string;
  sourceCollectionId?: string;
  inlineValue?: unknown;
  sourceValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  config: GeneratorConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  typeNeedsValue: boolean;
  hasValue: boolean;
  previewTokens: GeneratedTokenResult[];
  previewAnalysis: GeneratorPreviewAnalysis | null;
  onSaved: (info?: GeneratorSaveSuccessInfo) => void;
  onInterceptSemanticMapping?: (data: {
    tokens: GeneratedTokenResult[];
    targetGroup: string;
    targetCollection: string;
    generatorType: GeneratorType;
  }) => void;
  getSuccessToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => { action?: ToastAction; secondaryAction?: ToastAction } | undefined;
  pushUndo?: (slot: UndoSlot) => void;
  initialKeepUpdated: boolean;
  initialSemanticEnabled: boolean;
  initialSemanticPrefix: string;
  initialSemanticMappings: Array<{ semantic: string; step: string }>;
  initialSelectedSemanticPatternId: string | null;
}

export interface UseGeneratorSaveReturn {
  saving: boolean;
  saveError: string;
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  keepUpdated: boolean;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  handleQuickSave: () => Promise<boolean>;
  setKeepUpdated: (v: boolean) => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useGeneratedGroupSave({
  serverUrl,
  isEditing,
  existingGenerator,
  selectedType,
  name,
  sourceTokenPath,
  sourceCollectionId,
  inlineValue,
  sourceValue,
  targetCollection,
  targetGroup,
  config,
  pendingOverrides,
  typeNeedsValue,
  hasValue,
  previewTokens,
  previewAnalysis,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
  initialKeepUpdated,
  initialSemanticEnabled,
  initialSemanticPrefix,
  initialSemanticMappings,
  initialSelectedSemanticPatternId,
}: UseGeneratorSaveParams): UseGeneratorSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [overwritePendingPaths, setOverwritePendingPaths] = useState<string[]>(
    () => previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
  );
  const [overwriteCheckLoading, setOverwriteCheckLoading] = useState(false);
  const [overwriteCheckError, setOverwriteCheckError] = useState("");
  const [keepUpdated, setKeepUpdated] = useState(initialKeepUpdated);
  const [semanticEnabled, setSemanticEnabled] = useState(initialSemanticEnabled);
  const [semanticPrefix, setSemanticPrefix] = useState(initialSemanticPrefix);
  const [semanticMappings, setSemanticMappings] = useState<
    Array<{ semantic: string; step: string }>
  >(initialSemanticMappings);
  const [selectedSemanticPatternId, setSelectedSemanticPatternId] = useState<
    string | null
  >(initialSelectedSemanticPatternId);
  const overwriteCheckRequestIdRef = useRef(0);
  const getToastActions = useCallback(
    (
      generatorIdAtSave: string,
      targetGroupAtSave: string,
      targetCollectionAtSave: string,
    ) =>
      getSuccessToastAction?.({
        generatorId: generatorIdAtSave,
        targetGroup: targetGroupAtSave,
        targetCollection: targetCollectionAtSave,
      }) ?? {},
    [getSuccessToastAction],
  );
  const buildGeneratorMutationBody = useCallback(
    ({
      sourceTokenPath,
      sourceCollectionId,
      sourceValue,
      inlineValue,
      targetGroup,
      targetCollection,
      keepUpdated,
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      selectedPatternId = selectedSemanticPatternId,
      skipSemanticLayer = Boolean(onInterceptSemanticMapping),
    }: {
      sourceTokenPath?: string;
      sourceCollectionId?: string;
      sourceValue?: unknown;
      inlineValue?: unknown;
      targetGroup: string;
      targetCollection: string;
      keepUpdated: boolean;
      semanticEnabled: boolean;
      semanticPrefix: string;
      semanticMappings: Array<{ semantic: string; step: string }>;
      selectedPatternId?: string | null;
      skipSemanticLayer?: boolean;
    }): GeneratorMutationBody => {
      const semanticLayer =
        skipSemanticLayer
          ? null
          : semanticEnabled &&
              semanticPrefix.trim() &&
              semanticMappings.some((mapping) => mapping.semantic.trim())
            ? ({
                prefix: semanticPrefix.trim(),
                mappings: semanticMappings.filter(
                  (mapping) => mapping.semantic.trim() && mapping.step,
                ),
                patternId: selectedPatternId,
              } satisfies GeneratorSemanticLayer)
            : null;

      const effectiveName = name.trim() || autoNameFromGroup(targetGroup, selectedType);
      const normalizedSourceTokenPath = sourceTokenPath?.trim() || undefined;
      const normalizedSourceCollectionId =
        normalizedSourceTokenPath && sourceCollectionId?.trim()
          ? sourceCollectionId.trim()
          : undefined;

      return {
        type: selectedType,
        name: effectiveName,
        sourceToken: normalizedSourceTokenPath ?? null,
        sourceCollectionId: normalizedSourceTokenPath
          ? normalizedSourceCollectionId ?? null
          : null,
        sourceValue: normalizedSourceTokenPath ? sourceValue : undefined,
        inlineValue:
          !normalizedSourceTokenPath &&
          inlineValue !== undefined &&
          inlineValue !== ""
            ? inlineValue
            : null,
        targetCollection,
        targetGroup,
        enabled: keepUpdated,
        config,
        semanticLayer,
        overrides:
          Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
      };
    },
    [
      config,
      name,
      onInterceptSemanticMapping,
      pendingOverrides,
      selectedSemanticPatternId,
      selectedType,
    ],
  );

  const validateBeforeSave = useCallback((): boolean => {
    if (!targetGroup.trim()) {
      setSaveError("Group name is required.");
      return false;
    }
    if (typeNeedsValue && !hasValue) {
      setSaveError(
        "This generated group needs a source token or source value.",
      );
      return false;
    }
    setSaveError("");
    return true;
  }, [targetGroup, typeNeedsValue, hasValue]);

  /** Inner save logic — commits the generator to the server. */
  const commitSave = useCallback(
    async (
      keepUpdatedAtSave: boolean,
      semanticEnabledAtSave: boolean,
      semanticPrefixAtSave: string,
      semanticMappingsAtSave: Array<{ semantic: string; step: string }>,
      targetGroupAtSave: string,
      targetCollectionAtSave: string,
    ) => {
      setSaving(true);
      setSaveError("");
      try {
        const body = buildGeneratorMutationBody({
          sourceTokenPath,
          sourceCollectionId,
          sourceValue,
          inlineValue,
          targetGroup: targetGroupAtSave,
          targetCollection: targetCollectionAtSave,
          keepUpdated: keepUpdatedAtSave,
          semanticEnabled: semanticEnabledAtSave,
          semanticPrefix: semanticPrefixAtSave,
          semanticMappings: semanticMappingsAtSave,
        });
        const saveUrl =
          isEditing && existingGenerator
            ? `${serverUrl}/api/generators/${existingGenerator.id}`
            : `${serverUrl}/api/generators`;
        const savedGen = await apiFetch<{ id: string }>(saveUrl, {
          method: isEditing && existingGenerator ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (pushUndo) {
          if (isEditing && existingGenerator) {
            const prevGen = existingGenerator;
            const prevBody = buildGeneratorMutationBody({
              sourceTokenPath: prevGen.sourceToken,
              sourceCollectionId: prevGen.sourceCollectionId,
              sourceValue: prevGen.lastRunSourceValue,
              inlineValue: prevGen.inlineValue,
              targetGroup: prevGen.targetGroup,
              targetCollection: prevGen.targetCollection,
              keepUpdated: prevGen.enabled !== false,
              semanticEnabled: Boolean(prevGen.semanticLayer?.mappings.length),
              semanticPrefix: prevGen.semanticLayer?.prefix ?? "",
              semanticMappings: prevGen.semanticLayer?.mappings ?? [],
              selectedPatternId: prevGen.semanticLayer?.patternId ?? null,
              skipSemanticLayer: false,
            });
            pushUndo({
              description: `Edited generated group "${prevGen.name}"`,
              restore: async () => {
                await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(prevBody),
                });
              },
              redo: async () => {
                await apiFetch(`${serverUrl}/api/generators/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
              },
            });
          } else {
            const newId = savedGen.id;
            const genName = name.trim() || autoNameFromGroup(targetGroupAtSave, selectedType);
            pushUndo({
              description: `Created generated group "${genName}"`,
              restore: async () => {
                await apiFetch(
                  `${serverUrl}/api/generators/${newId}?deleteTokens=true`,
                  { method: "DELETE" },
                );
              },
            });
          }
        }

        setSaving(false);
        onInterceptSemanticMapping?.({
          tokens: previewTokens,
          targetGroup: targetGroupAtSave,
          targetCollection: targetCollectionAtSave,
          generatorType: selectedType,
        });
        const displayName = name.trim() || autoNameFromGroup(targetGroupAtSave, selectedType);
        const toastActions = getToastActions(
          savedGen.id,
          targetGroupAtSave,
          targetCollectionAtSave,
        );
        dispatchToast(
          isEditing
            ? `Generated group "${displayName}" updated`
            : `Generated group "${displayName}" created`,
          "success",
          {
            action: toastActions.action,
            secondaryAction: toastActions.secondaryAction,
            destination: {
              kind: "workspace",
              topTab: "library",
              subTab: "tokens",
            },
          },
        );
        onSaved({
          generatorId: savedGen.id,
          targetGroup: targetGroupAtSave,
          targetCollection: targetCollectionAtSave,
        });
        return true;
      } catch (err) {
        setSaveError(getErrorMessage(err));
        setSaving(false);
        return false;
      }
    },
    [
      buildGeneratorMutationBody,
      inlineValue,
      name,
      serverUrl,
      isEditing,
      existingGenerator,
      onSaved,
      onInterceptSemanticMapping,
      previewTokens,
      getToastActions,
      pushUndo,
      selectedType,
      sourceCollectionId,
      sourceTokenPath,
      sourceValue,
    ],
  );

  const revalidatePreview = useCallback(async () => {
    const requestId = overwriteCheckRequestIdRef.current + 1;
    overwriteCheckRequestIdRef.current = requestId;
    setOverwriteCheckLoading(true);
    setOverwriteCheckError("");

    try {
      const latestPreview = await requestGeneratedGroupPreview({
        serverUrl,
        selectedType,
        sourceTokenPath,
        sourceCollectionId,
        inlineValue,
        sourceValue,
        targetGroup,
        targetCollection,
        config,
        pendingOverrides,
        baseGeneratorId: existingGenerator?.id,
        detachedPaths: existingGenerator?.detachedPaths,
      });
      if (overwriteCheckRequestIdRef.current !== requestId) return false;
      setOverwritePendingPaths(
        latestPreview.analysis.manualEditConflicts.map((entry) => entry.path),
      );
      return true;
    } catch (err) {
      if (overwriteCheckRequestIdRef.current !== requestId) return false;
      setOverwriteCheckError(
        `Could not revalidate the latest preview: ${getErrorMessage(err)}`,
      );
      return false;
    } finally {
      if (overwriteCheckRequestIdRef.current === requestId) {
        setOverwriteCheckLoading(false);
      }
    }
  }, [
    config,
    existingGenerator,
    inlineValue,
    pendingOverrides,
    selectedType,
    serverUrl,
    sourceCollectionId,
    sourceValue,
    sourceTokenPath,
    targetGroup,
    targetCollection,
  ]);

  const handleQuickSave = useCallback(async () => {
    if (!validateBeforeSave()) return false;
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckError("");
    const revalidated = await revalidatePreview();
    if (!revalidated) return false;
    return commitSave(
      keepUpdated,
      semanticEnabled,
      semanticPrefix,
      semanticMappings,
      targetGroup.trim(),
      targetCollection,
    );
  }, [
    validateBeforeSave,
    commitSave,
    previewAnalysis,
    revalidatePreview,
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    targetGroup,
    targetCollection,
  ]);

  return {
    saving,
    saveError,
    overwritePendingPaths,
    overwriteCheckLoading,
    overwriteCheckError,
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    handleQuickSave,
    setKeepUpdated,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
  };
}
