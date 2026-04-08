import { useState } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';
import { ConfirmModal } from './ConfirmModal';

export interface UnusedToken {
  path: string;
  set: string;
  $type: string;
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
  const [confirmDeleteAllUnused, setConfirmDeleteAllUnused] = useState(false);
  const [confirmDeleteUnusedToken, setConfirmDeleteUnusedToken] = useState<{ path: string; set: string } | null>(null);
  const [confirmDeprecateAllUnused, setConfirmDeprecateAllUnused] = useState(false);
  const [confirmDeprecateUnusedToken, setConfirmDeprecateUnusedToken] = useState<{ path: string; set: string } | null>(null);
  const [deletingUnused, setDeletingUnused] = useState<Set<string>>(new Set());
  const [deprecatingUnused, setDeprecatingUnused] = useState<Set<string>>(new Set());

  const handleDeleteUnusedToken = async (path: string, set: string) => {
    const key = `${set}:${path}`;
    setDeletingUnused(prev => new Set([...prev, key]));
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, { method: 'DELETE' });
      onMutate();
    } catch (err) {
      console.warn('[UnusedTokensPanel] delete unused token failed:', err);
      onError('Delete failed — check your connection and try again.');
    } finally {
      setDeletingUnused(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleDeleteAllUnused = async () => {
    setDeletingUnused(new Set(['__all__']));
    try {
      await Promise.all(unusedTokens.map(({ path, set }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, { method: 'DELETE' })
      ));
      setConfirmDeleteAllUnused(false);
      onMutate();
    } catch (err) {
      console.warn('[UnusedTokensPanel] delete all unused tokens failed:', err);
      onError('Delete failed — some tokens may not have been removed.');
    } finally {
      setDeletingUnused(new Set());
    }
  };

  const handleDeprecateUnusedToken = async (path: string, set: string) => {
    const key = `${set}:${path}`;
    setDeprecatingUnused(prev => new Set([...prev, key]));
    try {
      await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
      });
      onMutate();
    } catch (err) {
      console.warn('[UnusedTokensPanel] deprecate unused token failed:', err);
      onError('Deprecate failed — check your connection and try again.');
    } finally {
      setDeprecatingUnused(prev => { const next = new Set(prev); next.delete(key); return next; });
    }
  };

  const handleDeprecateAllUnused = async () => {
    setDeprecatingUnused(new Set(['__all__']));
    try {
      await Promise.all(unusedTokens.map(({ path, set }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(set)}/${tokenPathToUrlSegment(path)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $extensions: { tokenmanager: { lifecycle: 'deprecated' } } }),
        })
      ));
      setConfirmDeprecateAllUnused(false);
      onMutate();
    } catch (err) {
      console.warn('[UnusedTokensPanel] deprecate all unused tokens failed:', err);
      onError('Deprecate failed — some tokens may not have been updated.');
    } finally {
      setDeprecatingUnused(new Set());
    }
  };

  return (
    <>
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
        <button
          onClick={() => setShowUnused(v => !v)}
          className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
        >
          <span className="flex items-center gap-1.5">
            {unusedTokens.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
            Unused Tokens
            {!hasUsageData ? (
              <span className="normal-case font-normal opacity-60">(requires Figma usage scan)</span>
            ) : (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">{unusedCount}</span>
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
                <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
                  <span>{unusedTokens.length} token{unusedTokens.length !== 1 ? 's' : ''} with zero Figma usage and no alias dependents.</span>
                  <div className="shrink-0 flex items-center gap-1">
                    {confirmDeprecateAllUnused ? (
                      <>
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Deprecate {unusedTokens.length}?</span>
                        <button onClick={handleDeprecateAllUnused} disabled={deprecatingUnused.has('__all__')} className="text-[9px] px-2 py-0.5 rounded bg-gray-500 text-white hover:opacity-80 disabled:opacity-40 transition-opacity">
                          {deprecatingUnused.has('__all__') ? 'Marking…' : 'Confirm'}
                        </button>
                        <button onClick={() => setConfirmDeprecateAllUnused(false)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                          Cancel
                        </button>
                      </>
                    ) : confirmDeleteAllUnused ? (
                      <>
                        <span className="text-[9px] text-[var(--color-figma-text-secondary)]">Delete {unusedTokens.length}?</span>
                        <button onClick={handleDeleteAllUnused} disabled={deletingUnused.has('__all__')} className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-figma-error)] text-white hover:opacity-80 disabled:opacity-40 transition-opacity">
                          {deletingUnused.has('__all__') ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button onClick={() => setConfirmDeleteAllUnused(false)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => setConfirmDeprecateAllUnused(true)} className="text-[9px] px-2 py-0.5 rounded border border-gray-400/40 text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                          Deprecate all
                        </button>
                        <button onClick={() => setConfirmDeleteAllUnused(true)} className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors">
                          Delete all
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                  {unusedTokens.map(({ path, set, $type }) => {
                    const key = `${set}:${path}`;
                    const isDeleting = deletingUnused.has(key) || deletingUnused.has('__all__');
                    const isDeprecating = deprecatingUnused.has(key) || deprecatingUnused.has('__all__');
                    const isBusy = isDeleting || isDeprecating;
                    return (
                      <div key={key} className="group relative flex items-center hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                        <button
                          onClick={() => onNavigateToToken?.(path, set)}
                          disabled={!onNavigateToToken || isBusy}
                          className="flex-1 flex items-center justify-between px-3 py-1.5 text-left disabled:cursor-default"
                        >
                          <span className={`text-[10px] text-[var(--color-figma-text)] font-mono truncate flex-1 ${isBusy ? 'opacity-40' : ''}`}>{path}</span>
                          <span className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">{$type}</span>
                            <span className="text-[9px] text-[var(--color-figma-text-secondary)]">{set}</span>
                          </span>
                        </button>
                        <div className="absolute right-1 top-0 bottom-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                          {isBusy ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] animate-spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          ) : (
                            <>
                              <button
                                onClick={() => setConfirmDeprecateUnusedToken({ path, set })}
                                className="px-1.5 py-1 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                aria-label={`Deprecate ${path}`}
                                title="Mark as deprecated"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z"/><path d="M4.9 4.9l14.2 14.2"/></svg>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUnusedToken({ path, set })}
                                className="px-1.5 py-1 rounded transition-colors"
                                aria-label={`Delete ${path}`}
                                title="Delete token"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)]" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {confirmDeleteUnusedToken && (
        <ConfirmModal
          title="Delete unused token?"
          description={`"${confirmDeleteUnusedToken.path}" (${confirmDeleteUnusedToken.set}) will be permanently deleted.`}
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            const { path, set } = confirmDeleteUnusedToken;
            setConfirmDeleteUnusedToken(null);
            await handleDeleteUnusedToken(path, set);
          }}
          onCancel={() => setConfirmDeleteUnusedToken(null)}
        />
      )}
      {confirmDeprecateUnusedToken && (
        <ConfirmModal
          title="Deprecate unused token?"
          description={`"${confirmDeprecateUnusedToken.path}" will be marked as deprecated. It will no longer appear in this list and can be deleted later.`}
          confirmLabel="Deprecate"
          onConfirm={async () => {
            const { path, set } = confirmDeprecateUnusedToken;
            setConfirmDeprecateUnusedToken(null);
            await handleDeprecateUnusedToken(path, set);
          }}
          onCancel={() => setConfirmDeprecateUnusedToken(null)}
        />
      )}
    </>
  );
}
