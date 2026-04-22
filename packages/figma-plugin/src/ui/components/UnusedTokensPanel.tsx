import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import type { UnusedToken } from '../hooks/useHealthData';
import { useInlineConfirm } from '../hooks/useInlineConfirm';

export interface UnusedTokensPanelProps {
  serverUrl: string;
  unusedTokens: UnusedToken[];
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void | Promise<void>;
  /** When true, skip the collapsible wrapper and render content directly */
  embedded?: boolean;
}

type CleanupAction = 'delete' | 'deprecate';

const ITEMS_PER_PAGE = 20;

interface CollectionGroup {
  collectionId: string;
  tokens: UnusedToken[];
}

export function UnusedTokensPanel({
  serverUrl,
  unusedTokens,
  onNavigateToToken,
  onError,
  onMutate,
  embedded,
}: UnusedTokensPanelProps) {
  const [showUnused, setShowUnused] = useState(embedded ?? false);
  const [collapsedCollections, setCollapsedCollections] = useState<Set<string>>(new Set());
  const [expandedCounts, setExpandedCounts] = useState<Record<string, number>>({});
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const confirm = useInlineConfirm();

  const groups = useMemo<CollectionGroup[]>(() => {
    const map = new Map<string, UnusedToken[]>();
    for (const token of unusedTokens) {
      const list = map.get(token.collectionId) ?? [];
      list.push(token);
      map.set(token.collectionId, list);
    }
    return [...map.entries()]
      .map(([collectionId, tokens]) => ({
        collectionId,
        tokens: tokens.sort((a, b) => a.path.localeCompare(b.path)),
      }))
      .sort((a, b) => b.tokens.length - a.tokens.length);
  }, [unusedTokens]);

  useEffect(() => {
    const validCollectionIds = new Set(groups.map((group) => group.collectionId));
    setCollapsedCollections((currentCollections) => {
      const nextCollections = new Set(
        [...currentCollections].filter((collectionId) => validCollectionIds.has(collectionId)),
      );
      return nextCollections.size === currentCollections.size ? currentCollections : nextCollections;
    });
    setExpandedCounts((currentCounts) => {
      const nextCounts = Object.fromEntries(
        Object.entries(currentCounts).filter(([collectionId]) => validCollectionIds.has(collectionId)),
      );
      return Object.keys(nextCounts).length === Object.keys(currentCounts).length
        ? currentCounts
        : nextCounts;
    });
  }, [groups]);

  const executeAction = async (token: UnusedToken, action: CleanupAction) => {
    const endpoint = `${serverUrl}/api/tokens/${encodeURIComponent(token.collectionId)}/${tokenPathToUrlSegment(token.path)}`;
    if (action === 'delete') {
      await apiFetch(endpoint, { method: 'DELETE' });
    } else {
      await apiFetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
      });
    }
  };

  const runAction = async (tokens: UnusedToken[], action: CleanupAction) => {
    const keys = new Set(tokens.map(t => `${t.collectionId}:${t.path}`));
    setBusyKeys(prev => new Set([...prev, ...keys]));
    const failures: string[] = [];
    const results = await Promise.allSettled(tokens.map(t => executeAction(t, action)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') failures.push(tokens[i].path);
    });
    setBusyKeys(prev => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });
    if (failures.length > 0) {
      onError(`Failed to ${action} ${failures.length} token${failures.length === 1 ? '' : 's'}.`);
    }
    if (failures.length < tokens.length) {
      await onMutate();
    }
  };

  const toggleCollection = (id: string) => {
    setCollapsedCollections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const unusedCount = unusedTokens.length;

  const content = unusedCount === 0 ? (
    <div className={`px-3 ${embedded ? 'py-12 text-center' : 'py-3'} text-secondary text-[var(--color-figma-text-secondary)]`}>
      No unused tokens — all tokens are either used in Figma or referenced by other tokens.
    </div>
  ) : (
    <div className={`${embedded ? 'h-full overflow-y-auto' : 'max-h-[32rem] overflow-y-auto'} divide-y divide-[var(--color-figma-border)]`}>
              {groups.map(group => {
                const isCollapsed = collapsedCollections.has(group.collectionId);
                const visibleLimit = expandedCounts[group.collectionId] ?? ITEMS_PER_PAGE;
                const visibleTokens = group.tokens.slice(0, visibleLimit);
                const remainingCount = group.tokens.length - visibleLimit;
                const collKey = `coll:${group.collectionId}`;

                return (
                  <section key={group.collectionId} className="bg-[var(--color-figma-bg)]">
                    <div className="w-full px-3 py-2.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center gap-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                      <button onClick={() => toggleCollection(group.collectionId)} className="flex items-center gap-2 min-w-0 flex-1">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${isCollapsed ? '' : 'rotate-90'}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                        <span className="text-body font-semibold text-[var(--color-figma-text)] truncate">{group.collectionId}</span>
                        <span className="text-secondary text-[var(--color-figma-text-secondary)] tabular-nums shrink-0">{group.tokens.length}</span>
                      </button>
                      <div className="shrink-0 flex items-center gap-1">
                        <button
                          onClick={() => confirm.trigger(`${collKey}:deprecate`, () => runAction(group.tokens, 'deprecate'))}
                          className="text-secondary px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                        >
                          {confirm.isPending(`${collKey}:deprecate`) ? 'Confirm?' : 'Deprecate all'}
                        </button>
                        <button
                          onClick={() => confirm.trigger(`${collKey}:delete`, () => runAction(group.tokens, 'delete'))}
                          className="text-secondary px-2 py-1 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors"
                        >
                          {confirm.isPending(`${collKey}:delete`) ? 'Confirm?' : 'Delete all'}
                        </button>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="divide-y divide-[var(--color-figma-border)]">
                        {visibleTokens.map(token => {
                          const tokenKey = `${token.collectionId}:${token.path}`;
                          const isBusy = busyKeys.has(tokenKey);
                          return (
                            <div key={tokenKey} className="px-3 py-2 flex items-center gap-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                              <button
                                onClick={() => onNavigateToToken?.(token.path, token.collectionId)}
                                disabled={!onNavigateToToken || isBusy}
                                className="min-w-0 flex-1 text-left disabled:cursor-default"
                              >
                                <div className={`text-secondary font-mono truncate ${isBusy ? 'opacity-40 text-[var(--color-figma-text-secondary)]' : 'text-[var(--color-figma-text)]'}`}>{token.path}</div>
                                <div className="mt-0.5 text-secondary text-[var(--color-figma-text-tertiary)]">{token.$type}</div>
                              </button>
                              <div className="shrink-0 flex items-center gap-1">
                                <button
                                  onClick={() => confirm.trigger(`${tokenKey}:deprecate`, () => runAction([token], 'deprecate'))}
                                  disabled={isBusy}
                                  className="text-secondary px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                                >
                                  {confirm.isPending(`${tokenKey}:deprecate`) ? 'Confirm?' : 'Deprecate'}
                                </button>
                                <button
                                  onClick={() => confirm.trigger(`${tokenKey}:delete`, () => runAction([token], 'delete'))}
                                  disabled={isBusy}
                                  className="text-secondary px-2 py-1 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 transition-colors"
                                >
                                  {confirm.isPending(`${tokenKey}:delete`) ? 'Confirm?' : 'Delete'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {remainingCount > 0 && (
                          <button
                            onClick={() => setExpandedCounts(prev => ({
                              ...prev,
                              [group.collectionId]: visibleLimit + Math.min(remainingCount, ITEMS_PER_PAGE),
                            }))}
                            className="w-full px-3 py-2 text-secondary text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)] transition-colors text-center"
                          >
                            Show {Math.min(remainingCount, ITEMS_PER_PAGE)} more{remainingCount > ITEMS_PER_PAGE ? ` of ${remainingCount} remaining` : ''}
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
  );

  if (embedded) return content;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowUnused(v => !v)}
        className="w-full px-3 py-2.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span className="text-body font-semibold text-[var(--color-figma-text)]">Unused tokens</span>
          {unusedCount > 0 && (
            <span className="text-secondary text-[var(--color-figma-text-tertiary)]">{unusedCount}</span>
          )}
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showUnused ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
      </button>
      {showUnused && <div>{content}</div>}
    </div>
  );
}
