import { adaptShortcut, stableStringify } from "../shared/utils";
import { Network, Copy, Rows3, Check, ChevronDown, ChevronRight, Clock, Trash2, Link2, X, Plus } from "lucide-react";
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
import { tokenTypeBadgeClass, ALL_TOKEN_TYPES } from "../../shared/types";
import type { TokenGenerator } from "../hooks/useGenerators";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { AliasAutocomplete } from "./AliasAutocomplete";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { ColorModifiersEditor } from "./ColorModifiersEditor";
import { MetadataEditor } from "./MetadataEditor";
import { ModeValueEditor } from "./token-editor/ModeValueEditor";
import { useTokenEditorModeValue } from "../hooks/useTokenEditorModeValue";
import { PathAutocomplete } from "./PathAutocomplete";
import { Collapsible } from "./Collapsible";

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

import { detectAliasCycle, parsePastedValue, getInitialCreateValue, NAMESPACE_SUGGESTIONS, buildTypographyPreviewStyle, getTypographyPreviewValue } from "./token-editor/tokenEditorHelpers";
import { valueFormatHint } from "./tokenListHelpers";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import { TokenEditorDerivedGroups } from "./token-editor/TokenEditorDerivedGroups";
import { TokenEditorLintBanner } from "./token-editor/TokenEditorLintBanner";
import type { LintViolation } from "../hooks/useLint";

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
  onNavigateToToken?: (path: string, fromPath?: string) => void;
  onNavigateToGeneratedGroup?: (generatorId: string) => void;
  onOpenGeneratedGroupEditor?: (target: TokensLibraryGeneratedGroupEditorTarget) => void;
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
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
  onNavigateToToken,
  onNavigateToGeneratedGroup,
  onOpenGeneratedGroupEditor,
  pushUndo,
  lintViolations = [],
  syncSnapshot,
}: TokenEditorProps) {
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
    modeValues,
    setModeValues,
    setScopes,
    setExtendsPath,
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

  const [perModeAlias, setPerModeAlias] = useState<Set<string>>(new Set());
  const [perModeAliasQuery, setPerModeAliasQuery] = useState<Record<string, string>>({});
  const [perModeAutocompleteOpen, setPerModeAutocompleteOpen] = useState<Set<string>>(new Set());
  const previousLiteralModeValuesRef = useRef<Record<string, unknown>>({});

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
  const [devMetadataOpen, setDevMetadataOpen] = useState(false);
  const [rawJsonOpen, setRawJsonOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    const aliasSet = new Set<string>();
    const queries: Record<string, string> = {};
    for (const mode of modeValue.modes) {
      if (typeof mode.value === "string" && isAlias(mode.value)) {
        aliasSet.add(mode.name);
        queries[mode.name] = extractAliasPath(mode.value) ?? "";
      } else {
        previousLiteralModeValuesRef.current[mode.name] = mode.value;
      }
    }
    setPerModeAlias(aliasSet);
    setPerModeAliasQuery(queries);
    setPerModeAutocompleteOpen(new Set());
  }, [loading, modeValue.modes]);

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
            {isDirty && (
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
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="truncate text-secondary text-[var(--color-figma-text-secondary)]">
              in {ownerCollectionId}
            </span>
            <span className="relative inline-flex items-center shrink-0">
              <select
                value={tokenType}
                onChange={(e) => handleTypeChange(e.target.value)}
                title="Change token type"
                className={`pr-4 pl-1.5 py-0.5 rounded text-secondary font-medium uppercase cursor-pointer border-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] appearance-none ${tokenTypeBadgeClass(tokenType)}`}
                style={{ backgroundImage: "none" }}
              >
                {ALL_TOKEN_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown size={8} strokeWidth={2} className="pointer-events-none absolute right-1 opacity-60" aria-hidden />
            </span>
          </div>
        </div>
      )}
    </>
  );

  const headerActions = (
    <>
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
            <Check size={12} strokeWidth={2} aria-hidden />
          ) : (
            <Copy size={12} strokeWidth={2} aria-hidden />
          )}
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
      {pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-body">
          <Clock size={11} strokeWidth={2} className="shrink-0 text-[var(--color-figma-warning)]" aria-hidden />
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
              className="shrink-0 text-secondary font-medium text-[var(--color-figma-accent)] hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
              <Trash2 size={12} strokeWidth={2} aria-hidden />
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
          <Link2 size={10} strokeWidth={2} className="shrink-0 text-[var(--color-figma-accent)]" aria-hidden />
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
            aria-label="Remove base token"
            className="shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-error)]/10 hover:text-[var(--color-figma-error)]"
          >
            <X size={8} strokeWidth={2} aria-hidden />
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
            className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-secondary break-words max-h-16 overflow-auto flex items-start gap-2"
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

        <TokenEditorLintBanner lintViolations={tokenLintViolations} />

        {/* Type-change confirmation — shown when a type switch would reset a non-default value */}
        {pendingTypeChange && (
          <div className="px-2 py-2 rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 text-secondary">
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
                    <ChevronRight
                      size={8}
                      strokeWidth={2}
                      className={`shrink-0 transition-transform ${showPendingDependents ? "rotate-90" : ""}`}
                      aria-hidden
                    />
                    {dependents.length} dependent token
                    {dependents.length !== 1 ? "s" : ""} reference this token
                    and may break.
                  </button>
                  {showPendingDependents && (
                    <span className="mt-1 flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                      {dependents.slice(0, 20).map((dep) =>
                        onNavigateToToken ? (
                          <button
                            key={dep.path}
                            type="button"
                            onClick={() => {
                              setPendingTypeChange(null);
                              onNavigateToToken(dep.path, tokenPath);
                            }}
                            className="flex items-center gap-1 px-1 py-0.5 rounded font-mono text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-warning)]/20 hover:text-[var(--color-figma-warning)] transition-colors text-left w-full"
                            title={`Open ${dep.path}`}
                          >
                            <Network size={8} strokeWidth={2} className="shrink-0 opacity-60" aria-hidden />
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
                            className="flex items-center gap-1 px-1 py-0.5 font-mono text-secondary text-[var(--color-figma-text)]"
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
                        <span className="px-1 py-0.5 text-secondary text-[var(--color-figma-warning)]/70 italic">
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
                <p className="text-secondary font-medium text-[var(--color-figma-text)]">
                  Token details
                </p>
              </div>
              <div className="w-[112px] shrink-0">
                <label className="mb-1 block text-secondary font-medium text-[var(--color-figma-text-secondary)]">
                  Type
                </label>
                <select
                  value={tokenType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  title="Change token type"
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary font-medium uppercase text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                >
                  {ALL_TOKEN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-secondary text-[var(--color-figma-text-secondary)]">
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
              <div className="flex flex-wrap items-center gap-1">
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
                    className="rounded px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] ring-1 ring-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    {prefix}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2" ref={valueEditorContainerRef} onPaste={handlePaste}>
          <div
            className="divide-y divide-[var(--color-figma-border)]/50 rounded-md border border-[var(--color-figma-border)]/65"
            title={modeValue.modes.length >= 2 ? (valueFormatHint(tokenType) || undefined) : undefined}
          >
            {modeValue.modes.map((mode, modeIdx) => {
              const modeVal = mode.value === "" ? undefined : mode.value;
              const baseVal = extendsPath ? allTokensFlat[extendsPath]?.$value : undefined;
              const initialModeVal = modeIdx === 0
                ? initialFieldsSnapshot?.value
                : initialFieldsSnapshot?.modeValues[ownerCollectionId]?.[mode.name];
              const isModeModified = initialModeVal !== undefined
                && stableStringify(modeVal ?? "") !== stableStringify(initialModeVal ?? "");
              const modeColorSwatch = tokenType === "color" && typeof modeVal === "string"
                ? (isAlias(modeVal)
                    ? resolveRefValue(extractAliasPath(modeVal) ?? "", colorFlatMap) ?? null
                    : modeVal)
                : null;
              const modeTypoPreview = tokenType === "typography"
                ? getTypographyPreviewValue(modeVal ?? "")
                : null;
              const isModeEmpty = modeVal === undefined || modeVal === null || modeVal === "";
              const isModeInAliasMode = perModeAlias.has(mode.name) || (typeof modeVal === "string" && isAlias(modeVal));
              const showModeLabel = modeValue.modes.length >= 2;

              return (
                <div
                  key={mode.name}
                  data-token-editor-mode={mode.name}
                  data-token-editor-alias={isModeInAliasMode ? "1" : "0"}
                  className={`group/mode flex flex-col${isModeEmpty ? " bg-[var(--color-figma-warning,#f59e0b)]/5" : ""}`}
                >
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <div className={`${showModeLabel ? "w-[92px]" : ""} shrink-0 flex items-center gap-1`}>
                      {isModeModified && !isCreateMode && (
                        <span
                          className="shrink-0 w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)]"
                          title="Modified"
                          aria-label="Modified"
                        />
                      )}
                      {showModeLabel && (
                        <span
                          className="truncate text-body font-medium text-[var(--color-figma-text)]"
                          title={mode.name}
                        >
                          {mode.name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setPerModeAlias((prev) => {
                            const next = new Set(prev);
                            if (next.has(mode.name)) {
                              next.delete(mode.name);
                              if (typeof modeVal === "string" && isAlias(modeVal)) {
                                const resolvedValue = resolveSyncComparableValue({
                                  tokenPath,
                                  allTokensFlat,
                                  currentValue: modeVal,
                                  currentType: tokenType,
                                });
                                mode.setValue(
                                  resolvedValue ??
                                    previousLiteralModeValuesRef.current[mode.name] ??
                                    "",
                                );
                              }
                            } else {
                              previousLiteralModeValuesRef.current[mode.name] = modeVal;
                              next.add(mode.name);
                              setPerModeAliasQuery((prev) => ({
                                ...prev,
                                [mode.name]: typeof modeVal === "string" && isAlias(modeVal)
                                  ? (extractAliasPath(modeVal) ?? "")
                                  : "",
                              }));
                              setPerModeAutocompleteOpen((prev) => {
                                const next = new Set(prev);
                                next.add(mode.name);
                                return next;
                              });
                            }
                            return next;
                          });
                        }}
                        className={`shrink-0 rounded p-0.5 transition-all ${isModeInAliasMode ? "text-[var(--color-figma-accent)]" : "opacity-30 group-hover/mode:opacity-100 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"} hover:bg-[var(--color-figma-bg-hover)]`}
                        title={isModeInAliasMode ? "Switch to direct value" : "Switch to reference"}
                        aria-label={isModeInAliasMode ? "Switch to direct value" : "Switch to reference"}
                      >
                        <Link2 size={10} strokeWidth={2} aria-hidden />
                      </button>
                      {modeValue.modes.length > 1 && !isModeInAliasMode && (
                        <button
                          type="button"
                          onClick={() => {
                            const sourceIdx = modeIdx === 0 ? modeValue.modes.length - 1 : modeIdx - 1;
                            const sourceValue = modeValue.modes[sourceIdx].value;
                            if (sourceValue !== "" && sourceValue != null) {
                              mode.setValue(
                                typeof sourceValue === "object"
                                  ? JSON.parse(JSON.stringify(sourceValue))
                                  : sourceValue
                              );
                            }
                          }}
                          className="opacity-60 group-hover/mode:opacity-100 shrink-0 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-all"
                          title={`Copy from ${modeValue.modes[modeIdx === 0 ? modeValue.modes.length - 1 : modeIdx - 1].name}`}
                          aria-label={`Copy from ${modeValue.modes[modeIdx === 0 ? modeValue.modes.length - 1 : modeIdx - 1].name}`}
                        >
                          <Copy size={10} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                      {modeValue.modes.length > 1 && !isModeInAliasMode && modeVal !== "" && modeVal != null && (
                        <button
                          type="button"
                          onClick={() => {
                            const sourceValue = mode.value;
                            if (sourceValue === "" || sourceValue == null) return;
                            modeValue.modes.forEach((destMode, destIdx) => {
                              if (destIdx === modeIdx) return;
                              destMode.setValue(
                                typeof sourceValue === "object"
                                  ? JSON.parse(JSON.stringify(sourceValue))
                                  : sourceValue
                              );
                            });
                          }}
                          className="opacity-60 group-hover/mode:opacity-100 shrink-0 rounded p-0.5 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-all"
                          title="Copy to all other modes"
                          aria-label="Copy to all other modes"
                        >
                          <Rows3 size={10} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {isModeInAliasMode ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={perModeAliasQuery[mode.name] ?? (typeof modeVal === "string" && isAlias(modeVal) ? (extractAliasPath(modeVal) ?? "") : "")}
                            onChange={(e) => {
                              const q = e.target.value;
                              setPerModeAliasQuery((prev) => ({ ...prev, [mode.name]: q }));
                              setPerModeAutocompleteOpen((prev) => {
                                const next = new Set(prev);
                                next.add(mode.name);
                                return next;
                              });
                            }}
                            onFocus={() => {
                              setPerModeAutocompleteOpen((prev) => {
                                const next = new Set(prev);
                                next.add(mode.name);
                                return next;
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setPerModeAutocompleteOpen((prev) => {
                                  const next = new Set(prev);
                                  next.delete(mode.name);
                                  return next;
                                });
                              }
                            }}
                            autoFocus={modeIdx === 0 && !isCreateMode}
                            placeholder="Search tokens…"
                            className="w-full font-mono border border-[var(--color-figma-border)] rounded px-2 py-0.5 text-body bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
                          />
                          {perModeAutocompleteOpen.has(mode.name) && (
                            <AliasAutocomplete
                              query={perModeAliasQuery[mode.name] ?? ""}
                              allTokensFlat={allTokensFlat}
                              pathToCollectionId={pathToCollectionId}
                              filterType={tokenType}
                              onSelect={(path) => {
                                mode.setValue(`{${path}}`);
                                setPerModeAliasQuery((prev) => ({ ...prev, [mode.name]: path }));
                                setPerModeAutocompleteOpen((prev) => {
                                  const next = new Set(prev);
                                  next.delete(mode.name);
                                  return next;
                                });
                              }}
                              onClose={() => {
                                setPerModeAutocompleteOpen((prev) => {
                                  const next = new Set(prev);
                                  next.delete(mode.name);
                                  return next;
                                });
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        <ModeValueEditor
                          tokenType={tokenType}
                          value={modeVal}
                          onChange={mode.setValue}
                          allTokensFlat={allTokensFlat}
                          pathToCollectionId={pathToCollectionId}
                          autoFocus={modeIdx === 0 && !isCreateMode}
                          baseValue={baseVal}
                          availableFonts={availableFonts}
                          fontWeightsByFamily={fontWeightsByFamily}
                          fontFamilyRef={modeIdx === 0 ? fontFamilyRef : undefined}
                          fontSizeRef={modeIdx === 0 ? fontSizeRef : undefined}
                        />
                      )}
                    </div>
                    {modeColorSwatch && (
                      <div
                        className="shrink-0 w-4 h-4 rounded-sm border border-[var(--color-figma-border)]"
                        style={{ backgroundColor: modeColorSwatch }}
                        aria-label={`Color: ${modeColorSwatch}`}
                      />
                    )}
                  </div>
                  {modeTypoPreview && (
                    <div className="px-2.5 pb-1.5">
                      <span
                        className="block truncate text-body text-[var(--color-figma-text-secondary)] leading-normal"
                        style={buildTypographyPreviewStyle(modeTypoPreview)}
                      >
                        Aa Bb Cc
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {addingEditorMode ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5">
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
                  className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-0.5 text-body text-[var(--color-figma-text)] outline-none"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingEditorMode(true)}
                className="flex w-full items-center gap-1 px-2.5 py-1.5 text-secondary text-[var(--color-figma-text-tertiary)] transition-colors hover:text-[var(--color-figma-text-secondary)]"
              >
                <Plus size={10} strokeWidth={2} aria-hidden />
                Add mode
              </button>
            )}
          </div>
        </div>

        {tokenType === "color" &&
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
        {tokenType === "color" && !isCreateMode && (
          <ContrastChecker
            tokenPath={tokenPath}
            value={value}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            colorFlatMap={colorFlatMap}
          />
        )}

        {canBeGeneratorSource && !valueIsAlias && (
          <TokenEditorDerivedGroups
            tokenPath={tokenPath}
            tokenName={tokenName}
            tokenType={tokenType}
            value={value}
            existingGeneratorsForToken={existingGeneratorsForToken}
            openGeneratedGroupEditor={openGeneratedGroupEditor}
          />
        )}

        {activeProducingGenerator && !isCreateMode && (
          <div className="rounded-md border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/10 px-3 py-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-secondary font-medium text-[var(--color-figma-text)]">
                  Generated
                </p>
                <p className="text-secondary text-[var(--color-figma-text-secondary)]">
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
                    className="text-secondary font-medium text-[var(--color-figma-accent)] hover:underline"
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
                  className="text-secondary font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
                >
                  {detachingGeneratorOwnership ? "Detaching…" : "Detach from generator"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
            Description
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="min-h-[48px] w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)]/50 focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>

        {lifecycle !== "published" ? (
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                lifecycle === "draft"
                  ? "bg-[var(--color-figma-warning)]"
                  : "bg-[var(--color-figma-text-tertiary)]"
              }`}
              aria-hidden
            />
            <select
              value={lifecycle}
              onChange={(e) => setLifecycle(e.target.value as typeof lifecycle)}
              className="text-secondary text-[var(--color-figma-text-secondary)] bg-transparent border-0 outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-figma-accent)] rounded px-1 py-0.5 cursor-pointer"
              aria-label="Lifecycle"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="deprecated">Deprecated</option>
            </select>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLifecycle("draft")}
            className="self-start text-secondary text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] transition-colors"
            title="Change lifecycle status"
          >
            Mark as draft or deprecated
          </button>
        )}

        <Collapsible
          open={detailsOpen}
          onToggle={toggleDetails}
          label="Advanced"
        >
          <div className="mt-2 flex flex-col gap-3 pl-3">
            <Collapsible
              open={devMetadataOpen}
              onToggle={() => setDevMetadataOpen((v) => !v)}
              label="Developer metadata"
            >
              <div className="mt-2 pl-3">
                <MetadataEditor
                  tokenType={tokenType}
                  scopes={scopes}
                  onScopesChange={setScopes}
                  extensionsJsonText={extensionsJsonText}
                  onExtensionsJsonTextChange={setExtensionsJsonText}
                  extensionsJsonError={extensionsJsonError}
                  onExtensionsJsonErrorChange={setExtensionsJsonError}
                />
              </div>
            </Collapsible>

            {extendsSection}

            <Collapsible
              open={rawJsonOpen}
              onToggle={() => setRawJsonOpen((v) => !v)}
              label="Raw JSON"
            >
              <div className="mt-2 pl-3">
                <pre className="max-h-56 overflow-auto rounded-md border border-[var(--color-figma-border)]/70 bg-[var(--color-figma-bg-secondary)]/25 px-2 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
                  {rawJsonPreview}
                </pre>
                {extensionsJsonError && (
                  <p className="mt-1 text-secondary text-[var(--color-figma-error)]">
                    Extensions JSON is invalid. The preview excludes that invalid block until it parses.
                  </p>
                )}
              </div>
            </Collapsible>
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
