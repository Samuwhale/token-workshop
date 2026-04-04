import { useImportPanel } from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';

export function ImportConflictResolver() {
  const {
    conflictPaths,
    conflictDecisions,
    conflictExistingValues,
    conflictSearch,
    conflictStatusFilter,
    conflictTypeFilter,
    tokens,
    selectedTokens,
    importing,
    importProgress,
    setConflictSearch,
    setConflictStatusFilter,
    setConflictTypeFilter,
    setConflictDecisions,
    clearConflictState,
    executeImport,
  } = useImportPanel();

  if (!conflictPaths || conflictPaths.length === 0) return null;

  const newCount = selectedTokens.size - conflictPaths.length;
  const acceptCount = [...conflictDecisions.values()].filter(v => v === 'accept').length;
  const mergeCount = [...conflictDecisions.values()].filter(v => v === 'merge').length;
  const rejectCount = conflictPaths.length - acceptCount - mergeCount;
  const totalToImport = newCount + acceptCount + mergeCount;
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
          <span className="font-medium">{conflictPaths.length} conflict{conflictPaths.length !== 1 ? 's' : ''}</span>
          {newCount > 0 && <span className="text-[var(--color-figma-text-secondary)]"> + {newCount} new</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => applyToVisible('accept')}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-success,#16a34a)] hover:bg-[var(--color-figma-success,#16a34a)]/10 transition-colors"
          >
            Accept{hasActiveFilter ? ' visible' : ' all'}
          </button>
          <button
            onClick={() => applyToVisible('merge')}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
          >
            Merge{hasActiveFilter ? ' visible' : ' all'}
          </button>
          <button
            onClick={() => applyToVisible('reject')}
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30 transition-colors"
          >
            Reject{hasActiveFilter ? ' visible' : ' all'}
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-1">
        <div className="relative">
          <svg className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            type="text"
            value={conflictSearch}
            onChange={e => setConflictSearch(e.target.value)}
            placeholder="Search conflicts…"
            className="w-full pl-6 pr-1.5 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
          />
        </div>
        <div className="flex items-center gap-1">
          <select
            value={conflictStatusFilter}
            onChange={e => setConflictStatusFilter(e.target.value as 'all' | 'accept' | 'merge' | 'reject')}
            className="px-1 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] focus:focus-visible:border-[var(--color-figma-accent)]"
          >
            <option value="all">All status</option>
            <option value="accept">Accepted</option>
            <option value="merge">Merged</option>
            <option value="reject">Rejected</option>
          </select>
          {sortedConflictTypes.length > 1 && (
            <select
              value={conflictTypeFilter}
              onChange={e => setConflictTypeFilter(e.target.value)}
              className="px-1 py-1 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] focus:focus-visible:border-[var(--color-figma-accent)]"
            >
              <option value="all">All types</option>
              {sortedConflictTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Per-token conflict list */}
      {filteredConflictPaths.length === 0 ? (
        <div className="px-2 py-3 text-center text-[10px] text-[var(--color-figma-text-tertiary)] rounded border border-[var(--color-figma-border)]">
          No conflicts match{conflictSearch ? ` "${conflictSearch}"` : ''}{conflictStatusFilter !== 'all' ? ` (${conflictStatusFilter})` : ''}{conflictTypeFilter !== 'all' ? ` [${conflictTypeFilter}]` : ''}
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
          {filteredConflictPaths.map(path => {
            const decision = conflictDecisions.get(path) ?? 'accept';
            const incoming = tokens.find(t => t.path === path);
            const existing = conflictExistingValues?.get(path);
            const nextDecision = decision === 'accept' ? 'merge' : decision === 'merge' ? 'reject' : 'accept';
            return (
              <div key={path} className="px-2 py-1.5 bg-[var(--color-figma-bg)]">
                {/* Path + toggle */}
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1" title={path}>
                    {path}
                  </span>
                  <button
                    onClick={() => {
                      const next = new Map(conflictDecisions);
                      next.set(path, nextDecision);
                      setConflictDecisions(next);
                    }}
                    className={`shrink-0 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium cursor-pointer transition-colors ${
                      decision === 'accept'
                        ? 'bg-[var(--color-figma-success,#16a34a)]/15 text-[var(--color-figma-success,#16a34a)]'
                        : decision === 'merge'
                          ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                          : 'bg-[var(--color-figma-border)]/30 text-[var(--color-figma-text-secondary)]'
                    }`}
                  >
                    {decision === 'accept' ? (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : decision === 'merge' ? (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v10M16 3v4M8 13a4 4 0 008 0v-6" /></svg>
                    ) : (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    )}
                    {decision === 'accept' ? 'Accept' : decision === 'merge' ? 'Merge' : 'Reject'}
                  </button>
                </div>
                {/* Value diff */}
                <div className="flex flex-col gap-0.5 mt-0.5 ml-1 text-[10px] font-mono">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                    <span className="text-[var(--color-figma-text-secondary)] truncate flex items-center gap-1">
                      {renderConflictValue(existing?.$type ?? 'unknown', existing?.$value)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                    <span className={`truncate flex items-center gap-1 ${
                      decision === 'reject'
                        ? 'text-[var(--color-figma-text-secondary)] line-through opacity-60'
                        : 'text-[var(--color-figma-text)]'
                    }`}>
                      {renderConflictValue(incoming?.$type ?? 'unknown', incoming?.$value)}
                    </span>
                  </div>
                  {decision === 'merge' && (
                    <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-0.5">
                      Value updated · description &amp; extensions kept
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Import action */}
      <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
        <span className="text-[var(--color-figma-success,#16a34a)]">{acceptCount} accepted</span>
        {mergeCount > 0 && <><span>·</span><span className="text-[var(--color-figma-accent)]">{mergeCount} merged</span></>}
        {rejectCount > 0 && <><span>·</span><span>{rejectCount} rejected</span></>}
      </div>
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
            ? `Importing ${importProgress.done}/${importProgress.total}…`
            : 'Importing…'
          : totalToImport === 0
            ? 'No tokens to import'
            : `Import ${totalToImport} token${totalToImport !== 1 ? 's' : ''}`}
      </button>
      {importing && importProgress && importProgress.total > 0 && (
        <div className="w-full h-1.5 rounded-full bg-[var(--color-figma-border)] overflow-hidden">
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
        Revise selection
      </button>
    </div>
  );
}
