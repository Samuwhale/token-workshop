import { adaptShortcut, getErrorMessage, stableStringify } from "../shared/utils";
import { Copy, Check, Clock, Files, Trash2, Link2, X, Plus } from "lucide-react";
import { SHORTCUT_KEYS } from "../shared/shortcutRegistry";
import { Spinner } from "./Spinner";
import { AUTHORING_SURFACE_CLASSES, EditorShell } from "./EditorShell";
import { AUTHORING } from "../shared/editorClasses";
import { apiFetch } from "../shared/apiFetch";
import { buildTokenEditorValueBody } from "../shared/tokenEditorPayload";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  getCollectionIdsForPath,
  pathExistsInCollection,
  readGraphProvenance,
  resolveCollectionIdForPath,
  resolveRefValue,
} from "@tokenmanager/core";
import type { TokenCollection, TokenType } from "@tokenmanager/core";
import type { EditorSessionRegistration } from "../contexts/WorkspaceControllerContext";
import { ConfirmModal } from "./ConfirmModal";
import type { TokenMapEntry } from "../../shared/types";
import { tokenTypeBadgeClass } from "../../shared/types";
import { TypePicker } from "./TypePicker";
import { COMPOSITE_TOKEN_TYPES } from "@tokenmanager/core";
import { isAlias, extractAliasPath } from "../../shared/resolveAlias";
import { ContrastChecker } from "./ContrastChecker";
import { DerivationEditor, summarizeDerivationOp } from "./DerivationEditor";
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
import { useTokenAncestors } from "../hooks/useTokenAncestors";
import { formatTokenValueForDisplay } from "../shared/tokenFormatting";
import { useTokenTypeParsing } from "../hooks/useTokenTypeParsing";
import { useTokenEditorUIState } from "../hooks/useTokenEditorUIState";
import { useTokenEditorSave } from "../hooks/useTokenEditorSave";
import {
  clearEditorDraft,
  saveEditorDraft,
  formatDraftAge,
} from "../hooks/useTokenEditorUtils";
import { STORAGE_KEYS, lsGet, lsSet } from "../shared/storage";
import { dispatchToast } from "../shared/toastBus";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";
import { normalizeTokenType } from "../shared/tokenTypeCategories";
import {
  hasSyncSnapshotChange,
  resolveSyncComparableValue,
} from "../shared/tokenSync";

import { detectAliasCycle, parsePastedValue, getInitialCreateValue, NAMESPACE_SUGGESTIONS } from "./token-editor/tokenEditorHelpers";
import { valueFormatHint } from "./tokenListHelpers";
import { ExtendsTokenPicker } from "./token-editor/ExtendsTokenPicker";
import type { LintViolation } from "../hooks/useLint";
import { TokenDetailsAdvancedSection } from "./token-details/TokenDetailsAdvancedSection";
import { TokenDetailsModeRow } from "./token-details/TokenDetailsModeRow";
import { TokenDetailsStatusBanners } from "./token-details/TokenDetailsStatusBanners";
import { Field, ListItem, Section, Stack, Surface } from "../primitives";
interface TokenDetailsProps {
  tokenPath: string;
  currentCollectionId: string;
  collectionId?: string;
  serverUrl: string;
  mode?: "inspect" | "edit";
  onBack: () => void;
  backLabel?: string;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collectionIdsByPath?: Record<string, string[]>;
  perCollectionFlat?: Record<string, Record<string, TokenMapEntry>>;
  isCreateMode?: boolean;
  initialType?: string;
  /** When alias-shaped (e.g. "{color.primary}"), alias mode activates automatically. */
  initialValue?: string;
  editorSessionHost: {
    registerSession: (session: EditorSessionRegistration | null) => void;
    requestClose: () => void;
  };
  onSaved?: (savedPath: string) => void;
  onRenamed?: (newPath: string) => void;
  collections?: TokenCollection[];
  onRefresh?: () => void;
  onSaveAndCreateAnother?: (savedPath: string, tokenType: string) => void;
  availableFonts?: string[];
  fontWeightsByFamily?: Record<string, number[]>;
  onNavigateToToken?: (
    path: string,
    collectionId?: string,
  ) => void;
  onOpenGraphDocument?: (graphId: string) => void;
  pushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  onEnterEditMode?: () => void;
  onDuplicate?: () => void;
  onOpenInHealth?: () => void;
  onManageCollectionModes?: (collectionId: string) => void;
  requiresWorkingCollectionForEdit?: boolean;
  onMakeWorkingCollection?: () => void;
}

function cloneModeValue<T>(value: T): T {
  return typeof value === "object" && value !== null
    ? structuredClone(value)
    : value;
}

function getAncestorRowStatusLabel(
  status: "missing" | "ambiguous" | "cycle" | undefined,
): string | null {
  if (!status) return null;
  if (status === "ambiguous") return "ambiguous";
  return status;
}

function getAncestorTerminalNote(
  terminalKind: "literal" | "missing" | "ambiguous" | "cycle" | "depth",
): string | null {
  if (terminalKind === "depth") {
    return "Chain truncated after too many hops.";
  }
  return null;
}

function formatCollectionIdList(collectionIds: string[]): string {
  if (collectionIds.length === 0) {
    return "";
  }
  if (collectionIds.length === 1) {
    return collectionIds[0];
  }
  if (collectionIds.length === 2) {
    return `${collectionIds[0]} and ${collectionIds[1]}`;
  }
  return `${collectionIds.slice(0, -1).join(", ")}, and ${collectionIds.at(-1)}`;
}


export function TokenDetails({
  tokenPath,
  currentCollectionId,
  collectionId: explicitCollectionId,
  serverUrl,
  mode = "edit",
  onBack,
  backLabel,
  allTokensFlat = {},
  pathToCollectionId = {},
  collectionIdsByPath = {},
  perCollectionFlat = {},
  isCreateMode = false,
  initialType,
  initialValue,
  editorSessionHost,
  onSaved,
  onRenamed,
  onSaveAndCreateAnother,
  collections = [],
  onRefresh,
  availableFonts = [],
  fontWeightsByFamily = {},
  onNavigateToToken,
  onOpenGraphDocument,
  pushUndo,
  lintViolations = [],
  syncSnapshot,
  onEnterEditMode,
  onDuplicate,
  onOpenInHealth,
  onManageCollectionModes,
  requiresWorkingCollectionForEdit = false,
  onMakeWorkingCollection,
}: TokenDetailsProps) {
  const ownerCollectionId = useMemo(
    () =>
      explicitCollectionId ??
      (isCreateMode
        ? currentCollectionId
        : resolveCollectionIdForPath({
            path: tokenPath,
            pathToCollectionId,
            collectionIdsByPath,
            preferredCollectionId: currentCollectionId,
          }).collectionId ?? currentCollectionId),
    [
      collectionIdsByPath,
      explicitCollectionId,
      isCreateMode,
      currentCollectionId,
      pathToCollectionId,
      tokenPath,
    ],
  );
  const detailsMode = isCreateMode ? "edit" : mode;
  const isInspectMode = detailsMode === "inspect";
  const isEditMode = !isInspectMode;
  const showingExternalCollection = ownerCollectionId !== currentCollectionId;
  const canEditInPlace =
    !showingExternalCollection || !requiresWorkingCollectionForEdit;
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
    derivationOps,
    setDerivationOps,
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

  const [renameInput, setRenameInput] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameConfirm, setRenameConfirm] = useState<
    { newPath: string; aliasCount: number } | null
  >(null);

  // Keep rename input in sync with the incoming token path so the field reflects
  // the current name whenever the editor loads or switches tokens.
  useEffect(() => {
    const lastDot = tokenPath.lastIndexOf(".");
    setRenameInput(lastDot >= 0 ? tokenPath.slice(lastDot + 1) : tokenPath);
    setRenameError(null);
  }, [tokenPath]);

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
    setDerivationOps,
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

  const { dependents } = useTokenDependents({
    serverUrl,
    collectionId: ownerCollectionId,
    tokenPath,
    isCreateMode,
  });
  const ancestors = useTokenAncestors({
    tokenPath,
    collectionId: ownerCollectionId,
    collections,
    perCollectionFlat,
    pathToCollectionId,
    collectionIdsByPath,
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
  const currentTokenEntry = useMemo(
    () => perCollectionFlat[ownerCollectionId]?.[tokenPath] ?? allTokensFlat[tokenPath],
    [allTokensFlat, ownerCollectionId, perCollectionFlat, tokenPath],
  );
  const graphProvenance = useMemo(
    () => readGraphProvenance(currentTokenEntry),
    [currentTokenEntry],
  );
  const [detachedFromGraph, setDetachedFromGraph] = useState(false);
  const activeGraphProvenance = detachedFromGraph ? null : graphProvenance;
  const [graphName, setGraphName] = useState<string | null>(null);
  const [detachingGraphOutput, setDetachingGraphOutput] = useState(false);

  const initialFieldsSnapshot = initialRef.current;

  const requestClose = editorSessionHost.requestClose;
  const beforeSaveGeneratedToken = useCallback(
    async () => {
      if (!isCreateMode && activeGraphProvenance) {
        setError("This token is managed by a graph. Open the graph to change generated values, or detach the token before editing it directly.");
        return false;
      }
      return true;
    },
    [activeGraphProvenance, isCreateMode],
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
    derivationOps,
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
      derivationOps: [],
      modeValues: initModeValues,
      extensionsJsonText: '',
      lifecycle: 'published',
      extendsPath: '',
    };
    setTokenType(resolvedType);
    setValue(initialCreateValue);
    setDescription('');
    setScopes([]);
    setDerivationOps([]);
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
    setDerivationOps,
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

  useEffect(() => {
    setDetachedFromGraph(false);
    setGraphName(null);
  }, [tokenPath, graphProvenance?.graphId]);

  useEffect(() => {
    if (!activeGraphProvenance?.graphId) return;
    let cancelled = false;
    apiFetch<{ graph?: { name?: string } }>(
      `${serverUrl}/api/graphs/${encodeURIComponent(activeGraphProvenance.graphId)}`,
    )
      .then((response) => {
        if (!cancelled) {
          setGraphName(response.graph?.name ?? activeGraphProvenance.graphId);
        }
      })
      .catch(() => {
        if (!cancelled) setGraphName(activeGraphProvenance.graphId);
      });
    return () => {
      cancelled = true;
    };
  }, [activeGraphProvenance?.graphId, serverUrl]);

  const handleDetachGraphOutput = useCallback(async (): Promise<void> => {
    if (!activeGraphProvenance) return;
    setDetachingGraphOutput(true);
    try {
      setError(null);
      await apiFetch(
        `${serverUrl}/api/graphs/${encodeURIComponent(activeGraphProvenance.graphId)}/outputs/detach`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            collectionId: ownerCollectionId,
            path: tokenPath,
          }),
        },
      );
      setDetachedFromGraph(true);
      onRefresh?.();
      dispatchToast(`Detached "${tokenPath}" from graph`, "success", {
        destination: {
          kind: "token",
          tokenPath,
          collectionId: ownerCollectionId,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detach token from graph");
    } finally {
      setDetachingGraphOutput(false);
    }
  }, [activeGraphProvenance, onRefresh, ownerCollectionId, serverUrl, tokenPath]);

  const duplicatePath = useMemo(() => {
    if (!isCreateMode) return false;
    const trimmed = editPath.trim();
    if (!trimmed) return false;
    return pathExistsInCollection({
      path: trimmed,
      collectionId: ownerCollectionId,
      pathToCollectionId,
      collectionIdsByPath,
    });
  }, [
    collectionIdsByPath,
    editPath,
    isCreateMode,
    ownerCollectionId,
    pathToCollectionId,
  ]);

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
      derivationOps,
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
    derivationOps,
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
    setDerivationOps(init.derivationOps);
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
    setDerivationOps(draft.derivationOps);
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
    const editorCollection =
      collections.find((collection) => collection.id === ownerCollectionId) ?? null;
    return JSON.stringify(
      buildTokenEditorValueBody({
        tokenType,
        value,
        description,
        scopes,
        derivationOps,
        modeValues,
        collection: editorCollection,
        passthroughTokenManager: passthroughTokenManagerRef.current,
        lifecycle,
        extendsPath,
        extensionsJsonText,
        clearEmptyDescription: !isCreateMode,
        clearEmptyExtensions: !isCreateMode,
        ignoreInvalidExtensionsJson: true,
      }),
      null,
      2,
    );
  }, [
    derivationOps,
    description,
    extensionsJsonText,
    extendsPath,
    lifecycle,
    modeValues,
    scopes,
    tokenType,
    value,
    collections,
    isCreateMode,
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

  const lastDotIdx = tokenPath.lastIndexOf(".");
  const parentPrefix = lastDotIdx >= 0 ? tokenPath.slice(0, lastDotIdx) : "";
  const leafName = lastDotIdx >= 0 ? tokenPath.slice(lastDotIdx + 1) : tokenPath;
  const canRenameInPlace =
    !isCreateMode && isEditMode && canEditInPlace;
  const renameInputDiffers = renameInput !== leafName;
  const renameDisabled = !canRenameInPlace || isDirty || saving || renameSaving;

  const revertRename = useCallback(() => {
    setRenameInput(leafName);
    setRenameError(null);
  }, [leafName]);

  const performRename = useCallback(
    async (newPath: string, updateAliases: boolean) => {
      setRenameSaving(true);
      setRenameError(null);
      try {
        await apiFetch(
          `${serverUrl}/api/tokens/${encodeURIComponent(ownerCollectionId)}/tokens/rename`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldPath: tokenPath,
              newPath,
              updateAliases,
            }),
          },
        );
        if (pushUndo) {
          const capturedCollection = ownerCollectionId;
          const capturedUrl = serverUrl;
          const capturedOld = tokenPath;
          const capturedNew = newPath;
          pushUndo({
            description: `Rename "${leafName}"`,
            groupKey: `rename-${capturedCollection}`,
            groupSummary: (n) => `Rename ${n} tokens`,
            restore: async () => {
              try {
                await apiFetch(
                  `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollection)}/tokens/rename`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      oldPath: capturedNew,
                      newPath: capturedOld,
                    }),
                  },
                );
                onRefresh?.();
              } catch (err) {
                console.warn("[TokenDetails] undo rename failed:", err);
              }
            },
            redo: async () => {
              try {
                await apiFetch(
                  `${capturedUrl}/api/tokens/${encodeURIComponent(capturedCollection)}/tokens/rename`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      oldPath: capturedOld,
                      newPath: capturedNew,
                    }),
                  },
                );
                onRefresh?.();
              } catch (err) {
                console.warn("[TokenDetails] redo rename failed:", err);
              }
            },
          });
        }
        setRenameConfirm(null);
        dispatchToast(`Renamed to "${newPath}"`, "success");
        onRefresh?.();
        onRenamed?.(newPath);
      } catch (err) {
        setRenameError(getErrorMessage(err, "Rename failed"));
      } finally {
        setRenameSaving(false);
      }
    },
    [
      serverUrl,
      ownerCollectionId,
      tokenPath,
      leafName,
      pushUndo,
      onRefresh,
      onRenamed,
    ],
  );

  const submitRename = useCallback(async () => {
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty");
      return;
    }
    if (trimmed.includes(".")) {
      setRenameError("Name cannot contain dots");
      return;
    }
    if (trimmed === leafName) {
      setRenameError(null);
      return;
    }
    const newPath = parentPrefix ? `${parentPrefix}.${trimmed}` : trimmed;
    if (allTokensFlat[newPath]) {
      setRenameError(`A token named "${trimmed}" already exists here`);
      return;
    }
    setRenameSaving(true);
    setRenameError(null);
    try {
      const preview = await apiFetch<{ count: number }>(
        `${serverUrl}/api/tokens/${encodeURIComponent(ownerCollectionId)}/tokens/rename-preview?oldPath=${encodeURIComponent(tokenPath)}&newPath=${encodeURIComponent(newPath)}`,
      );
      if (preview.count > 0) {
        setRenameConfirm({ newPath, aliasCount: preview.count });
        setRenameSaving(false);
        return;
      }
      await performRename(newPath, true);
    } catch (err) {
      setRenameError(getErrorMessage(err, "Rename failed"));
      setRenameSaving(false);
    }
  }, [
    renameInput,
    leafName,
    parentPrefix,
    allTokensFlat,
    serverUrl,
    ownerCollectionId,
    tokenPath,
    performRename,
  ]);

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
  const conflictingOtherCollectionIds =
    isCreateMode && trimmedEditPath
      ? getCollectionIdsForPath({
          path: trimmedEditPath,
          pathToCollectionId,
          collectionIdsByPath,
        }).filter((collectionId) => collectionId !== ownerCollectionId)
      : [];
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
            {`Create in ${ownerCollectionId}`}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-start gap-1.5 min-w-0">
            {canRenameInPlace ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {parentPrefix && (
                  <span
                    className={LONG_TEXT_CLASSES.pathSecondary}
                    title={parentPrefix}
                  >
                    {parentPrefix}.
                  </span>
                )}
                <div className="flex min-w-0 items-center gap-0.5">
                  <input
                    type="text"
                    value={renameInput}
                    disabled={renameDisabled}
                    onChange={(e) => {
                      setRenameInput(e.target.value);
                      setRenameError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitRename();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        revertRename();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    title={
                      isDirty
                        ? "Save or discard your changes before renaming"
                        : undefined
                    }
                    className={`min-w-0 flex-1 font-mono text-body bg-transparent text-[var(--color-figma-text)] px-1 py-0.5 rounded border outline-none disabled:opacity-60 ${
                      renameError
                        ? "border-[var(--color-figma-error)]"
                        : renameInputDiffers
                          ? "border-[var(--color-figma-accent)]"
                          : "border-transparent hover:border-[var(--color-figma-border)] focus-visible:border-[var(--color-figma-accent)]"
                    }`}
                    aria-label="Token name"
                  />
                  {renameInputDiffers && (
                    <>
                      <button
                        type="button"
                        onClick={() => void submitRename()}
                        disabled={renameDisabled}
                        title="Save name (Enter)"
                        aria-label="Save name"
                        className="shrink-0 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-50"
                      >
                        <Check size={12} strokeWidth={1.5} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={revertRename}
                        disabled={renameSaving}
                        title="Revert name (Escape)"
                        aria-label="Revert name"
                        className="shrink-0 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] disabled:opacity-50"
                      >
                        <X size={12} strokeWidth={1.5} aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <span
                className="min-w-0 flex-1 truncate font-mono text-body text-[var(--color-figma-text)]"
                title={tokenPath}
              >
                {tokenPath}
              </span>
            )}
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
          {renameError && (
            <div className="min-w-0">
              <span className="text-secondary text-[var(--color-figma-error)]">
                {renameError}
              </span>
            </div>
          )}
          <div className="min-w-0">
            <span className="truncate text-secondary text-[var(--color-figma-text-secondary)]">
              {showingExternalCollection
                ? `Collection: ${ownerCollectionId} · Working in ${currentCollectionId}`
                : `Collection: ${ownerCollectionId}`}
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
          title="Duplicate token"
          aria-label="Duplicate token"
          className="shrink-0 p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
        >
          <Files size={12} strokeWidth={1.5} aria-hidden />
        </button>
      )}
      {!isCreateMode && isInspectMode && onEnterEditMode && canEditInPlace && (
        <button
          type="button"
          onClick={onEnterEditMode}
          className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
        >
          Edit
        </button>
      )}
      {!isCreateMode &&
        isInspectMode &&
        showingExternalCollection &&
        requiresWorkingCollectionForEdit &&
        onMakeWorkingCollection && (
          <button
            type="button"
            onClick={onMakeWorkingCollection}
            className="px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-body font-medium hover:bg-[var(--color-figma-accent-hover)]"
          >
            Make working collection
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
      {!isCreateMode &&
        isInspectMode &&
        showingExternalCollection &&
        requiresWorkingCollectionForEdit && (
          <div className="flex items-start gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-body">
            <span className="text-[var(--color-figma-text-secondary)]">
              This token belongs to <span className="font-medium text-[var(--color-figma-text)]">{ownerCollectionId}</span>.
              Switch the working collection to edit it.
            </span>
          </div>
        )}
      {isEditMode && pendingDraft && !isCreateMode && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 text-body">
          <Clock size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-figma-warning)]" aria-hidden />
          <span className="min-w-0 flex-1 text-[var(--color-figma-warning)] truncate">
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
        <div className={`${AUTHORING_SURFACE_CLASSES.footerMeta} flex flex-col gap-1.5`}>
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
              className="self-start text-secondary font-medium text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
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
          className="ml-auto min-w-0 flex-1"
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

  const valueSectionTitle =
    modeValue.modes.length >= 2 ? "Mode values" : "Value";
  const tokenTypeDisplayLabel =
    tokenType.charAt(0).toUpperCase() + tokenType.slice(1);
  const valueSectionActions = !isCreateMode ? (
    isInspectMode ? (
      <span
        className={`px-1.5 py-0.5 rounded text-secondary font-medium ${tokenTypeBadgeClass(tokenType)}`}
      >
        {tokenTypeDisplayLabel}
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
        backAriaLabel={backLabel ?? "Back"}
        backTitle={backLabel}
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

        {activeGraphProvenance ? (
          <div
            className="tm-token-details__graph-banner"
            role="region"
            aria-label="Graph ownership"
          >
            <div className="tm-token-details__graph-banner-summary">
              <span>Generated by graph</span>
              <span
                className="tm-token-details__graph-banner-name"
                title={graphName ?? activeGraphProvenance.graphId}
              >
                {graphName ?? activeGraphProvenance.graphId}
              </span>
            </div>
            <div className="tm-token-details__graph-banner-actions">
              {onOpenGraphDocument ? (
                <button
                  type="button"
                  onClick={() => onOpenGraphDocument(activeGraphProvenance.graphId)}
                  className="tm-token-details__text-button"
                >
                  Open graph
                </button>
              ) : null}
              {isEditMode ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleDetachGraphOutput();
                  }}
                  disabled={detachingGraphOutput}
                  className="tm-token-details__text-button tm-token-details__text-button--muted"
                >
                  {detachingGraphOutput ? "Detaching…" : "Detach"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {isCreateMode ? (
          <div className="tm-token-details__setup">
            <div className="tm-token-details__setup-row">
              <div className="relative" ref={pathInputWrapperRef}>
                <Field label="Token path">
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
                </Field>
                {showPathAutocomplete && trimmedEditPath ? (
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
                ) : null}
              </div>

              <Field label="Type">
                <TypePicker
                  value={tokenType}
                  onChange={handleTypeChange}
                  title="Change token type"
                  className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary font-medium text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                />
              </Field>
            </div>

            <div className="tm-token-details__setup-meta">
              <span>Collection: {ownerCollectionId}</span>
              {trimmedEditLeaf ? <span>Leaf: {trimmedEditLeaf}</span> : null}
            </div>

            {duplicatePath ? (
              <p className="tm-token-details__error-copy">
                A token with this path already exists in{" "}
                {ownerCollectionId}.
              </p>
            ) : null}
            {!duplicatePath && conflictingOtherCollectionIds.length > 0 ? (
              <p className="m-0 text-secondary leading-[var(--leading-body)] text-[var(--color-figma-text-secondary)]">
                This path is already used in{" "}
                {formatCollectionIdList(conflictingOtherCollectionIds)}.
                Creating it here will make references to{" "}
                <span className="font-mono">{trimmedEditPath}</span> ambiguous
                across collections.
              </p>
            ) : null}

            {!editPath.includes(".") && createSuggestions.length > 0 ? (
              <div className="tm-token-details__suggestions">
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">Try</span>
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
            ) : null}
          </div>
        ) : null}

        <Section
          title={valueSectionTitle}
          actions={valueSectionActions}
          emphasis="primary"
        >
          <Stack
            gap={3}
            ref={valueEditorContainerRef}
            onPaste={isEditMode ? handlePaste : undefined}
          >
            <Surface variant="muted" padding="sm">
              <Stack
                gap={1}
                title={
                  modeValue.modes.length >= 2
                    ? (valueFormatHint(tokenType) || undefined)
                    : undefined
                }
              >
                {modeValue.modes.map((mode, modeIdx) => {
                  const modeVal = mode.value;
                  const inheritedValue = extendsPath ? allTokensFlat[extendsPath]?.$value : undefined;
                  const initialModeVal =
                    modeIdx === 0
                      ? initialFieldsSnapshot?.value
                      : initialFieldsSnapshot?.modeValues[ownerCollectionId]?.[mode.name];
                  const isModeModified =
                    initialModeVal !== undefined &&
                    stableStringify(modeVal) !== stableStringify(initialModeVal);
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
                      inheritedValue={inheritedValue}
                      availableFonts={availableFonts}
                      fontWeightsByFamily={fontWeightsByFamily}
                      fontFamilyRef={modeIdx === 0 ? fontFamilyRef : undefined}
                      fontSizeRef={modeIdx === 0 ? fontSizeRef : undefined}
                      modified={isModeModified && !isCreateMode}
                      onNavigateToToken={(path) => onNavigateToToken?.(path)}
                      allowCopyFromPrevious={
                        isEditMode &&
                        modeValue.modes.length > 1 &&
                        modeIdx > 0
                      }
                      onCopyFromPrevious={
                        isEditMode && modeValue.modes.length > 1 && modeIdx > 0
                          ? () => {
                              const sourceIdx = modeIdx - 1;
                              const sourceValue = modeValue.modes[sourceIdx].value;
                              if (sourceValue != null) {
                                mode.setValue(cloneModeValue(sourceValue));
                              }
                            }
                          : undefined
                      }
                      allowCopyToAll={
                        isEditMode &&
                        modeValue.modes.length > 1 &&
                        modeVal != null
                      }
                      onCopyToAll={
                        isEditMode &&
                        modeValue.modes.length > 1 &&
                        modeVal != null
                          ? () => {
                              const sourceValue = mode.value;
                              if (sourceValue == null) return;
                              modeValue.modes.forEach((destMode, destIdx) => {
                                if (destIdx === modeIdx) return;
                                destMode.setValue(cloneModeValue(sourceValue));
                              });
                            }
                          : undefined
                      }
                    />
                  );
                })}
                {isEditMode ? (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                      Modes belong to the collection and apply to every token in it.
                    </span>
                    {onManageCollectionModes ? (
                      <button
                        type="button"
                        onClick={() => onManageCollectionModes(ownerCollectionId)}
                        className="inline-flex items-center gap-1 text-secondary text-[var(--color-figma-accent)] hover:underline"
                      >
                        <Plus size={12} strokeWidth={1.5} aria-hidden />
                        Manage collection modes
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </Stack>
            </Surface>

            {isEditMode && valueIsAlias ? (
              <DerivationEditor
                sourceType={tokenType as TokenType | undefined}
                reference={value as string}
                allTokensFlat={allTokensFlat}
                derivationOps={derivationOps}
                onDerivationOpsChange={setDerivationOps}
              />
            ) : null}

            {isInspectMode && derivationOps.length > 0 ? (
              <Field label="Modifier">
                <Stack gap={1}>
                  {derivationOps.map((op, idx) => (
                    <ListItem key={idx}>
                      <span className={LONG_TEXT_CLASSES.textPrimary}>
                        {summarizeDerivationOp(op)}
                      </span>
                    </ListItem>
                  ))}
                </Stack>
              </Field>
            ) : null}
          </Stack>
        </Section>

        <Section title="Details" emphasis="secondary">
          <Stack gap={4}>
            <Field label="Description">
              {isInspectMode ? (
                <p className="m-0 text-body text-[var(--color-figma-text)]">
                  {description ? (
                    description
                  ) : (
                    <span className="italic text-[var(--color-figma-text-tertiary)]">
                      No description
                    </span>
                  )}
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
            </Field>

            <Stack direction="row" gap={4}>
              {FIGMA_SCOPE_OPTIONS[tokenType] ? (
                <Field
                  label="Can apply to"
                  help="Pick the Figma fields this token is valid for. Leave empty to allow any compatible field."
                  className="flex-1"
                >
                  {isInspectMode ? (
                    <div className="text-body text-[var(--color-figma-text)]">
                      {scopeLabels.length > 0
                        ? scopeLabels.join(", ")
                        : "Any compatible field"}
                    </div>
                  ) : (
                    <ScopeEditor
                      tokenTypes={[tokenType]}
                      selectedScopes={scopes}
                      onChange={setScopes}
                      compact
                    />
                  )}
                </Field>
              ) : null}

              <Field label="Lifecycle" className="flex-1">
                <Stack direction="row" gap={2} align="center">
                  <span
                    className={`tm-token-details__lifecycle-dot ${lifecycleDotClass}`}
                    aria-hidden
                  />
                  {isInspectMode ? (
                    <span className="text-body text-[var(--color-figma-text)]">
                      {lifecycleLabel}
                    </span>
                  ) : (
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
                  )}
                </Stack>
              </Field>
            </Stack>
          </Stack>
        </Section>

        {!isCreateMode ? (
          <Section title="Related" emphasis="support">
            <Stack gap={5}>
            {tokenType === "color" ? (
              <ContrastChecker
                tokenPath={tokenPath}
                value={value}
                allTokensFlat={allTokensFlat}
                pathToCollectionId={pathToCollectionId}
                colorFlatMap={colorFlatMap}
              />
            ) : null}

            {isInspectMode && onOpenInHealth ? (
              <div className="tm-token-details__related-actions">
                <button
                  type="button"
                  onClick={onOpenInHealth}
                  className="tm-token-details__text-button"
                >
                  Open in review
                </button>
              </div>
            ) : null}

            {!ancestors.isEmpty ? (
              <Field label="Resolves to">
                <div className="max-h-36 overflow-y-auto">
                  <Stack gap={1} className="p-1.5">
                    {ancestors.chains.map((chain) => (
                      <Stack key={chain.modeName} gap={1}>
                        {ancestors.chains.length > 1 ? (
                          <div className="tm-token-details__list-note">{chain.modeName}</div>
                        ) : null}
                        {chain.rows.map((row, rowIdx) => {
                          const key = `${chain.modeName}::${rowIdx}::${row.path}`;
                          const crossCollection =
                            row.collectionId && row.collectionId !== ownerCollectionId;
                          const statusLabel = getAncestorRowStatusLabel(row.status);
                          const tags = (
                            <>
                              {crossCollection ? (
                                <span className="tm-token-details__mini-tag">{row.collectionId}</span>
                              ) : null}
                              {row.formulaSource ? (
                                <span
                                  className="tm-token-details__mini-tag"
                                  title={row.formulaSource}
                                >
                                  formula
                                </span>
                              ) : null}
                              {statusLabel ? (
                                <span className="tm-token-details__mini-tag">{statusLabel}</span>
                              ) : null}
                            </>
                          );
                          const handleNavigate =
                            onNavigateToToken &&
                            row.collectionId &&
                            row.status !== "missing" &&
                            row.status !== "ambiguous"
                              ? () => onNavigateToToken(row.path, row.collectionId)
                              : undefined;
                          return (
                            <ListItem
                              key={key}
                              onClick={handleNavigate}
                              title={handleNavigate ? `Open ${row.path}` : undefined}
                              trailing={tags}
                            >
                              <span className={LONG_TEXT_CLASSES.monoPrimary}>{row.path}</span>
                            </ListItem>
                          );
                        })}
                        {chain.terminalKind === "literal" && chain.terminalValue !== undefined ? (
                          <ListItem>
                            <span className={LONG_TEXT_CLASSES.monoPrimary}>
                              {formatTokenValueForDisplay(chain.terminalType, chain.terminalValue)}
                            </span>
                          </ListItem>
                        ) : null}
                        {(() => {
                          const terminalNote = getAncestorTerminalNote(chain.terminalKind);
                          return terminalNote ? (
                            <div className="tm-token-details__list-note">{terminalNote}</div>
                          ) : null;
                        })()}
                      </Stack>
                    ))}
                  </Stack>
                </div>
              </Field>
            ) : null}

            {dependents.length > 0 ? (
              <Field label="Dependent tokens">
                <div className="max-h-36 overflow-y-auto">
                  <Stack gap={1} className="p-1.5">
                    {dependents.slice(0, 20).map((dep) => {
                      const tag =
                        dep.collectionId !== ownerCollectionId ? (
                          <span className="tm-token-details__mini-tag">{dep.collectionId}</span>
                        ) : null;
                      return (
                        <ListItem
                          key={dep.path}
                          onClick={onNavigateToToken ? () => onNavigateToToken(dep.path, dep.collectionId) : undefined}
                          title={onNavigateToToken ? `Open ${dep.path}` : undefined}
                          trailing={tag}
                        >
                          <span className={LONG_TEXT_CLASSES.monoPrimary}>{dep.path}</span>
                        </ListItem>
                      );
                    })}
                    {dependents.length > 20 ? (
                      <div className="tm-token-details__list-note">
                        and {dependents.length - 20} more…
                      </div>
                    ) : null}
                  </Stack>
                </div>
              </Field>
            ) : null}
            </Stack>
          </Section>
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

      {/* Rename reference-update confirmation */}
      {renameConfirm && (
        <ConfirmModal
          title={`Rename "${leafName}"?`}
          description={`${renameConfirm.aliasCount} ${
            renameConfirm.aliasCount === 1 ? "alias reference" : "alias references"
          } will be updated to point to ${renameConfirm.newPath}.`}
          confirmLabel="Rename and update references"
          cancelLabel="Cancel"
          onConfirm={() => performRename(renameConfirm.newPath, true)}
          onCancel={() => setRenameConfirm(null)}
        />
      )}
    </div>
  );
}
