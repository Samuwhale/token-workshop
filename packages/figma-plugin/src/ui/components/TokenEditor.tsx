import { adaptShortcut, stableStringify } from "../shared/utils";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { createTokenValueBody } from "../shared/tokenMutations";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createGeneratorOwnershipKey, resolveRefValue } from "@tokenmanager/core";
import type { TokenCollection } from "@tokenmanager/core";
import { useCollectionStateContext } from "../contexts/TokenDataContext";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import type { TokenGenerator } from "../hooks/useGenerators";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { AliasPicker } from "./AliasPicker";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { ColorModifiersEditor } from "./ColorModifiersEditor";
import { MetadataEditor } from "./MetadataEditor";
import { ModeValuesEditor } from "./token-editor/ModeValuesEditor";
import { readTokenPresentationMetadata } from "../shared/tokenMetadata";
import { PathAutocomplete } from "./PathAutocomplete";
import { useNearbyTokenMatch } from "../hooks/useNearbyTokenMatch";
import { Collapsible } from "./Collapsible";

import { useTokenEditorFields } from "../hooks/useTokenEditorFields";
import { useTokenEditorLoad } from "../hooks/useTokenEditorLoad";
import { useTokenDependents } from "../hooks/useTokenDependents";
import { useTokenAliasEditor } from "../hooks/useTokenAliasEditor";
import { useTokenTypeParsing } from "../hooks/useTokenTypeParsing";
import { useTokenEditorUIState } from "../hooks/useTokenEditorUIState";
import { useTokenEditorSave } from "../hooks/useTokenEditorSave";
import { useTokenEditorGenerators } from "../hooks/useTokenEditorGenerators";
import {
  clearEditorDraft,
  saveEditorDraft,
  formatDraftAge,
} from "../hooks/useTokenEditorUtils";
import { buildTokenDependencySnapshot } from "./TokenFlowPanel";
import type { TokensLibraryGeneratedGroupEditorTarget } from "../shared/navigationTypes";
import { lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";
import { normalizeTokenType } from "../shared/tokenTypeCategories";

import { detectAliasCycle, parsePastedValue, getInitialCreateValue, NAMESPACE_SUGGESTIONS } from "./token-editor/tokenEditorHelpers";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import { TokenEditorValueSection } from "./token-editor/TokenEditorValueSection";
import { TokenEditorDerivedGroups } from "./token-editor/TokenEditorDerivedGroups";
import { TokenEditorInfoSection } from "./token-editor/TokenEditorInfoSection";

interface TokenEditorProps {
  tokenPath: string;
  tokenName?: string;
  currentCollectionId: string;
  collectionId?: string;
  serverUrl: string;
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
  onShowReferences?: (path: string) => void;
  onNavigateToToken?: (path: string, fromPath?: string) => void;
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
  onOpenGeneratedGroupEditor?: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
}

export function TokenEditor({
  tokenPath,
  tokenName,
  currentCollectionId,
  collectionId: explicitCollectionId,
  serverUrl,
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
  onShowReferences,
  onNavigateToToken,
  onNavigateToGeneratedGroup,
  onOpenGeneratedGroupEditor,
  pushUndo,
}: TokenEditorProps) {
  const collectionState = useCollectionStateContext();
  const effectivePathToCollectionId = pathToCollectionId;
  const collectionsWithModes = useMemo(
    () => collections.filter((collection) => collection.modes.length > 0),
    [collections],
  );
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
  const uiState = useTokenEditorUIState({
    tokenPath,
  });
  const {
    showDeleteConfirm,
    setShowDeleteConfirm,
    copied,
    setCopied,
    pasteFlash,
    showPathAutocomplete,
    setShowPathAutocomplete,
    editPath,
    setEditPath,
    refsExpanded,
    setRefsExpanded,
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
    reference,
    setReference,
    aliasMode,
    setAliasMode,
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
    preAliasValueRef,
    isDirty,
    colorFlatMap,
  } = fields;

  const valueEditorContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const previousTokenPathRef = useRef(tokenPath);

  const aliasEditor = useTokenAliasEditor({
    aliasMode,
    setAliasMode,
    value,
    setValue,
    reference,
    setReference,
    tokenType,
    allTokensFlat,
    preAliasValueRef,
  });
  const {
    showAutocomplete,
    setShowAutocomplete,
    refInputRef,
    handleToggleAlias,
  } = aliasEditor;

  const [error, setError] = useState<string | null>(null);

  const loadResult = useTokenEditorLoad({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
    initialRef,
    setTokenType,
    setValue,
    setDescription,
    setReference,
    setAliasMode,
    setScopes,
    setColorModifiers,
    setModeValues,
    setExtensionsJsonText,
    setLifecycle,
    setExtendsPath,
    setError,
    refInputRef,
    valueEditorContainerRef,
  });
  const { loading, pendingDraft, setPendingDraft, initialServerSnapshotRef } =
    loadResult;

  const { dependents, dependentsLoading } = useTokenDependents({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
  });
  const tokenEntry = allTokensFlat[tokenPath];
  const tokenPresentation = useMemo(
    () => readTokenPresentationMetadata(tokenEntry),
    [tokenEntry],
  );
  const tokenAliasPath = useMemo(() => {
    const raw = tokenEntry?.$value;
    return typeof raw === "string" && isAlias(raw) ? extractAliasPath(raw) : null;
  }, [tokenEntry]);

  const typeParsing = useTokenTypeParsing({
    tokenType,
    setTokenType,
    value,
    setValue,
    aliasMode,
    reference,
    setReference,
    setAliasMode,
    setShowAutocomplete,
    setScopes,
    setExtendsPath,
    extensionsJsonError,
    isCreateMode,
    editPath: tokenPath, // placeholder; updated below after UIState
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
    aliasHasCycle,
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
  const initialFieldsSnapshot = initialRef.current;
  const hasGeneratedValueChanges = useMemo(() => {
    if (!initialFieldsSnapshot) {
      return false;
    }
    return (
      stableStringify(value) !== stableStringify(initialFieldsSnapshot.value) ||
      reference !== initialFieldsSnapshot.reference
    );
  }, [initialFieldsSnapshot, reference, value]);
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
    reference,
    description,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
    initialServerSnapshotRef,
    onBack,
    requestClose,
    onSaved,
    onSaveAndCreateAnother,
    pushUndo,
    beforeSave: beforeSaveGeneratedToken,
    handleToggleAlias,
    showAutocomplete,
    setShowAutocomplete,
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
    const aliasInitialValue = initialValue && isAlias(initialValue) ? initialValue : '';
    const initialCreateValue = getInitialCreateValue(resolvedType, initialValue);
    initialRef.current = {
      value: initialCreateValue,
      description: '',
      reference: aliasInitialValue,
      scopes: [],
      type: resolvedType,
      colorModifiers: [],
      modeValues: {},
      extensionsJsonText: '',
      lifecycle: 'published',
      extendsPath: '',
    };
    setTokenType(resolvedType);
    setValue(initialCreateValue);
    setDescription('');
    setReference(aliasInitialValue);
    setAliasMode(Boolean(aliasInitialValue));
    setScopes([]);
    setColorModifiers([]);
    setModeValues({});
    setExtensionsJsonText('');
    setExtensionsJsonError(null);
    setLifecycle('published');
    setExtendsPath('');
    setEditPath(tokenPath);
    setShowPathAutocomplete(tokenPath.trim().endsWith('.'));
    setDisplayError(null);
  }, [
    initialRef,
    initialType,
    initialValue,
    isCreateMode,
    setAliasMode,
    setColorModifiers,
    setDescription,
    setEditPath,
    setExtensionsJsonError,
    setExtensionsJsonText,
    setExtendsPath,
    setLifecycle,
    setModeValues,
    setReference,
    setScopes,
    setDisplayError,
    setShowPathAutocomplete,
    setTokenType,
    setValue,
    tokenPath,
  ]);

  useEffect(() => {
    if (!isCreateMode) return;
    lsSet('tm_last_token_type', normalizeTokenType(tokenType));
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
            initialServerSnapshotRef.current = JSON.stringify({
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
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach token from generator");
      return false;
    } finally {
      setDetachingGeneratorOwnership(false);
    }
  }, [initialServerSnapshotRef, onRefresh, producingGenerator, serverUrl, tokenPath]);

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
            value: reference || value,
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
    reference,
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
      isDirty,
      canSave:
        canSave &&
        !saving &&
        !duplicatePath &&
        (!isCreateMode || editPath.trim().length > 0),
      save: async () => handleSaveRef.current(),
      discard: async () => {
        clearEditorDraft(ownerCollectionId, tokenPath);
        setPendingDraft(null);
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
    if (!isDirty || isCreateMode) return;
    saveEditorDraft(ownerCollectionId, tokenPath, {
      tokenType,
      value,
      description,
      reference,
      scopes,
      colorModifiers,
      modeValues,
      extensionsJsonText,
      lifecycle,
      extendsPath,
    });
  }, [
    isDirty,
    ownerCollectionId,
    tokenPath,
    isCreateMode,
    tokenType,
    value,
    description,
    reference,
    scopes,
    colorModifiers,
    modeValues,
    extensionsJsonText,
    lifecycle,
    extendsPath,
  ]);

  const currentPathForMatch = isCreateMode ? editPath.trim() : tokenPath;
  const nearbyMatches = useNearbyTokenMatch(
    value,
    tokenType,
    allTokensFlat,
    currentPathForMatch,
    !aliasMode,
  );
  const dependencySnapshot = useMemo(
    () =>
      isCreateMode
        ? null
        : buildTokenDependencySnapshot(tokenPath, allTokensFlat, pathToCollectionId),
    [isCreateMode, tokenPath, allTokensFlat, pathToCollectionId],
  );
  const referenceTrace = dependencySnapshot?.referenceNodes ?? [];
  const dependentTrace = dependencySnapshot?.dependentNodes ?? [];

  const handleRevert = () => {
    if (!initialRef.current) return;
    const init = initialRef.current;
    setTokenType(init.type);
    setValue(init.value);
    setDescription(init.description);
    setReference(init.reference);
    setScopes(init.scopes);
    setColorModifiers(init.colorModifiers);
    setModeValues(init.modeValues);
    setExtensionsJsonText(init.extensionsJsonText);
    setExtensionsJsonError(null);
    setExtendsPath(init.extendsPath);
    setAliasMode(!!init.reference);
    clearEditorDraft(ownerCollectionId, tokenPath);
    setPendingDraft(null);
  };

  const applyDraft = (draft: typeof pendingDraft) => {
    if (!draft) return;
    setTokenType(draft.tokenType);
    setValue(draft.value);
    setDescription(draft.description);
    setReference(draft.reference);
    setAliasMode(!!draft.reference);
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
      handlePasteInValueEditor(e, {
        aliasMode,
        tokenType,
        parsePastedValue,
        setValue,
      });
    },
    [aliasMode, handlePasteInValueEditor, setValue, tokenType],
  );

  const [detailsOpen, setDetailsOpen] = useState(() => {
    return lsGet('tm_editor_details') === '1';
  });
  const [referenceOpen, setReferenceOpen] = useState(false);
  const toggleDetails = useCallback(() => {
    setDetailsOpen((v) => {
      const next = !v;
      lsSet('tm_editor_details', next ? '1' : '0');
      return next;
    });
  }, []);
  const [infoTab, setInfoTab] = useState<'dependencies' | 'usage' | 'history' | null>(() => {
    const saved = lsGet('tm_editor_info_tab');
    if (saved === 'dependencies' || saved === 'usage' || saved === 'history') return saved;
    return null;
  });
  const handleInfoTab = useCallback((tab: 'dependencies' | 'usage' | 'history') => {
    setInfoTab((prev) => {
      const next = prev === tab ? null : tab;
      lsSet('tm_editor_info_tab', next ?? '');
      return next;
    });
  }, []);
  const hasReferenceValues = aliasMode || Boolean(extendsPath);
  const referenceSummary = aliasMode
    ? (extractAliasPath(reference) ?? "Alias")
    : extendsPath
      ? extendsPath
      : null;

  useEffect(() => {
    if (previousTokenPathRef.current === tokenPath) return;
    previousTokenPathRef.current = tokenPath;
    setReferenceOpen(hasReferenceValues);
  }, [hasReferenceValues, tokenPath]);

  useEffect(() => {
    if (hasReferenceValues) {
      setReferenceOpen(true);
    }
  }, [hasReferenceValues]);

  const rawJsonPreview = useMemo(() => {
    const extensions: Record<string, unknown> = {};
    if (scopes.length > 0) {
      extensions["com.figma.scopes"] = scopes;
    }

    const tokenManagerExtensions: Record<string, unknown> = {};
    if (colorModifiers.length > 0) {
      tokenManagerExtensions.colorModifier = colorModifiers;
    }

    const cleanModes: Record<string, Record<string, unknown>> = {};
    for (const [collectionKey, collectionModes] of Object.entries(modeValues)) {
      if (!collectionModes || typeof collectionModes !== "object") continue;
      const cleanOptions = Object.fromEntries(
        Object.entries(collectionModes).filter(
          ([, modeValue]) =>
            modeValue !== "" && modeValue !== undefined && modeValue !== null,
        ),
      );
      if (Object.keys(cleanOptions).length > 0) {
        cleanModes[collectionKey] = cleanOptions;
      }
    }

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
          Object.assign(extensions, parsedExtensions);
        }
      } catch {
        // Keep the preview focused on the valid payload we can infer from the form.
      }
    }

    return JSON.stringify(
      createTokenValueBody({
        type: tokenType,
        value: reference || value,
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
    reference,
    scopes,
    tokenType,
    value,
  ]);

  if (loading) {
    return (
      <div role="status" className="flex flex-col items-center justify-center gap-2 py-3 text-[var(--color-figma-text-secondary)] text-[11px]">
        <Spinner size="md" className="text-[var(--color-figma-accent)]" />
        Loading token...
      </div>
    );
  }

  const trimmedEditPath = editPath.trim();
  const trimmedEditLeaf = trimmedEditPath.split(".").filter(Boolean).pop() ?? "";
  const createSuggestions = NAMESPACE_SUGGESTIONS[tokenType]?.prefixes ?? [];
  const footerNote =
    isCreateMode && duplicatePath
      ? "Path already exists."
      : isCreateMode && !trimmedEditPath
        ? "Enter a token path."
        : saveBlockReason;

  const headerTitle = (
    <>
      {isCreateMode ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            New token
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {ownerCollectionId}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <div className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}>
            {tokenPath}
          </div>
          {isDirty && (
            <span
              className="shrink-0 px-1 py-px rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/30 leading-none"
              title="Unsaved changes"
              aria-label="Unsaved changes"
            >
              Unsaved
            </span>
          )}
        </div>
      )}
      {!isCreateMode && (
        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
          in {ownerCollectionId}
        </div>
      )}
    </>
  );

  const headerActions = (
    <>
      {!isCreateMode && onShowReferences && (
        <button
          type="button"
          onClick={() => onShowReferences(tokenPath)}
          title="Open dependency graph"
          aria-label="Open dependency graph"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
          </svg>
        </button>
      )}
      {!isCreateMode && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy token path"
          aria-label="Copy token path"
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          {copied ? (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
      )}
      {aliasMode &&
        reference &&
        tokenType === "color" &&
        (() => {
          const refPath = extractAliasPath(reference);
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
      {!isCreateMode && (
        <span className="relative inline-flex items-center">
          <select
            value={tokenType}
            onChange={(e) => handleTypeChange(e.target.value)}
            title="Change token type"
            className={`pr-4 pl-1.5 py-0.5 rounded text-[10px] font-medium uppercase cursor-pointer border-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] appearance-none ${TOKEN_TYPE_BADGE_CLASS[tokenType ?? ""] ?? "token-type-string"}`}
            style={{ backgroundImage: "none" }}
          >
            {Object.keys(TOKEN_TYPE_BADGE_CLASS).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <svg
            width="6"
            height="6"
            viewBox="0 0 6 6"
            fill="currentColor"
            className="pointer-events-none absolute right-1 opacity-60"
            aria-hidden="true"
          >
            <path d="M0 1.5L3 4.5L6 1.5" />
          </svg>
        </span>
      )}
    </>
  );

  const afterHeader = (
    <>
      {collectionsWithModes.length > 0 && !isCreateMode && (
        <div className="flex items-center gap-1.5 px-3 py-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30">
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">Mode</span>
          {collectionsWithModes.map((collection) => {
            const activeOption =
              collectionState.selectedModes[collection.id] ||
              collection.modes[0]?.name ||
              "";
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => {
                  const idx = collection.modes.findIndex(
                    (mode) => mode.name === activeOption,
                  );
                  const nextIdx = (idx + 1) % collection.modes.length;
                  const nextOption = collection.modes[nextIdx]?.name;
                  if (nextOption) {
                    collectionState.setSelectedModes({
                      ...collectionState.selectedModes,
                      [collection.id]: nextOption,
                    });
                  }
                }}
                className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-figma-text)] hover:border-[var(--color-figma-accent)]/40 hover:text-[var(--color-figma-accent)] transition-colors"
                title={`${collection.id}: ${activeOption} (click to cycle)`}
              >
                {collectionsWithModes.length > 1 ? `${collection.id}: ` : ""}
                {activeOption}
              </button>
            );
          })}
        </div>
      )}
      {pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-[11px]">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--color-figma-warning)]"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="flex-1 text-[var(--color-figma-warning)] truncate">
            Unsaved changes from {formatDraftAge(pendingDraft.savedAt)}
          </span>
          <button
            type="button"
            onClick={() => applyDraft(pendingDraft)}
            className="shrink-0 text-[10px] font-medium text-[var(--color-figma-warning)] hover:underline"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingDraft(null);
              clearEditorDraft(ownerCollectionId, tokenPath);
            }}
            className="shrink-0 text-[10px] text-[var(--color-figma-warning)] hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </>
  );

  const footer = (
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
              className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
              </svg>
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

  const referenceSection = (
    <Collapsible
      open={referenceOpen}
      onToggle={() => setReferenceOpen((open) => !open)}
      label={
        <span className="flex items-center gap-1.5">
          <span>Reference</span>
          {referenceSummary && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              {referenceSummary}
            </span>
          )}
        </span>
      }
      className="flex flex-col gap-2"
    >
      <div className="mt-2 flex flex-col gap-3">
        <AliasPicker
          aliasMode={aliasMode}
          reference={reference}
          tokenType={tokenType}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          onToggleAlias={handleToggleAlias}
          onReferenceChange={setReference}
          showAutocomplete={showAutocomplete}
          onShowAutocompleteChange={setShowAutocomplete}
          aliasHasCycle={aliasHasCycle}
          refInputRef={refInputRef}
          hideHeader
        />

        {!aliasMode && COMPOSITE_TOKEN_TYPES.has(tokenType) && (
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
              Inherits from
            </label>
            {extendsPath ? (
              <div className="flex items-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 text-[var(--color-figma-accent)]"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span
                  className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1`}
                  title={extendsPath}
                >
                  {extendsPath}
                </span>
                <button
                  type="button"
                  onClick={() => setExtendsPath("")}
                  title="Remove base token"
                  className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
                >
                  <svg
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <ExtendsTokenPicker
                tokenType={tokenType}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                currentPath={isCreateMode ? trimmedEditPath : tokenPath}
                onSelect={setExtendsPath}
              />
            )}
            {extendsPath &&
              (() => {
                const base = allTokensFlat[extendsPath];
                if (!base) {
                  return (
                    <p className="text-[10px] text-[var(--color-figma-error)]">
                      Base token not found
                    </p>
                  );
                }
                return (
                  <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
                    Base properties merged with overrides.
                  </p>
                );
              })()}
          </div>
        )}
      </div>
    </Collapsible>
  );

  const dependentsSection = !isCreateMode && dependentTrace.length > 0 && (
    <Collapsible
      open={refsExpanded}
      onToggle={() => setRefsExpanded((open) => !open)}
      label={<span>Dependents ({dependentTrace.length})</span>}
      className="flex flex-col gap-2"
    >
      <div className="mt-2 flex flex-col gap-0.5 rounded-md border border-[var(--color-figma-border)]/65 bg-[var(--color-figma-bg-secondary)]/20 p-2">
        {dependentTrace.slice(0, 20).map((dependent) => {
          const dependentColor =
            dependent.$type === "color"
              ? resolveRefValue(dependent.path, colorFlatMap)
              : null;
          return (
            <button
              key={dependent.path}
              type="button"
              onClick={() => onNavigateToToken?.(dependent.path, tokenPath)}
              disabled={!onNavigateToToken}
              className="group flex items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-default"
              title={
                onNavigateToToken
                  ? `Navigate to ${dependent.path}`
                  : dependent.path
              }
              style={{
                paddingLeft: `${6 + Math.max(0, dependent.depth - 1) * 12}px`,
              }}
            >
              <span className="shrink-0 rounded bg-[var(--color-figma-bg-hover)] px-1 py-0.5 text-[8px] text-[var(--color-figma-text-secondary)]">
                {dependent.depth === 1 ? "Direct" : `+${dependent.depth - 1}`}
              </span>
              {dependentColor ? (
                <span
                  className="h-3 w-3 shrink-0 rounded-sm border border-[var(--color-figma-border)]"
                  style={{ backgroundColor: dependentColor }}
                />
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="shrink-0 opacity-40"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              )}
              <span
                className={`${LONG_TEXT_CLASSES.monoPrimary} flex-1 group-hover:underline`}
              >
                {dependent.path}
              </span>
              {dependent.collectionId && dependent.collectionId !== ownerCollectionId && (
                <span className="shrink-0 rounded bg-[var(--color-figma-bg-hover)] px-1 py-0.5 text-[8px] text-[var(--color-figma-text-secondary)]">
                  {dependent.collectionId}
                </span>
              )}
            </button>
          );
        })}
        {dependentTrace.length > 20 && (
          <div className="px-1.5 pt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)]">
            + {dependentTrace.length - 20} more
          </div>
        )}
      </div>
    </Collapsible>
  );

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
        {displayError && (
          <div
            role="alert"
            className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px] break-words max-h-16 overflow-auto flex items-start gap-2"
          >
            <span className="flex-1">{displayError}</span>
            {saveRetryArgs && (
              <button
                type="button"
                onClick={() => {
                  setSaveRetryArgs(null);
                  handleSaveRef.current(saveRetryArgs[0], saveRetryArgs[1]);
                }}
                className="shrink-0 font-medium underline hover:opacity-80"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Type-change confirmation — shown when a type switch would reset a non-default value */}
        {pendingTypeChange && (
          <div className="px-2 py-2 rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 text-[10px]">
            <p className="text-[var(--color-figma-text)] mb-2">
              Switch to <strong>{pendingTypeChange}</strong>? This will reset
              the current value.
              {dependents.length > 0 && (
                <span className="block mt-1">
                  <button
                    type="button"
                    onClick={() => setShowPendingDependents((v) => !v)}
                    className="flex items-center gap-1 text-[var(--color-figma-warning)] hover:text-[var(--color-figma-warning)] transition-colors"
                  >
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className={`transition-transform shrink-0 ${showPendingDependents ? "rotate-90" : ""}`}
                      aria-hidden="true"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    {dependents.length} dependent token
                    {dependents.length !== 1 ? "s" : ""} reference this token
                    and may break.
                  </button>
                  {showPendingDependents && (
                    <span className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                      {dependents.slice(0, 20).map((dep) =>
                        onShowReferences ? (
                          <button
                            key={dep.path}
                            type="button"
                            onClick={() => {
                              setPendingTypeChange(null);
                              onShowReferences(dep.path);
                            }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded font-mono text-[10px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-warning)]/20 hover:text-[var(--color-figma-warning)] transition-colors text-left w-full"
                            title={`Open ${dep.path} in dependency graph`}
                          >
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="shrink-0 opacity-60"
                            >
                              <circle cx="12" cy="12" r="3" />
                              <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                            </svg>
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                            {dep.collectionId !== ownerCollectionId && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)] ml-auto">
                                {dep.collectionId}
                              </span>
                            )}
                          </button>
                        ) : (
                          <span
                            key={dep.path}
                            className="flex items-center gap-1 px-1 py-0.5 font-mono text-[10px] text-[var(--color-figma-text)]"
                          >
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                            {dep.collectionId !== ownerCollectionId && (
                              <span className="shrink-0 px-1 py-0.5 rounded text-[8px] bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)] ml-auto">
                                {dep.collectionId}
                              </span>
                            )}
                          </span>
                        ),
                      )}
                      {dependents.length > 20 && (
                        <span className="px-1 py-0.5 text-[10px] text-[var(--color-figma-warning)]/70 italic">
                          and {dependents.length - 20} more…
                        </span>
                      )}
                    </span>
                  )}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPendingTypeChange(null);
                  setShowPendingDependents(false);
                }}
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Keep {tokenType}
              </button>
              <button
                type="button"
                onClick={() => applyTypeChange(pendingTypeChange)}
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-warning)] text-white hover:bg-[var(--color-figma-warning)]"
              >
                Switch type
              </button>
            </div>
          </div>
        )}

        {isCreateMode && (
          <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/25 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Token details
                </p>
              </div>
              <div className="w-[112px] shrink-0">
                <label className="mb-1 block text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                  Type
                </label>
                <select
                  value={tokenType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  title="Change token type"
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] font-medium uppercase text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                >
                  {Object.keys(TOKEN_TYPE_BADGE_CLASS).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="relative" ref={pathInputWrapperRef}>
              <label className="mb-1 block text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-[var(--color-figma-text-secondary)]">
              <span>Collection: {ownerCollectionId}</span>
              {trimmedEditLeaf && <span>Leaf: {trimmedEditLeaf}</span>}
            </div>
            {duplicatePath && (
              <p className="text-[10px] text-[var(--color-figma-error)]">
                A token with this path already exists in{" "}
                {pathToCollectionId[trimmedEditPath] || ownerCollectionId}.
              </p>
            )}
            {!editPath.includes(".") && createSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
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
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] ring-1 ring-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {aliasMode ? (
          referenceSection
        ) : (
          <TokenEditorValueSection
            tokenPath={tokenPath}
            tokenType={tokenType}
            value={value}
            setValue={setValue}
            isCreateMode={isCreateMode}
            extendsPath={extendsPath}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            initialValue={initialRef.current?.value ?? null}
            fontFamilyRef={fontFamilyRef}
            fontSizeRef={fontSizeRef}
            availableFonts={availableFonts}
            fontWeightsByFamily={fontWeightsByFamily}
            canSave={canSave}
            saveBlockReason={saveBlockReason}
            focusBlockedField={focusBlockedField}
            pasteFlash={pasteFlash}
            onPaste={handlePaste}
            nearbyMatches={nearbyMatches}
            onAcceptNudge={(path) => {
              preAliasValueRef.current = value;
              setAliasMode(true);
              setReference(`{${path}}`);
              setTimeout(() => refInputRef.current?.focus(), 0);
            }}
            valueEditorContainerRef={valueEditorContainerRef}
          />
        )}

        <ModeValuesEditor
          collectionId={ownerCollectionId}
          collections={collections}
          modeValues={modeValues}
          onModeValuesChange={setModeValues}
          tokenType={tokenType}
          aliasMode={aliasMode}
          reference={reference}
          value={value}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={effectivePathToCollectionId}
          selectedModes={collectionState.selectedModes}
        />

        {!aliasMode && referenceSection}

        {activeProducingGenerator && !isCreateMode && (
          <div className="rounded-md border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[var(--color-figma-text)]">
                  Generated
                </p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Managed by{" "}
                  <span className="font-medium text-[var(--color-figma-text)]">
                    {activeProducingGenerator.name}
                  </span>
                  . Saving here will ask whether to edit the generator, keep a manual exception, or detach this token.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(onOpenGeneratedGroupEditor || onNavigateToGeneratedGroup) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenGeneratedGroupEditor) {
                        openGeneratedGroupEditor({
                          mode: "edit",
                          id: activeProducingGenerator.id,
                        });
                        return;
                      }
                      onNavigateToGeneratedGroup?.(activeProducingGenerator.id);
                    }}
                    className="text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline"
                  >
                    Edit generator
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleDetachGeneratorOwnership();
                  }}
                  disabled={detachingGeneratorOwnership}
                  className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
                >
                  {detachingGeneratorOwnership ? "Detaching…" : "Detach from generator"}
                </button>
              </div>
            </div>
          </div>
        )}

        {dependentsSection}

        <Collapsible
          open={detailsOpen}
          onToggle={toggleDetails}
          label={<span>Details</span>}
        >
          <div className="mt-2 flex flex-col gap-3">
            {tokenType === "color" &&
              (aliasMode
                ? isAlias(reference)
                : typeof value === "string" && value.length > 0) && (
                <ColorModifiersEditor
                  reference={aliasMode ? reference : undefined}
                  colorFlatMap={aliasMode ? colorFlatMap : undefined}
                  directColor={
                    !aliasMode && typeof value === "string" ? value : undefined
                  }
                  colorModifiers={colorModifiers}
                  onColorModifiersChange={setColorModifiers}
                />
              )}

            {tokenType === "color" && (
              <ContrastChecker
                tokenPath={tokenPath}
                value={value}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                colorFlatMap={colorFlatMap}
              />
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="min-h-[48px] w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/50 focus-visible:border-[var(--color-figma-accent)]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Lifecycle
              </label>
              <div className="flex gap-1">
                {(["draft", "published", "deprecated"] as const).map((lc) => (
                  <button
                    key={lc}
                    type="button"
                    onClick={() => setLifecycle(lc)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      lifecycle === lc
                        ? lc === "draft"
                          ? "bg-[var(--color-figma-warning)]/20 text-[var(--color-figma-warning)] ring-1 ring-[var(--color-figma-warning)]/40"
                          : lc === "deprecated"
                            ? "bg-[var(--color-figma-text-tertiary)]/20 text-[var(--color-figma-text-secondary)] ring-1 ring-[var(--color-figma-text-tertiary)]/40"
                            : "bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40"
                        : "bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    }`}
                  >
                    {lc}
                  </button>
                ))}
              </div>
            </div>

            <MetadataEditor
              tokenType={tokenType}
              scopes={scopes}
              onScopesChange={setScopes}
              extensionsJsonText={extensionsJsonText}
              onExtensionsJsonTextChange={setExtensionsJsonText}
              extensionsJsonError={extensionsJsonError}
              onExtensionsJsonErrorChange={setExtensionsJsonError}
              isCreateMode={isCreateMode}
            />

            {canBeGeneratorSource && !aliasMode && (
              <TokenEditorDerivedGroups
                tokenPath={tokenPath}
                tokenName={tokenName}
                tokenType={tokenType}
                value={value}
                existingGeneratorsForToken={existingGeneratorsForToken}
                openGeneratedGroupEditor={openGeneratedGroupEditor}
              />
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Raw JSON
              </label>
              <pre className="max-h-56 overflow-auto rounded-md border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/25 px-2 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                {rawJsonPreview}
              </pre>
              {extensionsJsonError && (
                <p className="text-[10px] text-[var(--color-figma-error)]">
                  Extensions JSON is invalid. The preview excludes that invalid block until it parses.
                </p>
              )}
            </div>

            {!isCreateMode && (
              <TokenEditorInfoSection
                tokenPath={tokenPath}
                collectionId={ownerCollectionId}
                serverUrl={serverUrl}
                tokenType={tokenType}
                value={value}
                scopes={tokenPresentation.scopes}
                lifecycle={tokenPresentation.lifecycle}
                provenance={tokenPresentation.provenance}
                aliasPath={tokenAliasPath}
                extendsPath={tokenPresentation.extendsPath}
                isDirty={isDirty}
                aliasMode={aliasMode}
                referenceTrace={referenceTrace}
                dependentTrace={dependentTrace}
                dependencySnapshot={dependencySnapshot}
                dependents={dependents}
                dependentsLoading={dependentsLoading}
                colorFlatMap={colorFlatMap}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                initialValue={initialRef.current?.value}
                activeProducingGenerator={activeProducingGenerator}
                existingGeneratorsForToken={existingGeneratorsForToken}
                infoTab={infoTab}
                onInfoTabChange={handleInfoTab}
                refsExpanded={refsExpanded}
                onRefsExpandedChange={setRefsExpanded}
                onShowReferences={onShowReferences}
                onNavigateToToken={onNavigateToToken}
                onNavigateToGeneratedGroup={onNavigateToGeneratedGroup}
              />
            )}
          </div>
        </Collapsible>
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
              <h3 className="text-[14px] font-semibold text-[var(--color-figma-text)]">
                This token is generated
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-figma-text-secondary)]">
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
                className="rounded-md bg-[var(--color-figma-accent)] px-3 py-2 text-left text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
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
                className="rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-left text-[11px] font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-50"
              >
                {generatedTokenChoiceBusy === "manual-exception"
                  ? "Saving manual exception…"
                  : "Make manual exception"}
              </button>
              {!canCreateManualException && (
                <p className="px-0.5 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                  Manual exceptions only preserve the generated value. Detach this token if you need to keep description, scope, mode, lifecycle, or extension edits.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  void handleDetachAndSaveGeneratedToken();
                }}
                disabled={generatedTokenChoiceBusy !== null}
                className="rounded-md border border-[var(--color-figma-border)] px-3 py-2 text-left text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
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
                className="text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)] disabled:opacity-50"
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
