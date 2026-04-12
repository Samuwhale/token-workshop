import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { ConfirmModal } from './ConfirmModal';

export interface UnusedToken {
  path: string;
  set: string;
  $type: string;
  $lifecycle?: 'draft' | 'published' | 'deprecated';
}

export interface UnusedTokensPanelProps {
  serverUrl: string;
  unusedTokens: UnusedToken[];
  hasUsageData: boolean;
  unusedCount: number;
  onNavigateToToken?: (path: string, set: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void;
}

type LifecycleValue = 'draft' | 'published' | 'deprecated';
type CleanupAction = 'delete' | 'deprecate';
type StageFilter = 'all' | 'staged' | 'unstaged' | CleanupAction;

interface QueueToken extends UnusedToken {
  key: string;
  lifecycle: LifecycleValue;
}

const LIFECYCLE_ORDER: Record<LifecycleValue, number> = {
  draft: 0,
  published: 1,
  deprecated: 2,
};

function tokenKey(token: { set: string; path: string }): string {
  return `${token.set}:${token.path}`;
}

function normalizeLifecycle(lifecycle?: UnusedToken['$lifecycle']): LifecycleValue {
  return lifecycle ?? 'published';
}

function formatLifecycle(lifecycle: LifecycleValue): string {
  switch (lifecycle) {
    case 'draft':
      return 'Draft';
    case 'deprecated':
      return 'Deprecated';
    default:
      return 'Published';
  }
}

function getActionBadgeClass(action: CleanupAction): string {
  return action === 'delete'
    ? 'border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]'
    : 'border-gray-400/40 bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]';
}

function getLifecycleBadgeClass(lifecycle: LifecycleValue): string {
  switch (lifecycle) {
    case 'draft':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    case 'deprecated':
      return 'border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]';
    default:
      return 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]';
  }
}

export function UnusedTokensPanel({
  serverUrl,
  unusedTokens,
  hasUsageData,
  unusedCount,
  onNavigateToToken,
  onError,
  onMutate,
}: UnusedTokensPanelProps) {
  const [showUnused, setShowUnused] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<'all' | LifecycleValue>('all');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [stagedActions, setStagedActions] = useState<Record<string, CleanupAction>>({});
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [confirmApplyStaged, setConfirmApplyStaged] = useState(false);
  const [deletingUnused, setDeletingUnused] = useState<Set<string>>(new Set());
  const [deprecatingUnused, setDeprecatingUnused] = useState<Set<string>>(new Set());
  const [collapsedSets, setCollapsedSets] = useState<Set<string>>(new Set());
  const [expandedCounts, setExpandedCounts] = useState<Record<string, number>>({});
  const ITEMS_PER_PAGE = 20;

  const queueTokens = useMemo<QueueToken[]>(() => (
    [...unusedTokens]
      .map(token => ({
        ...token,
        key: tokenKey(token),
        lifecycle: normalizeLifecycle(token.$lifecycle),
      }))
      .sort((a, b) => (
        a.set.localeCompare(b.set)
        || LIFECYCLE_ORDER[a.lifecycle] - LIFECYCLE_ORDER[b.lifecycle]
        || a.path.localeCompare(b.path)
      ))
  ), [unusedTokens]);

  useEffect(() => {
    const validKeys = new Set(queueTokens.map(token => token.key));
    setStagedActions(prev => {
      let changed = false;
      const next: Record<string, CleanupAction> = {};
      for (const [key, action] of Object.entries(prev)) {
        if (validKeys.has(key)) {
          next[key] = action;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [queueTokens]);

  const availableSets = useMemo(() => (
    [...new Set(queueTokens.map(token => token.set))].sort((a, b) => a.localeCompare(b))
  ), [queueTokens]);

  const filteredTokens = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return queueTokens.filter(token => {
      if (setFilter !== 'all' && token.set !== setFilter) return false;
      if (lifecycleFilter !== 'all' && token.lifecycle !== lifecycleFilter) return false;

      const stagedAction = stagedActions[token.key];
      if (stageFilter === 'staged' && !stagedAction) return false;
      if (stageFilter === 'unstaged' && stagedAction) return false;
      if ((stageFilter === 'delete' || stageFilter === 'deprecate') && stagedAction !== stageFilter) return false;

      if (!query) return true;
      return [token.path, token.set, token.$type, token.lifecycle]
        .some(value => value.toLowerCase().includes(query));
    });
  }, [lifecycleFilter, queueTokens, searchQuery, setFilter, stageFilter, stagedActions]);

  const groupedQueue = useMemo(() => {
    const grouped = new Map<string, Map<LifecycleValue, QueueToken[]>>();
    for (const token of filteredTokens) {
      let lifecycleGroups = grouped.get(token.set);
      if (!lifecycleGroups) {
        lifecycleGroups = new Map<LifecycleValue, QueueToken[]>();
        grouped.set(token.set, lifecycleGroups);
      }
      const existing = lifecycleGroups.get(token.lifecycle) ?? [];
      existing.push(token);
      lifecycleGroups.set(token.lifecycle, existing);
    }
    return [...grouped.entries()]
      .map(([setName, lifecycleGroups]) => {
        const lg = (['draft', 'published', 'deprecated'] as LifecycleValue[])
          .map(lifecycle => ({ lifecycle, tokens: lifecycleGroups.get(lifecycle) ?? [] }))
          .filter(group => group.tokens.length > 0);
        const totalCount = lg.reduce((sum, g) => sum + g.tokens.length, 0);
        return { setName, lifecycleGroups: lg, totalCount };
      })
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [filteredTokens]);

  const stagedQueue = useMemo(() => (
    queueTokens.flatMap(token => {
      const action = stagedActions[token.key];
      return action ? [{ token, action }] : [];
    })
  ), [queueTokens, stagedActions]);

  const stagedDeleteCount = stagedQueue.filter(entry => entry.action === 'delete').length;
  const stagedDeprecateCount = stagedQueue.length - stagedDeleteCount;
  const visibleStagedCount = filteredTokens.filter(token => stagedActions[token.key]).length;
  const hasActiveFilters = (
    searchQuery.trim().length > 0
    || setFilter !== 'all'
    || lifecycleFilter !== 'all'
    || stageFilter !== 'all'
  );

  const busyKeys = useMemo(() => {
    const next = new Set<string>();
    for (const key of deletingUnused) next.add(key);
    for (const key of deprecatingUnused) next.add(key);
    return next;
  }, [deletingUnused, deprecatingUnused]);

  useEffect(() => {
    if (stagedQueue.length > 0 || hasActiveFilters) {
      setShowBulkActions(true);
    }
  }, [stagedQueue.length, hasActiveFilters]);

  const stageTokens = (tokens: QueueToken[], action: CleanupAction) => {
    if (tokens.length === 0) return;
    setStagedActions(prev => {
      const next = { ...prev };
      for (const token of tokens) next[token.key] = action;
      return next;
    });
  };

  const clearStagedTokens = (tokens: QueueToken[]) => {
    if (tokens.length === 0) return;
    setStagedActions(prev => {
      const next = { ...prev };
      for (const token of tokens) delete next[token.key];
      return next;
    });
  };

  const executeCleanupAction = async (token: QueueToken, action: CleanupAction) => {
    const endpoint = `${serverUrl}/api/tokens/${encodeURIComponent(token.set)}/${tokenPathToUrlSegment(token.path)}`;
    if (action === 'delete') {
      await apiFetch(endpoint, { method: 'DELETE' });
      return;
    }
    await apiFetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
    });
  };

  const handleApplyStaged = async () => {
    const entries = stagedQueue;
    if (entries.length === 0) {
      setConfirmApplyStaged(false);
      return;
    }

    const deleteKeys = new Set(entries.filter(entry => entry.action === 'delete').map(entry => entry.token.key));
    const deprecateKeys = new Set(entries.filter(entry => entry.action === 'deprecate').map(entry => entry.token.key));
    setDeletingUnused(deleteKeys);
    setDeprecatingUnused(deprecateKeys);

    const failures: Array<{ key: string; action: CleanupAction }> = [];
    let successCount = 0;

    const results = await Promise.allSettled(entries.map(({ token, action }) => executeCleanupAction(token, action)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount += 1;
        return;
      }
      const failedEntry = entries[index];
      console.warn(`[UnusedTokensPanel] ${failedEntry.action} unused token failed:`, result.reason);
      failures.push({ key: failedEntry.token.key, action: failedEntry.action });
    });

    setDeletingUnused(new Set());
    setDeprecatingUnused(new Set());
    setConfirmApplyStaged(false);

    if (failures.length > 0) {
      setStagedActions(Object.fromEntries(failures.map(({ key, action }) => [key, action])));
      onError(
        failures.length === entries.length
          ? 'Cleanup failed — no unused tokens were updated.'
          : `Cleanup partially failed — ${failures.length} staged token${failures.length === 1 ? '' : 's'} still need attention.`,
      );
    } else {
      setStagedActions({});
    }

    if (successCount > 0) onMutate();
  };

  const totalVisibleGroups = groupedQueue.reduce((sum, group) => sum + group.lifecycleGroups.length, 0);

  return (
    <>
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
        <button
          onClick={() => setShowUnused(v => !v)}
          className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            {unusedTokens.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            Unused Tokens
            {!hasUsageData ? (
              <span className="normal-case font-normal opacity-60">(scan required)</span>
            ) : (
              <>
                <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">{unusedCount}</span>
                <span className="normal-case font-normal opacity-60">not bound to any canvas node</span>
              </>
            )}
          </span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showUnused ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
        </button>
        {showUnused && (
          <div>
            {!hasUsageData ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                No Figma usage data. Go to Tokens &gt; Library to trigger a usage scan, then return here.
              </div>
            ) : unusedTokens.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                No unused tokens — all tokens are either used in Figma or referenced by other tokens.
              </div>
            ) : (
              <>
                <div className="px-3 py-3 border-b border-[var(--color-figma-border)] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                    <span>{unusedTokens.length} token{unusedTokens.length !== 1 ? 's' : ''} have zero Figma usage and no alias dependents.</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] font-mono">Visible {filteredTokens.length}</span>
                      <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] font-mono">Staged {stagedQueue.length}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(0,0.8fr))_auto]">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search path, set, type, or lifecycle"
                      className="px-2.5 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-tertiary)]"
                    />
                    <select
                      value={setFilter}
                      onChange={(event) => setSetFilter(event.target.value)}
                      className="px-2 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)]"
                      aria-label="Filter unused tokens by set"
                    >
                      <option value="all">All sets</option>
                      {availableSets.map(setName => (
                        <option key={setName} value={setName}>{setName}</option>
                      ))}
                    </select>
                    <select
                      value={lifecycleFilter}
                      onChange={(event) => setLifecycleFilter(event.target.value as 'all' | LifecycleValue)}
                      className="px-2 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)]"
                      aria-label="Filter unused tokens by lifecycle"
                    >
                      <option value="all">All lifecycles</option>
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="deprecated">Deprecated</option>
                    </select>
                    <select
                      value={stageFilter}
                      onChange={(event) => setStageFilter(event.target.value as StageFilter)}
                      className="px-2 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)]"
                      aria-label="Filter unused tokens by staging state"
                    >
                      <option value="all">All queue items</option>
                      <option value="staged">Staged only</option>
                      <option value="unstaged">Unstaged only</option>
                      <option value="deprecate">Staged to deprecate</option>
                      <option value="delete">Staged to delete</option>
                    </select>
                    <button
                      onClick={() => setShowBulkActions(v => !v)}
                      className="px-2 py-2 rounded border border-[var(--color-figma-border)] text-[10px] font-medium text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors whitespace-nowrap"
                      aria-expanded={showBulkActions || hasActiveFilters || stagedQueue.length > 0}
                    >
                      {showBulkActions || hasActiveFilters || stagedQueue.length > 0 ? 'Hide bulk actions' : 'Bulk actions'}
                    </button>
                  </div>

                  {(showBulkActions || hasActiveFilters || stagedQueue.length > 0) && (
                    <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2.5 py-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                          {totalVisibleGroups} queue group{totalVisibleGroups === 1 ? '' : 's'} across {groupedQueue.length} set{groupedQueue.length === 1 ? '' : 's'} match the current filters.
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            onClick={() => stageTokens(filteredTokens, 'deprecate')}
                            disabled={filteredTokens.length === 0}
                            className="text-[10px] px-2 py-1 rounded border border-gray-400/40 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Stage visible to deprecate
                          </button>
                          <button
                            onClick={() => stageTokens(filteredTokens, 'delete')}
                            disabled={filteredTokens.length === 0}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Stage visible to delete
                          </button>
                          <button
                            onClick={() => clearStagedTokens(filteredTokens.filter(token => stagedActions[token.key]))}
                            disabled={visibleStagedCount === 0}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Clear visible
                          </button>
                          <button
                            onClick={() => setStagedActions({})}
                            disabled={stagedQueue.length === 0}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Clear all
                          </button>
                          <button
                            onClick={() => setConfirmApplyStaged(true)}
                            disabled={stagedQueue.length === 0}
                            className="text-[10px] px-2.5 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            Apply staged cleanup
                          </button>
                        </div>
                      </div>
                      {stagedQueue.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">{stagedDeprecateCount} staged to deprecate</span>
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)]">{stagedDeleteCount} staged to delete</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {filteredTokens.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[10px] text-[var(--color-figma-text-secondary)]">
                    No unused tokens match the current search and filters.
                  </div>
                ) : (
                  <div className="max-h-[32rem] overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                    {groupedQueue.map(group => {
                      const groupTokens = group.lifecycleGroups.flatMap(lifecycleGroup => lifecycleGroup.tokens);
                      const groupStagedCount = groupTokens.filter(token => stagedActions[token.key]).length;
                      const isSetCollapsed = collapsedSets.has(group.setName);
                      const visibleLimit = expandedCounts[group.setName] ?? ITEMS_PER_PAGE;
                      const allGroupTokens = groupTokens;
                      const visibleTokens = allGroupTokens.slice(0, visibleLimit);
                      const remainingCount = allGroupTokens.length - visibleLimit;
                      return (
                        <section key={group.setName} className="bg-[var(--color-figma-bg)]">
                          <button
                            onClick={() => setCollapsedSets(prev => {
                              const next = new Set(prev);
                              if (next.has(group.setName)) next.delete(group.setName); else next.add(group.setName);
                              return next;
                            })}
                            className="w-full px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center gap-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${isSetCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                            <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate">{group.setName}</span>
                            <span className="text-[10px] text-[var(--color-figma-text-secondary)] tabular-nums shrink-0">{groupTokens.length}</span>
                            {groupStagedCount > 0 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] shrink-0">{groupStagedCount} staged</span>
                            )}
                          </button>

                          {!isSetCollapsed && (
                            <>
                              <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/50 flex flex-wrap items-center justify-end gap-1">
                                <button
                                  onClick={() => stageTokens(groupTokens, 'deprecate')}
                                  className="text-[9px] px-2 py-1 rounded border border-gray-400/40 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                >
                                  Stage set to deprecate
                                </button>
                                <button
                                  onClick={() => stageTokens(groupTokens, 'delete')}
                                  className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors"
                                >
                                  Stage set to delete
                                </button>
                                <button
                                  onClick={() => clearStagedTokens(groupTokens.filter(token => stagedActions[token.key]))}
                                  disabled={groupStagedCount === 0}
                                  className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  Clear set
                                </button>
                              </div>

                              <div className="divide-y divide-[var(--color-figma-border)]">
                                {visibleTokens.map(token => {
                                      const stagedAction = stagedActions[token.key];
                                      const isDeleting = deletingUnused.has(token.key);
                                      const isDeprecating = deprecatingUnused.has(token.key);
                                      const isBusy = busyKeys.has(token.key);
                                      return (
                                        <div key={token.key} className="px-3 py-2 flex items-center gap-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                                          <button
                                            onClick={() => onNavigateToToken?.(token.path, token.set)}
                                            disabled={!onNavigateToToken || isBusy}
                                            className="min-w-0 flex-1 text-left disabled:cursor-default"
                                          >
                                            <div className={`text-[10px] font-mono truncate ${isBusy ? 'opacity-40 text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-text)]'}`}>{token.path}</div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-[var(--color-figma-text-tertiary)]">
                                              <span>{token.$type}</span>
                                              <span>{token.set}</span>
                                              {stagedAction && (
                                                <span className={`px-1.5 py-0.5 rounded border ${getActionBadgeClass(stagedAction)}`}>
                                                  Staged to {stagedAction}
                                                </span>
                                              )}
                                              {isDeleting && <span className="text-[var(--color-figma-error)]">Deleting…</span>}
                                              {isDeprecating && <span>Deprecating…</span>}
                                            </div>
                                          </button>

                                          <div className="shrink-0 flex flex-wrap items-center justify-end gap-1">
                                            {stagedAction ? (
                                              <>
                                                <button
                                                  onClick={() => setStagedActions(prev => ({ ...prev, [token.key]: stagedAction === 'delete' ? 'deprecate' : 'delete' }))}
                                                  disabled={isBusy}
                                                  className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                  Stage to {stagedAction === 'delete' ? 'deprecate' : 'delete'}
                                                </button>
                                                <button
                                                  onClick={() => clearStagedTokens([token])}
                                                  disabled={isBusy}
                                                  className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                  Clear
                                                </button>
                                              </>
                                            ) : (
                                              <>
                                                <button
                                                  onClick={() => stageTokens([token], 'deprecate')}
                                                  disabled={isBusy}
                                                  className="text-[9px] px-2 py-1 rounded border border-gray-400/40 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                  Stage deprecate
                                                </button>
                                                <button
                                                  onClick={() => stageTokens([token], 'delete')}
                                                  disabled={isBusy}
                                                  className="text-[9px] px-2 py-1 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                >
                                                  Stage delete
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                {remainingCount > 0 && (
                                  <button
                                    onClick={() => setExpandedCounts(prev => ({
                                      ...prev,
                                      [group.setName]: visibleLimit + Math.min(remainingCount, ITEMS_PER_PAGE),
                                    }))}
                                    className="w-full px-3 py-2 text-[10px] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-center"
                                  >
                                    Show {Math.min(remainingCount, ITEMS_PER_PAGE)} more{remainingCount > ITEMS_PER_PAGE ? ` of ${remainingCount} remaining` : ''}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {confirmApplyStaged && (
        <ConfirmModal
          title="Apply staged cleanup?"
          description={`This will apply ${stagedQueue.length} queued cleanup action${stagedQueue.length === 1 ? '' : 's'} to unused tokens.`}
          confirmLabel="Apply cleanup"
          danger={stagedDeleteCount > 0}
          wide
          onConfirm={handleApplyStaged}
          onCancel={() => setConfirmApplyStaged(false)}
        >
          <div className="mt-3 space-y-2 text-[10px] text-[var(--color-figma-text-secondary)]">
            <div className="flex items-center justify-between gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
              <span>Deprecate tokens</span>
              <span className="font-mono text-[var(--color-figma-text)]">{stagedDeprecateCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
              <span>Delete tokens</span>
              <span className="font-mono text-[var(--color-figma-text)]">{stagedDeleteCount}</span>
            </div>
            <p className="leading-relaxed">
              Tokens staged to delete will be permanently removed. Tokens staged to deprecate will leave the queue after their lifecycle is updated.
            </p>
          </div>
        </ConfirmModal>
      )}
    </>
  );
}
