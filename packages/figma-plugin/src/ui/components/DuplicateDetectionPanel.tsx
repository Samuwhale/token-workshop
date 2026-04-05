import { useState } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { tokenPathToUrlSegment } from '../shared/utils';

export interface DuplicateGroup {
  canonical: string;
  canonicalSet: string;
  tokens: { path: string; setName: string }[];
  colorHex?: string;
}

export interface DuplicateDetectionPanelProps {
  serverUrl: string;
  lintDuplicateGroups: DuplicateGroup[];
  totalDuplicateAliases: number;
  onNavigateToToken?: (path: string, set: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void;
  onRefreshValidation: () => void;
}

export function DuplicateDetectionPanel({
  serverUrl,
  lintDuplicateGroups,
  totalDuplicateAliases,
  onNavigateToToken,
  onError,
  onMutate,
  onRefreshValidation,
}: DuplicateDetectionPanelProps) {
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [deduplicating, setDeduplicating] = useState<string | null>(null);
  const [confirmDedup, setConfirmDedup] = useState<{ canonical: string; canonicalSet: string; others: { path: string; setName: string }[] } | null>(null);
  const [bulkDeduplicating, setBulkDeduplicating] = useState(false);
  const [confirmBulkDedup, setConfirmBulkDedup] = useState(false);

  if (lintDuplicateGroups.length === 0) return null;

  const handleDeduplicate = async (canonical: string, others: { path: string; setName: string }[]) => {
    setDeduplicating(canonical);
    try {
      await Promise.all(others.map(({ path, setName }) =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(path)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $value: `{${canonical}}` }),
        })
      ));
      setDeduplicating(null);
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] deduplicate failed:', err);
      onError('Deduplicate failed — check your connection and try again.');
      setDeduplicating(null);
    }
  };

  const handleBulkDeduplicate = async () => {
    setBulkDeduplicating(true);
    try {
      const patches: Promise<unknown>[] = [];
      for (const group of lintDuplicateGroups) {
        const others = group.tokens.filter(t => t.path !== group.canonical);
        for (const { path, setName } of others) {
          patches.push(
            apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/${tokenPathToUrlSegment(path)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ $value: `{${group.canonical}}` }),
            })
          );
        }
      }
      await Promise.all(patches);
      setBulkDeduplicating(false);
      setConfirmBulkDedup(false);
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] bulk deduplicate failed:', err);
      onError('Bulk deduplicate failed — some tokens may not have been updated.');
      setBulkDeduplicating(false);
    }
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowDuplicates(v => !v)}
        className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
      >
        <span className="flex items-center gap-1.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          Duplicate Values ({lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? 's' : ''})
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
      </button>
      {showDuplicates && (
        <div className="divide-y divide-[var(--color-figma-border)]">
          {lintDuplicateGroups.length > 1 && (
            <div className="p-3 flex flex-col gap-2">
              {confirmBulkDedup ? (
                <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    This will convert <span className="font-medium text-[var(--color-figma-text)]">{totalDuplicateAliases} token{totalDuplicateAliases !== 1 ? 's' : ''}</span> across {lintDuplicateGroups.length} groups into aliases.
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    <button disabled={bulkDeduplicating} onClick={handleBulkDeduplicate} className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                      {bulkDeduplicating ? 'Promoting…' : `Confirm — promote ${totalDuplicateAliases} to aliases`}
                    </button>
                    <button onClick={() => setConfirmBulkDedup(false)} className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button disabled={bulkDeduplicating} onClick={() => setConfirmBulkDedup(true)} className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                  {bulkDeduplicating ? 'Promoting…' : `Promote all duplicates to aliases (${totalDuplicateAliases} tokens → ${lintDuplicateGroups.length} canonicals)`}
                </button>
              )}
            </div>
          )}
          {lintDuplicateGroups.map(group => {
            const others = group.tokens.filter(t => t.path !== group.canonical);
            const isDeduplicating = deduplicating === group.canonical;
            return (
              <div key={group.canonical} className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {group.colorHex && <div className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />}
                  <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate">{group.canonical}</span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">— {group.tokens.length} tokens</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.tokens.map(t => (
                    <div key={`${t.setName}:${t.path}`} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{t.path}</span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{t.setName}</span>
                      {t.path === group.canonical && <span className="text-[8px] text-[var(--color-figma-accent)] shrink-0 font-medium">canonical</span>}
                      {onNavigateToToken && (
                        <button onClick={() => onNavigateToToken(t.path, t.setName)} className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0">
                          Go →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {confirmDedup?.canonical === group.canonical ? (
                  <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      Replace {others.length} token{others.length !== 1 ? 's' : ''} with an alias to <span className="font-mono text-[var(--color-figma-text)]">{group.canonical}</span>?
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <button disabled={isDeduplicating} onClick={() => { handleDeduplicate(group.canonical, others); setConfirmDedup(null); }} className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                        {isDeduplicating ? 'Deduplicating…' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmDedup(null)} className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button disabled={isDeduplicating} onClick={() => setConfirmDedup({ canonical: group.canonical, canonicalSet: group.canonicalSet, others })} className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors">
                    {isDeduplicating ? 'Deduplicating…' : `Deduplicate (${others.length} → reference)`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
