import { useState, useEffect, useRef, useCallback } from 'react';
import type { ThemeDimension, ThemeSetStatus } from '@tokenmanager/core';
import { SET_NAME_RE } from '../shared/utils';
import { fuzzyScore } from '../shared/fuzzyMatch';

interface FolderGroup {
  folder: string;
  sets: string[];
}
type GroupItem = string | FolderGroup;

/** Group a flat list of set names by their first path segment. Preserves original order. */
function buildFolderGroups(sets: string[]): GroupItem[] {
  const folderMap = new Map<string, string[]>();
  for (const set of sets) {
    const slashIdx = set.indexOf('/');
    if (slashIdx !== -1) {
      const folder = set.slice(0, slashIdx);
      if (!folderMap.has(folder)) folderMap.set(folder, []);
      folderMap.get(folder)!.push(set);
    }
  }
  const result: GroupItem[] = [];
  const seenFolders = new Set<string>();
  for (const set of sets) {
    const slashIdx = set.indexOf('/');
    if (slashIdx === -1) {
      result.push(set);
    } else {
      const folder = set.slice(0, slashIdx);
      if (!seenFolders.has(folder)) {
        seenFolders.add(folder);
        result.push({ folder, sets: folderMap.get(folder)! });
      }
    }
  }
  return result;
}

interface SetThemeLabel {
  option: string;
  status: ThemeSetStatus;
}

/** Build a map from set name → theme option labels (enabled/source only, not disabled). */
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
    <span className="flex items-center gap-0.5 flex-shrink-0 ml-1.5">
      {labels.map((l, i) => (
        <span
          key={i}
          className={`text-[9px] px-1 py-px rounded leading-tight ${
            l.status === 'enabled'
              ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
              : 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]'
          }`}
          title={l.status === 'enabled' ? `Theme override: ${l.option}` : `Theme base: ${l.option}`}
        >
          {l.option}
        </span>
      ))}
    </span>
  );
}

interface SetSwitcherProps {
  sets: string[];
  activeSet: string;
  onSelect: (set: string) => void;
  onClose: () => void;
  initialMode?: 'switch' | 'manage';
  // Management callbacks (used in manage mode)
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: 'left' | 'right') => void;
  onReorderFull?: (newOrder: string[]) => void;
  onCreateSet?: (name: string) => Promise<void>;
  onEditInfo?: (setName: string) => void;
  setTokenCounts?: Record<string, number>;
  setDescriptions?: Record<string, string>;
  dimensions?: ThemeDimension[];
  // Bulk operation callbacks (manage mode multi-select)
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (moves: Array<{ from: string; to: string }>) => Promise<void>;
}


/** Render a set name with folder prefix dimmed. e.g. "brand/colors" → <dim>brand/</dim>colors */
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

export function SetSwitcher({
  sets,
  activeSet,
  onSelect,
  onClose,
  initialMode = 'switch',
  onRename,
  onDuplicate,
  onDelete,
  onReorder,
  onReorderFull,
  onCreateSet,
  onEditInfo,
  setTokenCounts = {},
  setDescriptions = {},
  dimensions = [],
  onBulkDelete,
  onBulkDuplicate,
  onBulkMoveToFolder,
}: SetSwitcherProps) {
  const setThemeLabels = buildSetThemeLabels(dimensions);
  const [mode, setMode] = useState<'switch' | 'manage'>(initialMode);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(() => {
    const idx = sets.indexOf(activeSet);
    return idx >= 0 ? idx : 0;
  });
  // New set creation state (manage mode)
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetError, setNewSetError] = useState('');
  const [createPending, setCreatePending] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const newSetInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Focus new set input when create form opens
  useEffect(() => {
    if (creatingSet) newSetInputRef.current?.focus();
  }, [creatingSet]);

  const filtered = query
    ? sets
        .map(s => ({ s, score: fuzzyScore(query, s) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ s }) => s)
    : sets;

  useEffect(() => {
    const idx = filtered.indexOf(activeSet);
    setActiveIdx(idx >= 0 ? idx : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Scroll active item into view (switch mode) — query by name so collapsed folders don't shift indices
  useEffect(() => {
    if (mode !== 'switch') return;
    const list = listRef.current;
    if (!list) return;
    const setName = filtered[activeIdx];
    if (!setName) return;
    const active = list.querySelector(`[data-set-name="${setName.replace(/"/g, '\\"')}"]`) as HTMLElement | null;
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, mode, filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (mode !== 'switch') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const set = filtered[activeIdx];
      if (set) { onSelect(set); onClose(); }
    }
  };

  const handleCreateSubmit = async () => {
    const name = newSetName.trim();
    if (!name) { setNewSetError('Name cannot be empty'); return; }
    if (!SET_NAME_RE.test(name)) { setNewSetError('Letters, numbers, - _ and / for folders'); return; }
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

  const handleModeChange = (newMode: 'switch' | 'manage') => {
    setMode(newMode);
    setQuery('');
    setCreatingSet(false);
    setNewSetName('');
    setNewSetError('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const canManage = !!(onRename || onDuplicate || onDelete || onReorder || onReorderFull || onCreateSet || onEditInfo);

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 pt-16"
      onClick={onClose}
    >
      <div
        className="bg-[var(--color-figma-bg)] rounded border border-[var(--color-figma-border)] shadow-2xl w-full mx-3 flex flex-col"
        style={{ maxHeight: '70vh' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'manage' ? 'Manage token sets' : 'Switch token set'}
      >
        {/* Header: search + mode toggle */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--color-figma-border)]">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-secondary)] shrink-0">
            <circle cx="6" cy="6" r="4" />
            <path d="M9 9l3 3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); }}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'manage' ? 'Filter sets…' : 'Switch to set…'}
            aria-label="Filter token sets"
            className="flex-1 bg-transparent outline-none text-[12px] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
          />
          {canManage && (
            <div className="flex shrink-0 text-[10px] rounded overflow-hidden border border-[var(--color-figma-border)]">
              <button
                onClick={() => handleModeChange('switch')}
                className={`px-2 py-1 transition-colors ${mode === 'switch' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >
                Switch
              </button>
              <button
                onClick={() => handleModeChange('manage')}
                className={`px-2 py-1 transition-colors border-l border-[var(--color-figma-border)] ${mode === 'manage' ? 'bg-[var(--color-figma-accent)] text-white' : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >
                Manage
              </button>
            </div>
          )}
          {!canManage && (
            <kbd className="text-[10px] text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1 py-0.5 shrink-0">
              ESC
            </kbd>
          )}
        </div>

        {/* Content */}
        {mode === 'switch' ? (
          <SwitchView
            listRef={listRef}
            filtered={filtered}
            activeSet={activeSet}
            activeIdx={activeIdx}
            query={query}
            onSelect={(set) => { onSelect(set); onClose(); }}
            setThemeLabels={setThemeLabels}
          />
        ) : (
          <ManageView
            listRef={listRef}
            filtered={filtered}
            sets={sets}
            activeSet={activeSet}
            query={query}
            setTokenCounts={setTokenCounts}
            setDescriptions={setDescriptions}
            setThemeLabels={setThemeLabels}
            onSelect={(set) => { onSelect(set); onClose(); }}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onReorder={onReorder}
            onReorderFull={onReorderFull}
            onEditInfo={onEditInfo}
            creatingSet={creatingSet}
            setCreatingSet={setCreatingSet}
            newSetName={newSetName}
            setNewSetName={setNewSetName}
            newSetError={newSetError}
            setNewSetError={setNewSetError}
            createPending={createPending}
            newSetInputRef={newSetInputRef}
            onCreateSubmit={handleCreateSubmit}
            canCreate={!!onCreateSet}
            onBulkDelete={onBulkDelete}
            onBulkDuplicate={onBulkDuplicate}
            onBulkMoveToFolder={onBulkMoveToFolder}
          />
        )}

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] flex items-center justify-between">
          <span>
            {filtered.length === sets.length
              ? `${sets.length} set${sets.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${sets.length} sets`}
          </span>
          {mode === 'switch' && (
            <span className="opacity-60">↑↓ navigate · ↵ switch · ESC close</span>
          )}
          {mode === 'manage' && (
            <span className="opacity-60">ESC close</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SwitchViewProps {
  listRef: React.RefObject<HTMLDivElement>;
  filtered: string[];
  activeSet: string;
  activeIdx: number;
  query: string;
  onSelect: (set: string) => void;
  setThemeLabels: Record<string, SetThemeLabel[]>;
}

function SwitchView({ listRef, filtered, activeSet, activeIdx, query, onSelect, setThemeLabels }: SwitchViewProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Expand all folders when searching so results are always visible
  useEffect(() => {
    if (query) setCollapsedFolders(new Set());
  }, [query]);

  // Auto-expand folder when keyboard navigation lands on an item inside it
  useEffect(() => {
    const set = filtered[activeIdx];
    if (!set) return;
    const slashIdx = set.indexOf('/');
    if (slashIdx === -1) return;
    const folder = set.slice(0, slashIdx);
    if (collapsedFolders.has(folder)) {
      setCollapsedFolders(prev => { const s = new Set(prev); s.delete(folder); return s; });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx]);

  const toggleFolder = (folder: string) => {
    setCollapsedFolders(prev => {
      const s = new Set(prev);
      if (s.has(folder)) s.delete(folder); else s.add(folder);
      return s;
    });
  };

  const hasFolders = filtered.some(s => s.includes('/'));
  const groups = hasFolders ? buildFolderGroups(filtered) : null;

  const renderSetButton = (set: string, indented: boolean) => {
    const isCurrent = set === activeSet;
    const isHighlighted = filtered[activeIdx] === set;
    const label = indented ? set.slice(set.indexOf('/') + 1) : null;
    const themeLabels = setThemeLabels[set] ?? [];
    return (
      <button
        key={set}
        data-set-item
        data-set-name={set}
        onClick={() => onSelect(set)}
        className={`w-full flex items-center justify-between text-left text-[12px] transition-colors py-2 pr-3 ${indented ? 'pl-6' : 'px-3'} ${isHighlighted ? 'bg-[var(--color-figma-bg-hover)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
        role="option"
        aria-selected={isCurrent}
      >
        <span className={`flex items-center min-w-0 flex-1 ${isCurrent ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}`}>
          {label !== null ? <span>{label}</span> : <SetNameDisplay name={set} />}
          <ThemeBadges labels={themeLabels} />
        </span>
        {isCurrent && (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 ml-2">active</span>
        )}
      </button>
    );
  };

  return (
    <div ref={listRef} className="overflow-y-auto flex-1" role="listbox" aria-label="Token sets">
      {filtered.length === 0 ? (
        <div className="px-3 py-4 text-[11px] text-[var(--color-figma-text-secondary)] text-center">
          No sets match &ldquo;{query}&rdquo;
        </div>
      ) : groups ? (
        groups.map(group => {
          if (typeof group === 'string') {
            return renderSetButton(group, false);
          }
          const isCollapsed = collapsedFolders.has(group.folder);
          const hasActiveSet = group.sets.some(s => s === activeSet);
          return (
            <div key={group.folder}>
              <button
                onClick={() => toggleFolder(group.folder)}
                className="w-full flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-b border-[var(--color-figma-border)]"
              >
                <svg
                  width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
                  className={`shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                  aria-hidden="true"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <span className="font-medium">{group.folder}/</span>
                <span className="opacity-50 text-[10px]">{group.sets.length}</span>
                {hasActiveSet && isCollapsed && (
                  <span className="ml-auto text-[var(--color-figma-accent)] leading-none" aria-label="contains active set">●</span>
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

interface ManageViewProps {
  listRef: React.RefObject<HTMLDivElement>;
  filtered: string[];
  sets: string[];
  activeSet: string;
  query: string;
  setTokenCounts: Record<string, number>;
  setDescriptions: Record<string, string>;
  setThemeLabels: Record<string, SetThemeLabel[]>;
  onSelect: (set: string) => void;
  onRename?: (setName: string) => void;
  onDuplicate?: (setName: string) => void;
  onDelete?: (setName: string) => void;
  onReorder?: (setName: string, direction: 'left' | 'right') => void;
  onReorderFull?: (newOrder: string[]) => void;
  onEditInfo?: (setName: string) => void;
  creatingSet: boolean;
  setCreatingSet: (v: boolean) => void;
  newSetName: string;
  setNewSetName: (v: string) => void;
  newSetError: string;
  setNewSetError: (v: string) => void;
  createPending: boolean;
  newSetInputRef: React.RefObject<HTMLInputElement>;
  onCreateSubmit: () => void;
  canCreate: boolean;
  onBulkDelete?: (sets: string[]) => Promise<void>;
  onBulkDuplicate?: (sets: string[]) => Promise<void>;
  onBulkMoveToFolder?: (moves: Array<{ from: string; to: string }>) => Promise<void>;
}

/** Extract the leaf segment (after last `/`) from a set name. */
function leafName(setName: string): string {
  const idx = setName.lastIndexOf('/');
  return idx === -1 ? setName : setName.slice(idx + 1);
}

/** Folder-name validation: one path segment, no slashes. */
const FOLDER_NAME_RE = /^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/;

function ManageView({
  listRef, filtered, sets, activeSet, query,
  setTokenCounts, setDescriptions, setThemeLabels,
  onSelect, onRename, onDuplicate, onDelete, onReorder, onReorderFull, onEditInfo,
  creatingSet, setCreatingSet, newSetName, setNewSetName,
  newSetError, setNewSetError, createPending,
  newSetInputRef, onCreateSubmit, canCreate,
  onBulkDelete, onBulkDuplicate, onBulkMoveToFolder,
}: ManageViewProps) {
  const [dragSetName, setDragSetName] = useState<string | null>(null);
  const [dragOverSetName, setDragOverSetName] = useState<string | null>(null);

  // Multi-select state
  const [selectedSets, setSelectedSets] = useState<Set<string>>(new Set());
  const [bulkFolderMode, setBulkFolderMode] = useState(false);
  const [bulkFolder, setBulkFolder] = useState('');
  const [bulkFolderError, setBulkFolderError] = useState('');
  const [bulkPending, setBulkPending] = useState(false);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  const bulkFolderInputRef = useRef<HTMLInputElement>(null);

  // Clear selection when filter query changes
  useEffect(() => {
    setSelectedSets(new Set());
    setBulkFolderMode(false);
    setDeleteConfirming(false);
  }, [query]);

  // Focus folder input when folder mode opens
  useEffect(() => {
    if (bulkFolderMode) bulkFolderInputRef.current?.focus();
  }, [bulkFolderMode]);

  const hasBulkOps = !!(onBulkDelete || onBulkDuplicate || onBulkMoveToFolder);
  const hasSelection = selectedSets.size > 0;

  const toggleSelect = (set: string) => {
    setSelectedSets(prev => {
      const s = new Set(prev);
      if (s.has(set)) s.delete(set); else s.add(set);
      return s;
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
    if (!folder) { setBulkFolderError('Folder name cannot be empty'); return; }
    if (!FOLDER_NAME_RE.test(folder)) { setBulkFolderError('Use letters, numbers, - and _ (/ for sub-folders)'); return; }
    const moves = Array.from(selectedSets).map(set => ({
      from: set,
      to: `${folder}/${leafName(set)}`,
    }));
    // Skip no-op moves (already in that exact path)
    const actualMoves = moves.filter(m => m.from !== m.to);
    if (!actualMoves.length) { setBulkFolderError('All selected sets are already in that folder'); return; }
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
    if (dragSetName && dragSetName !== setName) {
      setDragOverSetName(setName);
    }
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
    if (fromIdx === -1 || toIdx === -1) { handleDragEnd(); return; }
    const newOrder = [...sets];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragSetName);
    setDragSetName(null);
    setDragOverSetName(null);
    onReorderFull(newOrder);
  }, [dragSetName, sets, onReorderFull, handleDragEnd]);

  const canDrag = !!onReorderFull;

  return (
    <div ref={listRef} className="overflow-y-auto flex-1">
      {filtered.length === 0 && !creatingSet ? (
        <div className="px-3 py-4 text-[11px] text-[var(--color-figma-text-secondary)] text-center">
          No sets match &ldquo;{query}&rdquo;
        </div>
      ) : (
        <>
          {/* Bulk action toolbar — shown when 1+ sets are selected */}
          {hasBulkOps && hasSelection && (
            <div className="sticky top-0 z-10 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              {/* Main toolbar row */}
              <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]">
                <span className="text-[var(--color-figma-text-secondary)] shrink-0 mr-0.5">
                  {selectedSets.size} selected
                </span>
                {selectedSets.size < filtered.length && (
                  <button
                    onClick={selectAll}
                    className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors shrink-0"
                    disabled={bulkPending}
                  >
                    All
                  </button>
                )}
                <div className="flex-1" />
                {onBulkMoveToFolder && !bulkFolderMode && !deleteConfirming && (
                  <button
                    onClick={() => { setBulkFolderMode(true); setDeleteConfirming(false); }}
                    disabled={bulkPending}
                    className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors shrink-0"
                    title="Move selected sets to a folder"
                  >
                    Move to folder
                  </button>
                )}
                {onBulkDuplicate && !deleteConfirming && !bulkFolderMode && (
                  <button
                    onClick={handleBulkDuplicate}
                    disabled={bulkPending}
                    className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors shrink-0"
                    title="Duplicate selected sets"
                  >
                    {bulkPending ? 'Working…' : 'Duplicate'}
                  </button>
                )}
                {onBulkDelete && !deleteConfirming && !bulkFolderMode && (
                  <button
                    onClick={() => { setDeleteConfirming(true); setBulkFolderMode(false); }}
                    disabled={bulkPending}
                    className="px-1.5 py-0.5 rounded text-[10px] text-red-500 hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
                    title="Delete selected sets"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={clearSelection}
                  disabled={bulkPending}
                  className="ml-0.5 p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors shrink-0"
                  title="Clear selection"
                  aria-label="Clear selection"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M1 1l8 8M9 1L1 9" />
                  </svg>
                </button>
              </div>

              {/* Delete confirmation strip */}
              {deleteConfirming && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-red-500/10 border-t border-red-500/20 text-[11px]">
                  <span className="text-[var(--color-figma-text)] flex-1">
                    Delete {selectedSets.size} set{selectedSets.size !== 1 ? 's' : ''}? This cannot be undone.
                  </span>
                  <button
                    onClick={handleBulkDeleteConfirm}
                    disabled={bulkPending}
                    className="px-2 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 shrink-0 transition-colors"
                  >
                    {bulkPending ? 'Deleting…' : 'Confirm delete'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirming(false)}
                    disabled={bulkPending}
                    className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Move-to-folder input strip */}
              {bulkFolderMode && (
                <div className="px-2 py-1.5 border-t border-[var(--color-figma-border)]">
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={bulkFolderInputRef}
                      type="text"
                      value={bulkFolder}
                      onChange={e => { setBulkFolder(e.target.value); setBulkFolderError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleBulkMoveToFolder(); }
                        if (e.key === 'Escape') { e.preventDefault(); setBulkFolderMode(false); setBulkFolder(''); setBulkFolderError(''); }
                      }}
                      placeholder="Folder name (e.g. brand or brand/sub)"
                      className="flex-1 px-2 py-1 text-[11px] bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded focus-visible:border-[var(--color-figma-accent)] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
                      disabled={bulkPending}
                    />
                    <button
                      onClick={handleBulkMoveToFolder}
                      disabled={bulkPending || !bulkFolder.trim()}
                      className="px-2 py-1 text-[11px] rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 shrink-0 transition-colors"
                    >
                      {bulkPending ? 'Moving…' : 'Move'}
                    </button>
                    <button
                      onClick={() => { setBulkFolderMode(false); setBulkFolder(''); setBulkFolderError(''); }}
                      disabled={bulkPending}
                      className="px-1.5 py-1 text-[11px] rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                  {bulkFolderError && (
                    <div className="mt-1 text-[10px] text-red-500">{bulkFolderError}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {filtered.map((set) => {
            const isCurrent = set === activeSet;
            const idx = sets.indexOf(set);
            const isFirst = idx === 0;
            const isLast = idx === sets.length - 1;
            const tokenCount = setTokenCounts[set];
            const description = setDescriptions[set];

            const isDragOver = dragOverSetName === set && dragSetName !== set;
            const isDragging = dragSetName === set;
            const themeLabels = setThemeLabels[set] ?? [];
            const isSelected = selectedSets.has(set);

            return (
              <div
                key={set}
                draggable={canDrag && !hasBulkOps}
                onDragStart={canDrag && !hasBulkOps ? e => handleDragStart(e, set) : undefined}
                onDragOver={canDrag && !hasBulkOps ? e => handleDragOver(e, set) : undefined}
                onDrop={canDrag && !hasBulkOps ? e => handleDrop(e, set) : undefined}
                onDragEnd={canDrag && !hasBulkOps ? handleDragEnd : undefined}
                className={`group flex items-center gap-2 px-3 py-2 text-[12px] border-b border-[var(--color-figma-border)] last:border-b-0 transition-colors ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-l-2 border-l-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]' : isSelected ? 'bg-[var(--color-figma-accent)]/8' : isCurrent ? 'bg-[var(--color-figma-bg-secondary)]' : 'hover:bg-[var(--color-figma-bg-hover)]'}`}
              >
                {/* Checkbox (multi-select) */}
                {hasBulkOps && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(set)}
                    onClick={e => e.stopPropagation()}
                    className="shrink-0 accent-[var(--color-figma-accent)] cursor-pointer"
                    aria-label={`Select ${set}`}
                  />
                )}

                {/* Drag handle — hidden when bulk ops are available */}
                {canDrag && !hasBulkOps && (
                  <span className="shrink-0 text-[var(--color-figma-text-secondary)] opacity-0 group-hover:opacity-60 group-focus-within:opacity-60 cursor-grab active:cursor-grabbing" aria-hidden="true">
                    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                      <circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
                      <circle cx="2" cy="6" r="1" /><circle cx="6" cy="6" r="1" />
                      <circle cx="2" cy="10" r="1" /><circle cx="6" cy="10" r="1" />
                    </svg>
                  </span>
                )}
                {/* Set name — click to switch to this set */}
                <button
                  onClick={() => onSelect(set)}
                  className="flex-1 text-left min-w-0 flex items-center"
                  title={description || set}
                >
                  <span className={isCurrent ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text)]'}>
                    <SetNameDisplay name={set} />
                  </span>
                  <ThemeBadges labels={themeLabels} />
                  {isCurrent && (
                    <span className="ml-2 text-[10px] text-[var(--color-figma-text-secondary)]">active</span>
                  )}
                </button>

                {/* Token count badge */}
                {tokenCount !== undefined && (
                  <span className="shrink-0 text-[10px] text-[var(--color-figma-text-secondary)] tabular-nums">
                    {tokenCount}
                  </span>
                )}

                {/* Action buttons */}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                  {/* Move up/down buttons — only shown when drag-and-drop is not available */}
                  {onReorder && !canDrag && (
                    <button
                      onClick={() => onReorder(set, 'left')}
                      disabled={isFirst}
                      title="Move up"
                      aria-label="Move up"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                        <path d="M5 2L9 7H1L5 2Z" />
                      </svg>
                    </button>
                  )}
                  {onReorder && !canDrag && (
                    <button
                      onClick={() => onReorder(set, 'right')}
                      disabled={isLast}
                      title="Move down"
                      aria-label="Move down"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                        <path d="M5 8L1 3H9L5 8Z" />
                      </svg>
                    </button>
                  )}
                  {/* Edit info */}
                  {onEditInfo && (
                    <button
                      onClick={() => onEditInfo(set)}
                      title="Edit set info"
                      aria-label="Edit set info"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>
                  )}
                  {/* Rename */}
                  {onRename && (
                    <button
                      onClick={() => onRename(set)}
                      title="Rename"
                      aria-label="Rename"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}
                  {/* Duplicate */}
                  {onDuplicate && (
                    <button
                      onClick={() => onDuplicate(set)}
                      title="Duplicate"
                      aria-label="Duplicate"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                      </svg>
                    </button>
                  )}
                  {/* Delete */}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(set)}
                      title="Delete"
                      aria-label="Delete"
                      className="p-1 rounded text-[var(--color-figma-text-secondary)] hover:text-red-500 hover:bg-[var(--color-figma-bg-secondary)]"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* New set create form */}
          {canCreate && (
            <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
              {creatingSet ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={newSetInputRef}
                      type="text"
                      value={newSetName}
                      onChange={e => { setNewSetName(e.target.value); setNewSetError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); onCreateSubmit(); }
                        if (e.key === 'Escape') { e.preventDefault(); setCreatingSet(false); setNewSetName(''); setNewSetError(''); }
                      }}
                      placeholder="Set name (e.g. primitives or brand/colors)"
                      className="flex-1 px-2 py-1 text-[11px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded focus-visible:border-[var(--color-figma-accent)] text-[var(--color-figma-text)] placeholder-[var(--color-figma-text-secondary)]"
                      disabled={createPending}
                    />
                    <button
                      onClick={onCreateSubmit}
                      disabled={createPending || !newSetName.trim()}
                      className="px-2 py-1 text-[11px] rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 shrink-0"
                    >
                      {createPending ? 'Creating…' : 'Create'}
                    </button>
                    <button
                      onClick={() => { setCreatingSet(false); setNewSetName(''); setNewSetError(''); }}
                      className="px-2 py-1 text-[11px] rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
                    >
                      Cancel
                    </button>
                  </div>
                  {newSetError && (
                    <div className="text-[10px] text-red-500">{newSetError}</div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setCreatingSet(true)}
                  className="flex items-center gap-1.5 text-[11px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                    <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                  </svg>
                  New set
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
