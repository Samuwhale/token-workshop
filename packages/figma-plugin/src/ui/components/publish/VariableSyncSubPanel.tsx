import type { useVariableSync } from '../../hooks/useVariableSync';
import { VarDiffRowItem } from './PublishShared';

type VarSync = ReturnType<typeof useVariableSync>;

interface VariableSyncSubPanelProps {
  varSync: VarSync;
  activeSet: string;
  diffFilter: string;
  onRequestConfirm: (action: 'preview-vars' | 'apply-vars') => void;
}

export function VariableSyncSubPanel({ varSync, activeSet, diffFilter, onRequestConfirm }: VariableSyncSubPanelProps) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 text-[10px] text-[var(--color-figma-text-secondary)]">
        Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back.
      </div>

      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Token differences</span>
        <button
          onClick={varSync.computeVarDiff}
          disabled={varSync.varLoading || !activeSet}
          className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
        >
          {varSync.varLoading ? 'Checking\u2026' : varSync.varChecked ? 'Re-check' : 'Compare'}
        </button>
      </div>

      {varSync.varError && (
        <div role="alert" className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{varSync.varError}</div>
      )}

      {varSync.varRows.length > 0 && (() => {
        const filterLower = diffFilter.toLowerCase();
        const filteredVarRows = filterLower
          ? varSync.varRows.filter(r => r.path.toLowerCase().includes(filterLower))
          : varSync.varRows;
        const localOnly = filteredVarRows.filter(r => r.cat === 'local-only');
        const figmaOnly = filteredVarRows.filter(r => r.cat === 'figma-only');
        const conflicts = filteredVarRows.filter(r => r.cat === 'conflict');

        return (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
              {(['push', 'pull', 'skip'] as const).map(action => (
                <button
                  key={action}
                  onClick={() => varSync.setVarDirs(Object.fromEntries(varSync.varRows.map(r => [r.path, action])))}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                >
                  {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                </button>
              ))}
            </div>

            {filterLower && filteredVarRows.length !== varSync.varRows.length && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                {filteredVarRows.length} of {varSync.varRows.length} token{varSync.varRows.length !== 1 ? 's' : ''} match filter
              </div>
            )}

            <div className="divide-y divide-[var(--color-figma-border)]">
              {localOnly.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                </div>
              )}
              {localOnly.map(row => (
                <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'push'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
              ))}
              {figmaOnly.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                </div>
              )}
              {figmaOnly.map(row => (
                <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'pull'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
              ))}
              {conflicts.length > 0 && (
                <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                  {conflicts.length > 1 && (
                    <span className="flex items-center gap-1">
                      {(['push', 'pull', 'skip'] as const).map(action => (
                        <button
                          key={action}
                          onClick={() => varSync.setVarDirs(prev => {
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
                <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'push'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
              ))}
            </div>

            <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {varSync.varSyncCount === 0
                  ? 'Nothing to apply \u2014 all skipped'
                  : [
                      varSync.varPushCount > 0 ? `\u2191 ${varSync.varPushCount} to Figma` : null,
                      varSync.varPullCount > 0 ? `\u2193 ${varSync.varPullCount} to local` : null,
                    ].filter(Boolean).join(' \u00b7 ')
                }
              </span>
              <span className="flex items-center gap-1.5">
                <button
                  onClick={() => onRequestConfirm('preview-vars')}
                  disabled={varSync.varSyncCount === 0}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => onRequestConfirm('apply-vars')}
                  disabled={varSync.varSyncing || varSync.varSyncCount === 0}
                  className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {varSync.varSyncing
                    ? (varSync.varProgress
                      ? `Syncing ${varSync.varProgress.current} / ${varSync.varProgress.total}\u2026`
                      : 'Syncing\u2026')
                    : `Apply ${varSync.varSyncCount > 0 ? varSync.varSyncCount + ' change' + (varSync.varSyncCount !== 1 ? 's' : '') : ''}`}
                </button>
              </span>
            </div>
          </>
        );
      })()}

      {!varSync.varLoading && !varSync.varError && (
        varSync.varChecked && varSync.varRows.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            Local tokens match Figma variables.
          </div>
        ) : !varSync.varChecked && varSync.varRows.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.
          </div>
        ) : null
      )}
    </div>
  );
}
