import { useState, useCallback, useRef } from "react";
import { getErrorMessage } from "../shared/utils";
import { apiFetch } from "../shared/apiFetch";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import type { UndoSlot } from "./useUndo";
import type {
  TokenRecipe,
  RecipeType,
  RecipeConfig,
  RecipeSemanticLayer,
  GeneratedTokenResult,
} from "./useRecipes";
import {
  requestGeneratedGroupPreview,
  requiresGeneratedGroupReview,
  type RecipePreviewAnalysis,
} from "./useGeneratedGroupPreview";

export interface RecipeSaveSuccessInfo {
  targetGroup: string;
  targetCollection: string;
}

interface RecipeMutationBody {
  type: RecipeType;
  name: string;
  sourceToken?: string;
  sourceValue?: unknown;
  inlineValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  enabled: boolean;
  config: RecipeConfig;
  semanticLayer: RecipeSemanticLayer | null;
  overrides?: Record<string, { value: unknown; locked: boolean }>;
}

interface UseRecipeSaveParams {
  serverUrl: string;
  isEditing: boolean;
  existingRecipe?: TokenRecipe;
  selectedType: RecipeType;
  name: string;
  sourceTokenPath?: string;
  inlineValue?: unknown;
  sourceValue?: unknown;
  targetCollection: string;
  targetGroup: string;
  config: RecipeConfig;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  typeNeedsValue: boolean;
  hasValue: boolean;
  previewTokens: GeneratedTokenResult[];
  previewFingerprint: string;
  previewAnalysis: RecipePreviewAnalysis | null;
  onSaved: (info?: RecipeSaveSuccessInfo) => void;
  onInterceptSemanticMapping?: (data: {
    tokens: GeneratedTokenResult[];
    targetGroup: string;
    targetCollection: string;
    recipeType: RecipeType;
  }) => void;
  getSuccessToastAction?: (
    info: RecipeSaveSuccessInfo,
  ) => ToastAction | undefined;
  pushUndo?: (slot: UndoSlot) => void;
  requestPreviewRefresh: () => void;
  initialKeepUpdated: boolean;
  initialSemanticEnabled: boolean;
  initialSemanticPrefix: string;
  initialSemanticMappings: Array<{ semantic: string; step: string }>;
  initialSelectedSemanticPatternId: string | null;
}

export interface UseRecipeSaveReturn {
  saving: boolean;
  saveError: string;
  showConfirmation: boolean;
  previewReviewStale: boolean;
  overwritePendingPaths: string[];
  overwriteCheckLoading: boolean;
  overwriteCheckError: string;
  keepUpdated: boolean;
  semanticEnabled: boolean;
  semanticPrefix: string;
  semanticMappings: Array<{ semantic: string; step: string }>;
  selectedSemanticPatternId: string | null;
  handleQuickSave: () => Promise<boolean>;
  handleSave: () => Promise<boolean>;
  handleConfirmSave: () => Promise<boolean>;
  handleCancelConfirmation: () => void;
  setKeepUpdated: (v: boolean) => void;
  setSemanticEnabled: (v: boolean) => void;
  setSemanticPrefix: (v: string) => void;
  setSemanticMappings: (v: Array<{ semantic: string; step: string }>) => void;
  setSelectedSemanticPatternId: (v: string | null) => void;
}

export function useGeneratedGroupSave({
  serverUrl,
  isEditing,
  existingRecipe,
  selectedType,
  name,
  sourceTokenPath,
  inlineValue,
  sourceValue,
  targetCollection,
  targetGroup,
  config,
  pendingOverrides,
  typeNeedsValue,
  hasValue,
  previewTokens,
  previewFingerprint,
  previewAnalysis,
  onSaved,
  onInterceptSemanticMapping,
  getSuccessToastAction,
  pushUndo,
  requestPreviewRefresh,
  initialKeepUpdated,
  initialSemanticEnabled,
  initialSemanticPrefix,
  initialSemanticMappings,
  initialSelectedSemanticPatternId,
}: UseRecipeSaveParams): UseRecipeSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [previewReviewStale, setPreviewReviewStale] = useState(false);
  const [reviewedPreviewFingerprint, setReviewedPreviewFingerprint] = useState("");
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
  const getToastAction = useCallback(
    (targetGroupAtSave: string, targetCollectionAtSave: string) =>
      getSuccessToastAction?.({
        targetGroup: targetGroupAtSave,
        targetCollection: targetCollectionAtSave,
      }),
    [getSuccessToastAction],
  );
  const buildRecipeMutationBody = useCallback(
    ({
      sourceTokenPath,
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
    }): RecipeMutationBody => {
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
              } satisfies RecipeSemanticLayer)
            : null;

      return {
        type: selectedType,
        name: name.trim(),
        sourceToken: sourceTokenPath || undefined,
        sourceValue: sourceTokenPath ? sourceValue : undefined,
        inlineValue:
          !sourceTokenPath && inlineValue !== undefined && inlineValue !== ""
            ? inlineValue
            : undefined,
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
    if (!name.trim()) {
      setSaveError("Generated group label is required.");
      return false;
    }
    if (typeNeedsValue && !hasValue) {
      setSaveError(
        "This generated group needs a source token or base value.",
      );
      return false;
    }
    setSaveError("");
    return true;
  }, [targetGroup, name, typeNeedsValue, hasValue]);

  /** Inner save logic — commits the recipe to the server. */
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
        const body = buildRecipeMutationBody({
          sourceTokenPath,
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
          isEditing && existingRecipe
            ? `${serverUrl}/api/recipes/${existingRecipe.id}`
            : `${serverUrl}/api/recipes`;
        const savedGen = await apiFetch<{ id: string }>(saveUrl, {
          method: isEditing && existingRecipe ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        setShowConfirmation(false);

        if (pushUndo) {
          if (isEditing && existingRecipe) {
            const prevGen = existingRecipe;
            const prevBody = buildRecipeMutationBody({
              sourceTokenPath: prevGen.sourceToken,
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
                await apiFetch(`${serverUrl}/api/recipes/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(prevBody),
                });
              },
              redo: async () => {
                await apiFetch(`${serverUrl}/api/recipes/${prevGen.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
              },
            });
          } else {
            const newId = savedGen.id;
            const genName = name.trim();
            pushUndo({
              description: `Created generated group "${genName}"`,
              restore: async () => {
                await apiFetch(
                  `${serverUrl}/api/recipes/${newId}?deleteTokens=true`,
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
          recipeType: selectedType,
        });
        dispatchToast(
          isEditing
            ? `Generated group "${name.trim()}" updated`
            : `Generated group "${name.trim()}" created`,
          "success",
          getToastAction(targetGroupAtSave, targetCollectionAtSave),
        );
        onSaved({
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
      buildRecipeMutationBody,
      serverUrl,
      isEditing,
      existingRecipe,
      onSaved,
      onInterceptSemanticMapping,
      previewTokens,
      getToastAction,
      pushUndo,
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
        inlineValue,
        sourceValue,
        targetGroup,
        targetCollection,
        config,
        pendingOverrides,
        baseRecipeId: existingRecipe?.id,
        detachedPaths: existingRecipe?.detachedPaths,
      });
      if (overwriteCheckRequestIdRef.current !== requestId) return false;
      setOverwritePendingPaths(
        latestPreview.analysis.manualEditConflicts.map((entry) => entry.path),
      );
      if (
        reviewedPreviewFingerprint &&
        latestPreview.analysis.fingerprint !== reviewedPreviewFingerprint
      ) {
        requestPreviewRefresh();
        setPreviewReviewStale(true);
        setSaveError(
          "Preview changed since you reviewed it. Review the updated conflicts before saving.",
        );
        return false;
      }
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
    existingRecipe,
    inlineValue,
    pendingOverrides,
    requestPreviewRefresh,
    reviewedPreviewFingerprint,
    selectedType,
    serverUrl,
    sourceValue,
    sourceTokenPath,
    targetGroup,
    targetCollection,
  ]);

  /** Step 1: Validate inputs and either commit directly (no risks) or show
   *  the confirmation preview. Captures the reviewed preview fingerprint so
   *  confirm can detect staleness.
   */
  const handleSave = useCallback(async () => {
    if (!validateBeforeSave()) return false;

    setReviewedPreviewFingerprint(previewFingerprint);

    // No risks — skip confirmation and commit directly
    if (!requiresGeneratedGroupReview(previewAnalysis)) {
      const revalidated = await revalidatePreview();
      if (revalidated) {
        return commitSave(
          keepUpdated,
          semanticEnabled,
          semanticPrefix,
          semanticMappings,
          targetGroup.trim(),
          targetCollection,
        );
      }
      // Revalidation revealed issues — show confirmation so user can review
      setShowConfirmation(true);
      return false;
    }

    // Has risks — show confirmation screen
    setPreviewReviewStale(false);
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckError("");
    setShowConfirmation(true);
    return false;
  }, [
    commitSave,
    previewAnalysis,
    previewFingerprint,
    revalidatePreview,
    semanticEnabled,
    semanticMappings,
    semanticPrefix,
    keepUpdated,
    targetGroup,
    targetCollection,
    validateBeforeSave,
  ]);

  const handleQuickSave = useCallback(async () => {
    if (!validateBeforeSave()) return false;
    setReviewedPreviewFingerprint(previewFingerprint);
    if (requiresGeneratedGroupReview(previewAnalysis)) {
      setPreviewReviewStale(false);
      setOverwritePendingPaths(
        previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
      );
      setOverwriteCheckError("");
      setShowConfirmation(true);
      return false;
    }
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
    previewFingerprint,
    previewAnalysis,
    revalidatePreview,
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    targetGroup,
    targetCollection,
  ]);

  /** Step 2: Commit the save. Overwrites are already known (shown in review view).
   *  The server applies semantic aliases together with the recipe run.
   */
  const handleConfirmSave = useCallback(async () => {
    if (previewReviewStale) {
      if (!previewFingerprint) {
        setSaveError("Refreshing preview…");
        return false;
      }
      setReviewedPreviewFingerprint(previewFingerprint);
      setPreviewReviewStale(false);
      setSaveError("");
      return false;
    }
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
    commitSave,
    previewFingerprint,
    previewReviewStale,
    revalidatePreview,
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    targetGroup,
    targetCollection,
  ]);

  const handleCancelConfirmation = useCallback(() => {
    setShowConfirmation(false);
    setPreviewReviewStale(false);
    setReviewedPreviewFingerprint("");
    setOverwritePendingPaths(
      previewAnalysis?.manualEditConflicts.map((entry) => entry.path) ?? [],
    );
    setOverwriteCheckLoading(false);
    setOverwriteCheckError("");
  }, [previewAnalysis]);

  return {
    saving,
    saveError,
    showConfirmation,
    previewReviewStale,
    overwritePendingPaths,
    overwriteCheckLoading,
    overwriteCheckError,
    keepUpdated,
    semanticEnabled,
    semanticPrefix,
    semanticMappings,
    selectedSemanticPatternId,
    handleQuickSave,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    setKeepUpdated,
    setSemanticEnabled,
    setSemanticPrefix,
    setSemanticMappings,
    setSelectedSemanticPatternId,
  };
}
