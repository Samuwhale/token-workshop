import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import { apiFetch } from "../shared/apiFetch";
import { getCollectionDisplayName } from "../shared/libraryCollections";
import { ActionRow, IconButton, TextInput } from "../primitives";
import {
  CollectionMergeInline,
  CollectionDeleteDialog,
  CollectionSplitDialog,
  useCollectionStructuralPreflight,
} from "./CollectionStructureDialogs";

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
  onMetadataSave?: () => void;
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
    <div className="px-5 pb-1.5 pt-5 text-body font-medium text-[var(--color-figma-text-secondary)]">
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[18px] font-semibold leading-none tabular-nums text-[var(--color-figma-text)]">
        {value}
      </span>
      <span className="mt-1 text-secondary text-[var(--color-figma-text-tertiary)]">
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
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(modeName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setSaving(true);
    setError("");
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes/${encodeURIComponent(modeName)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setRenaming(false);
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }, [collectionId, modeName, onMutated, renameValue, serverUrl]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    setError("");
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes/${encodeURIComponent(modeName)}`,
        { method: "DELETE" },
      );
      setConfirmingDelete(false);
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
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
        await apiFetch(
          `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/modes-order`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modes: reordered }),
          },
        );
        onMutated?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reorder failed");
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
        <p className="text-secondary text-[var(--color-figma-text)]">
          Delete mode? {tokenCount} token{tokenCount === 1 ? "" : "s"} may lose values.
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
            className="rounded px-2 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p className="mt-1 text-secondary text-[var(--color-figma-error)]">{error}</p>
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
          <p className="mt-1 text-secondary text-[var(--color-figma-error)]">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-[var(--color-figma-bg-hover)]">
      <button
        type="button"
        onDoubleClick={() => {
          if (connected) {
            setRenameValue(modeName);
            setRenaming(true);
          }
        }}
        className="min-w-0 flex-1 truncate text-left text-body text-[var(--color-figma-text)]"
        title={connected ? "Double-click to rename" : modeName}
      >
        {modeName}
      </button>
      {connected && allModeNames.length > 1 ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton
            size="sm"
            onClick={() => void handleReorder(-1)}
            disabled={!canMoveUp || saving}
            aria-label="Move up"
          >
            <ArrowUp size={10} strokeWidth={2} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            onClick={() => void handleReorder(1)}
            disabled={!canMoveDown || saving}
            aria-label="Move down"
          >
            <ArrowDown size={10} strokeWidth={2} aria-hidden />
          </IconButton>
          <IconButton
            size="sm"
            tone="danger"
            onClick={() => setConfirmingDelete(true)}
            disabled={saving}
            aria-label="Delete mode"
          >
            <X size={10} strokeWidth={2} aria-hidden />
          </IconButton>
        </div>
      ) : null}
      {error ? (
        <p className="text-secondary text-[var(--color-figma-error)]">{error}</p>
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
    setAddSaving(true);
    setAddError("");
    try {
      await apiFetch(
        `${serverUrl}/api/collections/${encodeURIComponent(collection.id)}/modes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      setAdding(false);
      setAddValue("");
      onModeMutated?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setAddSaving(false);
    }
  }, [addValue, collection.id, onModeMutated, serverUrl]);

  const allModeNames = collection.modes.map((m) => m.name);

  return (
    <div>
      <SectionHeader>Modes</SectionHeader>
      <div className="px-3">
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
                <p className="mt-1 text-secondary text-[var(--color-figma-error)]">{addError}</p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-body text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <Plus size={11} strokeWidth={1.8} aria-hidden />
              Add mode
            </button>
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
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRenaming(false);
    setRenameError("");
  }, [collection?.id]);

  useLayoutEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

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

  if (!collection) {
    return (
      <div className={shellClass}>
        <div className={contentClass}>
          {showCloseButton ? (
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                aria-label="Close collection details"
              >
                <X size={12} strokeWidth={2} aria-hidden />
              </button>
            </div>
          ) : null}
          <div className="flex flex-1 items-center justify-center px-6 text-center text-body text-[var(--color-figma-text-secondary)]">
            Choose a collection to review its structure.
          </div>
        </div>
      </div>
    );
  }

  const tokenCount = collectionTokenCounts[collection.id] ?? 0;
  const modeCount = collection.modes.length;
  const savedDescription = collectionDescriptions[collection.id] ?? "";
  const currentDescription =
    editingMetadataCollectionId === collection.id ? metadataDescription : savedDescription;
  const descriptionDirty =
    editingMetadataCollectionId === collection.id && metadataDescription !== savedDescription;

  const canMerge =
    !!onMerge && collectionIds.some((collectionId) => collectionId !== collection.id);

  if (
    mergingCollectionId === collection.id &&
    onMergeClose &&
    onMergeTargetChange &&
    setMergeResolutions &&
    onMergeCheckConflicts &&
    onMergeConfirm
  ) {
    return (
      <div className={shellClass}>
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
      <div className={shellClass}>
        <div className={contentClass}>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            <div className="px-5 pb-4 pt-4">
              <div className="flex min-w-0 items-start gap-2">
                {renaming ? (
                  <div className="min-w-0 flex-1">
                    <input
                      ref={renameInputRef}
                      type="text"
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
                      className="w-full rounded bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-[17px] font-semibold tracking-tight text-[var(--color-figma-text)] outline-none focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)]"
                    />
                    {renameError ? (
                      <p className="mt-1 text-secondary text-[var(--color-figma-error)]">{renameError}</p>
                    ) : null}
                  </div>
                ) : (
                  <h2
                    className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-[var(--color-figma-text)]"
                    onDoubleClick={onRename ? startRename : undefined}
                    title={onRename ? "Double-click to rename" : undefined}
                  >
                    {getCollectionDisplayName(collection.id, collectionDisplayNames)}
                  </h2>
                )}
                {showCloseButton ? (
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

              {/* Inline description — auto-save on blur, no separate button */}
              <textarea
                value={currentDescription}
                onChange={(e) => setMetadataDescription?.(e.target.value)}
                onBlur={() => {
                  if (descriptionDirty) void onMetadataSave?.();
                }}
                rows={2}
                placeholder="Add a description…"
                className="mt-2 w-full resize-none bg-transparent p-0 text-body leading-[1.5] text-[var(--color-figma-text-secondary)] outline-none placeholder:text-[var(--color-figma-text-tertiary)]"
              />

              {/* Stats row */}
              <div className="mt-2 flex items-start gap-5">
                <Stat value={tokenCount} label={tokenCount === 1 ? "token" : "tokens"} />
                <Stat value={modeCount} label={modeCount === 1 ? "mode" : "modes"} />
              </div>
            </div>

            <ModesSection
              collection={collection}
              serverUrl={serverUrl}
              connected={connected}
              onModeMutated={onModeMutated}
              tokenCount={collectionTokenCounts[collection.id] ?? 0}
            />

            <SectionHeader>Structure</SectionHeader>
            <div className="px-3 pb-2">
              <ActionRow onClick={() => onDuplicate?.(collection.id)}>
                Duplicate collection
              </ActionRow>
              <ActionRow
                onClick={() => onMerge?.(collection.id)}
                disabled={!canMerge}
              >
                Merge into another collection…
              </ActionRow>
              <ActionRow onClick={() => onSplit?.(collection.id)}>
                Split by top-level groups…
              </ActionRow>
            </div>

            <div className="px-3 pb-4 pt-1">
              <ActionRow onClick={() => onDelete?.(collection.id)} tone="danger">
                Delete collection
              </ActionRow>
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
