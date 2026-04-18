import { useState, useEffect, useMemo, useRef } from 'react';
import type { useSyncEntity } from '../../hooks/useSyncEntity';
import { NoticeBanner } from '../../shared/noticeSystem';
import { getDiffRowId } from '../../shared/syncWorkflow';
import { VarDiffRowItem } from './PublishShared';

type SyncState = ReturnType<typeof useSyncEntity>;

interface SyncSubPanelProps {
  sync: SyncState;
  diffFilter: string;
  onRevert?: () => void;
  inSyncMessage: string;
  notCheckedMessage: React.ReactNode;
  revertDescription: string;
  reviewOnly?: boolean;
  reviewOnlyMessage?: React.ReactNode;

  // Optional scope editing (variable sync only)
  scopeOverrides?: Record<string, string[]>;
  onScopesChange?: (path: string, scopes: string[]) => void;
  getScopeOptions?: (type: string | undefined) => { label: string; value: string }[];
}

/* ── Category section with header, bulk actions, and collapsible rows ── */

type DiffRow = SyncState['rows'][number];

function CategorySection({
  title,
  rows,
  defaultDir,
  dirs,
  onSetDirs,
  collapsed,
  onToggleCollapse,
  getScopeOptions,
  scopeOverrides,
  onScopesChange,
  reviewOnly,
}: {
  title: string;
  rows: DiffRow[];
  defaultDir: 'push' | 'pull' | 'skip';
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  onSetDirs: (updater: (prev: Record<string, 'push' | 'pull' | 'skip'>) => Record<string, 'push' | 'pull' | 'skip'>) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  getScopeOptions?: (type: string | undefined) => { label: string; value: string }[];
  scopeOverrides?: Record<string, string[]>;
  onScopesChange?: (path: string, scopes: string[]) => void;
  reviewOnly?: boolean;
}) {
  // Count current directions within this category
  const pushCount = rows.filter(r => (dirs[getDiffRowId(r)] ?? defaultDir) === 'push').length;
  const pullCount = rows.filter(r => (dirs[getDiffRowId(r)] ?? defaultDir) === 'pull').length;
  const skipCount = rows.filter(r => (dirs[getDiffRowId(r)] ?? defaultDir) === 'skip').length;

  // Group rows by token type within this category
  const typeGroups = new Map<string, DiffRow[]>();
  for (const row of rows) {
    const type = row.localType ?? row.figmaType ?? 'other';
    const groupRows = typeGroups.get(type);
    if (groupRows) {
      groupRows.push(row);
    } else {
      typeGroups.set(type, [row]);
    }
  }

  if (rows.length === 0) return null;

  const setBulk = (action: 'push' | 'pull' | 'skip') => {
    onSetDirs(prev => {
      const next = { ...prev };
      for (const r of rows) next[getDiffRowId(r)] = action;
      return next;
    });
  };

  return (
    <div className="border-t border-[var(--color-figma-border)]">
      {/* Category header */}
      <button
        onClick={onToggleCollapse}
        className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center gap-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 text-[var(--color-figma-text-tertiary)] ${collapsed ? '' : 'rotate-90'}`} aria-hidden="true">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{title}</span>
        <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{rows.length}</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-[var(--color-figma-text-tertiary)]">
          {pushCount > 0 && <span>{'\u2191'}{pushCount}</span>}
          {pullCount > 0 && <span>{'\u2193'}{pullCount}</span>}
          {skipCount > 0 && <span>skip {skipCount}</span>}
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Bulk actions for this category */}
          {!reviewOnly && (
            <div className="px-3 py-1 bg-[var(--color-figma-bg)] border-t border-[var(--color-figma-border)] flex items-center gap-1.5">
              {(['push', 'pull', 'skip'] as const).map(action => (
                <button
                  key={action}
                  onClick={(e) => { e.stopPropagation(); setBulk(action); }}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                >
                  {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                </button>
              ))}
            </div>
          )}

          {/* Rows grouped by type */}
          <div className="divide-y divide-[var(--color-figma-border)]">
            {[...typeGroups.entries()].map(([type, groupRows]) => (
              <div key={type}>
                {typeGroups.size > 1 && (
                  <div className="px-3 py-0.5 bg-[var(--color-figma-bg)]">
                    <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">{type}</span>
                  </div>
                )}
                {groupRows.map(row => (
                  <VarDiffRowItem
                    key={getDiffRowId(row)}
                    row={row}
                    dir={dirs[getDiffRowId(row)] ?? defaultDir}
                    onChange={d => onSetDirs(prev => ({ ...prev, [getDiffRowId(row)]: d }))}
                    scopeOptions={getScopeOptions?.(
                      row.cat === 'figma-only' ? row.figmaType : (row.localType ?? row.figmaType),
                    )}
                    scopeValue={
                      row.cat === 'figma-only'
                        ? row.figmaScopes
                        : (scopeOverrides?.[row.path] ?? row.localScopes)
                    }
                    onScopesChange={
                      onScopesChange && row.cat !== 'figma-only'
                        ? (s) => onScopesChange(row.path, s)
                        : undefined
                    }
                    figmaScopeValue={row.cat !== 'local-only' ? row.figmaScopes : undefined}
                    reviewOnly={reviewOnly}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── SyncSubPanel ──────────────────────────────────────────────────────── */

export function SyncSubPanel({
  sync,
  diffFilter,
  onRevert,
  inSyncMessage,
  notCheckedMessage,
  revertDescription,
  reviewOnly = false,
  reviewOnlyMessage,
  scopeOverrides,
  onScopesChange,
  getScopeOptions,
}: SyncSubPanelProps) {
  const [revertPending, setRevertPending] = useState(false);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const prevRowsRef = useRef(sync.rows);

  // Reset type filter and collapsed state when a new compare completes
  useEffect(() => {
    if (sync.rows !== prevRowsRef.current) {
      prevRowsRef.current = sync.rows;
      setTypeFilters([]);
      setCollapsedSections({});
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

  // Combined path + type filtering
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

  const toggleSection = (key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {sync.error && (
        <NoticeBanner severity="error" className="mx-3 mt-3">{sync.error}</NoticeBanner>
      )}

      {sync.rows.length > 0 && (() => {
        const localOnly = filteredRows.filter(r => r.cat === 'local-only');
        const figmaOnly = filteredRows.filter(r => r.cat === 'figma-only');
        const conflicts = filteredRows.filter(r => r.cat === 'conflict');
        const isFiltered = diffFilter.length > 0 || typeFilters.length > 0;

        return (
          <>
            {/* Type filter chips */}
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

            {isFiltered && filteredRows.length !== sync.rows.length && (
              <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                {filteredRows.length} of {sync.rows.length} token{sync.rows.length !== 1 ? 's' : ''}
              </div>
            )}

            {/* Category review groups */}
            <CategorySection
              title="Local only"
              rows={localOnly}
              defaultDir="push"
              dirs={sync.dirs}
              onSetDirs={sync.setDirs}
              collapsed={!!collapsedSections['local-only']}
              onToggleCollapse={() => toggleSection('local-only')}
              getScopeOptions={getScopeOptions}
              scopeOverrides={scopeOverrides}
              onScopesChange={onScopesChange}
              reviewOnly={reviewOnly}
            />

            <CategorySection
              title="Figma only"
              rows={figmaOnly}
              defaultDir="pull"
              dirs={sync.dirs}
              onSetDirs={sync.setDirs}
              collapsed={!!collapsedSections['figma-only']}
              onToggleCollapse={() => toggleSection('figma-only')}
              getScopeOptions={getScopeOptions}
              scopeOverrides={scopeOverrides}
              onScopesChange={onScopesChange}
              reviewOnly={reviewOnly}
            />

            <CategorySection
              title="Conflicts"
              rows={conflicts}
              defaultDir="push"
              dirs={sync.dirs}
              onSetDirs={sync.setDirs}
              collapsed={!!collapsedSections['conflict']}
              onToggleCollapse={() => toggleSection('conflict')}
              getScopeOptions={getScopeOptions}
              scopeOverrides={scopeOverrides}
              onScopesChange={onScopesChange}
              reviewOnly={reviewOnly}
            />

            {reviewOnly && reviewOnlyMessage ? (
              <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] leading-relaxed text-[var(--color-figma-text-secondary)]">
                {reviewOnlyMessage}
              </div>
            ) : null}
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
            {!!sync.snapshot && (
              <div className="mt-2 flex flex-col gap-1">
                {revertPending ? (
                  <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
                    <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Revert last sync?</span>
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{revertDescription}</span>
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
                  <NoticeBanner severity="error">{sync.revertError}</NoticeBanner>
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
