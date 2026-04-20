import { useEffect } from "react";
import type { ReactNode, Ref } from "react";
import type { TokenCollection } from "@tokenmanager/core";
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
    <section className="border-t border-[var(--color-figma-border)] px-4 py-4 first:border-t-0">
      <div className="mb-3">
        <h3 className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CollectionDetailsPanel({
  collection,
  collectionIds,
  collectionTokenCounts,
  collectionDescriptions,
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
        <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-4 py-3">
          <h2 className="text-[11px] font-semibold text-[var(--color-figma-text)]">
            Collection setup
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close collection setup"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
          Select a collection in Tokens to review its structure.
        </div>
      </aside>
    );
  }

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
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
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
      <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-figma-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[11px] font-semibold text-[var(--color-figma-text)]">
              {collection.id}
            </h2>
            <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
              {collectionTokenCounts[collection.id] ?? 0} token
              {(collectionTokenCounts[collection.id] ?? 0) === 1 ? "" : "s"} in this collection
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close collection setup"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Description">
            <div className="space-y-2">
              <textarea
                value={
                  editingMetadataCollectionId === collection.id
                    ? metadataDescription
                    : collectionDescriptions[collection.id] ?? ""
                }
                onChange={(event) => setMetadataDescription?.(event.target.value)}
                rows={4}
                placeholder="What is this collection for?"
                className="w-full resize-none rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
              />
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => void onMetadataSave?.()}
                  className="shrink-0 rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </Section>

          <Section title="Organize" description="Structural changes to this collection.">
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] select-none">
                Rename, merge, split, or delete…
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {renamingCollectionId === collection.id ? (
                  <div className="space-y-2">
                    <input
                      ref={renameInputRef}
                      type="text"
                      value={renameValue}
                      onChange={(event) => setRenameValue?.(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void onRenameConfirm?.();
                        }
                        if (event.key === "Escape") {
                          onRenameCancel?.();
                        }
                      }}
                      className="w-full rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-1.5 text-[11px] text-[var(--color-figma-text)] outline-none focus-visible:border-[var(--color-figma-accent)]"
                    />
                    {renameError ? (
                      <p className="text-[10px] text-[var(--color-figma-error)]">{renameError}</p>
                    ) : null}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onRenameConfirm?.()}
                        className="rounded-md bg-[var(--color-figma-accent)] px-2.5 py-1 text-[10px] font-medium text-white"
                      >
                        Save name
                      </button>
                      <button
                        type="button"
                        onClick={onRenameCancel}
                        className="rounded-md px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRename?.(collection.id)}
                    className="flex w-full items-center justify-between rounded-md border border-[var(--color-figma-border)] px-2.5 py-2 text-left text-[11px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                  >
                    <span className="font-medium">Rename collection</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{collection.id}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDuplicate?.(collection.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--color-figma-border)] px-2.5 py-2 text-left text-[11px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span className="font-medium">Duplicate collection</span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Create a copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => onMerge?.(collection.id)}
                  disabled={!canMerge}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--color-figma-border)] px-2.5 py-2 text-left text-[11px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <span className="font-medium">Merge into another collection</span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {canMerge ? "Resolve conflicts first" : "Create another collection first"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onSplit?.(collection.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--color-figma-border)] px-2.5 py-2 text-left text-[11px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span className="font-medium">Split collection</span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Promote top-level groups</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete?.(collection.id)}
                  className="flex w-full items-center justify-between rounded-md border border-[var(--color-figma-error)]/30 px-2.5 py-2 text-left text-[11px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/10"
                >
                  <span className="font-medium">Delete collection</span>
                  <span className="text-[10px] text-[var(--color-figma-error)]/80">Remove permanently</span>
                </button>
              </div>
            </details>
          </Section>
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
