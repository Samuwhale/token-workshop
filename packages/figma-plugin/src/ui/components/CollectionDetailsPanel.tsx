import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import type { ReactNode, Ref } from "react";
import type { TokenCollection } from "@tokenmanager/core";
import { apiFetch } from "../shared/apiFetch";
import {
  CollectionMergeInline,
  SetDeleteDialog,
  SetSplitDialog,
  useCollectionStructuralPreflight,
} from "./CollectionStructureDialogs";

interface CollectionDetailsPanelProps {
  collection: TokenCollection | null;
  collectionIds: string[];
  collectionTokenCounts: Record<string, number>;
  collectionDescriptions: Record<string, string>;
  serverUrl: string;
  connected: boolean;
  onModeMutated?: () => void;
  onClose: () => void;
  onRename?: (collectionId: string) => void;
  onDuplicate?: (collectionId: string) => void;
  onDelete?: (collectionId: string) => void;
  onEditInfo?: (collectionId: string) => void;
  onMerge?: (collectionId: string) => void;
  onSplit?: (collectionId: string) => void;
  renamingCollectionId?: string | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  renameError?: string;
  renameInputRef?: Ref<HTMLInputElement>;
  onRenameConfirm?: () => void;
  onRenameCancel?: () => void;
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

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-figma-border)] px-5 py-4 first:border-t-0">
      <div className="mb-3">
        <h3 className="text-body font-semibold text-[var(--color-figma-text)]">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
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
      <div className="rounded-md border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/5 px-2.5 py-2">
        <p className="text-secondary text-[var(--color-figma-text)]">
          Delete mode? {tokenCount} token{tokenCount === 1 ? "" : "s"} may lose values.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={saving}
            className="rounded-md bg-[var(--color-figma-error)] px-2 py-0.5 text-secondary font-medium text-white disabled:opacity-50"
          >
            {saving ? "Deleting..." : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={saving}
            className="rounded-md px-2 py-0.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
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
      <div className="space-y-1">
        <input
          ref={inputRef}
          type="text"
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
          className="w-full rounded-md border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none"
        />
        {error ? (
          <p className="text-secondary text-[var(--color-figma-error)]">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors hover:bg-[var(--color-figma-bg-hover)]">
      <span
        className="flex-1 cursor-default truncate text-body text-[var(--color-figma-text)]"
        onDoubleClick={() => {
          if (connected) {
            setRenameValue(modeName);
            setRenaming(true);
          }
        }}
        title="Double-click to rename"
      >
        {modeName}
      </span>
      {connected && allModeNames.length > 1 ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => void handleReorder(-1)}
            disabled={!canMoveUp || saving}
            className="rounded p-0.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-30"
            aria-label="Move up"
          >
            <ChevronUp size={10} strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => void handleReorder(1)}
            disabled={!canMoveDown || saving}
            className="rounded p-0.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-30"
            aria-label="Move down"
          >
            <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={saving}
            className="rounded p-0.5 text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10 disabled:opacity-30"
            aria-label="Delete mode"
          >
            <X size={10} strokeWidth={2.5} aria-hidden />
          </button>
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
  const isSingleDefault =
    collection.modes.length === 1 && collection.modes[0].name === "Mode 1";

  return (
    <Section title="Modes">
      <div className="space-y-1">
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
      </div>
      {isSingleDefault ? (
        <p className="mt-2 text-secondary text-[var(--color-figma-text-tertiary)]">
          Add another mode to enable multi-mode tokens.
        </p>
      ) : null}
      {connected ? (
        <div className="mt-2">
          {adding ? (
            <div className="space-y-1">
              <input
                ref={addInputRef}
                type="text"
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
                disabled={addSaving}
                placeholder="Mode name"
                className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
              />
              {addError ? (
                <p className="text-secondary text-[var(--color-figma-error)]">{addError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleAdd()}
                  disabled={addSaving || !addValue.trim()}
                  className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-secondary font-medium text-white disabled:opacity-50"
                >
                  {addSaving ? "Adding..." : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setAddValue("");
                    setAddError("");
                  }}
                  disabled={addSaving}
                  className="rounded-md px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              <Plus size={10} strokeWidth={2.5} aria-hidden />
              Add mode
            </button>
          )}
        </div>
      ) : null}
    </Section>
  );
}

export function CollectionDetailsPanel({
  collection,
  collectionIds,
  collectionTokenCounts,
  collectionDescriptions,
  serverUrl,
  connected,
  onModeMutated,
  onClose,
  onRename,
  onDuplicate,
  onDelete,
  onEditInfo,
  onMerge,
  onSplit,
  renamingCollectionId = null,
  renameValue = "",
  setRenameValue,
  renameError = "",
  renameInputRef,
  onRenameConfirm,
  onRenameCancel,
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

  if (!collection) {
    return (
      <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-5 py-3">
          <h2 className="text-body font-semibold text-[var(--color-figma-text)]">
            Collection setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close collection setup"
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-body text-[var(--color-figma-text-secondary)]">
          Select a collection in Tokens to review its structure.
        </div>
      </aside>
    );
  }

  const tokenCount = collectionTokenCounts[collection.id] ?? 0;
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
      <aside className="flex h-full w-[360px] max-w-full shrink-0 flex-col overflow-hidden border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <CollectionMergeInline
          collectionIds={collectionIds}
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
      </aside>
    );
  }

  return (
    <>
      <aside className="flex h-full w-[360px] max-w-full shrink-0 flex-col overflow-hidden border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-5 py-3">
          <div className="min-w-0 flex-1">
            {renamingCollectionId === collection.id ? (
              <div className="space-y-1">
                <input
                  ref={renameInputRef}
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onRenameConfirm?.();
                    if (e.key === "Escape") onRenameCancel?.();
                  }}
                  className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg-secondary)] px-1.5 py-0.5 text-body font-semibold text-[var(--color-figma-text)] outline-none"
                />
                {renameError ? (
                  <p className="text-secondary text-[var(--color-figma-error)]">{renameError}</p>
                ) : null}
              </div>
            ) : (
              <h2
                className="cursor-default truncate text-body font-semibold text-[var(--color-figma-text)]"
                onDoubleClick={() => onRename?.(collection.id)}
                title="Double-click to rename"
              >
                {collection.id}
              </h2>
            )}
            <p className="mt-0.5 text-secondary text-[var(--color-figma-text-secondary)]">
              {tokenCount} token{tokenCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close"
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-5 py-4">
            <textarea
              value={currentDescription}
              onChange={(e) => setMetadataDescription?.(e.target.value)}
              rows={3}
              placeholder="What is this collection for?"
              className="w-full resize-none rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-body text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
            />
            {descriptionDirty ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => void onMetadataSave?.()}
                  className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-secondary font-medium text-white"
                >
                  Save
                </button>
              </div>
            ) : null}
          </div>

          <ModesSection
            collection={collection}
            serverUrl={serverUrl}
            connected={connected}
            onModeMutated={onModeMutated}
            tokenCount={collectionTokenCounts[collection.id] ?? 0}
          />

          <div className="border-t border-[var(--color-figma-border)] py-1">
            <button
              type="button"
              onClick={() => onRename?.(collection.id)}
              className="w-full px-5 py-2 text-left text-body text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Rename
            </button>
            <button
              type="button"
              onClick={() => onDuplicate?.(collection.id)}
              className="w-full px-5 py-2 text-left text-body text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => onMerge?.(collection.id)}
              disabled={!canMerge}
              className="w-full px-5 py-2 text-left text-body text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              Merge into another collection
            </button>
            <button
              type="button"
              onClick={() => onSplit?.(collection.id)}
              className="w-full px-5 py-2 text-left text-body text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            >
              Split by top-level groups
            </button>
          </div>
          <div className="border-t border-[var(--color-figma-border)] py-1">
            <button
              type="button"
              onClick={() => onDelete?.(collection.id)}
              className="w-full px-5 py-2 text-left text-body text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10"
            >
              Delete collection
            </button>
          </div>
        </div>
      </aside>

      {deletingCollectionId === collection.id && onDeleteConfirm && onDeleteCancel ? (
        <SetDeleteDialog
          deletingCollectionId={deletingCollectionId}
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
        <SetSplitDialog
          collectionIds={collectionIds}
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
