import { useState, useCallback } from 'react';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { formatRelativeTime } from '../shared/changeHelpers';

interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  setName: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

interface RecentActionsSourceProps {
  recentOperations: OperationEntry[];
  onRollback: (opId: string) => void;
  undoDescriptions: string[];
  onSwitchTab: (tab: 'commits' | 'snapshots') => void;
}

/** Icon for each operation type */
function OpIcon({ type }: { type: string }) {
  const className = 'shrink-0 text-[var(--color-figma-text-tertiary)]';
  const props = { width: 10, height: 10, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className, 'aria-hidden': true as const };

  if (type.includes('create') || type.includes('add')) {
    return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
  }
  if (type.includes('delete') || type.includes('remove')) {
    return <svg {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
  }
  if (type.includes('rename') || type.includes('move') || type.includes('reorder')) {
    return <svg {...props}><path d="M11 4H4v16h7M20 12H9m6-5l5 5-5 5" /></svg>;
  }
  if (type.includes('update') || type.includes('replace') || type.includes('meta')) {
    return <svg {...props}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
  }
  if (type === 'rollback') {
    return <svg {...props}><path d="M3 12a9 9 0 109-9" /><path d="M3 3v6h6" /></svg>;
  }
  if (type.includes('bulk')) {
    return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
  }
  if (type.includes('generator') || type.includes('run')) {
    return <svg {...props}><path d="M5 3l14 9-14 9V3z" /></svg>;
  }
  return <svg {...props}><circle cx="12" cy="12" r="3" /></svg>;
}

export function RecentActionsSource({ recentOperations, onRollback, undoDescriptions, onSwitchTab }: RecentActionsSourceProps) {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [confirmOp, setConfirmOp] = useState<OperationEntry | null>(null);
  const [localOpen, setLocalOpen] = useState(true);
  const [serverOpen, setServerOpen] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [searchPath, setSearchPath] = useState('');

  const handleRollback = useCallback(async (opId: string) => {
    setRollingBack(opId);
    setConfirmOp(null);
    try {
      await onRollback(opId);
    } finally {
      setRollingBack(null);
    }
  }, [onRollback]);

  // Derive unique op types for the dropdown
  const opTypes = Array.from(new Set(recentOperations.map(op => op.type))).sort();

  // Apply filters to server operations
  const filteredOperations = recentOperations.filter(op => {
    if (filterType && op.type !== filterType) return false;
    if (searchPath) {
      const needle = searchPath.toLowerCase();
      const matchesDesc = op.description.toLowerCase().includes(needle);
      const matchesSet = op.setName.toLowerCase().includes(needle);
      const matchesPath = op.affectedPaths.some(p => p.toLowerCase().includes(needle));
      if (!matchesDesc && !matchesSet && !matchesPath) return false;
    }
    return true;
  });

  const hasLocal = undoDescriptions.length > 0;
  const hasServer = recentOperations.length > 0;
  const isEmpty = !hasLocal && !hasServer;

  return (
    <>
    {confirmOp && (
      <ConfirmModal
        title="Roll back operation?"
        description={`"${confirmOp.description}" affected ${confirmOp.affectedPaths.length} path${confirmOp.affectedPaths.length !== 1 ? 's' : ''}. This will restore tokens to their state before this operation.`}
        confirmLabel="Roll Back"
        danger
        onConfirm={() => handleRollback(confirmOp.id)}
        onCancel={() => setConfirmOp(null)}
      />
    )}
    <div className="flex-1 overflow-y-auto">
      {isEmpty && (
        <div className="flex flex-col items-center justify-center h-full p-6 gap-2 text-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] opacity-40" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-[11px] text-[var(--color-figma-text-secondary)]">No recent actions yet.</p>
          <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            Edits, renames, and bulk operations will appear here.
          </p>
        </div>
      )}

      {/* Local undo stack (this session) */}
      {hasLocal && (
        <div className="border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => setLocalOpen(o => !o)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${localOpen ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
              This session
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              ({undoDescriptions.length})
            </span>
          </button>
          {localOpen && (
            <div className="pb-1">
              {[...undoDescriptions].reverse().map((desc, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 group">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span className="flex-1 text-[10px] text-[var(--color-figma-text)] truncate min-w-0">
                    {desc}
                  </span>
                  {i === 0 && (
                    <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] font-medium">
                      Undo available
                    </span>
                  )}
                  <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                    Local
                  </span>
                </div>
              ))}
              <p className="px-3 py-1 text-[9px] text-[var(--color-figma-text-tertiary)] italic">
                Local actions are undoable with ⌘Z but lost on refresh.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Server operations */}
      {hasServer && (
        <div className="border-b border-[var(--color-figma-border)]">
          <button
            onClick={() => setServerOpen(o => !o)}
            className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            <svg
              width="8" height="8" viewBox="0 0 8 8" fill="currentColor"
              className={`shrink-0 text-[var(--color-figma-text-tertiary)] transition-transform ${serverOpen ? 'rotate-90' : ''}`}
              aria-hidden="true"
            >
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
              Server operations
            </span>
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              ({filteredOperations.length}{filteredOperations.length !== recentOperations.length ? `/${recentOperations.length}` : ''})
            </span>
          </button>
          {serverOpen && (
            <div className="pb-1">
              {/* Filter bar */}
              <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-0.5">
                <div className="relative flex-1 min-w-0">
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={searchPath}
                    onChange={e => setSearchPath(e.target.value)}
                    placeholder="Search by path…"
                    className="w-full pl-5 pr-1.5 py-1 text-[10px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                  />
                </div>
                {opTypes.length > 1 && (
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="shrink-0 py-1 pl-1.5 pr-4 text-[10px] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] appearance-none"
                    style={{ backgroundImage: 'none' }}
                    aria-label="Filter by operation type"
                  >
                    <option value="">All types</option>
                    {opTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
                {(filterType || searchPath) && (
                  <button
                    onClick={() => { setFilterType(''); setSearchPath(''); }}
                    className="shrink-0 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
                    title="Clear filters"
                    aria-label="Clear filters"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {filteredOperations.length === 0 && (
                <p className="px-3 py-2 text-[10px] text-[var(--color-figma-text-tertiary)] italic">
                  No operations match the current filters.
                </p>
              )}
              {filteredOperations.map(op => (
                <div key={op.id} className="flex items-start gap-2 px-3 py-1.5 group hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                  <div className="mt-0.5">
                    <OpIcon type={op.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] truncate min-w-0 ${op.rolledBack ? 'text-[var(--color-figma-text-tertiary)] line-through' : 'text-[var(--color-figma-text)]'}`}>
                        {op.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                        {op.setName}
                      </span>
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                        · {op.affectedPaths.length} path{op.affectedPaths.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                        · {formatRelativeTime(new Date(op.timestamp))}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {op.rolledBack ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                        Rolled back
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmOp(op)}
                        disabled={rollingBack !== null}
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                      >
                        {rollingBack === op.id ? (
                          <span className="flex items-center gap-1">
                            <Spinner size="xs" />
                            Rolling back…
                          </span>
                        ) : 'Rollback'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <p className="px-3 py-1 text-[9px] text-[var(--color-figma-text-tertiary)] italic">
                Server operations persist across sessions and can be rolled back.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Link to git history */}
      <div className="px-3 py-3 space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
          Full history
        </p>
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
          For complete version history with per-token diffs, switch to Git Commits or Snapshots.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onSwitchTab('commits')}
            className="text-[10px] px-2 py-1 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Git Commits →
          </button>
          <button
            onClick={() => onSwitchTab('snapshots')}
            className="text-[10px] px-2 py-1 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Snapshots →
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
