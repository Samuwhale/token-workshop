import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { RefObject, ReactNode } from "react";
import { fuzzyScore } from "../shared/fuzzyMatch";
import {
  apiFetch,
  createFetchSignal,
  isNetworkError,
} from "../shared/apiFetch";
import { useConnectionContext } from "../contexts/ConnectionContext";
import { useTokenSetsContext } from "../contexts/TokenDataContext";
import { useSetMetadata } from "../hooks/useSetMetadata";
import type {
  SetPreflightImpact,
  SetStructuralOperation,
  SetStructuralPreflight,
} from "../shared/setStructuralPreflight";
import { dispatchToast } from "../shared/toastBus";

interface FolderGroup {
  folder: string;
  sets: string[];
}

type GroupItem = string | FolderGroup;

interface ManageFolderGroup extends FolderGroup {
  totalSetCount: number;
}

type ManageItem = string | ManageFolderGroup;

interface FolderRenameResponse {
  ok: true;
  folder: string;
  newFolder: string;
  renamedSets: Array<{ from: string; to: string }>;
  sets: string[];
}

interface FolderMergeResponse {
  ok: true;
  sourceFolder: string;
  targetFolder: string;
  movedSets: Array<{ from: string; to: string }>;
  sets: string[];
}

interface FolderDeleteResponse {
  ok: true;
  folder: string;
  deletedSets: string[];
  sets: string[];
}

interface FolderReorderResponse {
  ok: true;
  sets: string[];
}

interface SetSwitcherProps {
  sets: string[];
  activeSet: string;
  onSelect: (set: string) => void;
  onClose: () => void;
  onManageSets?: () => void;
  onOpenCreateSet?: () => void;
}

interface SetManagerProps {
  sets: string[];
  activeSet: string;
  onClose: () => void;
  onOpenQuickSwitch?: () => void;
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: "left" | "right") => void;
  onReorderFull?: (newOrder: string[]) => void;
  onOpenCreateSet?: () => void;
  onEditInfo?: (setName: string) => void;
  onMerge?: (setName: string) => void;
  onSplit?: (setName: string) => void;
  setTokenCounts?: Record<string, number>;
  setDescriptions?: Record<string, string>;
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (
    moves: Array<{ from: string; to: string }>,
  ) => Promise<void>;
  renamingSet?: string | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  renameError?: string;
  setRenameError?: (value: string) => void;
  renameInputRef?: RefObject<HTMLInputElement | null>;
  onRenameConfirm?: () => void;
  onRenameCancel?: () => void;
  editingMetadataSet?: string | null;
  metadataDescription?: string;
  setMetadataDescription?: (value: string) => void;
  metadataCollectionName?: string;
  setMetadataCollectionName?: (value: string) => void;
  metadataModeName?: string;
  setMetadataModeName?: (value: string) => void;
  onMetadataClose?: () => void;
  onMetadataSave?: () => void;
  deletingSet?: string | null;
  onDeleteConfirm?: () => void | Promise<void>;
  onDeleteCancel?: () => void;
  mergingSet?: string | null;
  mergeTargetSet?: string;
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
  splittingSet?: string | null;
  splitPreview?: Array<{ key: string; newName: string; count: number }>;
  splitDeleteOriginal?: boolean;
  splitLoading?: boolean;
  setSplitDeleteOriginal?: (value: boolean) => void;
  onSplitConfirm?: () => void | Promise<void>;
  onSplitClose?: () => void;
}

function useSetStructuralPreflight({
  operation,
  setName,
  targetSet,
  deleteOriginal,
  enabled,
}: {
  operation: SetStructuralOperation;
  setName: string | null;
  targetSet?: string;
  deleteOriginal?: boolean;
  enabled: boolean;
}) {
  const { connected, serverUrl, getDisconnectSignal } = useConnectionContext();
  const [data, setData] = useState<SetStructuralPreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !connected || !setName) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (operation === "merge" && !targetSet) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiFetch<SetStructuralPreflight>(
      `${serverUrl}/api/sets/${encodeURIComponent(setName)}/preflight`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation,
          ...(targetSet ? { targetSet } : {}),
          ...(typeof deleteOriginal === "boolean" ? { deleteOriginal } : {}),
        }),
        signal: createFetchSignal(
          AbortSignal.any([controller.signal, getDisconnectSignal()]),
        ),
      },
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setData(response);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(
            err instanceof Error
              ? err.message
              : "Failed to inspect set dependencies",
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
    connected,
    deleteOriginal,
    enabled,
    getDisconnectSignal,
    operation,
    serverUrl,
    setName,
    targetSet,
  ]);

  return { data, loading, error };
}

function SetPreflightCard({
  impact,
  label,
}: {
  impact: SetPreflightImpact;
  label?: string;
}) {
  const hasDependencies =
    impact.resolverRefs.length > 0 ||
    impact.generatedOwnership.length > 0 ||
    impact.recipeTargets.length > 0 ||
    !!impact.metadata.description ||
    !!impact.metadata.collectionName ||
    !!impact.metadata.modeName;

  return (
    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {label && (
            <div className="mb-1 text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
              {label}
            </div>
          )}
          <div className="truncate font-mono text-[11px] text-[var(--color-figma-text)]">
            {impact.name}
          </div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
            {impact.tokenCount} token{impact.tokenCount === 1 ? "" : "s"}
          </div>
        </div>
        {(impact.metadata.collectionName || impact.metadata.modeName) && (
          <div className="text-right text-[9px] text-[var(--color-figma-text-secondary)]">
            {impact.metadata.collectionName && (
              <div>Collection: {impact.metadata.collectionName}</div>
            )}
            {impact.metadata.modeName && (
              <div>Mode: {impact.metadata.modeName}</div>
            )}
          </div>
        )}
      </div>
      {impact.metadata.description && (
        <p className="mt-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          {impact.metadata.description}
        </p>
      )}
      {!hasDependencies ? (
        <div className="mt-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          No resolver, metadata, or recipe dependencies detected.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {impact.resolverRefs.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                Resolver refs ({impact.resolverRefs.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {impact.resolverRefs.map((resolver) => (
                  <span
                    key={resolver.name}
                    className="rounded border border-[var(--color-figma-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]"
                  >
                    {resolver.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {impact.generatedOwnership.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                Managed token ownership ({impact.generatedOwnership.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {impact.generatedOwnership.map((ownership) => (
                  <div
                    key={ownership.recipeId}
                    className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--color-figma-text)]">
                        {ownership.recipeName}
                      </span>
                      <span>
                        {ownership.tokenCount} token
                        {ownership.tokenCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    {ownership.targetGroup && (
                      <div className="mt-0.5 truncate font-mono text-[9px]">
                        {ownership.targetGroup}
                      </div>
                    )}
                    {ownership.samplePaths.length > 0 && (
                      <div className="mt-1 truncate text-[9px] opacity-80">
                        {ownership.samplePaths.join(", ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {impact.recipeTargets.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
                Recipe targets ({impact.recipeTargets.length})
              </div>
              <div className="flex flex-col gap-1">
                {impact.recipeTargets.map((recipe) => (
                  <div
                    key={recipe.recipeId}
                    className="flex items-center justify-between gap-2 text-[10px] text-[var(--color-figma-text-secondary)]"
                  >
                    <span className="truncate">{recipe.recipeName}</span>
                    <span className="truncate font-mono text-[9px]">
                      {recipe.targetGroup}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getPreflightImpactLabel(params: {
  operation: SetStructuralOperation;
  impactName: string;
  sourceSetName?: string;
  targetSetName?: string;
  splitPreview?: Array<{
    key: string;
    newName: string;
    count: number;
    existing?: boolean;
  }>;
}): string | undefined {
  const {
    operation,
    impactName,
    sourceSetName,
    targetSetName,
    splitPreview = [],
  } = params;
  if (operation === "delete" && impactName === sourceSetName) {
    return "Set being deleted";
  }
  if (operation === "merge") {
    if (impactName === sourceSetName) return "Source set";
    if (impactName === targetSetName) return "Target set";
  }
  if (operation === "split") {
    if (impactName === sourceSetName) return "Set being split";
    if (
      splitPreview.some(
        (entry) => entry.existing && entry.newName === impactName,
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
  sourceSetName,
  targetSetName,
  splitPreview,
}: {
  preflight: SetStructuralPreflight | null;
  loading: boolean;
  error: string | null;
  sourceSetName?: string;
  targetSetName?: string;
  splitPreview?: Array<{
    key: string;
    newName: string;
    count: number;
    existing?: boolean;
  }>;
}) {
  if (loading) {
    return (
      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
        Loading dependency preflight…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 px-3 py-2 text-[10px] text-[var(--color-figma-error)]">
        {error}
      </div>
    );
  }
  if (!preflight) return null;

  return (
    <div className="flex flex-col gap-3">
      {preflight.blockers.length > 0 && (
        <div className="rounded border border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 p-3">
          <div className="text-[10px] font-medium text-[var(--color-figma-error)]">
            Blocking dependencies
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {preflight.blockers.map((blocker) => (
              <div key={blocker.id} className="text-[10px] text-[var(--color-figma-error)]">
                {blocker.message}
              </div>
            ))}
          </div>
        </div>
      )}
      {preflight.warnings.length > 0 && (
        <div className="rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/10 p-3">
          <div className="text-[10px] font-medium text-[var(--color-figma-warning)]">Warnings</div>
          <div className="mt-1 flex flex-col gap-1">
            {preflight.warnings.map((warning, index) => (
              <div
                key={`${index}-${warning}`}
                className="text-[10px] text-[var(--color-figma-warning)]"
              >
                {warning}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {preflight.affectedSets.map((impact) => (
          <SetPreflightCard
            key={impact.name}
            impact={impact}
            label={getPreflightImpactLabel({
              operation: preflight.operation,
              impactName: impact.name,
              sourceSetName,
              targetSetName,
              splitPreview,
            })}
          />
        ))}
      </div>
    </div>
  );
}

function buildFolderGroups(sets: string[]): GroupItem[] {
  const folderMap = new Map<string, string[]>();
  for (const set of sets) {
    const slashIdx = set.indexOf("/");
    if (slashIdx === -1) continue;
    const folder = set.slice(0, slashIdx);
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(set);
  }

  const result: GroupItem[] = [];
  const seenFolders = new Set<string>();
  for (const set of sets) {
    const slashIdx = set.indexOf("/");
    if (slashIdx === -1) {
      result.push(set);
      continue;
    }
    const folder = set.slice(0, slashIdx);
    if (seenFolders.has(folder)) continue;
    seenFolders.add(folder);
    result.push({ folder, sets: folderMap.get(folder)! });
  }
  return result;
}

function buildManageItems(sets: string[], filtered: string[]): ManageItem[] {
  const filteredLookup = new Set(filtered);
  return buildFolderGroups(sets).reduce<ManageItem[]>((result, item) => {
    if (typeof item === "string") {
      if (filteredLookup.has(item)) {
        result.push(item);
      }
      return result;
    }
    const visibleSets = item.sets.filter((set) => filteredLookup.has(set));
    if (visibleSets.length > 0) {
      result.push({
        folder: item.folder,
        sets: visibleSets,
        totalSetCount: item.sets.length,
      });
    }
    return result;
  }, []);
}

function folderItemKey(folder: string): string {
  return `${folder}/`;
}

function isSetInFolder(setName: string, folder: string): boolean {
  return setName.startsWith(`${folder}/`);
}

function replaceFolderPrefix(
  setName: string,
  fromFolder: string,
  toFolder: string,
): string {
  return `${toFolder}${setName.slice(fromFolder.length)}`;
}

function buildTopLevelItemOrder(sets: string[]): string[] {
  return buildFolderGroups(sets).map((item) =>
    typeof item === "string" ? item : folderItemKey(item.folder),
  );
}

function SetNameDisplay({ name }: { name: string }) {
  const slash = name.lastIndexOf("/");
  if (slash === -1) return <span>{name}</span>;
  return (
    <>
      <span className="text-[var(--color-figma-text-secondary)]">
        {name.slice(0, slash + 1)}
      </span>
      <span>{name.slice(slash + 1)}</span>
    </>
  );
}

function leafName(setName: string): string {
  const idx = setName.lastIndexOf("/");
  return idx === -1 ? setName : setName.slice(idx + 1);
}

const FOLDER_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

function filterSets(sets: string[], query: string): string[] {
  if (!query) return sets;
  return sets
    .map((set) => ({ set, score: fuzzyScore(query, set) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ set }) => set);
}

function matchesMappingManagerQuery({
  query,
  setName,
  description,
  collectionName,
  modeName,
}: {
  query: string;
  setName: string;
  description: string;
  collectionName: string;
  modeName: string;
}): boolean {
  if (!query) return true;
  const lowered = query.trim().toLowerCase();
  if (!lowered) return true;
  return [setName, description, collectionName, modeName].some((value) =>
    value.toLowerCase().includes(lowered),
  );
}

export function SetSwitcher({
  sets,
  activeSet,
  onSelect,
  onClose,
  onManageSets,
  onOpenCreateSet,
}: SetSwitcherProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(() => {
    const idx = sets.indexOf(activeSet);
    return idx >= 0 ? idx : 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterSets(sets, query), [sets, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const idx = filtered.indexOf(activeSet);
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [filtered, activeSet]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const setName = filtered[activeIdx];
    if (!setName) return;
    const active = list.querySelector(
      `[data-set-name="${setName.replace(/"/g, '\\"')}"]`,
    ) as HTMLElement | null;
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((index) => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((index) => Math.max(index - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const set = filtered[activeIdx];
      if (set) {
        onSelect(set);
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--color-figma-overlay)] pt-16"
      onClick={onClose}
    >
      <div
        className="mx-3 flex w-full flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-2xl"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Switch token set"
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-figma-border)] px-3 py-2.5">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="shrink-0 text-[var(--color-figma-text-secondary)]"
          >
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9l3 3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Switch to set…"
            aria-label="Filter token sets"
            className="flex-1 bg-transparent text-[12px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)]"
          />
          <kbd className="shrink-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-1 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            ESC
          </kbd>
        </div>

        <SwitchView
          listRef={listRef}
          filtered={filtered}
          activeSet={activeSet}
          activeIdx={activeIdx}
          query={query}
          onSelect={(set) => {
            onSelect(set);
            onClose();
          }}
        />

        <div className="flex items-center justify-between border-t border-[var(--color-figma-border)] px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          <span>
            {filtered.length === sets.length
              ? `${sets.length} set${sets.length !== 1 ? "s" : ""}`
              : `${filtered.length} of ${sets.length} sets`}
          </span>
          <div className="flex items-center gap-2">
            {onOpenCreateSet && (
              <button
                onClick={onOpenCreateSet}
                className="rounded px-1.5 py-0.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                New set
              </button>
            )}
            {onManageSets && (
              <button
                onClick={onManageSets}
                className="rounded px-1.5 py-0.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                Manage sets
              </button>
            )}
            <span className="opacity-60">↑↓ navigate · ↵ switch</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SwitchViewProps {
  listRef: RefObject<HTMLDivElement | null>;
  filtered: string[];
  activeSet: string;
  activeIdx: number;
  query: string;
  onSelect: (set: string) => void;
}

function SwitchView({
  listRef,
  filtered,
  activeSet,
  activeIdx,
  query,
  onSelect,
}: SwitchViewProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (query) setCollapsedFolders(new Set());
  }, [query]);

  useEffect(() => {
    const set = filtered[activeIdx];
    if (!set) return;
    const slashIdx = set.indexOf("/");
    if (slashIdx === -1) return;
    const folder = set.slice(0, slashIdx);
    if (!collapsedFolders.has(folder)) return;
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.delete(folder);
      return next;
    });
  }, [activeIdx, filtered, collapsedFolders]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const hasFolders = filtered.some((set) => set.includes("/"));
  const groups = hasFolders ? buildFolderGroups(filtered) : null;

  const renderSetButton = (set: string, indented: boolean) => {
    const isCurrent = set === activeSet;
    const isHighlighted = filtered[activeIdx] === set;
    const label = indented ? set.slice(set.indexOf("/") + 1) : null;
    return (
      <button
        key={set}
        data-set-name={set}
        onClick={() => onSelect(set)}
        className={`flex w-full items-center justify-between py-2 pr-3 text-left text-[12px] transition-colors ${indented ? "pl-6" : "px-3"} ${isHighlighted ? "bg-[var(--color-figma-bg-hover)]" : "hover:bg-[var(--color-figma-bg-hover)]"}`}
        role="option"
        aria-selected={isCurrent}
      >
        <span
          className={`flex min-w-0 flex-1 items-center ${isCurrent ? "text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text)]"}`}
        >
          {label !== null ? (
            <span>{label}</span>
          ) : (
            <SetNameDisplay name={set} />
          )}
        </span>
        {isCurrent && (
          <span className="ml-2 shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
            active
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      ref={listRef as RefObject<HTMLDivElement>}
      className="flex-1 overflow-y-auto"
      role="listbox"
      aria-label="Token sets"
    >
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
          No sets match &ldquo;{query}&rdquo;
        </div>
      ) : groups ? (
        groups.map((group) => {
          if (typeof group === "string") return renderSetButton(group, false);
          const isCollapsed = collapsedFolders.has(group.folder);
          const hasActiveSet = group.sets.includes(activeSet);
          return (
            <div key={group.folder}>
              <button
                onClick={() => toggleFolder(group.folder)}
                className="flex w-full items-center gap-1.5 border-b border-[var(--color-figma-border)] px-2.5 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  className={`shrink-0 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <span className="font-medium">{group.folder}/</span>
                <span className="text-[10px] opacity-50">
                  {group.sets.length}
                </span>
                {hasActiveSet && isCollapsed && (
                  <span
                    className="ml-auto leading-none text-[var(--color-figma-accent)]"
                    aria-label="contains active set"
                  >
                    ●
                  </span>
                )}
              </button>
              {!isCollapsed &&
                group.sets.map((set) => renderSetButton(set, true))}
            </div>
          );
        })
      ) : (
        filtered.map((set) => renderSetButton(set, false))
      )}
    </div>
  );
}

export function SetManager({
  sets,
  activeSet,
  onClose,
  onOpenQuickSwitch,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onReorderFull,
  onOpenCreateSet,
  onEditInfo,
  onMerge,
  onSplit,
  setTokenCounts = {},
  setDescriptions = {},
  onBulkDelete,
  onBulkDuplicate,
  onBulkMoveToFolder,
  renamingSet = null,
  renameValue = "",
  setRenameValue,
  renameError = "",
  setRenameError,
  renameInputRef,
  onRenameConfirm,
  onRenameCancel,
  editingMetadataSet = null,
  metadataDescription = "",
  setMetadataDescription,
  metadataCollectionName = "",
  setMetadataCollectionName,
  metadataModeName = "",
  setMetadataModeName,
  onMetadataClose,
  onMetadataSave,
  deletingSet = null,
  onDeleteConfirm,
  onDeleteCancel,
  mergingSet = null,
  mergeTargetSet = "",
  mergeConflicts = [],
  mergeResolutions = {},
  mergeChecked = false,
  mergeLoading = false,
  onMergeTargetChange,
  setMergeResolutions,
  onMergeCheckConflicts,
  onMergeConfirm,
  onMergeClose,
  splittingSet = null,
  splitPreview = [],
  splitDeleteOriginal = false,
  splitLoading = false,
  setSplitDeleteOriginal,
  onSplitConfirm,
  onSplitClose,
}: SetManagerProps) {
  const { serverUrl, connected } = useConnectionContext();
  const {
    setDescriptions: metadataDescriptions,
    setCollectionNames,
    setModeNames,
    updateSetMetadataInState,
  } = useTokenSetsContext();
  const [query, setQuery] = useState("");
  const deletePreflight = useSetStructuralPreflight({
    operation: "delete",
    setName: deletingSet,
    enabled: !!deletingSet && !!onDeleteConfirm,
  });
  const mergePreflight = useSetStructuralPreflight({
    operation: "merge",
    setName: mergingSet,
    targetSet: mergeTargetSet,
    enabled: !!mergingSet && !!mergeTargetSet && !!onMergeConfirm,
  });
  const splitPreflight = useSetStructuralPreflight({
    operation: "split",
    setName: splittingSet,
    deleteOriginal: splitDeleteOriginal,
    enabled: !!splittingSet && !!onSplitConfirm,
  });
  const {
    metadataManagerRows,
    metadataManagerDirtyCount,
    metadataManagerSaving,
    updateMetadataManagerField,
    resetMetadataManager,
    saveMetadataManager,
  } = useSetMetadata({
    serverUrl,
    connected,
    setDescriptions: metadataDescriptions,
    setCollectionNames,
    setModeNames,
    updateSetMetadataInState,
    onError: (message) => dispatchToast(message, "error"),
    onSuccess: (message) => dispatchToast(message, "success"),
    sets,
  });

  const filtered = useMemo(() => filterSets(sets, query), [sets, query]);
  const visibleMetadataRows = useMemo(
    () =>
      metadataManagerRows.filter((row) =>
        matchesMappingManagerQuery({
          query,
          setName: row.setName,
          description: row.description,
          collectionName: row.collectionName,
          modeName: row.modeName,
        }),
      ),
    [metadataManagerRows, query],
  );

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
            aria-label="Back"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6.5 2L3.5 5l3 3" />
            </svg>
            Back
          </button>
          <span className="ml-1 text-[10px] font-medium text-[var(--color-figma-text)]">
            Manage sets
          </span>
          {onOpenQuickSwitch && (
            <button
              onClick={onOpenQuickSwitch}
              className="ml-auto rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
            >
              Quick switch
            </button>
          )}
        </div>

        {mergingSet &&
          onMergeClose &&
          onMergeTargetChange &&
          setMergeResolutions &&
          onMergeCheckConflicts &&
          onMergeConfirm ? (
          <SetMergeInline
            sets={sets}
            mergingSet={mergingSet}
            preflight={mergePreflight.data}
            preflightLoading={mergePreflight.loading}
            preflightError={mergePreflight.error}
            mergeTargetSet={mergeTargetSet}
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
        ) : (
          <>
            <div className="border-b border-[var(--color-figma-border)] px-3 py-2">
              <div className="flex items-center gap-2">
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="shrink-0 text-[var(--color-figma-text-secondary)]"
                >
                  <circle cx="6" cy="6" r="4" />
                  <path d="M9 9l3 3" />
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter sets…"
                  aria-label="Filter token sets"
                  className="flex-1 bg-transparent text-[12px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)]"
                />
                {onOpenCreateSet && (
                  <button
                    onClick={onOpenCreateSet}
                    className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[11px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
                  >
                    New set
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                <span>
                  {sets.length} set{sets.length !== 1 ? "s" : ""}
                </span>
                <span>·</span>
                <span>Active: {activeSet}</span>
                <span>·</span>
                <span>
                  Use this for naming, folders, ordering, Figma routing,
                  merges, splits, and bulk actions.
                </span>
              </div>
            </div>

            <ManageView
              filtered={filtered}
              sets={sets}
              activeSet={activeSet}
              query={query}
              topContent={
                <SetMappingManager
                  rows={metadataManagerRows}
                  visibleRows={visibleMetadataRows}
                  dirtyCount={metadataManagerDirtyCount}
                  saving={metadataManagerSaving}
                  onFieldChange={updateMetadataManagerField}
                  onResetRow={(setName) => resetMetadataManager(setName)}
                  onResetAll={() => resetMetadataManager()}
                  onSaveRow={(setName) => saveMetadataManager([setName])}
                  onSaveAll={() => saveMetadataManager()}
                />
              }
              setTokenCounts={setTokenCounts}
              setDescriptions={setDescriptions}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onReorder={onReorder}
              onReorderFull={onReorderFull}
              onEditInfo={onEditInfo}
              onMerge={onMerge}
              onSplit={onSplit}
              onBulkDelete={onBulkDelete}
              onBulkDuplicate={onBulkDuplicate}
              onBulkMoveToFolder={onBulkMoveToFolder}
              renamingSet={renamingSet}
              renameValue={renameValue}
              setRenameValue={setRenameValue}
              renameError={renameError}
              setRenameError={setRenameError}
              renameInputRef={renameInputRef}
              onRenameConfirm={onRenameConfirm}
              onRenameCancel={onRenameCancel}
            />
          </>
        )}
      </div>
      {editingMetadataSet && (
        <SetMetadataDialog
          setName={editingMetadataSet}
          description={metadataDescription}
          onDescriptionChange={(value) => setMetadataDescription?.(value)}
          collectionName={metadataCollectionName}
          onCollectionNameChange={(value) => setMetadataCollectionName?.(value)}
          modeName={metadataModeName}
          onModeNameChange={(value) => setMetadataModeName?.(value)}
          onClose={() => onMetadataClose?.()}
          onSave={() => onMetadataSave?.()}
        />
      )}
      {deletingSet && onDeleteConfirm && onDeleteCancel && (
        <SetDeleteDialog
          deletingSet={deletingSet}
          preflight={deletePreflight.data}
          preflightLoading={deletePreflight.loading}
          preflightError={deletePreflight.error}
          onConfirm={onDeleteConfirm}
          onCancel={onDeleteCancel}
        />
      )}
      {splittingSet &&
        onSplitClose &&
        setSplitDeleteOriginal &&
        onSplitConfirm && (
          <SetSplitDialog
            sets={sets}
            splittingSet={splittingSet}
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
        )}
    </>
  );
}

interface ManageViewProps {
  filtered: string[];
  sets: string[];
  activeSet: string;
  query: string;
  topContent?: ReactNode;
  setTokenCounts: Record<string, number>;
  setDescriptions: Record<string, string>;
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: "left" | "right") => void;
  onReorderFull?: (newOrder: string[]) => void;
  onEditInfo?: (setName: string) => void;
  onMerge?: (setName: string) => void;
  onSplit?: (setName: string) => void;
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (
    moves: Array<{ from: string; to: string }>,
  ) => Promise<void>;
  renamingSet: string | null;
  renameValue: string;
  setRenameValue?: (value: string) => void;
  renameError: string;
  setRenameError?: (value: string) => void;
  renameInputRef?: RefObject<HTMLInputElement | null>;
  onRenameConfirm?: () => void;
  onRenameCancel?: () => void;
}

function ManageView({
  filtered,
  sets,
  activeSet,
  query,
  topContent,
  setTokenCounts,
  setDescriptions,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onReorderFull,
  onEditInfo,
  onMerge,
  onSplit,
  onBulkDelete,
  onBulkDuplicate,
  onBulkMoveToFolder,
  renamingSet,
  renameValue,
  setRenameValue,
  renameError,
  setRenameError,
  renameInputRef,
  onRenameConfirm,
  onRenameCancel,
}: ManageViewProps) {
  const { connected, serverUrl, getDisconnectSignal, markDisconnected } =
    useConnectionContext();
  const { setSets, setActiveSet, renameSetInState, removeSetFromState } =
    useTokenSetsContext();
  const [dragSetName, setDragSetName] = useState<string | null>(null);
  const [dragOverSetName, setDragOverSetName] = useState<string | null>(null);
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [bulkFolderMode, setBulkFolderMode] = useState(false);
  const [bulkFolder, setBulkFolder] = useState("");
  const [bulkFolderError, setBulkFolderError] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [folderRenameError, setFolderRenameError] = useState("");
  const [mergingFolder, setMergingFolder] = useState<string | null>(null);
  const [folderMergeTarget, setFolderMergeTarget] = useState("");
  const [folderMergeError, setFolderMergeError] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null);
  const [folderDeleteError, setFolderDeleteError] = useState("");
  const [folderActionPending, setFolderActionPending] = useState(false);

  const bulkFolderInputRef = useRef<HTMLInputElement>(null);
  const folderRenameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedSets(new Set());
    setBulkFolderMode(false);
    setDeleteConfirming(false);
    setRenamingFolder(null);
    setFolderRenameValue("");
    setFolderRenameError("");
    setMergingFolder(null);
    setFolderMergeTarget("");
    setFolderMergeError("");
    setDeletingFolder(null);
    setFolderDeleteError("");
  }, [query]);

  useEffect(() => {
    if (bulkFolderMode) bulkFolderInputRef.current?.focus();
  }, [bulkFolderMode]);

  useEffect(() => {
    if (renamingFolder) folderRenameInputRef.current?.focus();
  }, [renamingFolder]);

  const folderNames = useMemo(
    () =>
      buildFolderGroups(sets)
        .filter((item): item is FolderGroup => typeof item !== "string")
        .map((item) => item.folder),
    [sets],
  );
  const manageItems = useMemo(
    () => buildManageItems(sets, filtered),
    [sets, filtered],
  );

  const hasBulkOps = !!(onBulkDelete || onBulkDuplicate || onBulkMoveToFolder);
  const hasSelection = selectedSets.size > 0;
  const canDrag =
    !!onReorderFull && !hasSelection && !bulkFolderMode && !deleteConfirming;

  const handleFolderActionError = (
    err: unknown,
    fallback: string,
    setInlineError?: (value: string) => void,
  ) => {
    if (isNetworkError(err)) markDisconnected();
    const message = err instanceof Error ? err.message : fallback;
    setInlineError?.(message);
    dispatchToast(message, "error");
  };

  const toggleSelect = (set: string) => {
    setSelectedSets((prev) => {
      const next = new Set(prev);
      if (next.has(set)) next.delete(set);
      else next.add(set);
      return next;
    });
  };

  const selectAll = () => setSelectedSets(new Set(filtered));

  const clearSelection = () => {
    setSelectedSets(new Set());
    setBulkFolderMode(false);
    setBulkFolder("");
    setBulkFolderError("");
    setDeleteConfirming(false);
  };

  const handleBulkDuplicate = async () => {
    if (!onBulkDuplicate || !hasSelection) return;
    setBulkPending(true);
    try {
      await onBulkDuplicate(Array.from(selectedSets));
      clearSelection();
    } finally {
      setBulkPending(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    if (!onBulkDelete || !hasSelection) return;
    setBulkPending(true);
    try {
      await onBulkDelete(Array.from(selectedSets));
      clearSelection();
    } finally {
      setBulkPending(false);
      setDeleteConfirming(false);
    }
  };

  const handleBulkMoveToFolder = async () => {
    if (!onBulkMoveToFolder || !hasSelection) return;
    const folder = bulkFolder.trim();
    if (!folder) {
      setBulkFolderError("Folder name cannot be empty");
      return;
    }
    if (!FOLDER_NAME_RE.test(folder)) {
      setBulkFolderError("Use letters, numbers, - and _ (/ for sub-folders)");
      return;
    }
    const moves = Array.from(selectedSets).map((set) => ({
      from: set,
      to: `${folder}/${leafName(set)}`,
    }));
    const actualMoves = moves.filter((move) => move.from !== move.to);
    if (!actualMoves.length) {
      setBulkFolderError("All selected sets are already in that folder");
      return;
    }
    setBulkPending(true);
    setBulkFolderError("");
    try {
      await onBulkMoveToFolder(actualMoves);
      clearSelection();
      setBulkFolder("");
    } catch (err) {
      setBulkFolderError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setBulkPending(false);
    }
  };

  const openFolderRename = (folder: string) => {
    setRenamingFolder(folder);
    setFolderRenameValue(folder);
    setFolderRenameError("");
    setMergingFolder(null);
    setDeletingFolder(null);
  };

  const cancelFolderRename = () => {
    setRenamingFolder(null);
    setFolderRenameValue("");
    setFolderRenameError("");
  };

  const handleFolderRenameConfirm = async () => {
    if (!renamingFolder || folderActionPending || !connected) return;
    const nextFolder = folderRenameValue.trim();
    if (!nextFolder) {
      setFolderRenameError("Folder name cannot be empty");
      return;
    }
    if (!FOLDER_NAME_RE.test(nextFolder)) {
      setFolderRenameError("Use letters, numbers, - and _ (/ for sub-folders)");
      return;
    }
    if (nextFolder === renamingFolder) {
      cancelFolderRename();
      return;
    }

    setFolderActionPending(true);
    setFolderRenameError("");
    try {
      const response = await apiFetch<FolderRenameResponse>(
        `${serverUrl}/api/set-folders/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromFolder: renamingFolder,
            toFolder: nextFolder,
          }),
          signal: createFetchSignal(getDisconnectSignal()),
        },
      );
      response.renamedSets.forEach(({ from, to }) =>
        renameSetInState(from, to),
      );
      setSets(response.sets);
      if (isSetInFolder(activeSet, renamingFolder)) {
        setActiveSet(
          replaceFolderPrefix(activeSet, renamingFolder, nextFolder),
        );
      }
      cancelFolderRename();
      dispatchToast(
        `Renamed folder "${renamingFolder}" → "${nextFolder}"`,
        "success",
      );
    } catch (err) {
      handleFolderActionError(
        err,
        "Failed to rename folder",
        setFolderRenameError,
      );
    } finally {
      setFolderActionPending(false);
    }
  };

  const openFolderMerge = (folder: string) => {
    setMergingFolder(folder);
    setFolderMergeTarget(folderNames.find((name) => name !== folder) ?? "");
    setFolderMergeError("");
    setRenamingFolder(null);
    setDeletingFolder(null);
  };

  const cancelFolderMerge = () => {
    setMergingFolder(null);
    setFolderMergeTarget("");
    setFolderMergeError("");
  };

  const handleFolderMergeConfirm = async () => {
    if (!mergingFolder || folderActionPending || !connected) return;
    if (!folderMergeTarget) {
      setFolderMergeError("Choose a target folder");
      return;
    }

    setFolderActionPending(true);
    setFolderMergeError("");
    try {
      const response = await apiFetch<FolderMergeResponse>(
        `${serverUrl}/api/set-folders/merge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceFolder: mergingFolder,
            targetFolder: folderMergeTarget,
          }),
          signal: createFetchSignal(getDisconnectSignal()),
        },
      );
      response.movedSets.forEach(({ from, to }) => renameSetInState(from, to));
      setSets(response.sets);
      if (isSetInFolder(activeSet, mergingFolder)) {
        setActiveSet(
          replaceFolderPrefix(activeSet, mergingFolder, folderMergeTarget),
        );
      }
      cancelFolderMerge();
      dispatchToast(
        `Merged folder "${mergingFolder}" into "${folderMergeTarget}"`,
        "success",
      );
    } catch (err) {
      handleFolderActionError(
        err,
        "Failed to merge folders",
        setFolderMergeError,
      );
    } finally {
      setFolderActionPending(false);
    }
  };

  const openFolderDelete = (folder: string) => {
    setDeletingFolder(folder);
    setFolderDeleteError("");
    setRenamingFolder(null);
    setMergingFolder(null);
  };

  const cancelFolderDelete = () => {
    setDeletingFolder(null);
    setFolderDeleteError("");
  };

  const handleFolderDeleteConfirm = async () => {
    if (!deletingFolder || folderActionPending || !connected) return;
    setFolderActionPending(true);
    setFolderDeleteError("");
    try {
      const response = await apiFetch<FolderDeleteResponse>(
        `${serverUrl}/api/set-folders/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: deletingFolder }),
          signal: createFetchSignal(getDisconnectSignal()),
        },
      );
      response.deletedSets.forEach((setName) => removeSetFromState(setName));
      setSets(response.sets);
      if (isSetInFolder(activeSet, deletingFolder)) {
        const nextActive = response.sets[0] ?? "";
        setActiveSet(nextActive);
      }
      cancelFolderDelete();
      dispatchToast(
        `Deleted folder "${deletingFolder}" (${response.deletedSets.length} set${response.deletedSets.length === 1 ? "" : "s"})`,
        "success",
      );
    } catch (err) {
      handleFolderActionError(
        err,
        "Failed to delete folder",
        setFolderDeleteError,
      );
    } finally {
      setFolderActionPending(false);
    }
  };

  const handleFolderMove = async (
    folder: string,
    direction: "left" | "right",
  ) => {
    if (!connected || folderActionPending) return;
    const order = buildTopLevelItemOrder(sets);
    const folderKey = folderItemKey(folder);
    const fromIndex = order.indexOf(folderKey);
    if (fromIndex === -1) return;
    const toIndex = direction === "left" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= order.length) return;
    const nextOrder = [...order];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);

    setFolderActionPending(true);
    try {
      const response = await apiFetch<FolderReorderResponse>(
        `${serverUrl}/api/set-folders/reorder`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: nextOrder }),
          signal: createFetchSignal(getDisconnectSignal()),
        },
      );
      setSets(response.sets);
      dispatchToast(`Reordered folder "${folder}"`, "success");
    } catch (err) {
      handleFolderActionError(err, "Failed to reorder folders");
    } finally {
      setFolderActionPending(false);
    }
  };

  const handleDragStart = useCallback((e: React.DragEvent, setName: string) => {
    setDragSetName(setName);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, setName: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragSetName && dragSetName !== setName) setDragOverSetName(setName);
    },
    [dragSetName],
  );

  const handleDragEnd = useCallback(() => {
    setDragSetName(null);
    setDragOverSetName(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetSetName: string) => {
      e.preventDefault();
      if (!dragSetName || dragSetName === targetSetName || !onReorderFull) {
        handleDragEnd();
        return;
      }
      const fromIdx = sets.indexOf(dragSetName);
      const toIdx = sets.indexOf(targetSetName);
      if (fromIdx === -1 || toIdx === -1) {
        handleDragEnd();
        return;
      }
      const newOrder = [...sets];
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, dragSetName);
      setDragSetName(null);
      setDragOverSetName(null);
      onReorderFull(newOrder);
    },
    [dragSetName, sets, onReorderFull, handleDragEnd],
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-6 text-[11px] text-[var(--color-figma-text-secondary)]">
        No sets match &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {topContent}
      {hasBulkOps && hasSelection && (
        <div className="sticky top-0 z-10 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]">
            <span className="mr-0.5 shrink-0 text-[var(--color-figma-text-secondary)]">
              {selectedSets.size} selected
            </span>
            {selectedSets.size < filtered.length && (
              <button
                onClick={selectAll}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                disabled={bulkPending}
              >
                All
              </button>
            )}
            <div className="flex-1" />
            {onBulkMoveToFolder && !bulkFolderMode && !deleteConfirming && (
              <button
                onClick={() => {
                  setBulkFolderMode(true);
                  setDeleteConfirming(false);
                }}
                disabled={bulkPending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                Move to folder
              </button>
            )}
            {onBulkDuplicate && !deleteConfirming && !bulkFolderMode && (
              <button
                onClick={handleBulkDuplicate}
                disabled={bulkPending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              >
                {bulkPending ? "Working…" : "Duplicate"}
              </button>
            )}
            {onBulkDelete && !deleteConfirming && !bulkFolderMode && (
              <button
                onClick={() => {
                  setDeleteConfirming(true);
                  setBulkFolderMode(false);
                }}
                disabled={bulkPending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Delete
              </button>
            )}
            <button
              onClick={clearSelection}
              disabled={bulkPending}
              className="ml-0.5 shrink-0 rounded p-0.5 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M1 1l8 8M9 1L1 9" />
              </svg>
            </button>
          </div>

          {deleteConfirming && (
            <div className="flex items-center gap-2 border-t border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[11px]">
              <span className="flex-1 text-[var(--color-figma-text)]">
                Delete {selectedSets.size} set
                {selectedSets.size !== 1 ? "s" : ""}? This cannot be undone.
              </span>
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={bulkPending}
                className="shrink-0 rounded bg-[var(--color-figma-error)] px-2 py-0.5 text-[10px] text-white transition-colors hover:bg-[var(--color-figma-error)] disabled:opacity-50"
              >
                {bulkPending ? "Deleting…" : "Confirm delete"}
              </button>
              <button
                onClick={() => setDeleteConfirming(false)}
                disabled={bulkPending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          )}

          {bulkFolderMode && (
            <div className="border-t border-[var(--color-figma-border)] px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  ref={bulkFolderInputRef}
                  type="text"
                  value={bulkFolder}
                  onChange={(e) => {
                    setBulkFolder(e.target.value);
                    setBulkFolderError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBulkMoveToFolder();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setBulkFolderMode(false);
                      setBulkFolder("");
                      setBulkFolderError("");
                    }
                  }}
                  placeholder="Folder name (e.g. brand or brand/sub)"
                  className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
                  disabled={bulkPending}
                />
                <button
                  onClick={handleBulkMoveToFolder}
                  disabled={bulkPending || !bulkFolder.trim()}
                  className="shrink-0 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[11px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                >
                  {bulkPending ? "Moving…" : "Move"}
                </button>
                <button
                  onClick={() => {
                    setBulkFolderMode(false);
                    setBulkFolder("");
                    setBulkFolderError("");
                  }}
                  disabled={bulkPending}
                  className="shrink-0 rounded px-1.5 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
              {bulkFolderError && (
                <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
                  {bulkFolderError}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(() => {
        const renderSetRow = (set: string, indented = false) => {
          const isCurrent = set === activeSet;
          const idx = sets.indexOf(set);
          const isFirst = idx === 0;
          const isLast = idx === sets.length - 1;
          const tokenCount = setTokenCounts[set];
          const description = setDescriptions[set];
          const isSelected = selectedSets.has(set);
          const isDragging = dragSetName === set;
          const isDragOver = dragOverSetName === set && dragSetName !== set;
          const isRenaming = renamingSet === set;

          return (
            <div
              key={set}
              draggable={canDrag && !isRenaming}
              onDragStart={canDrag ? (e) => handleDragStart(e, set) : undefined}
              onDragOver={canDrag ? (e) => handleDragOver(e, set) : undefined}
              onDrop={canDrag ? (e) => handleDrop(e, set) : undefined}
              onDragEnd={canDrag ? handleDragEnd : undefined}
              className={`group relative flex items-start gap-2 border-b border-[var(--color-figma-border)] py-2.5 pr-3 text-[12px] transition-colors last:border-b-0 ${
                indented ? "pl-8" : "pl-3"
              } ${isDragging ? "opacity-40" : ""} ${
                isDragOver
                  ? "border-l-2 border-l-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]"
                  : isSelected
                    ? "bg-[var(--color-figma-accent)]/8"
                    : "hover:bg-[var(--color-figma-bg-hover)]"
              }`}
            >
              {hasBulkOps && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(set)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1 shrink-0 cursor-pointer accent-[var(--color-figma-accent)]"
                  aria-label={`Select ${set}`}
                />
              )}

              {canDrag ? (
                <span
                  className="mt-1 shrink-0 cursor-grab text-[var(--color-figma-text-secondary)] opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60 active:cursor-grabbing"
                  aria-hidden="true"
                >
                  <svg
                    width="8"
                    height="12"
                    viewBox="0 0 8 12"
                    fill="currentColor"
                  >
                    <circle cx="2" cy="2" r="1" />
                    <circle cx="6" cy="2" r="1" />
                    <circle cx="2" cy="6" r="1" />
                    <circle cx="6" cy="6" r="1" />
                    <circle cx="2" cy="10" r="1" />
                    <circle cx="6" cy="10" r="1" />
                  </svg>
                </span>
              ) : (
                <span className="w-[8px] shrink-0" aria-hidden="true" />
              )}

              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <div className="flex flex-col gap-1">
                    <input
                      ref={
                        renameInputRef as
                          | RefObject<HTMLInputElement>
                          | undefined
                      }
                      value={renameValue}
                      onChange={(e) => {
                        setRenameValue?.(e.target.value.trimStart());
                        setRenameError?.("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onRenameConfirm?.();
                        if (e.key === "Escape") onRenameCancel?.();
                      }}
                      onBlur={() => onRenameCancel?.()}
                      aria-label="Rename token set"
                      className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] outline-none"
                    />
                    {renameError && (
                      <span className="text-[10px] text-[var(--color-figma-error)]">
                        {renameError}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span
                        className={`min-w-0 truncate ${isCurrent ? "font-medium text-[var(--color-figma-accent)]" : "text-[var(--color-figma-text)]"}`}
                      >
                        <SetNameDisplay name={set} />
                      </span>
                      {isCurrent && (
                        <span className="rounded bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-accent)]">
                          Active
                        </span>
                      )}
                    </div>
                    {description && (
                      <div className="mt-0.5 truncate text-[10px] text-[var(--color-figma-text-secondary)]">
                        {description}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="mt-0.5 flex shrink-0 items-center gap-2">
                {tokenCount !== undefined && (
                  <span className="text-[10px] tabular-nums text-[var(--color-figma-text-secondary)]">
                    {tokenCount}
                  </span>
                )}
                {!isRenaming && (
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    {onReorder && !canDrag && (
                      <IconButton
                        title="Move up"
                        ariaLabel="Move up"
                        disabled={isFirst}
                        onClick={() => onReorder(set, "left")}
                      >
                        <path d="M5 2L9 7H1L5 2Z" />
                      </IconButton>
                    )}
                    {onReorder && !canDrag && (
                      <IconButton
                        title="Move down"
                        ariaLabel="Move down"
                        disabled={isLast}
                        onClick={() => onReorder(set, "right")}
                      >
                        <path d="M5 8L1 3H9L5 8Z" />
                      </IconButton>
                    )}
                    {onEditInfo && (
                      <StrokeIconButton
                        title="Edit set info"
                        ariaLabel="Edit set info"
                        onClick={() => onEditInfo(set)}
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </StrokeIconButton>
                    )}
                    {onRename && (
                      <StrokeIconButton
                        title="Rename or move"
                        ariaLabel="Rename or move"
                        onClick={() => onRename(set)}
                      >
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </StrokeIconButton>
                    )}
                    {onDuplicate && (
                      <StrokeIconButton
                        title="Duplicate"
                        ariaLabel="Duplicate"
                        onClick={() => onDuplicate(set)}
                      >
                        <rect
                          x="9"
                          y="9"
                          width="13"
                          height="13"
                          rx="2"
                          ry="2"
                        />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </StrokeIconButton>
                    )}
                    {onMerge && (
                      <StrokeIconButton
                        title="Merge into another set"
                        ariaLabel="Merge into another set"
                        onClick={() => onMerge(set)}
                      >
                        <path d="M7 7h5a4 4 0 014 4v0" />
                        <path d="M7 17h5a4 4 0 004-4v0" />
                        <path d="M7 12h10" />
                        <path d="M5 7l-2 2 2 2" />
                        <path d="M5 15l-2-2 2-2" />
                      </StrokeIconButton>
                    )}
                    {onSplit && (
                      <StrokeIconButton
                        title="Split by group"
                        ariaLabel="Split by group"
                        onClick={() => onSplit(set)}
                      >
                        <path d="M12 3v6" />
                        <path d="M12 9l-5 5" />
                        <path d="M12 9l5 5" />
                        <circle cx="12" cy="3" r="2" />
                        <circle cx="7" cy="16" r="2" />
                        <circle cx="17" cy="16" r="2" />
                      </StrokeIconButton>
                    )}
                    {onDelete && (
                      <StrokeIconButton
                        title="Delete"
                        ariaLabel="Delete"
                        onClick={() => onDelete(set)}
                        danger
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </StrokeIconButton>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        };

        const renderFolderRow = (item: ManageFolderGroup) => {
          const topLevelItems = buildTopLevelItemOrder(sets);
          const folderIndex = topLevelItems.indexOf(folderItemKey(item.folder));
          const visibleCount = item.sets.length;
          const targetFolderOptions = folderNames.filter(
            (folder) => folder !== item.folder,
          );
          const isRenaming = renamingFolder === item.folder;
          const isMerging = mergingFolder === item.folder;
          const isDeleting = deletingFolder === item.folder;

          return (
            <div
              key={`folder-${item.folder}`}
              className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/60"
            >
              <div className="group flex items-start gap-2 px-3 py-2.5">
                <span
                  className="mt-0.5 shrink-0 text-[var(--color-figma-text-secondary)]"
                  aria-hidden="true"
                >
                  <svg
                    width="12"
                    height="10"
                    viewBox="0 0 12 10"
                    fill="currentColor"
                  >
                    <path d="M1 2.5A1.5 1.5 0 012.5 1H5l1 1h3.5A1.5 1.5 0 0111 3.5v4A1.5 1.5 0 019.5 9h-7A1.5 1.5 0 011 7.5v-5z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <div className="flex flex-col gap-1">
                      <input
                        ref={folderRenameInputRef}
                        value={folderRenameValue}
                        onChange={(e) => {
                          setFolderRenameValue(e.target.value.trimStart());
                          setFolderRenameError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void handleFolderRenameConfirm();
                          if (e.key === "Escape") cancelFolderRename();
                        }}
                        className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] outline-none"
                        aria-label={`Rename folder ${item.folder}`}
                        disabled={folderActionPending}
                      />
                      {folderRenameError && (
                        <div className="text-[10px] text-[var(--color-figma-error)]">
                          {folderRenameError}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => void handleFolderRenameConfirm()}
                          disabled={
                            folderActionPending || !folderRenameValue.trim()
                          }
                          className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                        >
                          {folderActionPending ? "Renaming…" : "Rename folder"}
                        </button>
                        <button
                          onClick={cancelFolderRename}
                          disabled={folderActionPending}
                          className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-[var(--color-figma-text)]">
                          {item.folder}/
                        </span>
                        <span className="rounded border border-[var(--color-figma-border)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-[var(--color-figma-text-secondary)]">
                          Folder
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                        <span>
                          {item.totalSetCount} set
                          {item.totalSetCount === 1 ? "" : "s"}
                        </span>
                        {visibleCount !== item.totalSetCount && (
                          <>
                            <span>·</span>
                            <span>{visibleCount} shown by filter</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {!isRenaming && (
                  <div className="mt-0.5 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <IconButton
                      title="Move folder up"
                      ariaLabel="Move folder up"
                      disabled={folderActionPending || folderIndex <= 0}
                      onClick={() => void handleFolderMove(item.folder, "left")}
                    >
                      <path d="M5 2L9 7H1L5 2Z" />
                    </IconButton>
                    <IconButton
                      title="Move folder down"
                      ariaLabel="Move folder down"
                      disabled={
                        folderActionPending ||
                        folderIndex === -1 ||
                        folderIndex >= topLevelItems.length - 1
                      }
                      onClick={() =>
                        void handleFolderMove(item.folder, "right")
                      }
                    >
                      <path d="M5 8L1 3H9L5 8Z" />
                    </IconButton>
                    <StrokeIconButton
                      title="Rename folder"
                      ariaLabel="Rename folder"
                      onClick={() => openFolderRename(item.folder)}
                    >
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </StrokeIconButton>
                    <StrokeIconButton
                      title="Merge folder"
                      ariaLabel="Merge folder"
                      onClick={() => openFolderMerge(item.folder)}
                    >
                      <path d="M7 7h5a4 4 0 014 4v0" />
                      <path d="M7 17h5a4 4 0 004-4v0" />
                      <path d="M7 12h10" />
                      <path d="M5 7l-2 2 2 2" />
                      <path d="M5 15l-2-2 2-2" />
                    </StrokeIconButton>
                    <StrokeIconButton
                      title="Delete folder"
                      ariaLabel="Delete folder"
                      onClick={() => openFolderDelete(item.folder)}
                      danger
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </StrokeIconButton>
                  </div>
                )}
              </div>

              {isMerging && (
                <div className="border-t border-[var(--color-figma-border)] px-3 py-2.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      Merge into folder
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={folderMergeTarget}
                        onChange={(e) => {
                          setFolderMergeTarget(e.target.value);
                          setFolderMergeError("");
                        }}
                        disabled={folderActionPending}
                        className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)]"
                      >
                        {targetFolderOptions.map((folder) => (
                          <option key={folder} value={folder}>
                            {folder}/
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void handleFolderMergeConfirm()}
                        disabled={
                          folderActionPending ||
                          targetFolderOptions.length === 0
                        }
                        className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                      >
                        {folderActionPending ? "Merging…" : "Merge"}
                      </button>
                      <button
                        onClick={cancelFolderMerge}
                        disabled={folderActionPending}
                        className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                      >
                        Cancel
                      </button>
                    </div>
                    {targetFolderOptions.length === 0 && (
                      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                        Create another folder first, then merge into it.
                      </div>
                    )}
                    {folderMergeError && (
                      <div className="text-[10px] text-[var(--color-figma-error)]">
                        {folderMergeError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isDeleting && (
                <div className="border-t border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/10 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="flex-1 text-[var(--color-figma-text)]">
                      Delete folder "{item.folder}/" and its{" "}
                      {item.totalSetCount} set
                      {item.totalSetCount === 1 ? "" : "s"}?
                    </span>
                    <button
                      onClick={() => void handleFolderDeleteConfirm()}
                      disabled={folderActionPending}
                      className="rounded bg-[var(--color-figma-error)] px-2 py-1 text-[10px] text-white transition-colors hover:bg-[var(--color-figma-error)] disabled:opacity-50"
                    >
                      {folderActionPending ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      onClick={cancelFolderDelete}
                      disabled={folderActionPending}
                      className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Cancel
                    </button>
                  </div>
                  {folderDeleteError && (
                    <div className="mt-1 text-[10px] text-[var(--color-figma-error)]">
                      {folderDeleteError}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        };

        return manageItems.map((item) =>
          typeof item === "string" ? (
            renderSetRow(item, false)
          ) : (
            <div key={`folder-block-${item.folder}`}>
              {renderFolderRow(item)}
              {item.sets.map((set) => renderSetRow(set, true))}
            </div>
          ),
        );
      })()}
    </div>
  );
}

function SetMappingManager({
  rows,
  visibleRows,
  dirtyCount,
  saving,
  onFieldChange,
  onResetRow,
  onResetAll,
  onSaveRow,
  onSaveAll,
}: {
  rows: Array<{
    setName: string;
    description: string;
    collectionName: string;
    modeName: string;
    isDirty: boolean;
  }>;
  visibleRows: Array<{
    setName: string;
    description: string;
    collectionName: string;
    modeName: string;
    isDirty: boolean;
  }>;
  dirtyCount: number;
  saving: boolean;
  onFieldChange: (
    setName: string,
    field: "collectionName" | "modeName",
    value: string,
  ) => void;
  onResetRow: (setName: string) => void;
  onResetAll: () => void;
  onSaveRow: (setName: string) => Promise<unknown>;
  onSaveAll: () => Promise<unknown>;
}) {
  const collectionsCount = new Set(
    rows.map((row) => row.collectionName.trim()).filter(Boolean),
  ).size;
  const customModesCount = rows.filter(
    (row) => row.modeName.trim().length > 0,
  ).length;

  return (
    <section className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">
            Fallback Figma collection + mode routing
          </div>
          <p className="mt-1 max-w-3xl text-[10px] leading-4 text-[var(--color-figma-text-secondary)]">
            Review each set&rsquo;s direct Sync destination here. Resolver-based
            publish flows can now own their own context-to-mode mapping in the
            Publish workspace, while these per-set destinations remain the
            fallback for direct set sync and any sets not covered by a resolver.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onResetAll}
            disabled={saving || dirtyCount === 0}
            className="rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
          >
            Reset all
          </button>
          <button
            onClick={() => {
              void onSaveAll();
            }}
            disabled={saving || dirtyCount === 0}
            className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : dirtyCount > 0
                ? `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`
                : "Saved"}
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
        <span className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5">
          {rows.length} set{rows.length === 1 ? "" : "s"}
        </span>
        <span className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5">
          {collectionsCount} named collection{collectionsCount === 1 ? "" : "s"}
        </span>
        <span className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-1.5 py-0.5">
          {customModesCount} custom mode{customModesCount === 1 ? "" : "s"}
        </span>
        {dirtyCount > 0 && (
          <span className="rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[var(--color-figma-accent)]">
            {dirtyCount} unsaved
          </span>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
        <div
          className="hidden items-center gap-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-[var(--color-figma-text-secondary)] md:grid"
          style={{
            gridTemplateColumns:
              "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto",
          }}
        >
          <span>Set</span>
          <span>Collection</span>
          <span>Mode</span>
          <span className="text-right">Actions</span>
        </div>
        {visibleRows.length === 0 ? (
          <div className="px-3 py-4 text-[10px] text-[var(--color-figma-text-secondary)]">
            No sets match the current filter.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            {visibleRows.map((row) => (
              <div
                key={row.setName}
                className={`grid gap-2 border-b border-[var(--color-figma-border)] px-3 py-2.5 last:border-b-0 ${row.isDirty ? "bg-[var(--color-figma-accent)]/5" : ""}`}
                style={{
                  gridTemplateColumns:
                    "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) auto",
                }}
              >
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-medium text-[var(--color-figma-text)]">
                    <SetNameDisplay name={row.setName} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-secondary)]">
                    <span className="rounded border border-[var(--color-figma-border)] px-1.5 py-0.5">
                      {row.collectionName.trim()
                        ? "Custom collection"
                        : "Default collection"}
                    </span>
                    <span className="rounded border border-[var(--color-figma-border)] px-1.5 py-0.5">
                      {row.modeName.trim() ? "Named mode" : "First mode"}
                    </span>
                    {row.isDirty && (
                      <span className="rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[var(--color-figma-accent)]">
                        Edited
                      </span>
                    )}
                  </div>
                  {row.description && (
                    <div className="mt-1 truncate text-[10px] text-[var(--color-figma-text-secondary)]">
                      {row.description}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={row.collectionName}
                  onChange={(event) =>
                    onFieldChange(
                      row.setName,
                      "collectionName",
                      event.target.value,
                    )
                  }
                  placeholder="Default TokenManager collection"
                  disabled={saving}
                  className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
                  aria-label={`Collection for ${row.setName}`}
                />

                <input
                  type="text"
                  value={row.modeName}
                  onChange={(event) =>
                    onFieldChange(row.setName, "modeName", event.target.value)
                  }
                  placeholder="First mode"
                  disabled={saving}
                  className="min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
                  aria-label={`Mode for ${row.setName}`}
                />

                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onResetRow(row.setName)}
                    disabled={saving || !row.isDirty}
                    className="rounded px-1.5 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] disabled:opacity-50"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => {
                      void onSaveRow(row.setName);
                    }}
                    disabled={saving || !row.isDirty}
                    className="rounded bg-[var(--color-figma-accent)] px-1.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function SetMetadataDialog({
  setName,
  description,
  onDescriptionChange,
  collectionName,
  onCollectionNameChange,
  modeName,
  onModeNameChange,
  onClose,
  onSave,
}: {
  setName: string;
  description: string;
  onDescriptionChange: (value: string) => void;
  collectionName: string;
  onCollectionNameChange: (value: string) => void;
  modeName: string;
  onModeNameChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]">
      <div className="flex w-72 flex-col gap-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] p-4 shadow-xl">
        <div className="text-[12px] font-medium text-[var(--color-figma-text)]">
          Edit set info — {setName}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Description
          </label>
          <textarea
            autoFocus
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            rows={3}
            placeholder="What is this token set for?"
            className="w-full resize-none rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Figma collection name
          </label>
          <input
            type="text"
            value={collectionName}
            onChange={(e) => onCollectionNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="TokenManager"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          />
          <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            Direct set sync uses this collection when no resolver publish
            mapping is handling the destination.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Figma mode name
          </label>
          <input
            type="text"
            value={modeName}
            onChange={(e) => onModeNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            placeholder="Mode 1"
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          />
          <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            Direct set sync uses this mode when no resolver publish mapping is
            handling the destination. Leave blank to use the first mode.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            className="rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SetDeleteDialog({
  deletingSet,
  preflight,
  preflightLoading,
  preflightError,
  onConfirm,
  onCancel,
}: {
  deletingSet: string;
  preflight: SetStructuralPreflight | null;
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
          <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Delete "{deletingSet}"?
          </span>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-3 overflow-y-auto p-4">
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Review linked themes, resolvers, Figma metadata, and managed-token
            ownership before the set is removed.
          </p>
          <StructuralPreflightSummary
            preflight={preflight}
            loading={preflightLoading}
            error={preflightError}
            sourceSetName={deletingSet}
          />
        </div>
        <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={hasBlockingPreflight}
            className="flex-1 rounded bg-[var(--color-figma-error)] px-3 py-1.5 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Delete set
          </button>
        </div>
      </div>
    </div>
  );
}

/** Merge flow rendered inline within SetManager (no modal overlay). */
function SetMergeInline({
  sets,
  mergingSet,
  preflight,
  preflightLoading,
  preflightError,
  mergeTargetSet,
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
  sets: string[];
  mergingSet: string;
  preflight: SetStructuralPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  mergeTargetSet: string;
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
          prev: Record<string, "source" | "target">,
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
        <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
          Merge &ldquo;{mergingSet}&rdquo; into&hellip;
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Target set
          </label>
          <select
            value={mergeTargetSet}
            onChange={(e) => onTargetChange(e.target.value)}
            className="w-full rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] focus-visible:border-[var(--color-figma-accent)]"
          >
            {sets
              .filter((set) => set !== mergingSet)
              .map((set) => (
                <option key={set} value={set}>
                  {set}
                </option>
              ))}
          </select>
        </div>
        <StructuralPreflightSummary
          preflight={preflight}
          loading={preflightLoading}
          error={preflightError}
          sourceSetName={mergingSet}
          targetSetName={mergeTargetSet}
        />
        {!mergeChecked && (
          <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
            Tokens from{" "}
            <span className="font-mono font-medium">{mergingSet}</span> will
            be added to{" "}
            <span className="font-mono font-medium">{mergeTargetSet}</span>.
            Conflicts where both sets have the same path but different values
            will be shown for resolution.
          </p>
        )}
        {mergeChecked && mergeConflicts.length === 0 && (
          <p className="text-[10px] text-[var(--color-figma-success)]">
            No conflicts — all tokens can be merged cleanly.
          </p>
        )}
        {mergeChecked && mergeConflicts.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Resolve {mergeConflicts.length} conflict
              {mergeConflicts.length !== 1 ? "s" : ""} before merging.
            </p>
            <div className="flex flex-col gap-2 overflow-y-auto">
              {mergeConflicts.map((conflict) => (
                <div
                  key={conflict.path}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2"
                >
                  <div className="break-all font-mono text-[10px] text-[var(--color-figma-text)]">
                    {conflict.path}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label
                      className={`rounded border px-2 py-1 text-[10px] ${mergeResolutions[conflict.path] === "source" ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"}`}
                    >
                      <input
                        type="radio"
                        name={`merge-${conflict.path}`}
                        checked={mergeResolutions[conflict.path] === "source"}
                        onChange={() =>
                          onSetResolutions((prev) => ({
                            ...prev,
                            [conflict.path]: "source",
                          }))
                        }
                        className="sr-only"
                      />
                      <div className="font-medium">Use source</div>
                      <div className="mt-0.5 break-all opacity-80">
                        {String(conflict.sourceValue)}
                      </div>
                    </label>
                    <label
                      className={`rounded border px-2 py-1 text-[10px] ${mergeResolutions[conflict.path] === "target" ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]" : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]"}`}
                    >
                      <input
                        type="radio"
                        name={`merge-${conflict.path}`}
                        checked={mergeResolutions[conflict.path] === "target"}
                        onChange={() =>
                          onSetResolutions((prev) => ({
                            ...prev,
                            [conflict.path]: "target",
                          }))
                        }
                        className="sr-only"
                      />
                      <div className="font-medium">Keep target</div>
                      <div className="mt-0.5 break-all opacity-80">
                        {String(conflict.targetValue)}
                      </div>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
        <button
          onClick={onClose}
          className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        {!mergeChecked ? (
          <button
            onClick={onCheckConflicts}
            disabled={mergeLoading || !mergeTargetSet || hasBlockingPreflight}
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {mergeLoading ? "Checking…" : "Check conflicts"}
          </button>
        ) : (
          <button
            onClick={onConfirm}
            disabled={mergeLoading || hasBlockingPreflight}
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {mergeLoading ? "Merging…" : "Merge"}
          </button>
        )}
      </div>
    </>
  );
}

function SetSplitDialog({
  sets,
  splittingSet,
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
  sets: string[];
  splittingSet: string;
  preflight: SetStructuralPreflight | null;
  preflightLoading: boolean;
  preflightError: string | null;
  splitPreview: Array<{ key: string; newName: string; count: number }>;
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
          <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            Split "{splittingSet}"
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
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
            sourceSetName={splittingSet}
            splitPreview={effectiveSplitPreview}
          />
          {effectiveSplitPreview.length === 0 ? (
            <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
              No top-level groups found in this set to split.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Creates {effectiveSplitPreview.length} new set
                {effectiveSplitPreview.length !== 1 ? "s" : ""} from top-level
                groups:
              </p>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {effectiveSplitPreview.map((preview) => (
                  <div
                    key={preview.key}
                    className="flex items-center justify-between rounded bg-[var(--color-figma-bg-hover)] px-2 py-1"
                  >
                    <span className="truncate font-mono text-[11px] text-[var(--color-figma-text)]">
                      {preview.newName}
                    </span>
                    <span className="ml-2 shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">
                      {preview.count} token{preview.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
              {effectiveSplitPreview.some((preview) =>
                sets.includes(preview.newName),
              ) && (
                <p className="text-[10px] text-[var(--color-figma-warning)]">
                  Some sets already exist and will be skipped.
                </p>
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={splitDeleteOriginal}
                  onChange={(e) => onSetDeleteOriginal(e.target.checked)}
                  className="h-3 w-3 rounded"
                />
                <span className="text-[11px] text-[var(--color-figma-text)]">
                  Delete "{splittingSet}" after split
                </span>
              </label>
            </>
          )}
        </div>
        <div className="flex gap-2 border-t border-[var(--color-figma-border)] p-3">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-[var(--color-figma-bg)] px-3 py-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
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
            className="flex-1 rounded bg-[var(--color-figma-accent)] px-3 py-1.5 text-[11px] font-medium text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {splitLoading ? "Splitting…" : "Split"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  ariaLabel,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className="rounded p-1 text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="currentColor"
        aria-hidden="true"
      >
        {children}
      </svg>
    </button>
  );
}

function StrokeIconButton({
  children,
  title,
  ariaLabel,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  title: string;
  ariaLabel: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      className={`rounded p-1 transition-colors ${
        danger
          ? "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-error)]"
          : "text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
      }`}
    >
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
      >
        {children}
      </svg>
    </button>
  );
}
