import { adaptShortcut, stableStringify } from "../shared/utils";
import { Copy, Check, Clock, Trash2, Link2, X, Plus } from "lucide-react";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { createTokenValueBody } from "../shared/tokenMutations";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createGeneratorOwnershipKey, resolveRefValue } from "@tokenmanager/core";
import type { TokenCollection } from "@tokenmanager/core";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { tokenTypeBadgeClass } from "../../shared/types";
import { TypePicker } from "./TypePicker";
import type { TokenGenerator } from "../hooks/useGenerators";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { ColorModifiersEditor } from "./ColorModifiersEditor";
import { ScopeEditor } from "./ScopeEditor";
import {
  FIGMA_SCOPE_OPTIONS,
  getLifecycleLabel,
  getScopeLabels,
} from "../shared/tokenMetadata";
import { useTokenEditorModeValue } from "../hooks/useTokenEditorModeValue";
import { PathAutocomplete } from "./PathAutocomplete";

import { useTokenEditorFields } from "../hooks/useTokenEditorFields";
import { useTokenEditorLoad } from "../hooks/useTokenEditorLoad";
import { useTokenDependents } from "../hooks/useTokenDependents";
import { useTokenTypeParsing } from "../hooks/useTokenTypeParsing";
import { useTokenEditorUIState } from "../hooks/useTokenEditorUIState";
import { useTokenEditorSave } from "../hooks/useTokenEditorSave";
import { useTokenEditorGenerators } from "../hooks/useTokenEditorGenerators";
import {
  clearEditorDraft,
  saveEditorDraft,
  formatDraftAge,
} from "../hooks/useTokenEditorUtils";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../shared/navigationTypes";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";
import { normalizeTokenType } from "../shared/tokenTypeCategories";
import {
  hasSyncSnapshotChange,
  resolveSyncComparableValue,
} from "../shared/tokenSync";
import { sanitizeEditorCollectionModeValues } from "../shared/collectionModeUtils";
import { omitTokenEditorReservedExtensions } from "../shared/tokenEditorTypes";

import { detectAliasCycle, parsePastedValue, getInitialCreateValue, NAMESPACE_SUGGESTIONS } from "./token-editor/tokenEditorHelpers";
import { valueFormatHint } from "./tokenListHelpers";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import { TokenEditorDerivedGroups } from "./token-editor/TokenEditorDerivedGroups";
import type { LintViolation } from "../hooks/useLint";
import { TokenDetailsAdvancedSection } from "./token-details/TokenDetailsAdvancedSection";
import { TokenDetailsModeRow } from "./token-details/TokenDetailsModeRow";
import { TokenDetailsSection } from "./token-details/TokenDetailsSection";
import { TokenDetailsStatusBanners } from "./token-details/TokenDetailsStatusBanners";

interface TokenDetailsProps {
  tokenPath: string;
  tokenName?: string;
  currentCollectionId: string;
  collectionId?: string;
  serverUrl: string;
  mode?: "inspect" | "edit";
  onBack: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  generators?: TokenGenerator[];
  isCreateMode?: boolean;
  initialType?: string;
  /** When alias-shaped (e.g. "{color.primary}"), alias mode activates automatically. */
  initialValue?: string;
  editorSessionHost: {
    registerSession: (session: EditorSessionRegistration | null) => void;
    requestClose: () => void;
  };
  onSaved?: (savedPath: string) => void;
  collections?: TokenCollection[];
  onRefresh?: () => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  onNavigateToToken?: (path: string, fromPath?: string) => void;
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
  onOpenGeneratedGroupEditor?: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  onEnterEditMode?: () => void;
  onDuplicate?: () => void;
  onOpenInHealth?: () => void;
}


export function TokenDetails({
  tokenPath,
  tokenName,
  currentCollectionId,
  collectionId: explicitCollectionId,
  serverUrl,
  mode = "edit",
  onBack,
  allTokensFlat = {},
  pathToCollectionId = {},
  generators = [],
  isCreateMode = false,
  initialType,
  initialValue,
  editorSessionHost,
  onSaved,
  onSaveAndCreateAnother,
  collections = [],
  onRefresh,
  availableFonts = [],
  fontWeightsByFamily = {},
  derivedTokenPaths,
  onNavigateToToken,
  onNavigateToGeneratedGroup,
  onOpenGeneratedGroupEditor,
  pushUndo,
  lintViolations = [],
  syncSnapshot,
  onEnterEditMode,
  onDuplicate,
  onOpenInHealth,
}: TokenDetailsProps) {
  const effectivePathToCollectionId = pathToCollectionId;
  const ownerCollectionId = useMemo(
    () =>
      explicitCollectionId ??
      (isCreateMode
        ? currentCollectionId
        : effectivePathToCollectionId[tokenPath] ?? currentCollectionId),
    [
      explicitCollectionId,
      effectivePathToCollectionId,
      isCreateMode,
      currentCollectionId,
      tokenPath,
    ],
  );
  const detailsMode = isCreateMode ? "edit" : mode;
  const isInspectMode = detailsMode === "inspect";
  const isEditMode = !isInspectMode;
  const uiState = useTokenEditorUIState({
    tokenPath,
  });
  const {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    pathInputWrapperRef,
    handlePasteInValueEditor,
  } = uiState;

  const fields = useTokenEditorFields({
    isCreateMode,
    initialType,
    initialValue,
    tokenPath,
    editPath,
    allTokensFlat,
  });
  const {
    initialRef,
    tokenType,
    setTokenType,
    value,
    setValue,
    description,
    setDescription,
    scopes,
    setScopes,
    colorModifiers,
    setColorModifiers,
    modeValues,
    setModeValues,
    extensionsJsonText,
    setExtensionsJsonText,
    extensionsJsonError,
    setExtensionsJsonError,
    lifecycle,
    setLifecycle,
    extendsPath,
    setExtendsPath,
    isDirty,
    colorFlatMap,
  } = fields;

  const valueIsAlias = typeof value === "string" && isAlias(value);

  const modeValue = useTokenEditorModeValue({
    collectionId: ownerCollectionId,
    collections,
    value,
    setValue,
    modeValues,
    setModeValues,
  });

  const valueEditorContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const passthroughTokenManagerRef = useRef<Record<string, unknown> | null>(
    null,
  );

  const [error, setError] = useState<string | null>(null);

  const loadResult = useTokenEditorLoad({
    serverUrl,
    collectionId: ownerCollectionId,
    collections,
    tokenPath,
    isCreateMode,
    initialRef,
    setTokenType,
    setValue,
    setDescription,
    setScopes,
    setColorModifiers,
    setModeValues,
    setExtensionsJsonText,
    setExtensionsJsonError,
    setLifecycle,
    setExtendsPath,
    setError,
    passthroughTokenManagerRef,
    valueEditorContainerRef,
  });
  const { loading, pendingDraft, setPendingDraft, initialServerSnapshotRef } =
    loadResult;

  const { dependents, dependentsLoading: _dependentsLoading } = useTokenDependents({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
  });
  const typeParsing = useTokenTypeParsing({
    tokenType,
    setTokenType,
    value,
    setValue,
    scopes,
    modeValues,
    setModeValues,
    setScopes,
    extensionsJsonError,
    isCreateMode,
    editPath: tokenPath,
    allTokensFlat,
    currentTokenPath: tokenPath,
    detectAliasCycle,
  });
  const {
    pendingTypeChange,
    setPendingTypeChange,
    showPendingDependents,
    setShowPendingDependents,
    fontFamilyRef,
    fontSizeRef,
    aliasCycleError: _aliasCycleError,
    canSave,
    saveBlockReason,
    applyTypeChange,
    handleTypeChange,
    focusBlockedField,
  } = typeParsing;
  const generators$ = useTokenEditorGenerators({
    tokenPath,
    tokenType,
    generators,
  });
  const {
    existingGeneratorsForToken,
    canBeGeneratorSource,
  } = generators$;
  const producingGenerator =
    derivedTokenPaths?.get(createGeneratorOwnershipKey(ownerCollectionId, tokenPath)) ??
    null;
  const [detachedFromGenerator, setDetachedFromGenerator] = useState(false);
  const [detachingGeneratorOwnership, setDetachingGeneratorOwnership] =
    useState(false);
  const activeProducingGenerator =
    detachedFromGenerator ? null : producingGenerator;
  const [generatedTokenChoiceOpen, setGeneratedTokenChoiceOpen] =
    useState(false);
  const [generatedTokenChoiceBusy, setGeneratedTokenChoiceBusy] =
    useState<"manual-exception" | "detach" | null>(null);
  const pendingGeneratedSaveArgsRef = useRef<[boolean, boolean] | null>(null);
  const generatedSaveBypassRef = useRef(false);

  const [addingEditorMode, setAddingEditorMode] = useState(false);
  const [editorNewModeName, setEditorNewModeName] = useState("");
  const [editorAddModeSaving, setEditorAddModeSaving] = useState(false);

  const handleAddEditorMode = useCallback(async () => {
    const name = editorNewModeName.trim();
    if (!name) {
      setAddingEditorMode(false);
      setEditorNewModeName("");
      return;
    }
    setEditorAddModeSaving(true);
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(ownerCollectionId)}/modes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      setEditorNewModeName("");
      setAddingEditorMode(false);
      onRefresh?.();
    } catch {
      // keep input open on error
    } finally {
      setEditorAddModeSaving(false);
    }
  }, [editorNewModeName, ownerCollectionId, onRefresh, serverUrl]);

  const initialFieldsSnapshot = initialRef.current;
  const hasGeneratedValueChanges = useMemo(() => {
    if (!initialFieldsSnapshot) {
      return false;
    }
    return (
      stableStringify(value) !== stableStringify(initialFieldsSnapshot.value)
    );
  }, [initialFieldsSnapshot, value]);
  const hasGeneratedNonValueChanges = useMemo(() => {
    if (!initialFieldsSnapshot) {
      return false;
    }
    return (
      tokenType !== initialFieldsSnapshot.type ||
      description !== initialFieldsSnapshot.description ||
      stableStringify(scopes) !== stableStringify(initialFieldsSnapshot.scopes) ||
      stableStringify(colorModifiers) !==
        stableStringify(initialFieldsSnapshot.colorModifiers) ||
      stableStringify(modeValues) !==
        stableStringify(initialFieldsSnapshot.modeValues) ||
      extensionsJsonText !== initialFieldsSnapshot.extensionsJsonText ||
      lifecycle !== initialFieldsSnapshot.lifecycle ||
      extendsPath !== initialFieldsSnapshot.extendsPath
    );
  }, [
    colorModifiers,
    description,
    extendsPath,
    extensionsJsonText,
    initialFieldsSnapshot,
    lifecycle,
    modeValues,
    scopes,
    tokenType,
  ]);
  const canCreateManualException =
    hasGeneratedValueChanges && !hasGeneratedNonValueChanges;

  const requestClose = editorSessionHost.requestClose;
  const beforeSaveGeneratedToken = useCallback(
    async (forceOverwrite: boolean, createAnother: boolean) => {
      if (
        isCreateMode ||
        !activeProducingGenerator ||
        generatedSaveBypassRef.current
      ) {
        if (generatedSaveBypassRef.current) {
          generatedSaveBypassRef.current = false;
        }
        return true;
      }
      pendingGeneratedSaveArgsRef.current = [forceOverwrite, createAnother];
      setGeneratedTokenChoiceOpen(true);
      return false;
    },
    [activeProducingGenerator, isCreateMode],
  );

  const saveHook = useTokenEditorSave({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
    editPath,
    tokenType,
    value,
    description,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
    collections,
    initialServerSnapshotRef,
    passthroughTokenManagerRef,
    onBack,
    requestClose,
    onSaved,
    onSaveAndCreateAnother,
    pushUndo,
    beforeSave: beforeSaveGeneratedToken,
  });
  const {
    saving,
    error: saveError,
    setError: setSaveError,
    showConflictConfirm,
    setShowConflictConfirm,
    saveRetryArgs,
    setSaveRetryArgs,
    handleSaveRef,
    handleSave,
    handleDelete,
  } = saveHook;

  const displayError = error || saveError;
  const setDisplayError = useCallback((v: string | null) => {
    setError(v);
    setSaveError(v);
  }, [setError, setSaveError]);

  useEffect(() => {
    if (!isCreateMode) return;
    const resolvedType = normalizeTokenType(initialType);
    const initialCreateValue = getInitialCreateValue(resolvedType, initialValue);
    const collection = collections.find((c) => c.id === ownerCollectionId);
    const initModeValues: Record<string, Record<string, unknown>> = {};
    if (collection && collection.modes.length >= 2) {
      const collectionModes: Record<string, unknown> = {};
      for (let i = 1; i < collection.modes.length; i++) {
        collectionModes[collection.modes[i].name] = structuredClone(initialCreateValue);
      }
      initModeValues[collection.id] = collectionModes;
    }
    initialRef.current = {
      value: initialCreateValue,
      description: '',
      scopes: [],
      type: resolvedType,
      colorModifiers: [],
      modeValues: initModeValues,
      extensionsJsonText: '',
      lifecycle: 'published',
      extendsPath: '',
    };
    setTokenType(resolvedType);
    setValue(initialCreateValue);
    setDescription('');
    setScopes([]);
    setColorModifiers([]);
    setModeValues(initModeValues);
    setExtensionsJsonText('');
    setExtensionsJsonError(null);
    setLifecycle('published');
    setExtendsPath('');
    setEditPath(tokenPath);
    setShowPathAutocomplete(tokenPath.trim().endsWith('.'));
    setDisplayError(null);
  }, [
    collections,
    initialRef,
    initialType,
    initialValue,
    isCreateMode,
    ownerCollectionId,
    setColorModifiers,
    setDescription,
    setEditPath,
    setExtensionsJsonError,
    setExtensionsJsonText,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    setScopes,
    setDisplayError,
    setShowPathAutocomplete,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  useEffect(() => {
    if (!isCreateMode) return;
    lsSet(STORAGE_KEYS.LAST_CREATE_TYPE, normalizeTokenType(tokenType));
  }, [isCreateMode, tokenType]);

  const openGeneratedGroupEditor = useCallback((target: TokensLibraryGeneratedGroupEditorTarget) => {
    onOpenGeneratedGroupEditor?.(target);
  }, [onOpenGeneratedGroupEditor]);

  useEffect(() => {
    setDetachedFromGenerator(false);
    setGeneratedTokenChoiceOpen(false);
    pendingGeneratedSaveArgsRef.current = null;
    generatedSaveBypassRef.current = false;
  }, [tokenPath, producingGenerator?.id]);

  const handleDetachGeneratorOwnership = useCallback(async (): Promise<boolean> => {
    if (!producingGenerator) return false;
    setDetachingGeneratorOwnership(true);
    try {
      setError(null);
      await apiFetch(`${serverUrl}/api/generators/${producingGenerator.id}/detach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: "token",
          path: tokenPath,
        }),
      });
      if (initialServerSnapshotRef.current) {
        try {
            const snapshot = JSON.parse(initialServerSnapshotRef.current) as {
              $extensions?: Record<string, unknown>;
            } | null;
            if (snapshot?.$extensions) {
              const nextExtensions = { ...snapshot.$extensions };
              delete nextExtensions["com.tokenmanager.generator"];
              initialServerSnapshotRef.current = stableStringify({
                ...snapshot,
                $extensions:
                  Object.keys(nextExtensions).length > 0 ? nextExtensions : undefined,
              });
            }
        } catch (err) {
          console.debug("[TokenEditor] failed to update detached generator snapshot:", err);
        }
      }
      setDetachedFromGenerator(true);
      onRefresh?.();
      dispatchToast(
        `Detached "${tokenPath}" from "${producingGenerator.name}"`,
        "success",
        {
          destination: {
            kind: "token",
            tokenPath,
            collectionId: ownerCollectionId,
          },
        },
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach token from generator");
      return false;
    } finally {
      setDetachingGeneratorOwnership(false);
    }
  }, [
    initialServerSnapshotRef,
    onRefresh,
    ownerCollectionId,
    producingGenerator,
    serverUrl,
    tokenPath,
  ]);

  const getProducingGeneratorStepName = useCallback(() => {
    if (!activeProducingGenerator) {
      return null;
    }
    const prefix = `${activeProducingGenerator.targetGroup}.`;
    if (!tokenPath.startsWith(prefix)) {
      return null;
    }
    const stepName = tokenPath.slice(prefix.length);
    if (!stepName || stepName.includes(".")) {
      return null;
    }
    return stepName;
  }, [activeProducingGenerator, tokenPath]);

  const handleSaveManualException = useCallback(async () => {
    if (!canCreateManualException) {
      setError(
        "Manual exceptions only support value edits. Detach this token if you need to keep the other changes.",
      );
      return;
    }
    const stepName = getProducingGeneratorStepName();
    if (!activeProducingGenerator || !stepName) {
      setError("This token cannot store a manual exception. Edit the generator or detach it instead.");
      return;
    }

    setGeneratedTokenChoiceBusy("manual-exception");
    try {
      setError(null);
      await apiFetch(
        `${serverUrl}/api/generators/${activeProducingGenerator.id}/steps/${encodeURIComponent(stepName)}/override`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            value,
            locked: true,
          }),
        },
      );
      clearEditorDraft(ownerCollectionId, tokenPath);
      onSaved?.(tokenPath);
      onRefresh?.();
      dispatchToast(
        `Saved manual exception for "${tokenPath}"`,
        "success",
        {
          destination: {
            kind: "token",
            tokenPath,
            collectionId: ownerCollectionId,
          },
        },
      );
      setGeneratedTokenChoiceOpen(false);
      pendingGeneratedSaveArgsRef.current = null;
      onBack();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save manual exception",
      );
    } finally {
      setGeneratedTokenChoiceBusy(null);
    }
  }, [
    activeProducingGenerator,
    canCreateManualException,
    getProducingGeneratorStepName,
    onBack,
    onRefresh,
    onSaved,
    ownerCollectionId,
    serverUrl,
    tokenPath,
    value,
  ]);

  const handleDetachAndSaveGeneratedToken = useCallback(async () => {
    const saveArgs = pendingGeneratedSaveArgsRef.current ?? [false, false];
    setGeneratedTokenChoiceBusy("detach");
    try {
      const detached = await handleDetachGeneratorOwnership();
      if (!detached) {
        return;
      }
      generatedSaveBypassRef.current = true;
      setGeneratedTokenChoiceOpen(false);
      pendingGeneratedSaveArgsRef.current = null;
      await handleSaveRef.current(saveArgs[0], saveArgs[1]);
    } finally {
      setGeneratedTokenChoiceBusy(null);
    }
  }, [handleDetachGeneratorOwnership, handleSaveRef]);

  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return trimmed in allTokensFlat;
  }, [isCreateMode, editPath, allTokensFlat]);

  useEffect(() => {
    editorSessionHost.registerSession({
      isDirty: isEditMode ? isDirty : false,
      canSave:
        isEditMode &&
        canSave &&
        !saving &&
        !duplicatePath &&
        (!isCreateMode || editPath.trim().length > 0),
      save: async () => {
        if (isEditMode) {
          return handleSaveRef.current();
        }
        return false;
      },
      discard: async () => {
        if (isEditMode) {
          clearEditorDraft(ownerCollectionId, tokenPath);
          setPendingDraft(null);
        }
        onBack();
      },
      closeWhenClean: onBack,
    });
    return () => {
      editorSessionHost.registerSession(null);
    };
  }, [
    canSave,
    duplicatePath,
    editPath,
    editorSessionHost,
    handleSaveRef,
    isCreateMode,
    isDirty,
    isEditMode,
    onBack,
    saving,
    ownerCollectionId,
    tokenPath,
    setPendingDraft,
  ]);

  // Restore scroll position when navigating between tokens
  useEffect(() => {
    const saved = scrollPositionsRef.current.get(tokenPath) ?? 0;
    const raf = requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = saved;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [tokenPath]);

  useEffect(() => {
    if (!isEditMode || !isDirty || isCreateMode) return;
    saveEditorDraft(ownerCollectionId, tokenPath, {
      tokenType,
      value,
      description,
      scopes,
      colorModifiers,
      modeValues,
      extensionsJsonText,
      lifecycle,
      extendsPath,
    });
  }, [
    isDirty,
    isEditMode,
    ownerCollectionId,
    tokenPath,
    isCreateMode,
    tokenType,
    value,
    description,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
  ]);


  const handleRevert = () => {
    if (!initialRef.current) return;
    const init = initialRef.current;
    setTokenType(init.type);
    setValue(init.value);
    setDescription(init.description);
    setScopes(init.scopes);
    setColorModifiers(init.colorModifiers);
    setModeValues(init.modeValues);
    setExtensionsJsonText(init.extensionsJsonText);
    setExtensionsJsonError(null);
    setLifecycle(init.lifecycle);
    setExtendsPath(init.extendsPath);
    setSaveRetryArgs(null);
    setDisplayError(null);
    clearEditorDraft(ownerCollectionId, tokenPath);
    setPendingDraft(null);
  };

  const applyDraft = (draft: typeof pendingDraft) => {
    if (!draft) return;
    setTokenType(draft.tokenType);
    setValue(draft.value);
    setDescription(draft.description);
    setScopes(draft.scopes);
    setColorModifiers(draft.colorModifiers);
    setModeValues(draft.modeValues);
    setExtensionsJsonText(draft.extensionsJsonText);
    setLifecycle(draft.lifecycle);
    setExtendsPath(draft.extendsPath);
    setPendingDraft(null);
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement | null;
      const modeRow = target?.closest<HTMLElement>("[data-token-editor-mode]");
      const modeName = modeRow?.dataset.tokenEditorMode;
      const activeMode = modeName
        ? modeValue.modes.find((mode) => mode.name === modeName)
        : modeValue.modes[0];

      handlePasteInValueEditor(e, {
        tokenType,
        value: activeMode?.value ?? value,
        isAliasMode: modeRow?.dataset.tokenEditorAlias === "1",
        parsePastedValue,
        setValue: activeMode?.setValue ?? setValue,
      });
    },
    [handlePasteInValueEditor, modeValue.modes, setValue, tokenType, value],
  );

  const [detailsOpen, setDetailsOpen] = useState(() => {
    return lsGet(STORAGE_KEYS.EDITOR_DETAILS) === '1';
  });
  const toggleDetails = useCallback(() => {
    setDetailsOpen((v) => {
      const next = !v;
      lsSet(STORAGE_KEYS.EDITOR_DETAILS, next ? '1' : '0');
      return next;
    });
  }, []);

  const rawJsonPreview = useMemo(() => {
    const extensions: Record<string, unknown> = {};
    if (scopes.length > 0) {
      extensions["com.figma.scopes"] = scopes;
    }

    const tokenManagerExtensions: Record<string, unknown> =
      passthroughTokenManagerRef.current
        ? { ...passthroughTokenManagerRef.current }
        : {};
    if (colorModifiers.length > 0) {
      tokenManagerExtensions.colorModifier = colorModifiers;
    }

    const editorCollection =
      collections.find((collection) => collection.id === ownerCollectionId) ?? null;
    const cleanModes = sanitizeEditorCollectionModeValues(
      modeValues,
      editorCollection,
    );

    if (Object.keys(cleanModes).length > 0) {
      tokenManagerExtensions.modes = cleanModes;
    }
    if (lifecycle !== "published") {
      tokenManagerExtensions.lifecycle = lifecycle;
    }
    if (extendsPath) {
      tokenManagerExtensions.extends = extendsPath;
    }
    if (Object.keys(tokenManagerExtensions).length > 0) {
      extensions.tokenmanager = tokenManagerExtensions;
    }

    const trimmedExtensions = extensionsJsonText.trim();
    if (trimmedExtensions && trimmedExtensions !== "{}") {
      try {
        const parsedExtensions = JSON.parse(trimmedExtensions);
        if (parsedExtensions && typeof parsedExtensions === "object" && !Array.isArray(parsedExtensions)) {
          Object.assign(
            extensions,
            omitTokenEditorReservedExtensions(parsedExtensions),
          );
        }
      } catch {
        // Keep the preview focused on the valid payload we can infer from the form.
      }
    }

    return JSON.stringify(
      createTokenValueBody({
        type: tokenType,
        value,
        description: description || undefined,
        extensions,
      }),
      null,
      2,
    );
  }, [
    colorModifiers,
    description,
    extensionsJsonText,
    extendsPath,
    lifecycle,
    modeValues,
    scopes,
    tokenType,
    value,
    collections,
    ownerCollectionId,
    passthroughTokenManagerRef,
  ]);

  const syncComparableValue = useMemo(
    () =>
      resolveSyncComparableValue({
        tokenPath,
        allTokensFlat,
        currentValue: value,
        currentType: tokenType,
      }),
    [allTokensFlat, tokenPath, tokenType, value],
  );

  if (loading) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 py-3 text-[var(--color-figma-text-secondary)] text-body">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading token...
      </div>
    );
  }

  const syncChanged =
    !isCreateMode &&
    hasSyncSnapshotChange(syncSnapshot, tokenPath, syncComparableValue);

  const tokenLintViolations = lintViolations.filter((v) => v.path === tokenPath);

  const trimmedEditPath = editPath.trim();
  const trimmedEditLeaf = trimmedEditPath.split(".").filter(Boolean).pop() ?? "";
  const createSuggestions = NAMESPACE_SUGGESTIONS[tokenType]?.prefixes ?? [];
  const footerNote =
    isCreateMode && duplicatePath
      ? "Path already exists."
      : isCreateMode && !trimmedEditPath
        ? "Enter a token path."
        : saveBlockReason;

  const handleCopyPath = () => {
    navigator.clipboard.writeText(tokenPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const headerTitle = (
    <>
      {isCreateMode ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-body font-semibold text-[var(--color-figma-text)]">
            New token
          </div>
          <div className="text-secondary text-[var(--color-figma-text-secondary)]">
            {ownerCollectionId}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate font-mono text-body text-[var(--color-figma-text)]" title={tokenPath}>
              {tokenPath}
            </span>
            <button
              type="button"
              onClick={handleCopyPath}
              title="Copy token path"
              aria-label="Copy token path"
              className="shrink-0 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
            >
              {copied ? (
                <Check size={12} strokeWidth={1.5} aria-hidden />
              ) : (
                <Copy size={12} strokeWidth={1.5} aria-hidden />
              )}
            </button>
            {isEditMode && isDirty && (
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]"
                title="Unsaved changes"
                aria-label="Unsaved changes"
              />
            )}
            {syncChanged && (
              <span
                className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-warning)]"
                title="Not yet synced to Figma"
                aria-label="Not yet synced to Figma"
              />
            )}
          </div>
          <div className="min-w-0">
            <span className="truncate text-secondary text-[var(--color-figma-text-secondary)]">
              in {ownerCollectionId}
            </span>
          </div>
        </div>
      )}
    </>
  );

  const headerActions = (
    <>
      {!isCreateMode && isInspectMode && onDuplicate && (
        <button
          type="button"
          onClick={onDuplicate}
          className="px-2 py-1 rounded text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
        >
          Duplicate
        </button>
      )}
      {!isCreateMode && isInspectMode && onEnterEditMode && (
        <button
          type="button"
          onClick={onEnterEditMode}
          className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Edit
        </button>
      )}
      {valueIsAlias &&
        tokenType === "color" &&
        (() => {
          const refPath = extractAliasPath(value as string);
          const resolved = refPath
            ? resolveRefValue(refPath, colorFlatMap)
            : null;
          if (!resolved) return null;
          return (
            <div
              className="w-3.5 h-3.5 rounded-sm border border-white/50 ring-1 ring-[var(--color-figma-border)]"
              style={{ backgroundColor: resolved }}
              title={resolved}
              aria-hidden="true"
            />
          );
        })()}
    </>
  );

  const afterHeader = (
    <>
      {isEditMode && pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-body">
          <Clock size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-figma-warning)]" aria-hidden />
          <span className="flex-1 text-[var(--color-figma-warning)] truncate">
            Unsaved changes from {formatDraftAge(pendingDraft.savedAt)}
          </span>
          <button
            type="button"
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-secondary font-medium text-[var(--color-figma-warning)] hover:underline"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingDraft(null);
              clearEditorDraft(ownerCollectionId, tokenPath);
            }}
            className="shrink-0 text-secondary text-[var(--color-figma-warning)] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );

  const footer = isInspectMode ? null : (
    <div className={AUTHORING_SURFACE_CLASSES.footer}>
      {(footerNote || (isCreateMode && onSaveAndCreateAnother)) && (
        <div className={`${AUTHORING_SURFACE_CLASSES.footerMeta} flex items-center justify-between gap-2`}>
          <span
            className={
              footerNote && (duplicatePath || saveBlockReason)
                ? "text-[var(--color-figma-error)]"
                : undefined
            }
          >
            {footerNote || " "}
          </span>
          {isCreateMode && onSaveAndCreateAnother && (
            <button
              type="button"
              onClick={() => handleSave(false, true)}
              disabled={saving || !canSave || !trimmedEditPath || duplicatePath}
              title={`Create this token and immediately start creating another (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)})`}
              className="shrink-0 text-secondary font-medium text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
            >
              Create another{" "}
              <span className="opacity-60">
                {adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE_AND_NEW)}
              </span>
            </button>
          )}
        </div>
      )}
      <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
        <div className="flex flex-wrap items-center gap-2">
          {!isCreateMode && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete token"
              aria-label="Delete token"
              className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
            >
              <Trash2 size={12} strokeWidth={1.5} aria-hidden />
            </button>
          )}
          <button type="button" onClick={requestClose} className={AUTHORING.footerBtnSecondary}>
            {isDirty || isCreateMode ? "Cancel" : "Close"}
          </button>
          {isDirty && !isCreateMode && (
            <button
              type="button"
              onClick={handleRevert}
              title="Revert to last saved state"
              className={AUTHORING.footerBtnSecondary}
            >
              Revert
            </button>
          )}
        </div>
        <div
          className="ml-auto min-w-[140px] flex-1"
          onClick={() => {
            if (!canSave && saveBlockReason && tokenType === "typography")
              focusBlockedField();
          }}
        >
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={
              saving ||
              !canSave ||
              duplicatePath ||
              (!isCreateMode && !isDirty) ||
              (isCreateMode && !trimmedEditPath)
            }
            title={saveBlockReason || `Save (${adaptShortcut(SHORTCUT_KEYS.EDITOR_SAVE)})`}
            className={AUTHORING.footerBtnPrimary}
          >
            {saving ? (
              isCreateMode ? (
                "Creating…"
              ) : (
                "Saving…"
              )
            ) : (
              <>
                {isCreateMode ? "Create" : "Save"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  const extendsSection = !valueIsAlias && COMPOSITE_TOKEN_TYPES.has(tokenType) ? (
    <div className="flex flex-col gap-1">
      <label className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
        Inherits from
      </label>
      {extendsPath ? (
        <div className="flex items-center gap-1.5">
          <Link2 size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden />
          <span
            className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}
            title={extendsPath}
          >
            {extendsPath}
          </span>
          {isEditMode && (
            <button
              type="button"
              onClick={() => setExtendsPath("")}
              title="Remove base token"
              aria-label="Remove base token"
              className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
            >
              <X size={10} strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      ) : isEditMode ? (
        <ExtendsTokenPicker
          tokenType={tokenType}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          currentPath={isCreateMode ? trimmedEditPath : tokenPath}
          onSelect={setExtendsPath}
        />
      ) : (
        <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
          No base token
        </p>
      )}
      {extendsPath &&
        (() => {
          const base = allTokensFlat[extendsPath];
          if (!base) {
            return (
              <p className="text-secondary text-[var(--color-figma-error)]">
                Base token not found
              </p>
            );
          }
          return (
            <p className="mt-0.5 text-secondary text-[var(--color-figma-text-tertiary)]">
              Base properties merged with overrides.
            </p>
          );
        })()}
    </div>
  ) : null;

  const scopeLabels = getScopeLabels(tokenType, scopes);
  const lifecycleLabel = getLifecycleLabel(lifecycle) ?? "Published";
  const readOnlyExtensionsText = extensionsJsonText.trim() || "{}";
  const lifecycleDotClass =
    lifecycle === "draft"
      ? "bg-[var(--color-figma-warning)]"
      : lifecycle === "deprecated"
        ? "bg-[var(--color-figma-text-tertiary)]"
        : "bg-[var(--color-figma-accent)]";

  const retryAction = saveRetryArgs ? (
    <button
      type="button"
      onClick={() => {
        setSaveRetryArgs(null);
        handleSaveRef.current(saveRetryArgs[0], saveRetryArgs[1]);
      }}
      className="tm-token-details__text-button"
    >
      Retry
    </button>
  ) : null;

  const openGeneratedSource = () => {
    if (!activeProducingGenerator) return;
    if (onOpenGeneratedGroupEditor) {
      openGeneratedGroupEditor({
        mode: "edit",
        id: activeProducingGenerator.id,
      });
      return;
    }
    onNavigateToGeneratedGroup?.(activeProducingGenerator.id);
  };

  const valueSectionDescription =
    modeValue.modes.length >= 2
      ? "Every mode is visible here. Edit each one directly or reference another token."
      : undefined;
  const valueSectionActions = !isCreateMode ? (
    isInspectMode ? (
      <span
        className={`px-1.5 py-0.5 rounded text-secondary font-medium uppercase ${tokenTypeBadgeClass(tokenType)}`}
      >
        {tokenType}
      </span>
    ) : (
      <TypePicker
        value={tokenType}
        onChange={handleTypeChange}
        title="Change token type"
        withChevron
        className={`pr-5 pl-2 py-1 rounded text-secondary font-medium cursor-pointer border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] outline-none focus-visible:border-[var(--color-figma-accent)] appearance-none ${tokenTypeBadgeClass(tokenType)}`}
        style={{ backgroundImage: "none" }}
      />
    )
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <EditorShell
        surface="authoring"
        onBack={requestClose}
        title={headerTitle}
        headerActions={headerActions}
        afterHeader={afterHeader}
        bodyRef={scrollContainerRef}
        bodyProps={{
          onScroll: (e) => {
            scrollPositionsRef.current.set(tokenPath, e.currentTarget.scrollTop);
          },
        }}
        bodyClassName={AUTHORING_SURFACE_CLASSES.bodyStack}
        footer={footer}
      >
        <TokenDetailsStatusBanners
          displayError={displayError}
          retryAction={retryAction}
          lintViolations={tokenLintViolations}
          lifecycle={lifecycle}
          isCreateMode={isCreateMode}
          isEditMode={isEditMode}
          pendingTypeChange={pendingTypeChange}
          tokenType={tokenType}
          dependents={dependents}
          showPendingDependents={showPendingDependents}
          ownerCollectionId={ownerCollectionId}
          tokenPath={tokenPath}
          onDismissTypeChange={() => {
            setPendingTypeChange(null);
            setShowPendingDependents(false);
          }}
          onApplyTypeChange={() => {
            if (pendingTypeChange) applyTypeChange(pendingTypeChange);
          }}
          onTogglePendingDependents={() =>
            setShowPendingDependents((value) => !value)
          }
          onNavigateToToken={onNavigateToToken}
        />

        {isCreateMode && (
          <div className="tm-token-details__create-setup">
            <div className="tm-token-details__create-header">
              <div className="min-w-0">
                <p className="text-body font-semibold text-[var(--color-figma-text)]">
                  Token details
                </p>
              </div>
              <div className="w-[112px] shrink-0">
                <label className="mb-1 block text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                  Type
                </label>
                <TypePicker
                  value={tokenType}
                  onChange={handleTypeChange}
                  title="Change token type"
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
            </div>
            <div className="relative" ref={pathInputWrapperRef}>
              <label className="mb-1 block text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                Token path
              </label>
              <input
                type="text"
                value={editPath}
                onChange={(e) => {
                  setEditPath(e.target.value);
                  setDisplayError(null);
                  setShowPathAutocomplete(true);
                }}
                onFocus={() => {
                  if (trimmedEditPath) setShowPathAutocomplete(true);
                }}
                onBlur={(e) => {
                  if (
                    !pathInputWrapperRef.current?.contains(e.relatedTarget as Node)
                  ) {
                    setShowPathAutocomplete(false);
                  }
                }}
                placeholder={NAMESPACE_SUGGESTIONS[tokenType]?.example ?? "token.name"}
                autoFocus
                autoComplete="off"
                className={`${AUTHORING.inputMono} ${
                  duplicatePath
                    ? "border-[var(--color-figma-error)] focus-visible:border-[var(--color-figma-error)]"
                    : ""
                }`}
              />
              {showPathAutocomplete && trimmedEditPath && (
                <PathAutocomplete
                  query={editPath}
                  allTokensFlat={allTokensFlat}
                  onSelect={(path) => {
                    setEditPath(path);
                    setDisplayError(null);
                    setShowPathAutocomplete(path.endsWith("."));
                  }}
                  onClose={() => setShowPathAutocomplete(false)}
                />
              )}
            </div>
            <div className="tm-token-details__create-meta">
              <span>Collection: {ownerCollectionId}</span>
              {trimmedEditLeaf && <span>Leaf: {trimmedEditLeaf}</span>}
            </div>
            {duplicatePath && (
              <p className="text-secondary text-[var(--color-figma-error)]">
                A token with this path already exists in{" "}
                {pathToCollectionId[trimmedEditPath] || ownerCollectionId}.
              </p>
            )}
            {!editPath.includes(".") && createSuggestions.length > 0 && (
              <div className="tm-token-details__suggestions">
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">
                  Try:
                </span>
                {createSuggestions.map((prefix) => (
                  <button
                    key={prefix}
                    type="button"
                    onClick={() => {
                      setEditPath(prefix);
                      setDisplayError(null);
                    }}
                    className="tm-token-details__suggestion-button"
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <TokenDetailsSection
          title="Value"
          description={valueSectionDescription}
          actions={valueSectionActions}
        >
          <div
            className="flex flex-col gap-3"
            ref={valueEditorContainerRef}
            onPaste={isEditMode ? handlePaste : undefined}
          >
            <div
              className="tm-token-details__mode-stack"
              title={
                modeValue.modes.length >= 2
                  ? (valueFormatHint(tokenType) || undefined)
                  : undefined
              }
            >
              {modeValue.modes.map((mode, modeIdx) => {
                const modeVal = mode.value === "" ? undefined : mode.value;
                const baseVal = extendsPath ? allTokensFlat[extendsPath]?.$value : undefined;
                const initialModeVal =
                  modeIdx === 0
                    ? initialFieldsSnapshot?.value
                    : initialFieldsSnapshot?.modeValues[ownerCollectionId]?.[mode.name];
                const isModeModified =
                  initialModeVal !== undefined &&
                  stableStringify(modeVal ?? "") !== stableStringify(initialModeVal ?? "");
                const showModeLabel = modeValue.modes.length >= 2;

                return (
                  <TokenDetailsModeRow
                    key={mode.name}
                    modeName={mode.name}
                    tokenType={tokenType}
                    value={modeVal}
                    editable={isEditMode}
                    onChange={isEditMode ? mode.setValue : undefined}
                    allTokensFlat={allTokensFlat}
                    pathToCollectionId={pathToCollectionId}
                    showModeLabel={showModeLabel}
                    autoFocus={modeIdx === 0 && !isCreateMode && isEditMode}
                    baseValue={baseVal}
                    availableFonts={availableFonts}
                    fontWeightsByFamily={fontWeightsByFamily}
                    fontFamilyRef={modeIdx === 0 ? fontFamilyRef : undefined}
                    fontSizeRef={modeIdx === 0 ? fontSizeRef : undefined}
                    modified={isModeModified && !isCreateMode}
                    onNavigateToToken={(path) => onNavigateToToken?.(path, tokenPath)}
                    allowCopyFromPrevious={isEditMode && modeValue.modes.length > 1}
                    onCopyFromPrevious={
                      isEditMode && modeValue.modes.length > 1
                        ? () => {
                            const sourceIdx =
                              modeIdx === 0
                                ? modeValue.modes.length - 1
                                : modeIdx - 1;
                            const sourceValue = modeValue.modes[sourceIdx].value;
                            if (sourceValue !== "" && sourceValue != null) {
                              mode.setValue(
                                typeof sourceValue === "object"
                                  ? JSON.parse(JSON.stringify(sourceValue))
                                  : sourceValue,
                              );
                            }
                          }
                        : undefined
                    }
                    allowCopyToAll={
                      isEditMode &&
                      modeValue.modes.length > 1 &&
                      modeVal !== "" &&
                      modeVal != null
                    }
                    onCopyToAll={
                      isEditMode &&
                      modeValue.modes.length > 1 &&
                      modeVal !== "" &&
                      modeVal != null
                        ? () => {
                            const sourceValue = mode.value;
                            if (sourceValue === "" || sourceValue == null) return;
                            modeValue.modes.forEach((destMode, destIdx) => {
                              if (destIdx === modeIdx) return;
                              destMode.setValue(
                                typeof sourceValue === "object"
                                  ? JSON.parse(JSON.stringify(sourceValue))
                                  : sourceValue,
                              );
                            });
                          }
                        : undefined
                    }
                  />
                );
              })}
              {isEditMode && addingEditorMode ? (
                <div className="tm-token-details__mode-add-input">
                  <input
                    type="text"
                    value={editorNewModeName}
                    onChange={(e) => setEditorNewModeName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddEditorMode();
                      if (e.key === "Escape") {
                        setAddingEditorMode(false);
                        setEditorNewModeName("");
                      }
                    }}
                    onBlur={() => {
                      if (!editorNewModeName.trim()) {
                        setAddingEditorMode(false);
                        setEditorNewModeName("");
                      }
                    }}
                    autoFocus
                    disabled={editorAddModeSaving}
                    placeholder="Mode name"
                    className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none"
                  />
                </div>
              ) : isEditMode ? (
                <button
                  type="button"
                  onClick={() => setAddingEditorMode(true)}
                  className="tm-token-details__mode-add"
                >
                  <Plus size={12} strokeWidth={1.5} aria-hidden />
                  Add mode
                </button>
              ) : null}
            </div>

            {isEditMode &&
              tokenType === "color" &&
              (valueIsAlias || (typeof value === "string" && value.length > 0)) && (
                <ColorModifiersEditor
                  reference={valueIsAlias ? (value as string) : undefined}
                  colorFlatMap={valueIsAlias ? colorFlatMap : undefined}
                  directColor={
                    !valueIsAlias && typeof value === "string" ? value : undefined
                  }
                  colorModifiers={colorModifiers}
                  onColorModifiersChange={setColorModifiers}
                />
              )}

            {isInspectMode && colorModifiers.length > 0 ? (
              <div className="tm-token-details__field">
                <span className="tm-token-details__field-label">Color modifiers</span>
                <pre className="tm-token-details__code-block">
                  {JSON.stringify(colorModifiers, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </TokenDetailsSection>

        <TokenDetailsSection title="Description">
          {isInspectMode ? (
            <p className="tm-token-details__read-text">
              {description || <span className="tm-token-details__empty-text">No description</span>}
            </p>
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
              className="min-h-[56px] w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/50 focus-visible:border-[var(--color-figma-accent)]"
            />
          )}
        </TokenDetailsSection>

        <TokenDetailsSection
          title="Usage"
          description="Define where this token applies and how it should be treated in the system."
        >
          <div className="tm-token-details__usage-grid">
            {FIGMA_SCOPE_OPTIONS[tokenType] ? (
              <div className="tm-token-details__field">
                <span className="tm-token-details__field-label">Can apply to</span>
                <p className="tm-token-details__field-help">
                  Pick the Figma fields this token is valid for. Leave empty to allow
                  any compatible field.
                </p>
                {isInspectMode ? (
                  <div className="tm-token-details__field-value">
                    {scopeLabels.length > 0 ? scopeLabels.join(", ") : "Any compatible field"}
                  </div>
                ) : (
                  <ScopeEditor
                    tokenTypes={[tokenType]}
                    selectedScopes={scopes}
                    onChange={setScopes}
                    compact
                  />
                )}
              </div>
            ) : null}

            <div className="tm-token-details__field">
              <span className="tm-token-details__field-label">Lifecycle</span>
              {isInspectMode ? (
                <div className="tm-token-details__lifecycle-row">
                  <span className={`tm-token-details__lifecycle-dot ${lifecycleDotClass}`} aria-hidden />
                  <span className="tm-token-details__field-value">{lifecycleLabel}</span>
                </div>
              ) : (
                <div className="tm-token-details__lifecycle-row">
                  <span className={`tm-token-details__lifecycle-dot ${lifecycleDotClass}`} aria-hidden />
                  <select
                    value={lifecycle}
                    onChange={(e) => setLifecycle(e.target.value as typeof lifecycle)}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                    aria-label="Lifecycle"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="deprecated">Deprecated</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </TokenDetailsSection>

        {!isCreateMode ? (
          <TokenDetailsSection title="Related">
            <div className="tm-token-details__support-stack">
              {tokenType === "color" ? (
                <ContrastChecker
                  tokenPath={tokenPath}
                  value={value}
                  allTokensFlat={allTokensFlat}
                  pathToCollectionId={pathToCollectionId}
                  colorFlatMap={colorFlatMap}
                />
              ) : null}

              {canBeGeneratorSource && !valueIsAlias ? (
                <TokenEditorDerivedGroups
                  tokenPath={tokenPath}
                  tokenName={tokenName}
                  tokenType={tokenType}
                  value={value}
                  existingGeneratorsForToken={existingGeneratorsForToken}
                  openGeneratedGroupEditor={openGeneratedGroupEditor}
                />
              ) : null}

              {activeProducingGenerator ? (
                <div className="tm-token-details__generated-card">
                  <div className="tm-token-details__subsection-copy">
                    <h4 className="tm-token-details__subsection-title">Generated</h4>
                    <p className="tm-token-details__subsection-description">
                      Managed by{" "}
                      <span className="font-medium text-[var(--color-figma-text)]">
                        {activeProducingGenerator.name}
                      </span>
                      {isInspectMode
                        ? ". Edit the generator to change the source rules for this token."
                        : ". Saving here will ask whether to edit the generator, keep a manual exception, or detach this token."}
                    </p>
                  </div>
                  <div className="tm-token-details__generated-actions">
                    {(onOpenGeneratedGroupEditor || onNavigateToGeneratedGroup) ? (
                      <button
                        type="button"
                        onClick={openGeneratedSource}
                        className="tm-token-details__text-button"
                      >
                        Edit generator
                      </button>
                    ) : null}
                    {isEditMode ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleDetachGeneratorOwnership();
                        }}
                        disabled={detachingGeneratorOwnership}
                        className="tm-token-details__text-button tm-token-details__text-button--muted"
                      >
                        {detachingGeneratorOwnership ? "Detaching…" : "Detach from generator"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {dependents.length > 0 ? (
                <div className="tm-token-details__field">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tm-token-details__field-label">Dependent tokens</span>
                    {isInspectMode && onOpenInHealth ? (
                      <button
                        type="button"
                        onClick={onOpenInHealth}
                        className="tm-token-details__text-button"
                      >
                        Open in health
                      </button>
                    ) : null}
                  </div>
                  <div className="tm-token-details__list-box">
                    {dependents.slice(0, 20).map((dep) =>
                      onNavigateToToken ? (
                        <button
                          key={dep.path}
                          type="button"
                          onClick={() => onNavigateToToken(dep.path, tokenPath)}
                          className="tm-token-details__list-row"
                          title={`Open ${dep.path}`}
                        >
                          <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                          {dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                          ) : null}
                        </button>
                      ) : (
                        <div key={dep.path} className="tm-token-details__list-row">
                          <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                          {dep.collectionId !== ownerCollectionId ? (
                            <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                          ) : null}
                        </div>
                      ),
                    )}
                    {dependents.length > 20 ? (
                      <div className="tm-token-details__list-note">
                        and {dependents.length - 20} more…
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </TokenDetailsSection>
        ) : null}

        <TokenDetailsAdvancedSection
          open={detailsOpen}
          onToggle={toggleDetails}
          extendsSection={extendsSection}
          isInspectMode={isInspectMode}
          readOnlyExtensionsText={readOnlyExtensionsText}
          extensionsJsonText={extensionsJsonText}
          onExtensionsJsonTextChange={setExtensionsJsonText}
          extensionsJsonError={extensionsJsonError}
          onExtensionsJsonErrorChange={setExtensionsJsonError}
          rawJsonPreview={rawJsonPreview}
        />
      </EditorShell>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <ConfirmModal
          title={`Delete "${tokenPath.split(".").pop()}"?`}
          description={`Token path: ${tokenPath}`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {generatedTokenChoiceOpen && activeProducingGenerator && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setGeneratedTokenChoiceOpen(false);
            }
          }}
        >
          <div className="w-[340px] rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl">
            <div className="px-4 pt-4 pb-3">
              <h3 className="text-heading font-semibold text-[var(--color-figma-text)]">
                This token is generated
              </h3>
              <p className="mt-1.5 text-body leading-relaxed text-[var(--color-figma-text-secondary)]">
                <span className="font-medium text-[var(--color-figma-text)]">
                  {activeProducingGenerator.name}
                </span>{" "}
                owns <span className="font-mono text-[var(--color-figma-text)]">{tokenPath}</span>.
                Choose how this edit should behave before saving.
              </p>
            </div>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <button
                type="button"
                onClick={() => {
                  setGeneratedTokenChoiceOpen(false);
                  pendingGeneratedSaveArgsRef.current = null;
                  if (onOpenGeneratedGroupEditor) {
                    openGeneratedGroupEditor({
                      mode: "edit",
                      id: activeProducingGenerator.id,
                    });
                    requestClose();
                    return;
                  }
                  onNavigateToGeneratedGroup?.(activeProducingGenerator.id);
                }}
                className="rounded-md bg-[var(--color-figma-accent)] px-3 py-2 text-left text-body font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
              >
                Edit generator
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSaveManualException();
                }}
                disabled={
                  generatedTokenChoiceBusy !== null || !canCreateManualException
                }
                className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left text-body font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
              >
                {generatedTokenChoiceBusy === "manual-exception"
                  ? "Saving manual exception…"
                  : "Make manual exception"}
              </button>
              {!canCreateManualException && (
                <p className="px-0.5 text-secondary leading-relaxed text-[var(--color-figma-text-secondary)]">
                  Manual exceptions only preserve the generated value. Detach this token if you need to keep description, scope, mode, lifecycle, or extension edits.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  void handleDetachAndSaveGeneratedToken();
                }}
                disabled={generatedTokenChoiceBusy !== null}
                className="rounded-md border border-[var(--color-figma-border)] px-3 py-2 text-left text-body font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
              >
                {generatedTokenChoiceBusy === "detach"
                  ? "Detaching…"
                  : "Detach from generator"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneratedTokenChoiceOpen(false);
                  pendingGeneratedSaveArgsRef.current = null;
                }}
                disabled={generatedTokenChoiceBusy !== null}
                className="text-body text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict confirmation */}
      {showConflictConfirm && (
        <ConfirmModal
          title="Token modified on server"
          description="This token was changed on the server since you started editing. Overwrite with your changes?"
          confirmLabel="Overwrite"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            setShowConflictConfirm(false);
            handleSave(true);
          }}
          onCancel={() => setShowConflictConfirm(false)}
        />
      )}
    </div>
  );
}
