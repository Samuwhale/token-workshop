import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { RefObject, ReactNode } from 'react';
import type { ThemeDimension, ThemeSetStatus } from '@tokenmanager/core';
import { SET_NAME_RE } from '../shared/utils';
import { fuzzyScore } from '../shared/fuzzyMatch';

interface FolderGroup {
  folder: string;
  sets: string[];
}

type GroupItem = string | FolderGroup;

interface SetThemeLabel {
  option: string;
  status: ThemeSetStatus;
}

interface SetSwitcherProps {
  sets: string[];
  activeSet: string;
  onSelect: (set: string) => void;
  onClose: () => void;
  onManageSets?: () => void;
  dimensions?: ThemeDimension[];
}

interface SetManagerProps {
  sets: string[];
  activeSet: string;
  onClose: () => void;
  onOpenQuickSwitch?: () => void;
  onOpenGenerators?: (setName: string) => void;
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: 'left' | 'right') => void;
  onReorderFull?: (newOrder: string[]) => void;
  onCreateSet?: (name: string) => Promise<void>;
  onEditInfo?: (setName: string) => void;
  onMerge?: (setName: string) => void;
  onSplit?: (setName: string) => void;
  setTokenCounts?: Record<string, number>;
  setDescriptions?: Record<string, string>;
  dimensions?: ThemeDimension[];
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (moves: Array<{ from: string; to: string }>) => Promise<void>;
  renamingSet?: string | null;
  renameValue?: string;
  setRenameValue?: (value: string) => void;
  renameError?: string;
  setRenameError?: (value: string) => void;
  renameInputRef?: RefObject<HTMLInputElement | null>;
  onRenameConfirm?: () => void;
  onRenameCancel?: () => void;
}

function buildFolderGroups(sets: string[]): GroupItem[] {
  const folderMap = new Map<string, string[]>();
  for (const set of sets) {
    const slashIdx = set.indexOf('/');
    if (slashIdx === -1) continue;
    const folder = set.slice(0, slashIdx);
    if (!folderMap.has(folder)) folderMap.set(folder, []);
    folderMap.get(folder)!.push(set);
  }

  const result: GroupItem[] = [];
  const seenFolders = new Set<string>();
  for (const set of sets) {
    const slashIdx = set.indexOf('/');
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

function buildSetThemeLabels(dimensions: ThemeDimension[]): Record<string, SetThemeLabel[]> {
  const map: Record<string, SetThemeLabel[]> = {};
  for (const dim of dimensions) {
    for (const opt of dim.options) {
      for (const [setName, status] of Object.entries(opt.sets)) {
        if (status === 'disabled') continue;
        if (!map[setName]) map[setName] = [];
        map[setName].push({ option: opt.name, status });
      }
    }
  }
  return map;
}

function ThemeBadges({ labels }: { labels: SetThemeLabel[] }) {
  if (!labels.length) return null;
  return (
    <span className="ml-1.5 flex flex-shrink-0 items-center gap-0.5">
      {labels.map((label, index) => (
        <span
          key={`${label.option}-${index}`}
          className={`rounded px-1 py-px text-[9px] leading-tight ${
            label.status === 'enabled'
              ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
              : 'border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]'
          }`}
          title={label.status === 'enabled' ? `Theme override: ${label.option}` : `Theme base: ${label.option}`}
        >
          {label.option}
        </span>
      ))}
    </span>
  );
}

function SetNameDisplay({ name }: { name: string }) {
  const slash = name.lastIndexOf('/');
  if (slash === -1) return <span>{name}</span>;
  return (
    <>
      <span className="text-[var(--color-figma-text-secondary)]">{name.slice(0, slash + 1)}</span>
      <span>{name.slice(slash + 1)}</span>
    </>
  );
}

function leafName(setName: string): string {
  const idx = setName.lastIndexOf('/');
  return idx === -1 ? setName : setName.slice(idx + 1);
}

const FOLDER_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

function filterSets(sets: string[], query: string): string[] {
  if (!query) return sets;
  return sets
    .map(set => ({ set, score: fuzzyScore(query, set) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ set }) => set);
}

export function SetSwitcher({
  sets,
  activeSet,
  onSelect,
  onClose,
  onManageSets,
  dimensions = [],
}: SetSwitcherProps) {
  const setThemeLabels = buildSetThemeLabels(dimensions);
  const [query, setQuery] = useState('');
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
    const active = list.querySelector(`[data-set-name="${setName.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(index => Math.min(index + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(index => Math.max(index - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const set = filtered[activeIdx];
      if (set) {
        onSelect(set);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="mx-3 flex w-full flex-col rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-2xl"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
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
            onChange={e => setQuery(e.target.value)}
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
          onSelect={set => {
            onSelect(set);
            onClose();
          }}
          setThemeLabels={setThemeLabels}
        />

        <div className="flex items-center justify-between border-t border-[var(--color-figma-border)] px-3 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          <span>
            {filtered.length === sets.length
              ? `${sets.length} set${sets.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${sets.length} sets`}
          </span>
          <div className="flex items-center gap-2">
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
  setThemeLabels: Record<string, SetThemeLabel[]>;
}

function SwitchView({ listRef, filtered, activeSet, activeIdx, query, onSelect, setThemeLabels }: SwitchViewProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (query) setCollapsedFolders(new Set());
  }, [query]);

  useEffect(() => {
    const set = filtered[activeIdx];
    if (!set) return;
    const slashIdx = set.indexOf('/');
    if (slashIdx === -1) return;
    const folder = set.slice(0, slashIdx);
    if (!collapsedFolders.has(folder)) return;
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.delete(folder);
      return next;
    });
  }, [activeIdx, filtered, collapsedFolders]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const hasFolders = filtered.some(set => set.includes('/'));
  const groups = hasFolders ? buildFolderGroups(filtered) : null;

  const renderSetButton = (set: string, indented: boolean) => {
    const isCurrent = set === activeSet;
    const isHighlighted = filtered[activeIdx] === set;
    const label = indented ? set.slice(set.indexOf('/') + 1) : null;
    const themeLabels = setThemeLabels[set] ?? [];
    return (
      <button
        key={set}
        data-set-name={set}
        onClick={() => onSelect(set)}
        className={`flex w-full items-center justify-between py-2 pr-3 text-left text-[12px] transition-colors ${indented ? 'pl-6' : 'px-3'} ${isHighlighted ? 'bg-[var(--color-figma-bg-hover)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
        role="option"
        aria-selected={isCurrent}
      >
        <span className={`flex min-w-0 flex-1 items-center ${isCurrent ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}`}>
          {label !== null ? <span>{label}</span> : <SetNameDisplay name={set} />}
          <ThemeBadges labels={themeLabels} />
        </span>
        {isCurrent && (
          <span className="ml-2 shrink-0 text-[10px] text-[var(--color-figma-text-secondary)]">active</span>
        )}
      </button>
    );
  };

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto" role="listbox" aria-label="Token sets">
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-center text-[11px] text-[var(--color-figma-text-secondary)]">
          No sets match &ldquo;{query}&rdquo;
        </div>
      ) : groups ? (
        groups.map(group => {
          if (typeof group === 'string') return renderSetButton(group, false);
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
                  className={`shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <span className="font-medium">{group.folder}/</span>
                <span className="text-[10px] opacity-50">{group.sets.length}</span>
                {hasActiveSet && isCollapsed && (
                  <span className="ml-auto leading-none text-[var(--color-figma-accent)]" aria-label="contains active set">
                    ●
                  </span>
                )}
              </button>
              {!isCollapsed && group.sets.map(set => renderSetButton(set, true))}
            </div>
          );
        })
      ) : (
        filtered.map(set => renderSetButton(set, false))
      )}
    </div>
  );
}

export function SetManager({
  sets,
  activeSet,
  onClose,
  onOpenQuickSwitch,
  onOpenGenerators,
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onReorderFull,
  onCreateSet,
  onEditInfo,
  onMerge,
  onSplit,
  setTokenCounts = {},
  setDescriptions = {},
  dimensions = [],
  onBulkDelete,
  onBulkDuplicate,
  onBulkMoveToFolder,
  renamingSet = null,
  renameValue = '',
  setRenameValue,
  renameError = '',
  setRenameError,
  renameInputRef,
  onRenameConfirm,
  onRenameCancel,
}: SetManagerProps) {
  const setThemeLabels = buildSetThemeLabels(dimensions);
  const [query, setQuery] = useState('');
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetError, setNewSetError] = useState('');
  const [createPending, setCreatePending] = useState(false);
  const newSetInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterSets(sets, query), [sets, query]);

  useEffect(() => {
    if (creatingSet) newSetInputRef.current?.focus();
  }, [creatingSet]);

  const handleCreateSubmit = async () => {
    const name = newSetName.trim();
    if (!name) {
      setNewSetError('Name cannot be empty');
      return;
    }
    if (!SET_NAME_RE.test(name)) {
      setNewSetError('Use letters, numbers, - and _ (/ for folders)');
      return;
    }
    if (!onCreateSet) return;
    setCreatePending(true);
    setNewSetError('');
    try {
      await onCreateSet(name);
      setCreatingSet(false);
      setNewSetName('');
    } catch (err) {
      setNewSetError(err instanceof Error ? err.message : 'Failed to create set');
    } finally {
      setCreatePending(false);
    }
  };

  const cancelCreate = () => {
    setCreatingSet(false);
    setNewSetName('');
    setNewSetError('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
          aria-label="Back"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 2L3.5 5l3 3" />
          </svg>
          Back
        </button>
        <span className="ml-1 text-[10px] font-medium text-[var(--color-figma-text)]">Sets</span>
        {onOpenQuickSwitch && (
          <button
            onClick={onOpenQuickSwitch}
            className="ml-auto rounded px-2 py-1 text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Quick switch
          </button>
        )}
      </div>

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
            onChange={e => setQuery(e.target.value)}
            placeholder="Filter sets…"
            aria-label="Filter token sets"
            className="flex-1 bg-transparent text-[12px] text-[var(--color-figma-text)] outline-none placeholder-[var(--color-figma-text-secondary)]"
          />
          {!creatingSet && onCreateSet && (
            <button
              onClick={() => setCreatingSet(true)}
              className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[11px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)]"
            >
              New set
            </button>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
          <span>{sets.length} set{sets.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>Active: {activeSet}</span>
          <span>·</span>
          <span>Manage names, folders, ordering, merges, and bulk actions here.</span>
        </div>
        {creatingSet && onCreateSet && (
          <div className="mt-2 flex flex-col gap-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
            <div className="flex items-center gap-2">
              <input
                ref={newSetInputRef}
                type="text"
                value={newSetName}
                onChange={e => {
                  setNewSetName(e.target.value);
                  setNewSetError('');
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateSubmit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelCreate();
                  }
                }}
                placeholder="Set name (e.g. primitives or brand/colors)"
                className="flex-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)] focus-visible:border-[var(--color-figma-accent)]"
                disabled={createPending}
              />
              <button
                onClick={handleCreateSubmit}
                disabled={createPending || !newSetName.trim()}
                className="rounded bg-[var(--color-figma-accent)] px-2 py-1 text-[11px] text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >
                {createPending ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={cancelCreate}
                className="rounded px-2 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
            {newSetError && <div className="text-[10px] text-red-500">{newSetError}</div>}
          </div>
        )}
      </div>

      <ManageView
        filtered={filtered}
        sets={sets}
        activeSet={activeSet}
        query={query}
        setTokenCounts={setTokenCounts}
        setDescriptions={setDescriptions}
        setThemeLabels={setThemeLabels}
        onOpenGenerators={onOpenGenerators}
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
    </div>
  );
}

interface ManageViewProps {
  filtered: string[];
  sets: string[];
  activeSet: string;
  query: string;
  setTokenCounts: Record<string, number>;
  setDescriptions: Record<string, string>;
  setThemeLabels: Record<string, SetThemeLabel[]>;
  onOpenGenerators?: (setName: string) => void;
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: 'left' | 'right') => void;
  onReorderFull?: (newOrder: string[]) => void;
  onEditInfo?: (setName: string) => void;
  onMerge?: (setName: string) => void;
  onSplit?: (setName: string) => void;
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (moves: Array<{ from: string; to: string }>) => Promise<void>;
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
  setTokenCounts,
  setDescriptions,
  setThemeLabels,
  onOpenGenerators,
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
  const [dragSetName, setDragSetName] = useState<string | null>(null);
  const [dragOverSetName, setDragOverSetName] = useState<string | null>(null);
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [bulkFolderMode, setBulkFolderMode] = useState(false);
  const [bulkFolder, setBulkFolder] = useState('');
  const [bulkFolderError, setBulkFolderError] = useState('');
  const [bulkPending, setBulkPending] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const bulkFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedSets(new Set());
    setBulkFolderMode(false);
    setDeleteConfirming(false);
  }, [query]);

  useEffect(() => {
    if (bulkFolderMode) bulkFolderInputRef.current?.focus();
  }, [bulkFolderMode]);

  const hasBulkOps = !!(onBulkDelete || onBulkDuplicate || onBulkMoveToFolder);
  const hasSelection = selectedSets.size > 0;
  const canDrag = !!onReorderFull && !hasSelection && !bulkFolderMode && !deleteConfirming;

  const toggleSelect = (set: string) => {
    setSelectedSets(prev => {
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
    setBulkFolder('');
    setBulkFolderError('');
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
      setBulkFolderError('Folder name cannot be empty');
      return;
    }
    if (!FOLDER_NAME_RE.test(folder)) {
      setBulkFolderError('Use letters, numbers, - and _ (/ for sub-folders)');
      return;
    }
    const moves = Array.from(selectedSets).map(set => ({
      from: set,
      to: `${folder}/${leafName(set)}`,
    }));
    const actualMoves = moves.filter(move => move.from !== move.to);
    if (!actualMoves.length) {
      setBulkFolderError('All selected sets are already in that folder');
      return;
    }
    setBulkPending(true);
    setBulkFolderError('');
    try {
      await onBulkMoveToFolder(actualMoves);
      clearSelection();
      setBulkFolder('');
    } catch (err) {
      setBulkFolderError(err instanceof Error ? err.message : 'Move failed');
    } finally {
      setBulkPending(false);
    }
  };

  const handleDragStart = useCallback((e: React.DragEvent, setName: string) => {
    setDragSetName(setName);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, setName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragSetName && dragSetName !== setName) setDragOverSetName(setName);
  }, [dragSetName]);

  const handleDragEnd = useCallback(() => {
    setDragSetName(null);
    setDragOverSetName(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetSetName: string) => {
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
  }, [dragSetName, sets, onReorderFull, handleDragEnd]);

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-6 text-[11px] text-[var(--color-figma-text-secondary)]">
        No sets match &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
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
                {bulkPending ? 'Working…' : 'Duplicate'}
              </button>
            )}
            {onBulkDelete && !deleteConfirming && !bulkFolderMode && (
              <button
                onClick={() => {
                  setDeleteConfirming(true);
                  setBulkFolderMode(false);
                }}
                disabled={bulkPending}
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-red-500 transition-colors hover:bg-[var(--color-figma-bg-hover)]"
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M1 1l8 8M9 1L1 9" />
              </svg>
            </button>
          </div>

          {deleteConfirming && (
            <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/10 px-2 py-1.5 text-[11px]">
              <span className="flex-1 text-[var(--color-figma-text)]">
                Delete {selectedSets.size} set{selectedSets.size !== 1 ? 's' : ''}? This cannot be undone.
              </span>
              <button
                onClick={handleBulkDeleteConfirm}
                disabled={bulkPending}
                className="shrink-0 rounded bg-red-500 px-2 py-0.5 text-[10px] text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {bulkPending ? 'Deleting…' : 'Confirm delete'}
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
                  onChange={e => {
                    setBulkFolder(e.target.value);
                    setBulkFolderError('');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBulkMoveToFolder();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setBulkFolderMode(false);
                      setBulkFolder('');
                      setBulkFolderError('');
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
                  {bulkPending ? 'Moving…' : 'Move'}
                </button>
                <button
                  onClick={() => {
                    setBulkFolderMode(false);
                    setBulkFolder('');
                    setBulkFolderError('');
                  }}
                  disabled={bulkPending}
                  className="shrink-0 rounded px-1.5 py-1 text-[11px] text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  Cancel
                </button>
              </div>
              {bulkFolderError && <div className="mt-1 text-[10px] text-red-500">{bulkFolderError}</div>}
            </div>
          )}
        </div>
      )}

      {filtered.map(set => {
        const isCurrent = set === activeSet;
        const idx = sets.indexOf(set);
        const isFirst = idx === 0;
        const isLast = idx === sets.length - 1;
        const tokenCount = setTokenCounts[set];
        const description = setDescriptions[set];
        const themeLabels = setThemeLabels[set] ?? [];
        const isSelected = selectedSets.has(set);
        const isDragging = dragSetName === set;
        const isDragOver = dragOverSetName === set && dragSetName !== set;
        const isRenaming = renamingSet === set;

        return (
          <div
            key={set}
            draggable={canDrag && !isRenaming}
            onDragStart={canDrag ? e => handleDragStart(e, set) : undefined}
            onDragOver={canDrag ? e => handleDragOver(e, set) : undefined}
            onDrop={canDrag ? e => handleDrop(e, set) : undefined}
            onDragEnd={canDrag ? handleDragEnd : undefined}
            className={`group relative flex items-start gap-2 border-b border-[var(--color-figma-border)] px-3 py-2.5 text-[12px] transition-colors last:border-b-0 ${
              isDragging ? 'opacity-40' : ''
            } ${
              isDragOver
                ? 'border-l-2 border-l-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]'
                : isSelected
                  ? 'bg-[var(--color-figma-accent)]/8'
                  : 'hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {hasBulkOps && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(set)}
                onClick={e => e.stopPropagation()}
                className="mt-1 shrink-0 cursor-pointer accent-[var(--color-figma-accent)]"
                aria-label={`Select ${set}`}
              />
            )}

            {canDrag ? (
              <span
                className="mt-1 shrink-0 cursor-grab text-[var(--color-figma-text-secondary)] opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60 active:cursor-grabbing"
                aria-hidden="true"
              >
                <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
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
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => {
                      setRenameValue?.(e.target.value.trimStart());
                      setRenameError?.('');
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') onRenameConfirm?.();
                      if (e.key === 'Escape') onRenameCancel?.();
                    }}
                    onBlur={() => onRenameCancel?.()}
                    aria-label="Rename token set"
                    className="w-full rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-2 py-1 text-[11px] text-[var(--color-figma-text)] outline-none"
                  />
                  {renameError && <span className="text-[10px] text-red-500">{renameError}</span>}
                </div>
              ) : (
                <>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className={`min-w-0 truncate ${isCurrent ? 'font-medium text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}`}>
                      <SetNameDisplay name={set} />
                    </span>
                    {isCurrent && (
                      <span className="rounded bg-[var(--color-figma-accent)]/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-figma-accent)]">
                        Active
                      </span>
                    )}
                    <ThemeBadges labels={themeLabels} />
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
                      onClick={() => onReorder(set, 'left')}
                    >
                      <path d="M5 2L9 7H1L5 2Z" />
                    </IconButton>
                  )}
                  {onReorder && !canDrag && (
                    <IconButton
                      title="Move down"
                      ariaLabel="Move down"
                      disabled={isLast}
                      onClick={() => onReorder(set, 'right')}
                    >
                      <path d="M5 8L1 3H9L5 8Z" />
                    </IconButton>
                  )}
                  {onOpenGenerators && (
                    <StrokeIconButton title="Generate tokens" ariaLabel="Generate tokens" onClick={() => onOpenGenerators(set)}>
                      <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
                    </StrokeIconButton>
                  )}
                  {onEditInfo && (
                    <StrokeIconButton title="Edit set info" ariaLabel="Edit set info" onClick={() => onEditInfo(set)}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="16" x2="12" y2="12" />
                      <line x1="12" y1="8" x2="12.01" y2="8" />
                    </StrokeIconButton>
                  )}
                  {onRename && (
                    <StrokeIconButton title="Rename or move" ariaLabel="Rename or move" onClick={() => onRename(set)}>
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </StrokeIconButton>
                  )}
                  {onDuplicate && (
                    <StrokeIconButton title="Duplicate" ariaLabel="Duplicate" onClick={() => onDuplicate(set)}>
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </StrokeIconButton>
                  )}
                  {onMerge && (
                    <StrokeIconButton title="Merge into another set" ariaLabel="Merge into another set" onClick={() => onMerge(set)}>
                      <path d="M7 7h5a4 4 0 014 4v0" />
                      <path d="M7 17h5a4 4 0 004-4v0" />
                      <path d="M7 12h10" />
                      <path d="M5 7l-2 2 2 2" />
                      <path d="M5 15l-2-2 2-2" />
                    </StrokeIconButton>
                  )}
                  {onSplit && (
                    <StrokeIconButton title="Split by group" ariaLabel="Split by group" onClick={() => onSplit(set)}>
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
      })}
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
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
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
          ? 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-red-500'
          : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]'
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
