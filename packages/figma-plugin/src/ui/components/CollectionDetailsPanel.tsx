import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, ArrowDown, X, Plus, Pencil, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type { TokenCollection } from "@token-workshop/core";
import {
  addCollectionMode,
  deleteCollectionMode,
  DUPLICATE_MODE_NAME_MESSAGE,
  isModeNameTaken,
  renameCollectionMode,
  reorderCollectionModes,
} from "../shared/collectionModes";
import { getCollectionDisplayName } from "../shared/libraryCollections";
import { getErrorMessage } from "../shared/utils";
import { useDropdownMenu } from "../hooks/useDropdownMenu";
import { useAnchoredFloatingStyle } from "../shared/floatingPosition";
import { FLOATING_MENU_CLASS } from "../shared/menuClasses";
import { ActionRow, Button, IconButton, TextInput } from "../primitives";
import {
  CollectionMergeInline,
  CollectionDeleteDialog,
  CollectionSplitDialog,
  useCollectionStructuralPreflight,
} from "./CollectionStructureDialogs";
import { Collapsible } from "./Collapsible";

interface CollectionDetailsPanelProps {
  collection: TokenCollection | null;
  collectionIds: string[];
  collectionTokenCounts: Record<string, number>;
  collectionDescriptions: Record<string, string>;
  collectionDisplayNames?: Record<string, string>;
  serverUrl: string;
  connected: boolean;
  presentation?: "panel" | "takeover" | "bottom";
  showCloseButton?: boolean;
  returnLabel?: string;
  onModeMutated?: () => void;
  onClose: () => void;
  onRename?: (
    oldName: string,
    newName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onDuplicate?: (collectionId: string) => void;
  onDelete?: (collectionId: string) => void;
  onEditInfo?: (collectionId: string) => void;
  onMerge?: (collectionId: string) => void;
  onSplit?: (collectionId: string) => void;
  editingMetadataCollectionId?: string | null;
  metadataDescription?: string;
  setMetadataDescription?: (value: string) => void;
  onMetadataSave?: () => void | Promise<void>;
  deletingCollectionId?: string | null;
  onDeleteConfirm?: () => void | Promise<void>;
  onDeleteCancel?: () => void;
  mergingCollectionId?: string | null;
  mergeTargetCollectionId?: string;
  mergeConflicts?: Array<{
    path: string;
    sourceValue: unknown;
    targetValue: unknown;
  }>;
  mergeResolutions?: Record<string, "source" | "target">;
  mergeChecked?: boolean;
  mergeLoading?: boolean;
  onMergeTargetChange?: (target: string) => void;
  setMergeResolutions?: (
    updater:
      | Record<string, "source" | "target">
      | ((
          prev: Record<string, "source" | "target">,
        ) => Record<string, "source" | "target">),
  ) => void;
  onMergeCheckConflicts?: () => void | Promise<void>;
  onMergeConfirm?: () => void | Promise<void>;
  onMergeClose?: () => void;
  splittingCollectionId?: string | null;
  splitPreview?: Array<{ key: string; newCollectionId: string; count: number }>;
  splitDeleteOriginal?: boolean;
  splitLoading?: boolean;
  setSplitDeleteOriginal?: (value: boolean) => void;
  onSplitConfirm?: () => void | Promise<void>;
  onSplitClose?: () => void;
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div className="px-4 pb-1.5 pt-4 text-body font-medium text-[color:var(--color-figma-text-secondary)]">
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[18px] font-semibold leading-none tabular-nums text-[color:var(--color-figma-text)]">
        {value}
      </span>
      <span className="mt-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
        {label}
      </span>
    </div>
  );
}

function ModeRow({
  modeName,
  modeIndex,
  allModeNames,
  collectionId,
  serverUrl,
  connected,
  tokenCount,
  onMutated,
}: {
  modeName: string;
  modeIndex: number;
  allModeNames: string[];
  collectionId: string;
  serverUrl: string;
  connected: boolean;
  tokenCount: number;
  onMutated?: () => void;
}) {
  const actionsMenu = useDropdownMenu();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(modeName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const actionsMenuStyle = useAnchoredFloatingStyle({
    triggerRef: actionsMenu.triggerRef,
    open: actionsMenu.open,
    preferredWidth: 180,
    preferredHeight: 180,
    align: "end",
  });

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const handleRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === modeName) {
      setRenaming(false);
      setRenameValue(modeName);
      return;
    }
    if (isModeNameTaken(allModeNames, trimmed, modeName)) {
      setError(DUPLICATE_MODE_NAME_MESSAGE);
      inputRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      await renameCollectionMode({
        serverUrl,
        collectionId,
        modeName,
        name: trimmed,
      });
      setRenaming(false);
      onMutated?.();
    } catch (err) {
      setError(getErrorMessage(err, "Could not rename this mode."));
    } finally {
      setSaving(false);
    }
  }, [allModeNames, collectionId, modeName, onMutated, renameValue, serverUrl]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await deleteCollectionMode({ serverUrl, collectionId, modeName });
      setConfirmingDelete(false);
      onMutated?.();
    } catch (err) {
      setError(getErrorMessage(err, "Could not delete this mode."));
    } finally {
      setSaving(false);
    }
  }, [collectionId, modeName, onMutated, serverUrl]);

  const handleReorder = useCallback(
    async (direction: -1 | 1) => {
      const newIndex = modeIndex + direction;
      if (newIndex < 0 || newIndex >= allModeNames.length) return;
      const reordered = [...allModeNames];
      reordered.splice(modeIndex, 1);
      reordered.splice(newIndex, 0, modeName);
      setSaving(true);
      setError("");
      try {
        await reorderCollectionModes({
          serverUrl,
          collectionId,
          modes: reordered,
        });
        onMutated?.();
      } catch (err) {
        setError(getErrorMessage(err, "Could not move this mode."));
      } finally {
        setSaving(false);
      }
    },
    [allModeNames, collectionId, modeIndex, modeName, onMutated, serverUrl],
  );

  const canMoveUp = modeIndex > 0 && allModeNames.length > 1;
  const canMoveDown = modeIndex < allModeNames.length - 1 && allModeNames.length > 1;

  if (confirmingDelete) {
    return (
      <div className="mx-2 rounded bg-[var(--color-figma-error)]/10 px-2.5 py-2">
        <p className="text-secondary text-[color:var(--color-figma-text)]">
          Delete {modeName}? This removes the {modeName} value from {tokenCount} token{tokenCount === 1 ? "" : "s"} in this collection.
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded bg-[var(--color-figma-error)] px-2 py-0.5 text-secondary font-medium text-white disabled:opacity-50"
          >
            {saving ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={saving}
            className="rounded px-2 py-0.5 text-secondary text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p className="mt-1 text-secondary text-[color:var(--color-figma-text-error)]">{error}</p>
        ) : null}
      </div>
    );
  }

  if (renaming) {
    return (
      <div className="px-2">
        <TextInput
          ref={inputRef}
          value={renameValue}
          onChange={(e) => {
            setRenameValue(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(modeName);
            }
          }}
          onBlur={() => void handleRename()}
          disabled={saving}
        />
        {error ? (
          <p className="mt-1 text-secondary text-[color:var(--color-figma-text-error)]">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="tm-collection-details__mode-row group">
      <div
        className="tm-collection-details__mode-name text-left text-body text-[color:var(--color-figma-text)]"
        title={modeName}
      >
        {modeName}
      </div>
      {connected ? (
        <div className="tm-collection-details__mode-actions">
          <IconButton
            size="sm"
            onClick={() => {
              setRenameValue(modeName);
              setRenaming(true);
            }}
            disabled={saving}
            aria-label="Rename mode"
            title="Rename mode"
          >
            <Pencil size={11} strokeWidth={1.5} aria-hidden />
          </IconButton>
          <div className="relative">
            <IconButton
              ref={actionsMenu.triggerRef}
              size="sm"
              onClick={actionsMenu.toggle}
              disabled={saving}
              aria-label="More mode actions"
              title="More mode actions"
              aria-haspopup="menu"
              aria-expanded={actionsMenu.open}
            >
              <MoreHorizontal size={12} strokeWidth={1.8} aria-hidden />
            </IconButton>
            {actionsMenu.open ? (
              <div
                ref={actionsMenu.menuRef}
                style={actionsMenuStyle ?? { visibility: "hidden" }}
                className={FLOATING_MENU_CLASS}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void handleReorder(-1);
                    actionsMenu.close({ restoreFocus: false });
                  }}
                  disabled={!canMoveUp || saving}
                  className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  <ArrowUp size={10} strokeWidth={2} aria-hidden />
                  Move up
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    void handleReorder(1);
                    actionsMenu.close({ restoreFocus: false });
                  }}
                  disabled={!canMoveDown || saving}
                  className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  <ArrowDown size={10} strokeWidth={2} aria-hidden />
                  Move down
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setConfirmingDelete(true);
                    actionsMenu.close({ restoreFocus: false });
                  }}
                  disabled={allModeNames.length <= 1 || saving}
                  className="flex w-full items-center gap-2 px-2.5 py-1 text-left text-secondary text-[color:var(--color-figma-text-error)] transition-colors hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40"
                >
                  <X size={10} strokeWidth={2} aria-hidden />
                  Delete mode
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-secondary text-[color:var(--color-figma-text-error)]">{error}</p>
      ) : null}
    </div>
  );
}

function ModesSection({
  collection,
  serverUrl,
  connected,
  onModeMutated,
  tokenCount,
}: {
  collection: TokenCollection;
  serverUrl: string;
  connected: boolean;
  onModeMutated?: () => void;
  tokenCount: number;
}) {
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const allModeNames = useMemo(
    () => collection.modes.map((mode) => mode.name),
    [collection.modes],
  );
  const sourceModeName = allModeNames[0];

  useEffect(() => {
    if (adding) {
      addInputRef.current?.focus();
    }
  }, [adding]);

  const handleAdd = useCallback(async () => {
    const trimmed = addValue.trim();
    if (!trimmed) {
      setAdding(false);
      setAddValue("");
      return;
    }
    if (isModeNameTaken(allModeNames, trimmed)) {
      setAddError(DUPLICATE_MODE_NAME_MESSAGE);
      addInputRef.current?.focus();
      return;
    }
    setAddSaving(true);
    setAddError("");
    try {
      await addCollectionMode({
        serverUrl,
        collectionId: collection.id,
        name: trimmed,
        sourceModeName,
      });
      setAdding(false);
      setAddValue("");
      onModeMutated?.();
    } catch (err) {
      setAddError(getErrorMessage(err, "Could not add this mode."));
    } finally {
      setAddSaving(false);
    }
  }, [
    addValue,
    allModeNames,
    collection.id,
    onModeMutated,
    serverUrl,
    sourceModeName,
  ]);

  return (
    <div>
      <SectionHeader>Modes</SectionHeader>
      <div className="px-3">
        <p className="px-1 pb-2 text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Every token in this collection uses these modes. New modes{" "}
          {sourceModeName
            ? `copy ${sourceModeName} values as an editable starting point.`
            : "become value columns for every token in the collection."}
        </p>
        {collection.modes.map((mode, index) => (
          <ModeRow
            key={mode.name}
            modeName={mode.name}
            modeIndex={index}
            allModeNames={allModeNames}
            collectionId={collection.id}
            serverUrl={serverUrl}
            connected={connected}
            tokenCount={tokenCount}
            onMutated={onModeMutated}
          />
        ))}
        {connected ? (
          adding ? (
            <div className="mt-1 px-2">
              <TextInput
                ref={addInputRef}
                value={addValue}
                onChange={(e) => {
                  setAddValue(e.target.value);
                  setAddError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAdd();
                  if (e.key === "Escape") {
                    setAdding(false);
                    setAddValue("");
                    setAddError("");
                  }
                }}
                onBlur={() => {
                  if (!addValue.trim()) {
                    setAdding(false);
                    setAddValue("");
                    setAddError("");
                    return;
                  }
                  void handleAdd();
                }}
                disabled={addSaving}
                placeholder="Mode name"
              />
              {addError ? (
                <p className="mt-1 text-secondary text-[color:var(--color-figma-text-error)]">{addError}</p>
              ) : null}
              {!addError ? (
                <p className="mt-1 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                  {sourceModeName
                    ? `Existing tokens will copy ${sourceModeName} values into the new mode.`
                    : "This mode becomes a value column for every token in this collection."}
                </p>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => setAdding(true)}
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start"
            >
              <Plus size={11} strokeWidth={1.8} aria-hidden />
              Add mode
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

export function CollectionDetailsPanel({
  collection,
  collectionIds,
  collectionTokenCounts,
  collectionDescriptions,
  collectionDisplayNames,
  serverUrl,
  connected,
  presentation = "panel",
  showCloseButton = true,
  returnLabel,
  onModeMutated,
  onClose,
  onDuplicate,
  onDelete,
  onEditInfo,
  onMerge,
  onSplit,
  onRename,
  editingMetadataCollectionId = null,
  metadataDescription = "",
  setMetadataDescription,
  onMetadataSave,
  deletingCollectionId = null,
  onDeleteConfirm,
  onDeleteCancel,
  mergingCollectionId = null,
  mergeTargetCollectionId = "",
  mergeConflicts = [],
  mergeResolutions = {},
  mergeChecked = false,
  mergeLoading = false,
  onMergeTargetChange,
  setMergeResolutions,
  onMergeCheckConflicts,
  onMergeConfirm,
  onMergeClose,
  splittingCollectionId = null,
  splitPreview = [],
  splitDeleteOriginal = false,
  splitLoading = false,
  setSplitDeleteOriginal,
  onSplitConfirm,
  onSplitClose,
}: CollectionDetailsPanelProps) {
  useEffect(() => {
    if (!collection || !onEditInfo) {
      return;
    }
    if (editingMetadataCollectionId === collection.id) {
      return;
    }
    onEditInfo(collection.id);
  }, [collection, editingMetadataCollectionId, onEditInfo]);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [advancedStructureOpen, setAdvancedStructureOpen] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRenaming(false);
    setRenameError("");
    setMetadataSaving(false);
    setAdvancedStructureOpen(false);
  }, [collection?.id]);

  useEffect(() => {
    if (!collection) return;
    if (
      deletingCollectionId === collection.id ||
      mergingCollectionId === collection.id ||
      splittingCollectionId === collection.id
    ) {
      setAdvancedStructureOpen(true);
    }
  }, [
    collection,
    deletingCollectionId,
    mergingCollectionId,
    splittingCollectionId,
  ]);

  useLayoutEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  const collectionId = collection?.id ?? "";
  const tokenCount = collection ? (collectionTokenCounts[collection.id] ?? 0) : 0;
  const modeCount = collection?.modes.length ?? 0;
  const displayName = collection
    ? getCollectionDisplayName(collection.id, collectionDisplayNames)
    : "";
  const showRawId = !!collection && displayName !== collection.id;
  const savedDescription = collection ? (collectionDescriptions[collection.id] ?? "") : "";
  const currentDescription =
    collection && editingMetadataCollectionId === collection.id
      ? metadataDescription
      : savedDescription;
  const descriptionDirty =
    !!collection &&
    editingMetadataCollectionId === collection.id &&
    metadataDescription !== savedDescription;

  const startRename = useCallback(() => {
    if (!collection) return;
    setRenameValue(collection.id);
    setRenameError("");
    setRenaming(true);
  }, [collection]);

  const cancelRename = useCallback(() => {
    setRenaming(false);
    setRenameError("");
  }, []);

  const confirmRename = useCallback(async () => {
    if (!collection) {
      setRenaming(false);
      return;
    }
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === collection.id) {
      cancelRename();
      return;
    }
    if (!onRename) {
      cancelRename();
      return;
    }
    const result = await onRename(collection.id, trimmed);
    if (result.ok) {
      setRenaming(false);
      setRenameError("");
    } else if (result.error) {
      setRenameError(result.error);
    } else {
      setRenaming(false);
    }
  }, [cancelRename, collection, onRename, renameValue]);

  const deletePreflight = useCollectionStructuralPreflight({
    operation: "delete",
    collectionId: deletingCollectionId,
    enabled: !!deletingCollectionId && !!onDeleteConfirm,
  });
  const mergePreflight = useCollectionStructuralPreflight({
    operation: "merge",
    collectionId: mergingCollectionId,
    targetCollection: mergeTargetCollectionId,
    enabled:
      !!mergingCollectionId &&
      !!mergeTargetCollectionId &&
      !!onMergeConfirm,
  });
  const splitPreflight = useCollectionStructuralPreflight({
    operation: "split",
    collectionId: splittingCollectionId,
    deleteOriginal: splitDeleteOriginal,
    enabled: !!splittingCollectionId && !!onSplitConfirm,
  });

  const shellClass =
    presentation === "takeover"
      ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--color-figma-bg)]"
      : presentation === "bottom"
        ? "flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--color-figma-bg)]"
        : "flex h-full w-[340px] max-w-full shrink-0 flex-col overflow-hidden bg-[var(--color-figma-bg)]";
  const contentClass =
    presentation === "takeover"
      ? "mx-auto flex h-full w-full max-w-[720px] flex-col overflow-hidden"
      : "flex h-full w-full flex-col overflow-hidden";

  const saveDescription = useCallback(async () => {
    if (!descriptionDirty || !onMetadataSave) {
      return;
    }
    setMetadataSaving(true);
    try {
      await onMetadataSave();
    } finally {
      setMetadataSaving(false);
    }
  }, [descriptionDirty, onMetadataSave]);

  if (!collection) {
    return (
      <div className={`${shellClass} tm-collection-details`}>
        <div className={contentClass}>
          {showCloseButton ? (
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                aria-label="Close collection details"
              >
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}
          <div className="flex flex-1 items-center justify-center px-6 text-center text-body text-[color:var(--color-figma-text-secondary)]">
            Choose a collection to review its structure.
          </div>
        </div>
      </div>
    );
  }

  const canMerge =
    !!onMerge && collectionIds.some((candidateCollectionId) => candidateCollectionId !== collectionId);

  if (
    mergingCollectionId === collection.id &&
    onMergeClose &&
    onMergeTargetChange &&
    setMergeResolutions &&
    onMergeCheckConflicts &&
    onMergeConfirm
  ) {
    return (
      <div className={`${shellClass} tm-collection-details`}>
        <div className={contentClass}>
          <CollectionMergeInline
            collectionIds={collectionIds}
            collectionDisplayNames={collectionDisplayNames}
            mergingCollectionId={mergingCollectionId}
            preflight={mergePreflight.data}
            preflightLoading={mergePreflight.loading}
            preflightError={mergePreflight.error}
            mergeTargetCollectionId={mergeTargetCollectionId}
            mergeConflicts={mergeConflicts}
            mergeResolutions={mergeResolutions}
            mergeChecked={mergeChecked}
            mergeLoading={mergeLoading}
            onTargetChange={onMergeTargetChange}
            onSetResolutions={setMergeResolutions}
            onCheckConflicts={onMergeCheckConflicts}
            onConfirm={onMergeConfirm}
            onClose={onMergeClose}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`${shellClass} tm-collection-details`}>
        <div className={contentClass}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-4 pb-3 pt-4">
              {returnLabel ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="mb-3 inline-flex items-center gap-1 text-secondary font-medium text-[color:var(--color-figma-text-accent)] hover:underline"
                >
                  <ArrowLeft size={12} strokeWidth={1.75} aria-hidden />
                  {returnLabel}
                </button>
              ) : null}
              <div className="tm-collection-details__header">
                {renaming ? (
                  <div className="tm-collection-details__heading">
                    <TextInput
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue(e.target.value);
                        setRenameError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void confirmRename();
                        if (e.key === "Escape") cancelRename();
                      }}
                      onBlur={() => void confirmRename()}
                      className="w-full text-[17px] font-semibold tracking-tight"
                    />
                    {renameError ? (
                      <p className="mt-1 text-secondary text-[color:var(--color-figma-text-error)]">{renameError}</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="tm-collection-details__heading">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="tm-collection-details__title">{displayName}</h2>
                      {onRename ? (
                        <Button
                          type="button"
                          onClick={startRename}
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                        >
                          <Pencil size={11} strokeWidth={1.75} aria-hidden />
                          Rename
                        </Button>
                      ) : null}
                    </div>

                    <textarea
                      value={currentDescription}
                      onChange={(e) => setMetadataDescription?.(e.target.value)}
                      rows={2}
                      placeholder="Add a description…"
                      aria-label="Collection description"
                      className="w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-body leading-[1.5] text-[color:var(--color-figma-text-secondary)] outline-none placeholder:text-[color:var(--color-figma-text-tertiary)] hover:border-[color:var(--color-figma-text-tertiary)] focus-visible:border-[var(--color-figma-accent)] focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]"
                    />
                    {descriptionDirty || metadataSaving ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => void saveDescription()}
                          variant="primary"
                          size="sm"
                          disabled={metadataSaving}
                        >
                          {metadataSaving ? "Saving…" : "Save description"}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => setMetadataDescription?.(savedDescription)}
                          variant="ghost"
                          size="sm"
                          disabled={metadataSaving || !descriptionDirty}
                        >
                          Revert
                        </Button>
                      </div>
                    ) : null}

                    {showRawId ? (
                      <div className="tm-collection-details__raw-id text-secondary text-[color:var(--color-figma-text-tertiary)]">
                        ID <span className="font-mono">{collection.id}</span>
                      </div>
                    ) : null}

                    <div className="tm-collection-details__stats">
                      <Stat value={tokenCount} label={tokenCount === 1 ? "token" : "tokens"} />
                      <Stat value={modeCount} label={modeCount === 1 ? "mode" : "modes"} />
                    </div>
                  </div>
                )}
                {showCloseButton && !returnLabel ? (
                  <IconButton
                    size="md"
                    onClick={onClose}
                    aria-label="Close collection details"
                    title="Close"
                  >
                    <X size={12} strokeWidth={2} aria-hidden />
                  </IconButton>
                ) : null}
              </div>
            </div>

            <ModesSection
              collection={collection}
              serverUrl={serverUrl}
              connected={connected}
              onModeMutated={onModeMutated}
              tokenCount={collectionTokenCounts[collection.id] ?? 0}
            />

            <div className="px-4 pb-4 pt-4">
              <Collapsible
                open={advancedStructureOpen}
                onToggle={() => setAdvancedStructureOpen((open) => !open)}
                label="Advanced structure"
              >
                <div className="mt-2">
                  <ActionRow onClick={() => onDuplicate?.(collection.id)}>
                    Duplicate collection
                  </ActionRow>
                  <ActionRow
                    onClick={() => onMerge?.(collection.id)}
                    disabled={!canMerge}
                  >
                    Merge into another collection
                  </ActionRow>
                  <ActionRow onClick={() => onSplit?.(collection.id)}>
                    Split by top-level groups
                  </ActionRow>
                  <ActionRow onClick={() => onDelete?.(collection.id)} tone="danger">
                    Delete collection
                  </ActionRow>
                </div>
              </Collapsible>
            </div>
          </div>
        </div>
      </div>

      {deletingCollectionId === collection.id && onDeleteConfirm && onDeleteCancel ? (
        <CollectionDeleteDialog
          deletingCollectionId={deletingCollectionId}
          collectionDisplayNames={collectionDisplayNames}
          preflight={deletePreflight.data}
          preflightLoading={deletePreflight.loading}
          preflightError={deletePreflight.error}
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      ) : null}

      {splittingCollectionId === collection.id &&
      onSplitClose &&
      setSplitDeleteOriginal &&
      onSplitConfirm ? (
        <CollectionSplitDialog
          collectionIds={collectionIds}
          collectionDisplayNames={collectionDisplayNames}
          splittingCollectionId={splittingCollectionId}
          preflight={splitPreflight.data}
          preflightLoading={splitPreflight.loading}
          preflightError={splitPreflight.error}
          splitPreview={splitPreview}
          splitDeleteOriginal={splitDeleteOriginal}
          splitLoading={splitLoading}
          onSetDeleteOriginal={setSplitDeleteOriginal}
          onConfirm={onSplitConfirm}
          onClose={onSplitClose}
        />
      ) : null}
    </>
  );
}
