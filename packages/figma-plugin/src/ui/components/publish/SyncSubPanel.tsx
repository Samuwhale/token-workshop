import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { useSyncEntity } from '../../hooks/useSyncEntity';
import { VarDiffRowItem } from './PublishShared';

/** Group rows by their token type, returning groups in a stable order */
function groupByType<T extends { localType?: string; figmaType?: string }>(rows: T[]): { type: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const t = row.localType ?? row.figmaType ?? 'other';
    const arr = map.get(t);
    if (arr) arr.push(row); else map.set(t, [row]);
  }
  // Sort groups: color first, then dimension, typography, then alphabetical
  const order = ['color', 'dimension', 'number', 'typography', 'shadow', 'gradient'];
  return [...map.entries()]
    .sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([type, rows]) => ({ type, rows }));
}

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
  locked?: boolean;
  lockedMessage?: React.ReactNode;

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
  locked = false,
  lockedMessage,
  scopeOverrides,
  onScopesChange,
  getScopeOptions,
}: SyncSubPanelProps) {
  const [revertPending, setRevertPending] = useState(false);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [collapsedTypeGroups, setCollapsedTypeGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('tm_collapsed_type_groups');
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });
  const toggleTypeGroup = useCallback((key: string) => {
    setCollapsedTypeGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('tm_collapsed_type_groups', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const prevRowsRef = useRef(sync.rows);

  // Reset type filter when a new compare completes (rows identity changes)
  useEffect(() => {
    if (sync.rows !== prevRowsRef.current) {
      prevRowsRef.current = sync.rows;
      setTypeFilters([]);
    }
  }, [sync.rows]);

  // Collect unique types from all rows
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const row of sync.rows) {
      const t = row.localType ?? row.figmaType;
      if (t) types.add(t);
    }
    return [...types].sort();
  }, [sync.rows]);

  // Count tokens per type for badge display
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of sync.rows) {
      const t = row.localType ?? row.figmaType;
      if (t) counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [sync.rows]);

  // Combined path + type filtering (applied post-compare to the diff rows)
  const filteredRows = useMemo(() => {
    let rows = sync.rows;
    const filterLower = diffFilter.toLowerCase();
    if (filterLower) {
      rows = rows.filter(r => r.path.toLowerCase().includes(filterLower));
    }
    if (typeFilters.length > 0) {
      rows = rows.filter(r => {
        const t = r.localType ?? r.figmaType;
        return t !== undefined && typeFilters.includes(t);
      });
    }
    return rows;
  }, [sync.rows, diffFilter, typeFilters]);

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
          disabled={locked || sync.loading || !activeSet}
          className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
        >
          {locked ? 'Locked' : sync.loading ? 'Checking\u2026' : sync.checked ? 'Re-check' : 'Compare'}
        </button>
      </div>

      {sync.error && (
        <div role="alert" className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{sync.error}</div>
      )}

      {locked && (
        <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
          <div className="rounded-[14px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2.5 leading-relaxed">
            {lockedMessage ?? 'Run preflight first to unlock compare and apply for this sync target.'}
          </div>
        </div>
      )}

      {!locked && sync.rows.length > 0 && (() => {
        const localOnly = filteredRows.filter(r => r.cat === 'local-only');
        const figmaOnly = filteredRows.filter(r => r.cat === 'figma-only');
        const conflicts = filteredRows.filter(r => r.cat === 'conflict');
        const localOnlyGroups = groupByType(localOnly);
        const figmaOnlyGroups = groupByType(figmaOnly);
        const conflictGroups = groupByType(conflicts);
        const isFiltered = diffFilter.length > 0 || typeFilters.length > 0;

        return (
          <>
            {/* ── Type filter chips (visible when multiple types exist) ── */}
            {availableTypes.length > 1 && (
              <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Type:</span>
                <button
                  onClick={() => setTypeFilters([])}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                    typeFilters.length === 0
                      ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
                      : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  All
                </button>
                {availableTypes.map(type => {
                  const active = typeFilters.includes(type);
                  return (
                    <button
                      key={type}
                      onClick={() => setTypeFilters(prev =>
                        prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                      )}
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        active
                          ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      {type}
                      <span className="ml-1 opacity-60">{typeCounts[type] ?? 0}</span>
                    </button>
                  );
                })}
              </div>
            )}

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

            {isFiltered && filteredRows.length !== sync.rows.length && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                {filteredRows.length} of {sync.rows.length} token{sync.rows.length !== 1 ? 's' : ''} match filter
              </div>
            )}

            <div className="divide-y divide-[var(--color-figma-border)]">
              {localOnly.length > 0 && (
                <>
                  <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                  </div>
                  {localOnlyGroups.map(group => {
                    const groupKey = `local-only:${group.type}`;
                    const collapsed = collapsedTypeGroups.has(groupKey);
                    return (
                      <div key={groupKey}>
                        {localOnlyGroups.length > 1 && (
                          <button
                            onClick={() => toggleTypeGroup(groupKey)}
                            className="w-full flex items-center gap-1.5 px-4 py-1 bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform text-[var(--color-figma-text-secondary)] ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true">
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">{group.type}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-60">{group.rows.length}</span>
                          </button>
                        )}
                        {!collapsed && group.rows.map(row => (
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
                      </div>
                    );
                  })}
                </>
              )}
              {figmaOnly.length > 0 && (
                <>
                  <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                  </div>
                  {figmaOnlyGroups.map(group => {
                    const groupKey = `figma-only:${group.type}`;
                    const collapsed = collapsedTypeGroups.has(groupKey);
                    return (
                      <div key={groupKey}>
                        {figmaOnlyGroups.length > 1 && (
                          <button
                            onClick={() => toggleTypeGroup(groupKey)}
                            className="w-full flex items-center gap-1.5 px-4 py-1 bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform text-[var(--color-figma-text-secondary)] ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true">
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">{group.type}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-60">{group.rows.length}</span>
                          </button>
                        )}
                        {!collapsed && group.rows.map(row => (
                          <VarDiffRowItem
                            key={row.path}
                            row={row}
                            dir={sync.dirs[row.path] ?? 'pull'}
                            onChange={d => sync.setDirs(prev => ({ ...prev, [row.path]: d }))}
                            scopeOptions={getScopeOptions?.(row.figmaType)}
                            scopeValue={row.figmaScopes}
                          />
                        ))}
                      </div>
                    );
                  })}
                </>
              )}
              {conflicts.length > 0 && (
                <>
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
                  {conflictGroups.map(group => {
                    const groupKey = `conflict:${group.type}`;
                    const collapsed = collapsedTypeGroups.has(groupKey);
                    return (
                      <div key={groupKey}>
                        {conflictGroups.length > 1 && (
                          <button
                            onClick={() => toggleTypeGroup(groupKey)}
                            className="w-full flex items-center gap-1.5 px-4 py-1 bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] transition-colors border-t border-[var(--color-figma-border)]"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform text-[var(--color-figma-text-secondary)] ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true">
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">{group.type}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)] opacity-60">{group.rows.length}</span>
                          </button>
                        )}
                        {!collapsed && group.rows.map(row => (
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
                    );
                  })}
                </>
              )}
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
                  disabled={locked || sync.syncCount === 0}
                  className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                >
                  Preview
                </button>
                <button
                  onClick={() => onRequestConfirm(applyAction)}
                  disabled={locked || sync.syncing || sync.syncCount === 0}
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
        sync.checked && sync.rows.length === 0 && !locked ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {inSyncMessage}
            </div>
            {!!sync.snapshot && (
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
        ) : !sync.checked && sync.rows.length === 0 && !locked ? (
          <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
            {notCheckedMessage}
          </div>
        ) : null
      )}
    </div>
  );
}
