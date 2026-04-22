import { useEffect, useState } from "react";
import { useConnectionContext } from "../contexts/ConnectionContext";
import { apiFetch, createFetchSignal, combineAbortSignals } from "../shared/apiFetch";
import type {
  CollectionPreflightImpact,
  CollectionStructuralOperation,
  CollectionStructuralPreflight,
} from "../shared/collectionStructuralPreflight";

export function useCollectionStructuralPreflight({
  operation,
  collectionId,
  targetCollection,
  deleteOriginal,
  enabled,
}: {
  operation: CollectionStructuralOperation;
  collectionId: string | null;
  targetCollection?: string;
  deleteOriginal?: boolean;
  enabled: boolean;
}) {
  const { connected, serverUrl, getDisconnectSignal } = useConnectionContext();
  const [data, setData] = useState<CollectionStructuralPreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !connected || !collectionId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (operation === "merge" && !targetCollection) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    apiFetch<CollectionStructuralPreflight>(
      `${serverUrl}/api/collections/${encodeURIComponent(collectionId)}/preflight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          ...(targetCollection ? { targetCollection } : {}),
          ...(typeof deleteOriginal === "boolean" ? { deleteOriginal } : {}),
        }),
        signal: createFetchSignal(
          combineAbortSignals([controller.signal, getDisconnectSignal()]),
        ),
      },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setData(response);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to inspect collection dependencies",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    collectionId,
    connected,
    deleteOriginal,
    enabled,
    getDisconnectSignal,
    operation,
    serverUrl,
    targetCollection,
  ]);

  return { data, loading, error };
}

function CollectionPreflightCard({
  impact,
  label,
}: {
  impact: CollectionPreflightImpact;
  label?: string;
}) {
  const hasDependencies =
    impact.resolverRefs.length > 0 ||
    impact.generatedOwnership.length > 0 ||
    impact.generatorTargets.length > 0;

  return (
    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {label ? (
            <div className="mb-1 text-secondary uppercase tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
              {label}
            </div>
          ) : null}
          <div className="truncate font-mono text-body text-[var(--color-figma-text)]">
            {impact.collectionId}
          </div>
          <div className="text-secondary text-[var(--color-figma-text-secondary)]">
            {impact.tokenCount} token{impact.tokenCount === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {impact.metadata.description ? (
        <p className="mt-2 text-secondary text-[var(--color-figma-text-secondary)]">
          {impact.metadata.description}
        </p>
      ) : null}
      {!hasDependencies ? (
        <div className="mt-2 text-secondary text-[var(--color-figma-text-secondary)]">
          No linked resolver or generated group dependencies detected.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {impact.resolverRefs.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-secondary font-medium text-[var(--color-figma-text)]">
                Resolver refs ({impact.resolverRefs.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {impact.resolverRefs.map((resolver) => (
                  <span
                    key={resolver.name}
                    className="rounded border border-[var(--color-figma-border)] px-1.5 py-0.5 text-secondary text-[var(--color-figma-text-secondary)]"
                  >
                    {resolver.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {impact.generatedOwnership.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-secondary font-medium text-[var(--color-figma-text)]">
                Managed token ownership ({impact.generatedOwnership.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {impact.generatedOwnership.map((ownership) => (
                  <div
                    key={ownership.generatorId}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-secondary text-[var(--color-figma-text-secondary)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--color-figma-text)]">
                        {ownership.generatorName}
                      </span>
                      <span>
                        {ownership.tokenCount} token
                        {ownership.tokenCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {ownership.targetGroup ? (
                      <div className="mt-0.5 truncate font-mono text-secondary">
                        {ownership.targetGroup}
                      </div>
                    ) : null}
                    {ownership.samplePaths.length > 0 ? (
                      <div className="mt-1 truncate text-secondary opacity-80">
                        {ownership.samplePaths.join(", ")}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {impact.generatorTargets.length > 0 ? (
            <div className="flex flex-col gap-1">
              <div className="text-secondary font-medium text-[var(--color-figma-text)]">
                Generated group targets ({impact.generatorTargets.length})
              </div>
              <div className="flex flex-col gap-1">
                {impact.generatorTargets.map((generator) => (
                  <div
                    key={generator.generatorId}
                    className="flex items-center justify-between gap-2 text-secondary text-[var(--color-figma-text-secondary)]"
                  >
                    <span className="truncate">{generator.generatorName}</span>
                    <span className="truncate font-mono text-secondary">
                      {generator.targetGroup}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function getPreflightImpactLabel(params: {
  operation: CollectionStructuralOperation;
  impactName: string;
  sourceCollectionId?: string;
  targetCollectionId?: string;
  splitPreview?: Array<{
    key: string;
    newCollectionId: string;
    count: number;
    existing?: boolean;
  }>;
}): string | undefined {
  const {
    operation,
    impactName,
    sourceCollectionId,
    targetCollectionId,
    splitPreview = [],
  } = params;

  if (operation === "delete" && impactName === sourceCollectionId) {
    return "Collection being deleted";
  }
  if (operation === "merge") {
    if (impactName === sourceCollectionId) return "Source collection";
    if (impactName === targetCollectionId) return "Target collection";
  }
  if (operation === "split") {
    if (impactName === sourceCollectionId) return "Collection being split";
    if (
      splitPreview.some(
        (entry) => entry.existing && entry.newCollectionId === impactName,
      )
    ) {
      return "Existing split destination";
    }
  }

  return undefined;
}

function StructuralPreflightSummary({
  preflight,
  loading,
  error,
  sourceCollectionId,
  targetCollectionId,
  splitPreview,
}: {
  preflight: CollectionStructuralPreflight | null;
  loading: boolean;
  error: string | null;
  sourceCollectionId?: string;
  targetCollectionId?: string;
  splitPreview?: Array<{
    key: string;
    newCollectionId: string;
    count: number;
    existing?: boolean;
  }>;
}) {
  if (loading) {
    return (
      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-secondary text-[var(--color-figma-text-secondary)]">
        Checking what this affects…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 px-3 py-2 text-secondary text-[var(--color-figma-error)]">
        {error}
      </div>
    );
  }

  if (!preflight) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {preflight.blockers.length > 0 ? (
        <div className="rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 p-3">
          <div className="text-secondary font-medium text-[var(--color-figma-error)]">
            Blocking dependencies
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {preflight.blockers.map((blocker) => (
              <div
                key={blocker.id}
                className="text-secondary text-[var(--color-figma-error)]"
              >
                {blocker.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {preflight.warnings.length > 0 ? (
        <div className="rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 p-3">
          <div className="text-secondary font-medium text-[var(--color-figma-warning)]">
            Warnings
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {preflight.warnings.map((warning, index) => (
              <div
                key={`${index}-${warning}`}
                className="text-secondary text-[var(--color-figma-warning)]"
              >
                {warning}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {preflight.affectedCollections.map((impact) => (
          <CollectionPreflightCard
            key={impact.collectionId}
            impact={impact}
            label={getPreflightImpactLabel({
              operation: preflight.operation,
              impactName: impact.collectionId,
              sourceCollectionId,
              targetCollectionId,
              splitPreview,
            })}
          />
        ))}
      </div>
    </div>
  );
}

export function SetDeleteDialog({
  deletingCollectionId,
  preflight,
  preflightLoading,
  preflightError,
  onConfirm,
  onCancel,
}: {
  deletingCollectionId: string;
  preflight: CollectionStructuralPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const hasBlockingPreflight =
    !!preflightError ||
    preflightLoading ||
    (preflight?.blockers.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]">
      <div className="flex max-h-[80vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-4 py-3">
          <span className="text-heading font-semibold text-[var(--color-figma-text)]">
            Delete "{deletingCollectionId}"?
          </span>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close"
          >
            <svg
              width="12"
              height="12"
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
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <p className="text-secondary text-[var(--color-figma-text-secondary)]">
            Review linked previews and managed-token ownership before the
            collection is removed.
          </p>
          <StructuralPreflightSummary
            preflight={preflight}
            loading={preflightLoading}
            error={preflightError}
            sourceCollectionId={deletingCollectionId}
          />
        </div>
        <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={hasBlockingPreflight}
            className="flex-1 rounded bg-[var(--color-figma-error)] px-3 py-1.5 text-body font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Delete collection
          </button>
        </div>
      </div>
    </div>
  );
}

export function CollectionMergeInline({
  collectionIds,
  mergingCollectionId,
  preflight,
  preflightLoading,
  preflightError,
  mergeTargetCollectionId,
  mergeConflicts,
  mergeResolutions,
  mergeChecked,
  mergeLoading,
  onTargetChange,
  onSetResolutions,
  onCheckConflicts,
  onConfirm,
  onClose,
}: {
  collectionIds: string[];
  mergingCollectionId: string;
  preflight: CollectionStructuralPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  mergeTargetCollectionId: string;
  mergeConflicts: Array<{
    path: string;
    sourceValue: unknown;
    targetValue: unknown;
  }>;
  mergeResolutions: Record<string, "source" | "target">;
  mergeChecked: boolean;
  mergeLoading: boolean;
  onTargetChange: (target: string) => void;
  onSetResolutions: (
    updater:
      | Record<string, "source" | "target">
      | ((
          previous: Record<string, "source" | "target">,
        ) => Record<string, "source" | "target">),
  ) => void;
  onCheckConflicts: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const hasBlockingPreflight =
    !!preflightError ||
    preflightLoading ||
    (preflight?.blockers.length ?? 0) > 0;

  return (
    <>
      <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
        <span className="text-heading font-semibold text-[var(--color-figma-text)]">
          Copy tokens from &ldquo;{mergingCollectionId}&rdquo; into&hellip;
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          <label className="text-secondary text-[var(--color-figma-text-secondary)]">
            Target collection
          </label>
          <select
            value={mergeTargetCollectionId}
            onChange={(event) => onTargetChange(event.target.value)}
            aria-label="Merge target collection"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-body text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {collectionIds
              .filter((collectionId) => collectionId !== mergingCollectionId)
              .map((collectionId) => (
                <option key={collectionId} value={collectionId}>
                  {collectionId}
                </option>
              ))}
          </select>
        </div>
        <StructuralPreflightSummary
          preflight={preflight}
          loading={preflightLoading}
          error={preflightError}
          sourceCollectionId={mergingCollectionId}
          targetCollectionId={mergeTargetCollectionId}
        />
        {!mergeChecked ? (
          <p className="text-secondary text-[var(--color-figma-text-secondary)]">
            Tokens from{" "}
            <span className="font-mono font-medium">{mergingCollectionId}</span>{" "}
            will be added to{" "}
            <span className="font-mono font-medium">
              {mergeTargetCollectionId}
            </span>
            . The source collection stays in place. Conflicts where the target
            already has a different base value or different mode-authored values
            for the same token path will be shown for resolution.
          </p>
        ) : null}
        {mergeChecked && mergeConflicts.length === 0 ? (
          <p className="text-secondary text-[var(--color-figma-success)]">
            No conflicts — all tokens can be merged cleanly.
          </p>
        ) : null}
        {mergeChecked && mergeConflicts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-secondary text-[var(--color-figma-text-secondary)]">
              Resolve {mergeConflicts.length} conflict
              {mergeConflicts.length !== 1 ? "s" : ""} before merging.
            </p>
            <div className="flex flex-col gap-2 overflow-y-auto">
              {mergeConflicts.map((conflict) => (
                <div
                  key={conflict.path}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2"
                >
                  <div className="break-all font-mono text-secondary text-[var(--color-figma-text)]">
                    {conflict.path}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label
                      className={`rounded border px-2 py-1 text-secondary ${
                        mergeResolutions[conflict.path] === "source"
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`merge-${conflict.path}`}
                        checked={mergeResolutions[conflict.path] === "source"}
                        onChange={() =>
                          onSetResolutions((previous) => ({
                            ...previous,
                            [conflict.path]: "source",
                          }))
                        }
                        className="sr-only"
                      />
                      <div className="font-medium">Use source</div>
                      <div className="mt-0.5 break-all opacity-80">
                        {typeof conflict.sourceValue === "object"
                          ? JSON.stringify(conflict.sourceValue)
                          : String(conflict.sourceValue)}
                      </div>
                    </label>
                    <label
                      className={`rounded border px-2 py-1 text-secondary ${
                        mergeResolutions[conflict.path] === "target"
                          ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]"
                          : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`merge-${conflict.path}`}
                        checked={mergeResolutions[conflict.path] === "target"}
                        onChange={() =>
                          onSetResolutions((previous) => ({
                            ...previous,
                            [conflict.path]: "target",
                          }))
                        }
                        className="sr-only"
                      />
                      <div className="font-medium">Keep target</div>
                      <div className="mt-0.5 break-all opacity-80">
                        {typeof conflict.targetValue === "object"
                          ? JSON.stringify(conflict.targetValue)
                          : String(conflict.targetValue)}
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
        <button
          onClick={onClose}
          className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        {!mergeChecked ? (
          <button
            onClick={onCheckConflicts}
            disabled={
              mergeLoading || !mergeTargetCollectionId || hasBlockingPreflight
            }
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {mergeLoading ? "Checking…" : "Check conflicts"}
          </button>
        ) : (
          <button
            onClick={onConfirm}
            disabled={mergeLoading || hasBlockingPreflight}
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {mergeLoading ? "Copying…" : "Copy tokens"}
          </button>
        )}
      </div>
    </>
  );
}

export function SetSplitDialog({
  collectionIds,
  splittingCollectionId,
  preflight,
  preflightLoading,
  preflightError,
  splitPreview,
  splitDeleteOriginal,
  splitLoading,
  onSetDeleteOriginal,
  onConfirm,
  onClose,
}: {
  collectionIds: string[];
  splittingCollectionId: string;
  preflight: CollectionStructuralPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  splitPreview: Array<{ key: string; newCollectionId: string; count: number }>;
  splitDeleteOriginal: boolean;
  splitLoading: boolean;
  onSetDeleteOriginal: (value: boolean) => void;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const effectiveSplitPreview = preflight?.splitPreview ?? splitPreview;
  const hasBlockingPreflight =
    !!preflightError ||
    preflightLoading ||
    (preflight?.blockers.length ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]">
      <div className="flex max-h-[80vh] w-[34rem] max-w-[calc(100vw-2rem)] flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--color-figma-border)] px-4 py-3">
          <span className="text-heading font-semibold text-[var(--color-figma-text)]">
            Split "{splittingCollectionId}"
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            aria-label="Close"
          >
            <svg
              width="12"
              height="12"
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
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <StructuralPreflightSummary
            preflight={preflight}
            loading={preflightLoading}
            error={preflightError}
            sourceCollectionId={splittingCollectionId}
            splitPreview={effectiveSplitPreview}
          />
          {effectiveSplitPreview.length === 0 ? (
            <p className="text-secondary text-[var(--color-figma-text-secondary)]">
              No top-level groups found in this collection to split.
            </p>
          ) : (
            <>
              <p className="text-secondary text-[var(--color-figma-text-secondary)]">
                Creates {effectiveSplitPreview.length} new collection
                {effectiveSplitPreview.length !== 1 ? "s" : ""} from top-level
                groups:
              </p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {effectiveSplitPreview.map((preview) => (
                  <div
                    key={preview.key}
                    className="flex items-center justify-between rounded bg-[var(--color-figma-bg-hover)] px-2 py-1"
                  >
                    <span className="truncate font-mono text-body text-[var(--color-figma-text)]">
                      {preview.newCollectionId}
                    </span>
                    <span className="ml-2 shrink-0 text-secondary text-[var(--color-figma-text-secondary)]">
                      {preview.count} token{preview.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
              {effectiveSplitPreview.some((preview) =>
                collectionIds.includes(preview.newCollectionId),
              ) ? (
                <p className="text-secondary text-[var(--color-figma-warning)]">
                  Some collections already exist and will be skipped.
                </p>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitDeleteOriginal}
                  onChange={(event) => onSetDeleteOriginal(event.target.checked)}
                  className="h-3 w-3 rounded"
                />
                <span className="text-body text-[var(--color-figma-text)]">
                  Delete "{splittingCollectionId}" after split
                </span>
              </label>
            </>
          )}
        </div>
        <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-body text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={
              splitLoading ||
              effectiveSplitPreview.length === 0 ||
              hasBlockingPreflight
            }
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-body font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {splitLoading ? "Splitting…" : "Split"}
          </button>
        </div>
      </div>
    </div>
  );
}
