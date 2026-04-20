import { useEffect, useRef, useState } from 'react';
import { useImportReviewContext, useImportSourceContext } from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';

export function ImportConflictResolver() {
  const { tokens, selectedTokens } = useImportSourceContext();
  const {
    conflictPaths,
    conflictDecisions,
    conflictExistingValues,
    conflictSearch,
    conflictStatusFilter,
    conflictTypeFilter,
    importing,
    importProgress,
    reviewActionCopy,
    setConflictSearch,
    setConflictStatusFilter,
    setConflictTypeFilter,
    setConflictDecisions,
    clearConflictState,
    executeImport,
  } = useImportReviewContext();

  const [showFilters, setShowFilters] = useState(false);

  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handlerRef.current?.(e);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  handlerRef.current = null;

  if (!conflictPaths || conflictPaths.length === 0) return null;

  const newCount = selectedTokens.size - conflictPaths.length;
  const overwriteCount = [...conflictDecisions.values()].filter(v => v === 'accept').length;
  const mergeCount = [...conflictDecisions.values()].filter(v => v === 'merge').length;
  const keepExistingCount = conflictPaths.length - overwriteCount - mergeCount;
  const totalToImport = newCount + overwriteCount + mergeCount;
  const hasActiveFilter = conflictSearch !== '' || conflictStatusFilter !== 'all' || conflictTypeFilter !== 'all';
  const searchLower = conflictSearch.toLowerCase();

  const getFilteredPaths = () => conflictPaths.filter(path => {
    if (searchLower && !path.toLowerCase().includes(searchLower)) return false;
    if (conflictStatusFilter !== 'all') {
      const d = conflictDecisions.get(path) ?? 'accept';
      if (d !== conflictStatusFilter) return false;
    }
    if (conflictTypeFilter !== 'all') {
      const t = tokens.find(tk => tk.path === path);
      if (t?.$type !== conflictTypeFilter) return false;
    }
    return true;
  });

  const applyToVisible = (decision: 'accept' | 'merge' | 'reject') => {
    const next = new Map(conflictDecisions);
    const targets = hasActiveFilter ? getFilteredPaths() : conflictPaths;
    for (const p of targets) next.set(p, decision);
    setConflictDecisions(next);
  };

  handlerRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!importing) clearConflictState();
      return;
    }
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'a' || e.key === 'A') { e.preventDefault(); applyToVisible('accept'); }
    else if (e.key === 'm' || e.key === 'M') { e.preventDefault(); applyToVisible('merge'); }
    else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); applyToVisible('reject'); }
  };

  const conflictTypes = new Set<string>();
  for (const p of conflictPaths) {
    const t = tokens.find(tk => tk.path === p);
    if (t?.$type) conflictTypes.add(t.$type);
  }
  const sortedConflictTypes = [...conflictTypes].sort();
  const filteredConflictPaths = getFilteredPaths();

  return (
    <div className="flex flex-col gap-1.5">
      {/* Summary + bulk actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-[var(--color-figma-text)]">
          <span className="font-medium">{conflictPaths.length}</span> conflict{conflictPaths.length !== 1 ? 's' : ''}
          {newCount > 0 && <span className="text-[var(--color-figma-text-secondary)]"> + {newCount} new</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {(['accept', 'merge', 'reject'] as const).map(d => (
            <button
              key={d}
              onClick={() => applyToVisible(d)}
              title={`${d === 'accept' ? reviewActionCopy.overwrite.label : d === 'merge' ? reviewActionCopy.merge.label : reviewActionCopy.skip.label}${hasActiveFilter ? ' visible' : ' all'}`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                d === 'accept'
                  ? 'text-[var(--color-figma-success,#16a34a)] hover:bg-[var(--color-figma-success,#16a34a)]/10'
                  : d === 'merge'
                    ? 'text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10'
                    : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30'
              }`}
            >
              {d === 'accept' ? reviewActionCopy.overwrite.label : d === 'merge' ? reviewActionCopy.merge.label : reviewActionCopy.skip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compact status line */}
      <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
        {overwriteCount} overwrite, {mergeCount} merge, {keepExistingCount} keep{newCount > 0 ? ` + ${newCount} new` : ''}
      </div>

      {/* Search + filter toggle — show search inline, filters on demand */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={conflictSearch}
          onChange={e => setConflictSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:border-[var(--color-figma-accent)] focus:outline-none"
        />
        {(sortedConflictTypes.length > 1 || conflictPaths.length > 5) && (
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              showFilters || hasActiveFilter
                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                : 'text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30'
            }`}
          >
            Filter
          </button>
        )}
      </div>
      {showFilters && (
        <div className="flex items-center gap-1">
          <select
            value={conflictStatusFilter}
            onChange={e => setConflictStatusFilter(e.target.value as 'all' | 'accept' | 'merge' | 'reject')}
            className="px-1 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
          >
            <option value="all">All status</option>
            <option value="accept">{reviewActionCopy.overwrite.label}</option>
            <option value="merge">{reviewActionCopy.merge.label}</option>
            <option value="reject">{reviewActionCopy.skip.label}</option>
          </select>
          {sortedConflictTypes.length > 1 && (
            <select
              value={conflictTypeFilter}
              onChange={e => setConflictTypeFilter(e.target.value)}
              className="px-1 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
            >
              <option value="all">All types</option>
              {sortedConflictTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Conflict list */}
      {filteredConflictPaths.length === 0 ? (
        <div className="px-2 py-2 text-center text-[10px] text-[var(--color-figma-text-tertiary)] rounded border border-[var(--color-figma-border)]">
          No conflicts match filters
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
          {filteredConflictPaths.map(path => {
            const decision = conflictDecisions.get(path) ?? 'accept';
            const incoming = tokens.find(t => t.path === path);
            const existing = conflictExistingValues?.get(path);
            return (
              <div key={path} className="px-2 py-1 bg-[var(--color-figma-bg)]">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={path}>
                    {path}
                  </span>
                  <div
                    role="group"
                    aria-label={`Resolution for ${path}`}
                    className="shrink-0 flex items-center rounded overflow-hidden border border-[var(--color-figma-border)]"
                  >
                    {(['accept', 'merge', 'reject'] as const).map((d, i) => (
                      <button
                        key={d}
                        onClick={() => {
                          const next = new Map(conflictDecisions);
                          next.set(path, d);
                          setConflictDecisions(next);
                        }}
                        aria-pressed={decision === d}
                        className={`px-1 py-0.5 text-[10px] font-medium transition-colors ${
                          i > 0 ? 'border-l border-[var(--color-figma-border)]' : ''
                        } ${
                          decision === d
                            ? d === 'accept'
                              ? 'bg-[var(--color-figma-success,#16a34a)]/15 text-[var(--color-figma-success,#16a34a)]'
                              : d === 'merge'
                                ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                                : 'bg-[var(--color-figma-border)]/30 text-[var(--color-figma-text-secondary)]'
                            : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
                        }`}
                      >
                        {d === 'accept' ? 'Replace' : d === 'merge' ? 'Merge' : 'Skip'}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Value diff */}
                <div className="grid grid-cols-2 gap-x-1 text-[10px] font-mono rounded overflow-hidden">
                  <div className="flex items-center gap-1 min-w-0 px-1 py-0.5 bg-[var(--color-figma-error)]/5">
                    <span className="text-[var(--color-figma-text-secondary)] truncate flex items-center gap-1">
                      {renderConflictValue(existing?.$type ?? 'unknown', existing?.$value)}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 min-w-0 px-1 py-0.5 ${
                    decision === 'reject' ? 'opacity-40' : 'bg-[var(--color-figma-success,#16a34a)]/5'
                  }`}>
                    <span className={`truncate flex items-center gap-1 ${
                      decision === 'reject' ? 'text-[var(--color-figma-text-secondary)] line-through' : 'text-[var(--color-figma-text)]'
                    }`}>
                      {renderConflictValue(incoming?.$type ?? 'unknown', incoming?.$value)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import action */}
      <button
        onClick={() => {
          const rejected = new Set(
            [...conflictDecisions.entries()].filter(([, v]) => v === 'reject').map(([k]) => k)
          );
          const merged = new Set(
            [...conflictDecisions.entries()].filter(([, v]) => v === 'merge').map(([k]) => k)
          );
          executeImport('overwrite', rejected, merged.size > 0 ? merged : undefined);
        }}
        disabled={importing || totalToImport === 0}
        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
      >
        {importing
          ? importProgress
            ? `Importing ${importProgress.done}/${importProgress.total}...`
            : 'Importing...'
          : totalToImport === 0
            ? 'No tokens to import'
            : `Import ${totalToImport} token${totalToImport !== 1 ? 's' : ''}`}
      </button>
      {importing && importProgress && importProgress.total > 0 && (
        <div className="w-full h-1 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
          <div
            className="h-full rounded-full bg-[var(--color-figma-accent)] transition-all duration-300"
            style={{ width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` }}
          />
        </div>
      )}
      <button
        onClick={() => clearConflictState()}
        disabled={importing}
        className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}
