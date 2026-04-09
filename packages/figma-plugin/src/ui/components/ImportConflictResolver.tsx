import { useEffect, useRef } from 'react';
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
    reviewActionCopy,
    setConflictSearch,
    setConflictStatusFilter,
    setConflictTypeFilter,
    setConflictDecisions,
    clearConflictState,
    executeImport,
  } = useImportPanel();

  // Stable-ref pattern: handler is replaced each render so it always captures fresh closures
  const handlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => handlerRef.current?.(e);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Clear handler when no conflicts so shortcuts are inactive
  handlerRef.current = null;

  if (!conflictPaths || conflictPaths.length === 0) return null;

  const newCount = selectedTokens.size - conflictPaths.length;
  const overwriteCount = [...conflictDecisions.values()].filter(v => v === 'accept').length;
  const mergeCount = [...conflictDecisions.values()].filter(v => v === 'merge').length;
  const keepExistingCount = conflictPaths.length - overwriteCount - mergeCount;
  const totalToImport = newCount + overwriteCount + mergeCount;
  const hasActiveFilter = conflictSearch !== '' || conflictStatusFilter !== 'all' || conflictTypeFilter !== 'all';
  const searchLower = conflictSearch.toLowerCase();
  const isUniformReview =
    overwriteCount === conflictPaths.length ||
    mergeCount === conflictPaths.length ||
    keepExistingCount === conflictPaths.length;
  const recommendedActionKey =
    overwriteCount === conflictPaths.length
      ? 'overwrite'
      : mergeCount === conflictPaths.length
        ? 'merge'
        : keepExistingCount === conflictPaths.length
          ? 'skip'
          : null;
  const recommendedAction = recommendedActionKey ? reviewActionCopy[recommendedActionKey] : null;
  const reviewSummary = recommendedAction
    ? {
        title: `Recommended next step: ${recommendedAction.buttonLabel.toLowerCase()}`,
        detail: `${recommendedAction.consequence} ${newCount > 0 ? `${newCount} new token${newCount !== 1 ? 's' : ''} will also import.` : ''}`.trim(),
      }
    : {
        title: `Recommended next step: apply this mixed review`,
        detail: `${overwriteCount} overwrite, ${mergeCount} merge, ${keepExistingCount} keep existing. ${newCount} new token${newCount !== 1 ? 's' : ''} will also import.`,
      };

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

  // Register keyboard handler with current-render closures
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
          <span className="font-medium">{conflictPaths.length} conflict{conflictPaths.length !== 1 ? 's' : ''}</span>
          {newCount > 0 && <span className="text-[var(--color-figma-text-secondary)]"> + {newCount} new</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => applyToVisible('accept')}
            title={`${reviewActionCopy.overwrite.label} ${hasActiveFilter ? 'visible' : 'all'} (A)`}
            aria-keyshortcuts="a"
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-success,#16a34a)] hover:bg-[var(--color-figma-success,#16a34a)]/10 transition-colors"
          >
            {reviewActionCopy.overwrite.label}{hasActiveFilter ? ' visible' : ' all'}
          </button>
          <button
            onClick={() => applyToVisible('merge')}
            title={`${reviewActionCopy.merge.label} ${hasActiveFilter ? 'visible' : 'all'} (M)`}
            aria-keyshortcuts="m"
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
          >
            {reviewActionCopy.merge.label}{hasActiveFilter ? ' visible' : ' all'}
          </button>
          <button
            onClick={() => applyToVisible('reject')}
            title={`${reviewActionCopy.skip.label} ${hasActiveFilter ? 'visible' : 'all'} (R)`}
            aria-keyshortcuts="r"
            className="px-1.5 py-0.5 rounded text-[9px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30 transition-colors"
          >
            {reviewActionCopy.skip.label}{hasActiveFilter ? ' visible' : ' all'}
          </button>
        </div>
      </div>

      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text)]">
            {reviewSummary.title}
          </div>
          <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
            isUniformReview
              ? 'bg-[var(--color-figma-accent)]/12 text-[var(--color-figma-accent)]'
              : 'bg-[var(--color-figma-border)]/40 text-[var(--color-figma-text-secondary)]'
          }`}>
            {isUniformReview ? 'Ready to apply' : 'Mixed review'}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
          {reviewSummary.detail}
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
            <option value="accept">{reviewActionCopy.overwrite.label}</option>
            <option value="merge">{reviewActionCopy.merge.label}</option>
            <option value="reject">{reviewActionCopy.skip.label}</option>
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
            return (
              <div key={path} className="px-2 py-1.5 bg-[var(--color-figma-bg)]">
                {/* Path + toggle */}
                <div className="flex items-center justify-between gap-1 mb-1">
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
                        title={
                          d === 'accept'
                            ? `${reviewActionCopy.overwrite.label}: ${reviewActionCopy.overwrite.consequence}`
                            : d === 'merge'
                              ? `${reviewActionCopy.merge.label}: ${reviewActionCopy.merge.consequence}`
                              : `${reviewActionCopy.skip.label}: ${reviewActionCopy.skip.consequence}`
                        }
                        className={`px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                          i > 0 ? 'border-l border-[var(--color-figma-border)]' : ''
                        } ${
                          decision === d
                            ? d === 'accept'
                              ? 'bg-[var(--color-figma-success,#16a34a)]/15 text-[var(--color-figma-success,#16a34a)]'
                              : d === 'merge'
                                ? 'bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)]'
                                : 'bg-[var(--color-figma-border)]/30 text-[var(--color-figma-text-secondary)]'
                            : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/20'
                        }`}
                      >
                        {d === 'accept' ? reviewActionCopy.overwrite.label : d === 'merge' ? reviewActionCopy.merge.label : reviewActionCopy.skip.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Value diff — two-column side-by-side */}
                <div className="grid grid-cols-2 gap-x-2 mt-0.5 text-[10px] font-mono rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="flex flex-col gap-0.5 px-1.5 py-1 bg-[var(--color-figma-error)]/5 border-r border-[var(--color-figma-border)] min-w-0">
                    <span className="text-[9px] font-sans font-medium text-[var(--color-figma-error)] opacity-70 leading-none mb-0.5">Current</span>
                    <span className="flex items-center gap-1 text-[var(--color-figma-text-secondary)] truncate min-w-0" title={String(existing?.$value ?? '—')}>
                      {renderConflictValue(existing?.$type ?? 'unknown', existing?.$value)}
                    </span>
                  </div>
                  <div className={`flex flex-col gap-0.5 px-1.5 py-1 min-w-0 ${
                    decision === 'reject'
                      ? 'opacity-50'
                      : 'bg-[var(--color-figma-success,#16a34a)]/5'
                  }`}>
                    <span className={`text-[9px] font-sans font-medium leading-none mb-0.5 ${
                      decision === 'reject'
                        ? 'text-[var(--color-figma-text-tertiary)]'
                        : 'text-[var(--color-figma-success,#16a34a)] opacity-70'
                    }`}>Incoming</span>
                    <span className={`flex items-center gap-1 truncate min-w-0 ${
                      decision === 'reject'
                        ? 'text-[var(--color-figma-text-secondary)] line-through'
                        : 'text-[var(--color-figma-text)]'
                    }`} title={String(incoming?.$value ?? '—')}>
                      {renderConflictValue(incoming?.$type ?? 'unknown', incoming?.$value)}
                    </span>
                  </div>
                </div>
                {decision === 'merge' && (
                  <div className="text-[9px] text-[var(--color-figma-text-tertiary)] mt-0.5 ml-0.5">
                    Value will update · notes and metadata preserved
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Import action */}
      <div className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)]">
        <span className="text-[var(--color-figma-success,#16a34a)]">{overwriteCount} overwrite</span>
        {mergeCount > 0 && <><span>·</span><span className="text-[var(--color-figma-accent)]">{mergeCount} merge</span></>}
        {keepExistingCount > 0 && <><span>·</span><span>{keepExistingCount} keep existing</span></>}
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
            : isUniformReview && recommendedAction
              ? `${recommendedAction.buttonLabel} and import ${totalToImport} token${totalToImport !== 1 ? 's' : ''}`
              : `Apply review and import ${totalToImport} token${totalToImport !== 1 ? 's' : ''}`}
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
        title="Revise selection (Esc)"
        aria-keyshortcuts="Escape"
        className="text-[10px] text-[var(--color-figma-text-secondary)] hover:underline disabled:opacity-40"
      >
        Back to selection
      </button>
    </div>
  );
}
