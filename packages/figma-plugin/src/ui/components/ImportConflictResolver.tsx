import { useEffect, useMemo, useRef, useState } from 'react';
import { useImportReviewContext, useImportSourceContext } from './ImportPanelContext';
import { renderConflictValue } from './importPanelHelpers';

type ConflictDecision = 'accept' | 'merge' | 'reject';

const DEFAULT_CONFLICT_DECISION: ConflictDecision = 'reject';
const CONFLICT_DECISIONS: readonly ConflictDecision[] = ['reject', 'merge', 'accept'];

function getDecisionLabel(decision: ConflictDecision): string {
  if (decision === 'accept') return 'Replace';
  if (decision === 'merge') return 'Merge';
  return 'Keep';
}

function getDecisionTone(decision: ConflictDecision): string {
  if (decision === 'accept') {
    return 'text-[color:var(--color-figma-text-warning)] hover:bg-[var(--color-figma-warning)]/10';
  }
  if (decision === 'merge') {
    return 'text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10';
  }
  return 'text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30';
}

function getSelectedDecisionTone(decision: ConflictDecision): string {
  if (decision === 'accept') {
    return 'bg-[var(--color-figma-warning)]/15 text-[color:var(--color-figma-text-warning)]';
  }
  if (decision === 'merge') {
    return 'bg-[var(--color-figma-accent)]/15 text-[color:var(--color-figma-text-accent)]';
  }
  return 'bg-[var(--color-figma-border)]/30 text-[color:var(--color-figma-text-secondary)]';
}

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

  const incomingTokenByPath = useMemo(
    () => new Map(tokens.map((token) => [token.path, token])),
    [tokens],
  );
  const safeConflictPaths = conflictPaths ?? [];
  const decisionForPath = (path: string): ConflictDecision =>
    conflictDecisions.get(path) ?? DEFAULT_CONFLICT_DECISION;

  if (safeConflictPaths.length === 0) return null;

  const newCount = Math.max(0, selectedTokens.size - safeConflictPaths.length);
  const overwriteCount = safeConflictPaths.filter(path => decisionForPath(path) === 'accept').length;
  const mergeCount = safeConflictPaths.filter(path => decisionForPath(path) === 'merge').length;
  const keepExistingCount = safeConflictPaths.filter(path => decisionForPath(path) === 'reject').length;
  const totalToImport = newCount + overwriteCount + mergeCount;
  const hasActiveFilter = conflictSearch !== '' || conflictStatusFilter !== 'all' || conflictTypeFilter !== 'all';
  const searchLower = conflictSearch.toLowerCase();

  const getFilteredPaths = () => safeConflictPaths.filter(path => {
    if (searchLower && !path.toLowerCase().includes(searchLower)) return false;
    if (conflictStatusFilter !== 'all') {
      const d = decisionForPath(path);
      if (d !== conflictStatusFilter) return false;
    }
    if (conflictTypeFilter !== 'all') {
      const t = incomingTokenByPath.get(path);
      if (t?.$type !== conflictTypeFilter) return false;
    }
    return true;
  });

  const applyToVisible = (decision: ConflictDecision) => {
    const next = new Map(conflictDecisions);
    const targets = hasActiveFilter ? getFilteredPaths() : safeConflictPaths;
    for (const p of targets) next.set(p, decision);
    setConflictDecisions(next);
  };

  handlerRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!importing) clearConflictState();
    }
  };

  const conflictTypes = new Set<string>();
  for (const p of safeConflictPaths) {
    const t = incomingTokenByPath.get(p);
    if (t?.$type) conflictTypes.add(t.$type);
  }
  const sortedConflictTypes = [...conflictTypes].sort();
  const filteredConflictPaths = getFilteredPaths();

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1">
        <div className="text-secondary text-[color:var(--color-figma-text)]">
          Review <span className="font-medium">{safeConflictPaths.length}</span> existing token{safeConflictPaths.length !== 1 ? 's' : ''}
          {newCount > 0 && <span className="text-[color:var(--color-figma-text-secondary)]"> and {newCount} new token{newCount === 1 ? '' : 's'}</span>}
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Current library values are kept unless you choose Merge or Replace.
        </div>
      </div>

      {/* Summary + bulk actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          {keepExistingCount} keep, {mergeCount} merge, {overwriteCount} replace{newCount > 0 ? ` + ${newCount} new` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-0.5">
          {CONFLICT_DECISIONS.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => applyToVisible(d)}
              title={`${getDecisionLabel(d)} ${hasActiveFilter ? 'visible conflicts' : 'all conflicts'}`}
              className={`px-1.5 py-0.5 rounded text-secondary font-medium transition-colors ${getDecisionTone(d)}`}
            >
              {getDecisionLabel(d)} {hasActiveFilter ? 'visible' : 'all'}
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter toggle — show search inline, filters on demand */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={conflictSearch}
          onChange={e => setConflictSearch(e.target.value)}
          placeholder="Search..."
          className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-secondary text-[color:var(--color-figma-text)] placeholder:text-[color:var(--color-figma-text-tertiary)] focus:border-[var(--color-figma-accent)] focus:outline-none"
        />
        {(sortedConflictTypes.length > 1 || safeConflictPaths.length > 5) && (
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`px-1.5 py-0.5 rounded text-secondary font-medium transition-colors ${
              showFilters || hasActiveFilter
                ? 'bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]'
                : 'text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-border)]/30'
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
            className="px-1 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-secondary text-[color:var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
          >
            <option value="all">All status</option>
            <option value="reject">Keep</option>
            <option value="merge">Merge</option>
            <option value="accept">Replace</option>
          </select>
          {sortedConflictTypes.length > 1 && (
            <select
              value={conflictTypeFilter}
              onChange={e => setConflictTypeFilter(e.target.value)}
              className="px-1 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-secondary text-[color:var(--color-figma-text)] focus:border-[var(--color-figma-accent)] focus:outline-none"
            >
              <option value="all">All types</option>
              {sortedConflictTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      )}

      {/* Conflict list */}
      {filteredConflictPaths.length === 0 ? (
        <div className="px-2 py-2 text-center text-secondary text-[color:var(--color-figma-text-tertiary)] rounded border border-[var(--color-figma-border)]">
          No conflicts match filters
        </div>
      ) : (
        <div className="max-h-[200px] overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
          {filteredConflictPaths.map(path => {
            const decision = decisionForPath(path);
            const incoming = incomingTokenByPath.get(path);
            const existing = conflictExistingValues?.get(path);
            return (
              <div key={path} className="px-2 py-1 bg-[var(--color-figma-bg)]">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate flex-1" title={path}>
                    {path}
                  </span>
                  <div
                    role="group"
                    aria-label={`Resolution for ${path}`}
                    className="shrink-0 flex items-center rounded overflow-hidden border border-[var(--color-figma-border)]"
                  >
                    {CONFLICT_DECISIONS.map((d, i) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          const next = new Map(conflictDecisions);
                          next.set(path, d);
                          setConflictDecisions(next);
                        }}
                        aria-pressed={decision === d}
                        className={`px-1 py-0.5 text-secondary font-medium transition-colors ${
                          i > 0 ? 'border-l border-[var(--color-figma-border)]' : ''
                        } ${
                          decision === d
                            ? getSelectedDecisionTone(d)
                            : 'bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-text-secondary)]'
                        }`}
                      >
                        {getDecisionLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Value diff */}
                <div className="grid grid-cols-2 gap-x-1 rounded overflow-hidden text-secondary">
                  <div className="min-w-0 px-1 py-0.5 bg-[var(--color-figma-bg-secondary)]">
                    <div className="mb-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-tertiary)]">
                      Current in library
                    </div>
                    <span className="text-[color:var(--color-figma-text-secondary)] truncate flex items-center gap-1 font-mono">
                      {renderConflictValue(existing?.$type ?? 'unknown', existing?.$value)}
                    </span>
                  </div>
                  <div className={`min-w-0 px-1 py-0.5 ${
                    decision === 'reject' ? 'bg-[var(--color-figma-bg-secondary)] opacity-60' : 'bg-[var(--color-figma-accent)]/8'
                  }`}>
                    <div className="mb-0.5 text-[var(--font-size-xs)] font-medium text-[color:var(--color-figma-text-tertiary)]">
                      Incoming import
                    </div>
                    <span className={`truncate flex items-center gap-1 font-mono ${
                      decision === 'reject' ? 'text-[color:var(--color-figma-text-secondary)] line-through' : 'text-[color:var(--color-figma-text)]'
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
            safeConflictPaths.filter((path) => decisionForPath(path) === 'reject')
          );
          const merged = new Set(
            safeConflictPaths.filter((path) => decisionForPath(path) === 'merge')
          );
          executeImport('overwrite', rejected, merged.size > 0 ? merged : undefined);
        }}
        disabled={importing || totalToImport === 0}
        className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] text-secondary font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
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
        className="text-secondary text-[color:var(--color-figma-text-secondary)] hover:underline disabled:opacity-40"
      >
        Back
      </button>
    </div>
  );
}
