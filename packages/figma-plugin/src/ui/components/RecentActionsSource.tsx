import { useState, useCallback } from 'react';
import {
  Plus, X, ArrowRightLeft, Pencil, RotateCcw,
  List, AlertTriangle, Play, Minus,
} from 'lucide-react';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { formatRelativeTime } from '../shared/changeHelpers';

interface OperationEntry {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  resourceId: string;
  affectedPaths: string[];
  rolledBack: boolean;
}

interface RecentActionsSourceProps {
  recentOperations: OperationEntry[];
  onRollback: (opId: string) => void;
  undoDescriptions: string[];
  onSwitchTab: (tab: 'commits' | 'snapshots') => void;
  /** Total number of operations on the server (may exceed loaded count) */
  total?: number;
  /** Whether more operations can be loaded */
  hasMore?: boolean;
  /** Load the next batch of operations */
  onLoadMore?: () => void;
  /** Set of original op IDs that currently have a server redo available */
  redoableOpIds?: Set<string>;
  /** Redo a previously rolled-back operation by its original op ID */
  onServerRedo?: (opId: string) => void;
}

const OP_ICON_CLASS = 'shrink-0 text-[var(--color-figma-text-tertiary)]';
const OP_ICON_SIZE = 10;
const OP_ICON_SW = 2;

/** Icon for each operation type */
export function OpIcon({ type }: { type: string }) {
  if (type.includes('create') || type.includes('add')) {
    return <Plus size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type.includes('delete') || type.includes('remove')) {
    return <Minus size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type.includes('rename') || type.includes('move') || type.includes('reorder')) {
    return <ArrowRightLeft size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type.includes('update') || type.includes('replace') || type.includes('meta')) {
    return <Pencil size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type === 'rollback') {
    return <RotateCcw size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type.includes('bulk')) {
    return <List size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  if (type.includes('error')) {
    return <AlertTriangle size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className="shrink-0 text-[var(--color-figma-warning)]" aria-hidden />;
  }
  if (type.includes('generator') || type.includes('run')) {
    return <Play size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={OP_ICON_CLASS} aria-hidden />;
  }
  return <X size={OP_ICON_SIZE} strokeWidth={OP_ICON_SW} className={`${OP_ICON_CLASS} opacity-30`} aria-hidden />;
}

export function RecentActionsSource({ recentOperations, onRollback, undoDescriptions, onSwitchTab, total, hasMore, onLoadMore, redoableOpIds, onServerRedo }: RecentActionsSourceProps) {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [redoing, setRedoing] = useState<string | null>(null);
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

  const handleRedo = useCallback(async (opId: string) => {
    if (!onServerRedo) return;
    setRedoing(opId);
    try {
      await onServerRedo(opId);
    } finally {
      setRedoing(null);
    }
  }, [onServerRedo]);

  // Derive unique op types for the dropdown
  const opTypes = Array.from(new Set(recentOperations.map(op => op.type))).sort();

  // Apply filters to server operations
  const filteredOperations = recentOperations.filter(op => {
    if (filterType && op.type !== filterType) return false;
    if (searchPath) {
      const needle = searchPath.toLowerCase();
      const matchesDesc = op.description.toLowerCase().includes(needle);
      const matchesSet = op.resourceId.toLowerCase().includes(needle);
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
          <p className="text-body text-[var(--color-figma-text-secondary)]">No recent actions yet.</p>
          <p className="text-secondary text-[var(--color-figma-text-tertiary)]">
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
            <span className="text-secondary font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
              This session
            </span>
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
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
                  <span className="flex-1 text-secondary text-[var(--color-figma-text)] truncate min-w-0">
                    {desc}
                  </span>
                  {i === 0 && (
                    <span className="shrink-0 text-secondary px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] font-medium">
                      Undo available
                    </span>
                  )}
                  <span className="shrink-0 text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                    Local
                  </span>
                </div>
              ))}
              <p className="px-3 py-1 text-secondary text-[var(--color-figma-text-tertiary)] italic">
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
            <span className="text-secondary font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
              Server operations
            </span>
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
              ({filteredOperations.length}{filteredOperations.length !== recentOperations.length ? `/${recentOperations.length}` : ''}{total != null && total > recentOperations.length ? ` of ${total}` : ''})
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
                    className="w-full pl-5 pr-1.5 py-1 text-secondary bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                  />
                </div>
                {opTypes.length > 1 && (
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="shrink-0 py-1 pl-1.5 pr-4 text-secondary bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded text-[var(--color-figma-text)] focus:focus-visible:border-[var(--color-figma-accent)] appearance-none"
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
                <p className="px-3 py-2 text-secondary text-[var(--color-figma-text-tertiary)] italic">
                  No changes match the current filters.
                </p>
              )}
              {filteredOperations.map(op => (
                <div key={op.id} className="flex items-start gap-2 px-3 py-1.5 group hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                  <div className="mt-0.5">
                    <OpIcon type={op.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-secondary truncate min-w-0 ${op.rolledBack ? 'text-[var(--color-figma-text-tertiary)] line-through' : 'text-[var(--color-figma-text)]'}`}>
                        {op.description}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                        {op.resourceId}
                      </span>
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                        · {op.affectedPaths.length} path{op.affectedPaths.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-secondary text-[var(--color-figma-text-tertiary)]">
                        · {formatRelativeTime(new Date(op.timestamp))}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 mt-0.5 flex items-center gap-1">
                    {op.rolledBack ? (
                      <>
                        <span className="text-secondary px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]">
                          Rolled back
                        </span>
                        {redoableOpIds?.has(op.id) && onServerRedo && (
                          <button
                            onClick={() => handleRedo(op.id)}
                            disabled={redoing !== null || rollingBack !== null}
                            title="Redo this operation (⌘Y)"
                            className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
                          >
                            {redoing === op.id ? (
                              <span className="flex items-center gap-1">
                                <Spinner size="xs" />
                                Redoing…
                              </span>
                            ) : 'Redo'}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmOp(op)}
                        disabled={rollingBack !== null}
                        className="text-secondary px-1.5 py-0.5 rounded font-medium transition-colors opacity-0 group-hover:opacity-100 bg-[color-mix(in_srgb,var(--color-figma-accent)_12%,transparent)] text-[var(--color-figma-accent)] hover:bg-[color-mix(in_srgb,var(--color-figma-accent)_20%,transparent)] disabled:opacity-30"
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
              {hasMore && onLoadMore && (
                <div className="px-3 py-1.5">
                  <button
                    onClick={onLoadMore}
                    className="w-full text-secondary py-1 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
                  >
                    Load more{total != null ? ` (${total - recentOperations.length} remaining)` : ''}
                  </button>
                </div>
              )}
              <p className="px-3 py-1 text-secondary text-[var(--color-figma-text-tertiary)] italic">
                Recent changes stay here across sessions. Roll back any time.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Link to git history */}
      <div className="px-3 py-3 space-y-1.5">
        <p className="text-secondary font-semibold uppercase tracking-wider text-[var(--color-figma-text-secondary)]">
          Full history
        </p>
        <p className="text-secondary text-[var(--color-figma-text-tertiary)] leading-relaxed">
          For complete version history with per-token diffs, switch to Git Commits or Snapshots.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onSwitchTab('commits')}
            className="text-secondary px-2 py-1 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Git Commits →
          </button>
          <button
            onClick={() => onSwitchTab('snapshots')}
            className="text-secondary px-2 py-1 rounded font-medium transition-colors bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
          >
            Snapshots →
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
