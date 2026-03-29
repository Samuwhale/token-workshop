import { useState, useCallback } from 'react';
import { Spinner } from './Spinner';
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

  switch (type) {
    case 'create':
    case 'batch-create':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'delete':
    case 'batch-delete':
      return <svg {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case 'rename':
    case 'batch-rename':
      return <svg {...props}><path d="M11 4H4v16h7M20 12H9m6-5l5 5-5 5" /></svg>;
    case 'update':
    case 'batch-update':
      return <svg {...props}><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>;
    case 'rollback':
      return <svg {...props}><path d="M3 12a9 9 0 109-9" /><path d="M3 3v6h6" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="3" /></svg>;
  }
}

export function RecentActionsSource({ recentOperations, onRollback, undoDescriptions, onSwitchTab }: RecentActionsSourceProps) {
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(true);
  const [serverOpen, setServerOpen] = useState(true);

  const handleRollback = useCallback(async (opId: string) => {
    setRollingBack(opId);
    try {
      await onRollback(opId);
    } finally {
      setRollingBack(null);
    }
  }, [onRollback]);

  const hasLocal = undoDescriptions.length > 0;
  const hasServer = recentOperations.length > 0;
  const isEmpty = !hasLocal && !hasServer;

  return (
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
              ({recentOperations.length})
            </span>
          </button>
          {serverOpen && (
            <div className="pb-1">
              {recentOperations.map(op => (
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
                        onClick={() => handleRollback(op.id)}
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
  );
}
