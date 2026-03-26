import { useState, useEffect, useCallback, useRef } from 'react';
import { ConfirmModal } from './ConfirmModal';

const STATE_LABELS: Record<string, string> = {
  disabled: 'Off',
  source: 'Base',
  enabled: 'On',
};

const STATE_DESCRIPTIONS: Record<string, string> = {
  disabled: 'Not used in this theme',
  source: 'Foundation set — tokens can be overridden by "On" sets',
  enabled: 'Active in this theme — overrides the base set',
};

interface Theme {
  name: string;
  sets: Record<string, 'enabled' | 'disabled' | 'source'>;
}

interface ThemeManagerProps {
  serverUrl: string;
  connected: boolean;
  sets: string[];
}

type CoverageMap = Record<string, { uncovered: string[] }>;

function flattenTokenEntries(group: Record<string, any>, prefix = ''): Array<{ path: string; value: any }> {
  const entries: Array<{ path: string; value: any }> = [];
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && '$value' in value) {
      entries.push({ path, value: value.$value });
    } else if (value && typeof value === 'object') {
      entries.push(...flattenTokenEntries(value, path));
    }
  }
  return entries;
}

function getThemeStatus(theme: Theme): string {
  const baseSets = Object.entries(theme.sets).filter(([, s]) => s === 'source').map(([n]) => n);
  const onSets = Object.entries(theme.sets).filter(([, s]) => s === 'enabled').map(([n]) => n);
  if (baseSets.length === 0 && onSets.length === 0) return '';
  const parts: string[] = [];
  if (baseSets.length > 0) parts.push(`Base: ${baseSets.join(', ')}`);
  if (onSets.length > 0) parts.push(`+${onSets.length} active`);
  return parts.join(' · ');
}

export function ThemeManager({ serverUrl, connected, sets }: ThemeManagerProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newThemeName, setNewThemeName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [renameTheme, setRenameTheme] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<CoverageMap>({});
  const [expandedCoverage, setExpandedCoverage] = useState<string | null>(null);
  // Per-theme ordered list of set names (determines override precedence)
  const [themeSetOrders, setThemeSetOrders] = useState<Record<string, string[]>>({});
  const [dragInfo, setDragInfo] = useState<{ themeName: string; setName: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ themeName: string; setName: string } | null>(null);
  // Card-level drag-to-reorder
  const [themeOrder, setThemeOrder] = useState<string[]>(() => {
    try { const s = localStorage.getItem('themeCardOrder'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [cardDragInfo, setCardDragInfo] = useState<string | null>(null);
  const [cardDragOver, setCardDragOver] = useState<string | null>(null);
  const [newlyCreatedTheme, setNewlyCreatedTheme] = useState<string | null>(null);
  const newThemeCardRef = useRef<HTMLDivElement | null>(null);

  const fetchThemes = useCallback(async () => {
    if (!connected) { setLoading(false); return; }
    try {
      const themesRes = await fetch(`${serverUrl}/api/themes`);
      const themesData = await themesRes.json();
      const allThemes: Theme[] = themesData.themes || [];
      setThemes(allThemes);

      // Reconcile card order: preserve user's order, append new themes, drop deleted ones.
      setThemeOrder(prev => {
        const allNames = allThemes.map(t => t.name);
        const existing = prev.filter(n => allNames.includes(n));
        const added = allNames.filter(n => !existing.includes(n));
        return [...existing, ...added];
      });

      // Initialise per-theme set orders from server key-insertion order.
      // Don't overwrite existing orders to avoid jank during a drag.
      setThemeSetOrders(prev => {
        const next = { ...prev };
        for (const theme of allThemes) {
          if (!next[theme.name]) {
            const themeSetKeys = Object.keys(theme.sets).filter(s => sets.includes(s));
            const rest = sets.filter(s => !themeSetKeys.includes(s));
            next[theme.name] = [...themeSetKeys, ...rest];
          }
        }
        return next;
      });

      // Compute coverage: fetch flat token values per set
      const setTokenValues: Record<string, Record<string, any>> = {};
      await Promise.all(sets.map(async (s) => {
        try {
          const res = await fetch(`${serverUrl}/api/tokens/${s}`);
          if (res.ok) {
            const data = await res.json();
            const map: Record<string, any> = {};
            for (const { path, value } of flattenTokenEntries(data.tokens || {})) {
              map[path] = value;
            }
            setTokenValues[s] = map;
          }
        } catch { /* ignore */ }
      }));

      // For each theme, compute uncovered paths using fully-resolved alias chains.
      // Only tokens in active (source/enabled) sets are considered; disabled-set
      // paths are intentionally inactive and must not inflate the count.
      const cov: CoverageMap = {};
      for (const theme of allThemes) {
        // Merge active set values: source first (base), then enabled (overrides)
        const activeValues: Record<string, any> = {};
        for (const [setName, state] of Object.entries(theme.sets)) {
          if (state === 'source') Object.assign(activeValues, setTokenValues[setName] ?? {});
        }
        for (const [setName, state] of Object.entries(theme.sets)) {
          if (state === 'enabled') Object.assign(activeValues, setTokenValues[setName] ?? {});
        }

        // Returns true only if the value resolves to a concrete value within the active set pool.
        const isResolved = (value: any, visited = new Set<string>()): boolean => {
          if (typeof value !== 'string') return true;
          const m = /^\{([^}]+)\}$/.exec(value);
          if (!m) return true; // not an alias syntax
          const target = m[1];
          if (visited.has(target)) return false; // circular reference
          if (!(target in activeValues)) return false; // target not available in active sets
          return isResolved(activeValues[target], new Set([...visited, target]));
        };

        const uncovered = Object.entries(activeValues)
          .filter(([, value]) => !isResolved(value))
          .map(([path]) => path);

        cov[theme.name] = { uncovered };
      }
      setCoverage(cov);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }, [serverUrl, connected, sets]);

  useEffect(() => {
    fetchThemes();
  }, [fetchThemes]);

  const handleCreate = async () => {
    if (!newThemeName || !connected) return;
    const trimmedName = newThemeName.trim();
    if (themes.some(t => t.name === trimmedName)) {
      setCreateError(`A theme named "${trimmedName}" already exists.`);
      return;
    }
    setCreateError(null);
    try {
      const defaultSets: Record<string, 'disabled'> = {};
      sets.forEach(s => { defaultSets[s] = 'disabled'; });
      await fetch(`${serverUrl}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, sets: defaultSets }),
      });
      setThemes(prev => [...prev, { name: trimmedName, sets: defaultSets }]);
      setNewThemeName('');
      setShowCreate(false);
      setNewlyCreatedTheme(trimmedName);
      fetchThemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  const handleDelete = (name: string) => {
    setDeleteConfirm(name);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const name = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await fetch(`${serverUrl}/api/themes/${encodeURIComponent(name)}`, { method: 'DELETE' });
      setThemes(prev => prev.filter(t => t.name !== name));
      fetchThemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  const startRename = (name: string) => {
    setRenameTheme(name);
    setRenameValue(name);
    setRenameError(null);
  };

  const cancelRename = () => {
    setRenameTheme(null);
    setRenameValue('');
    setRenameError(null);
  };

  const executeRename = async () => {
    if (!renameTheme) return;
    const newName = renameValue.trim();
    if (!newName) { setRenameError('Name cannot be empty'); return; }
    if (newName === renameTheme) { cancelRename(); return; }
    if (themes.some(t => t.name === newName)) {
      setRenameError(`A theme named "${newName}" already exists.`);
      return;
    }
    const theme = themes.find(t => t.name === renameTheme);
    if (!theme) { cancelRename(); return; }
    try {
      await fetch(`${serverUrl}/api/themes/${encodeURIComponent(renameTheme)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      cancelRename();
      fetchThemes();
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleSetState = async (themeName: string, setName: string, targetState: string) => {
    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;
    if (themeName === newlyCreatedTheme) setNewlyCreatedTheme(null);

    const updatedSets = { ...theme.sets, [setName]: targetState as 'enabled' | 'disabled' | 'source' };
    const previousThemes = themes;
    // Optimistic update — flip the button immediately without waiting for the server.
    setThemes(prev => prev.map(t => t.name === themeName ? { ...t, sets: updatedSets } : t));
    try {
      await fetch(`${serverUrl}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: themeName, sets: updatedSets }),
      });
      fetchThemes();
    } catch (err) {
      setThemes(previousThemes); // revert on error
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  // --- Drag-to-reorder set rows ---

  const handleDragStart = (e: React.DragEvent, themeName: string, setName: string) => {
    setDragInfo({ themeName, setName });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, themeName: string, setName: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragInfo || dragInfo.themeName !== themeName || dragInfo.setName === setName) return;
    setDragOver({ themeName, setName });
  };

  const handleDrop = async (e: React.DragEvent, themeName: string, targetSetName: string) => {
    e.preventDefault();
    if (!dragInfo || dragInfo.themeName !== themeName) return;

    const theme = themes.find(t => t.name === themeName);
    if (!theme) return;

    const order = [...(themeSetOrders[themeName] || sets)];
    const fromIdx = order.indexOf(dragInfo.setName);
    const toIdx = order.indexOf(targetSetName);

    setDragInfo(null);
    setDragOver(null);

    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;

    const newOrder = [...order];
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, dragInfo.setName);

    setThemeSetOrders(prev => ({ ...prev, [themeName]: newOrder }));

    // Persist to server: rebuild sets object in new key order so the server
    // stores override precedence correctly (source → then enabled, by position).
    const reorderedSets: Record<string, 'enabled' | 'disabled' | 'source'> = {};
    for (const s of newOrder) {
      reorderedSets[s] = theme.sets[s] ?? 'enabled';
    }

    try {
      await fetch(`${serverUrl}/api/themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: themeName, sets: reorderedSets }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save set order');
    }
  };

  const handleDragEnd = () => {
    setDragInfo(null);
    setDragOver(null);
  };

  // --- Drag-to-reorder theme cards ---

  const handleCardDragStart = (e: React.DragEvent, themeName: string) => {
    setCardDragInfo(themeName);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCardDragOver = (e: React.DragEvent, themeName: string) => {
    if (!cardDragInfo || cardDragInfo === themeName) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setCardDragOver(themeName);
  };

  const handleCardDrop = (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    if (!cardDragInfo || cardDragInfo === targetName) return;
    const dragging = cardDragInfo;
    setCardDragInfo(null);
    setCardDragOver(null);
    setThemeOrder(prev => {
      const fromIdx = prev.indexOf(dragging);
      const toIdx = prev.indexOf(targetName);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragging);
      try { localStorage.setItem('themeCardOrder', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleCardDragEnd = () => {
    setCardDragInfo(null);
    setCardDragOver(null);
  };

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to manage themes
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
        Loading themes...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {error && (
        <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {themes.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center justify-center py-8 text-[var(--color-figma-text-secondary)] text-center px-4">
            <p className="text-[12px] font-medium text-[var(--color-figma-text)]">No themes configured</p>
            <p className="text-[10px] mt-1.5 leading-relaxed">Themes let you switch between token sets — for example, light and dark modes. Each theme enables a different combination of sets, making it easy to publish multi-mode Figma variables.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
            >
              Create your first theme
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {(themeOrder.length > 0 ? themeOrder.map(n => themes.find(t => t.name === n)).filter((t): t is Theme => !!t) : themes).map(theme => (
              <div
                key={theme.name}
                ref={theme.name === newlyCreatedTheme ? (el) => { if (el) { newThemeCardRef.current = el; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } } : undefined}
                draggable
                onDragStart={e => handleCardDragStart(e, theme.name)}
                onDragOver={e => handleCardDragOver(e, theme.name)}
                onDrop={e => handleCardDrop(e, theme.name)}
                onDragEnd={handleCardDragEnd}
                className={`group rounded border overflow-hidden transition-opacity ${
                  cardDragInfo === theme.name
                    ? 'opacity-40 border-[var(--color-figma-border)]'
                    : cardDragOver === theme.name
                    ? 'border-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40'
                    : 'border-[var(--color-figma-border)]'
                }`}
              >
                {/* Theme header */}
                <div className="flex items-center justify-between px-3 py-2 bg-[var(--color-figma-bg-secondary)]">
                  {renameTheme === theme.name ? (
                    <div className="flex flex-col gap-1 flex-1 mr-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={e => { setRenameValue(e.target.value); setRenameError(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') executeRename(); else if (e.key === 'Escape') cancelRename(); }}
                          className={`flex-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] ${renameError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
                          autoFocus
                        />
                        <button onClick={executeRename} disabled={!renameValue.trim()} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40">Save</button>
                        <button onClick={cancelRename} className="px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
                      </div>
                      {renameError && <p className="text-[9px] text-[var(--color-figma-error)]">{renameError}</p>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className="text-[var(--color-figma-text-tertiary)] cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                          <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
                          <circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/>
                          <circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/>
                        </svg>
                      </span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-medium truncate max-w-[140px]" title={theme.name}>{theme.name}</span>
                          <button
                            onClick={() => startRename(theme.name)}
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] flex-shrink-0"
                            title="Rename theme"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </div>
                        {(() => {
                          const status = getThemeStatus(theme);
                          const hasUncovered = (coverage[theme.name]?.uncovered.length ?? 0) > 0;
                          const isNew = newlyCreatedTheme === theme.name;
                          if (isNew && !status) {
                            return (
                              <span className="text-[9px] text-[var(--color-figma-accent)]">
                                Set at least one set to "Base" below
                              </span>
                            );
                          }
                          if (!status && !hasUncovered) return null;
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {status && (
                                <span className="text-[9px] text-[var(--color-figma-text-secondary)] truncate">{status}</span>
                              )}
                              {hasUncovered && (
                                <button
                                  onClick={() => setExpandedCoverage(expandedCoverage === theme.name ? null : theme.name)}
                                  className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-warning)]/15 text-[var(--color-figma-warning)] border border-[var(--color-figma-warning)]/40 hover:bg-[var(--color-figma-warning)]/25 transition-colors flex-shrink-0"
                                  title={`${coverage[theme.name].uncovered.length} tokens have no value in active sets`}
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                  {coverage[theme.name].uncovered.length} gaps
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                  {renameTheme !== theme.name && (
                    <button
                      onClick={() => handleDelete(theme.name)}
                      className="p-1 rounded hover:bg-[var(--color-figma-error)]/20 text-[var(--color-figma-error)] text-[10px] flex-shrink-0"
                      title="Delete theme"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Token set matrix */}
                <div className="divide-y divide-[var(--color-figma-border)]">
                  {(themeSetOrders[theme.name] || sets).map(setName => {
                    const state = theme.sets[setName] || 'enabled';
                    const isDropTarget = dragOver?.themeName === theme.name && dragOver?.setName === setName;
                    const isDragging = dragInfo?.themeName === theme.name && dragInfo?.setName === setName;
                    return (
                      <div
                        key={setName}
                        draggable
                        onDragStart={e => handleDragStart(e, theme.name, setName)}
                        onDragOver={e => handleDragOver(e, theme.name, setName)}
                        onDrop={e => handleDrop(e, theme.name, setName)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center justify-between px-3 py-1.5 transition-colors ${
                          isDropTarget
                            ? 'bg-[var(--color-figma-accent)]/10 border-l-2 border-l-[var(--color-figma-accent)]'
                            : isDragging
                            ? 'opacity-40'
                            : 'hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >
                        {/* Drag handle */}
                        <span
                          className="mr-2 text-[var(--color-figma-text-tertiary)] cursor-grab active:cursor-grabbing flex-shrink-0 select-none"
                          title="Drag to reorder"
                          aria-hidden="true"
                        >
                          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
                            <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
                            <circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/>
                            <circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/>
                          </svg>
                        </span>
                        <span className="text-[11px] text-[var(--color-figma-text)] flex-1 truncate" title={setName}>{setName}</span>
                        <div className="flex rounded overflow-hidden border border-[var(--color-figma-border)] text-[9px] font-medium">
                          {(['disabled', 'source', 'enabled'] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => { if (state !== s) handleSetState(theme.name, setName, s); }}
                              className={`px-1.5 py-0.5 transition-colors ${
                                state === s
                                  ? s === 'source'
                                    ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)]'
                                    : s === 'enabled'
                                    ? 'bg-[var(--color-figma-success)]/20 text-[var(--color-figma-success)]'
                                    : 'bg-[var(--color-figma-border)]/60 text-[var(--color-figma-text-secondary)]'
                                  : 'text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                              }`}
                              title={STATE_DESCRIPTIONS[s]}
                              aria-pressed={state === s}
                            >
                              {STATE_LABELS[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Uncovered tokens list */}
                {expandedCoverage === theme.name && coverage[theme.name]?.uncovered.length > 0 && (
                  <div className="border-t border-[var(--color-figma-warning)]/25 bg-[var(--color-figma-warning)]/10 px-3 py-2">
                    <div className="text-[10px] font-medium text-[var(--color-figma-warning)] mb-1">
                      Missing values ({coverage[theme.name].uncovered.length})
                    </div>
                    <p className="text-[9px] text-[var(--color-figma-text-secondary)] mb-1.5">These tokens have alias references that can't be resolved. Set a set containing them to "Base" or "On".</p>
                    <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
                      {coverage[theme.name].uncovered.map(p => (
                        <div key={p} className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono truncate">{p}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create theme */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        {showCreate ? (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={newThemeName}
              onChange={e => { setNewThemeName(e.target.value); setCreateError(null); }}
              placeholder="Theme name (e.g. light, dark)"
              className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] ${createError ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            {createError && (
              <p className="text-[10px] text-[var(--color-figma-error)]">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newThemeName}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
              >
                Create
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewThemeName(''); setCreateError(null); }}
                className="px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)]"
          >
            + New Theme
          </button>
        )}
      </div>

      {deleteConfirm && (
        <ConfirmModal
          title={`Delete theme "${deleteConfirm}"?`}
          description="This will permanently remove the theme configuration."
          confirmLabel="Delete"
          danger
          onConfirm={executeDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}
