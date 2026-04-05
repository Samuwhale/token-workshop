import { useState } from 'react';
import type { useSyncEntity } from '../../hooks/useSyncEntity';
import { VarDiffRowItem } from './PublishShared';

type SyncState = ReturnType<typeof useSyncEntity>;

interface SyncSubPanelProps {
  sync: SyncState;
  activeSet: string;
  diffFilter: string;
  onRequestConfirm: (action: string) => void;
  onRevert?: () => void;

  // Entity-specific text
  description: string;
  sectionLabel: string;
  previewAction: string;
  applyAction: string;
  inSyncMessage: string;
  notCheckedMessage: React.ReactNode;
  revertDescription: string;

  // Optional scope editing (variable sync only)
  scopeOverrides?: Record<string, string[]>;
  onScopesChange?: (path: string, scopes: string[]) => void;
  getScopeOptions?: (type: string | undefined) => { label: string; value: string }[];
}

export function SyncSubPanel({
  sync,
  activeSet,
  diffFilter,
  onRequestConfirm,
  onRevert,
  description,
  sectionLabel,
  previewAction,
  applyAction,
  inSyncMessage,
  notCheckedMessage,
  revertDescription,
  scopeOverrides,
  onScopesChange,
  getScopeOptions,
}: SyncSubPanelProps) {
  const [revertPending, setRevertPending] = useState(false);

  function handleRevertConfirm() {
    setRevertPending(false);
    onRevert?.();
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 text-[10px] text-[var(--color-figma-text-secondary)]">
        {description}
      </div>

      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">{sectionLabel}</span>
        <button
          onClick={sync.computeDiff}
          disabled={sync.loading || !activeSet}
          className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
        >
          {sync.loading ? 'Checking\u2026' : sync.checked ? 'Re-check' : 'Compare'}
        </button>
      </div>

      {sync.error && (
        <div role="alert" className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{sync.error}</div>
      )}

      {sync.rows.length > 0 && (() => {
        const filterLower = diffFilter.toLowerCase();
        const filteredRows = filterLower
          ? sync.rows.filter(r => r.path.toLowerCase().includes(filterLower))
          : sync.rows;
        const localOnly = filteredRows.filter(r => r.cat === 'local-only');
        const figmaOnly = filteredRows.filter(r => r.cat === 'figma-only');
        const conflicts = filteredRows.filter(r => r.cat === 'conflict');

        return (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
              {(['push', 'pull', 'skip'] as const).map(action => (
                <button
                  key={action}
                  onClick={() => sync.setDirs(Object.fromEntries(sync.rows.map(r => [r.path, action])))}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                >
                  {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                </button>
              ))}
            </div>

            {filterLower && filteredRows.length !== sync.rows.length && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                {filteredRows.length} of {sync.rows.length} token{sync.rows.length !== 1 ? 's' : ''} match filter
              </div>
            )}

            <div className="divide-y divide-[var(--color-figma-border)]">
              {localOnly.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                </div>
              )}
              {localOnly.map(row => (
                <VarDiffRowItem
                  key={row.path}
                  row={row}
                  dir={sync.dirs[row.path] ?? 'push'}
                  onChange={d => sync.setDirs(prev => ({ ...prev, [row.path]: d }))}
                  scopeOptions={getScopeOptions?.(row.localType)}
                  scopeValue={scopeOverrides?.[row.path] ?? row.localScopes}
                  onScopesChange={onScopesChange ? (s) => onScopesChange(row.path, s) : undefined}
                />
              ))}
              {figmaOnly.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                </div>
              )}
              {figmaOnly.map(row => (
                <VarDiffRowItem
                  key={row.path}
                  row={row}
                  dir={sync.dirs[row.path] ?? 'pull'}
                  onChange={d => sync.setDirs(prev => ({ ...prev, [row.path]: d }))}
                  scopeOptions={getScopeOptions?.(row.figmaType)}
                  scopeValue={row.figmaScopes}
                />
              ))}
              {conflicts.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                  {conflicts.length > 1 && (
                    <span className="flex items-center gap-1">
                      {(['push', 'pull', 'skip'] as const).map(action => (
                        <button
                          key={action}
                          onClick={() => sync.setDirs(prev => {
                            const next = { ...prev };
                            for (const r of conflicts) next[r.path] = action;
                            return next;
                          })}
                          className="text-[9px] px-1 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                        >
                          {action === 'push' ? '\u2191 Push' : action === 'pull' ? '\u2193 Pull' : 'Skip'} all
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              )}
              {conflicts.map(row => (
                <VarDiffRowItem
                  key={row.path}
                  row={row}
                  dir={sync.dirs[row.path] ?? 'push'}
                  onChange={d => sync.setDirs(prev => ({ ...prev, [row.path]: d }))}
                  scopeOptions={getScopeOptions?.(row.localType ?? row.figmaType)}
                  scopeValue={scopeOverrides?.[row.path] ?? row.localScopes}
                  onScopesChange={onScopesChange ? (s) => onScopesChange(row.path, s) : undefined}
                  figmaScopeValue={row.figmaScopes}
                />
              ))}
            </div>

            <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {sync.syncCount === 0
                  ? 'Nothing to apply \u2014 all skipped'
                  : [
                      sync.pushCount > 0 ? `\u2191 ${sync.pushCount} to Figma` : null,
                      sync.pullCount > 0 ? `\u2193 ${sync.pullCount} to local` : null,
                    ].filter(Boolean).join(' \u00b7 ')
                }
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  onClick={() => onRequestConfirm(previewAction)}
                  disabled={sync.syncCount === 0}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => onRequestConfirm(applyAction)}
                  disabled={sync.syncing || sync.syncCount === 0}
                  className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {sync.syncing
                    ? (sync.progress
                      ? `Syncing ${sync.progress.current} / ${sync.progress.total}\u2026`
                      : 'Syncing\u2026')
                    : `Apply ${sync.syncCount > 0 ? sync.syncCount + ' change' + (sync.syncCount !== 1 ? 's' : '') : ''}`}
                </button>
              </span>
            </div>
          </>
        );
      })()}

      {!sync.loading && !sync.error && (
        sync.checked && sync.rows.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {inSyncMessage}
            </div>
            {sync.snapshot && (
              <div className="mt-2 flex flex-col gap-1">
                {revertPending ? (
                  <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Revert last sync?</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{revertDescription} This cannot be undone.</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <button
                        onClick={handleRevertConfirm}
                        disabled={sync.reverting}
                        className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-figma-error)] text-white font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
                      >
                        {sync.reverting ? 'Reverting\u2026' : 'Yes, revert'}
                      </button>
                      <button
                        onClick={() => setRevertPending(false)}
                        disabled={sync.reverting}
                        className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setRevertPending(true)}
                      disabled={sync.reverting}
                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      {sync.reverting ? 'Reverting\u2026' : 'Revert last sync'}
                    </button>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{revertDescription}</span>
                  </div>
                )}
                {sync.revertError && (
                  <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">{sync.revertError}</div>
                )}
              </div>
            )}
          </div>
        ) : !sync.checked && sync.rows.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            {notCheckedMessage}
          </div>
        ) : null
      )}
    </div>
  );
}
