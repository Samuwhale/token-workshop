import { useMemo, useState } from 'react';
import { createTokenBody, updateToken } from '../shared/tokenMutations';
import type { DuplicateGroup } from '../hooks/useHealthData';
import { useInlineConfirm } from '../hooks/useInlineConfirm';

type DuplicateTokenCandidate = DuplicateGroup['tokens'][number];

interface DuplicateDetectionPanelProps {
  serverUrl: string;
  lintDuplicateGroups: DuplicateGroup[];
  totalDuplicateAliases: number;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => void;
  onRefreshValidation: () => void;
  embedded?: boolean;
}

function tokenKey(token: { path: string; collectionId: string }): string {
  return `${token.collectionId}:${token.path}`;
}

function truncateValue(value: string): string {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function getDiffLabels(kept: DuplicateTokenCandidate, other: DuplicateTokenCandidate): string[] {
  const labels: string[] = [];
  if (kept.collectionId !== other.collectionId) labels.push('Collection');
  if ((kept.lifecycle ?? 'published') !== (other.lifecycle ?? 'published')) labels.push('Lifecycle');
  if (kept.scopes.join(',') !== other.scopes.join(',')) labels.push('Scopes');
  return labels;
}


export function DuplicateDetectionPanel({
  serverUrl,
  lintDuplicateGroups,
  totalDuplicateAliases,
  onNavigateToToken,
  onError,
  onMutate,
  onRefreshValidation,
  embedded,
}: DuplicateDetectionPanelProps) {
  const [showDuplicates, setShowDuplicates] = useState(embedded ?? false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedKeepKeys, setSelectedKeepKeys] = useState<Record<string, string>>({});
  const [resolvingGroupId, setResolvingGroupId] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);

  const groupConfirm = useInlineConfirm();
  const bulkConfirm = useInlineConfirm();

  const keptTokens = useMemo(() => {
    const map = new Map<string, DuplicateTokenCandidate>();
    for (const group of lintDuplicateGroups) {
      const key = selectedKeepKeys[group.id];
      if (!key) continue;
      const token = group.tokens.find(t => tokenKey(t) === key);
      if (token) map.set(group.id, token);
    }
    return map;
  }, [lintDuplicateGroups, selectedKeepKeys]);

  const configuredCount = keptTokens.size;
  const allConfigured = configuredCount === lintDuplicateGroups.length;
  const aliasCount = lintDuplicateGroups.reduce(
    (sum, g) => (keptTokens.has(g.id) ? sum + g.tokens.length - 1 : sum), 0,
  );

  if (lintDuplicateGroups.length === 0) return null;

  const patchTokenToAlias = async (token: DuplicateTokenCandidate, keepPath: string) => {
    await updateToken(serverUrl, token.collectionId, token.path, createTokenBody({ $value: `{${keepPath}}` }));
  };

  const resolveGroup = async (group: DuplicateGroup, keep: DuplicateTokenCandidate) => {
    let count = 0;
    for (const token of group.tokens) {
      if (tokenKey(token) === tokenKey(keep)) continue;
      await patchTokenToAlias(token, keep.path);
      count += 1;
    }
    return count;
  };

  const handleResolve = async (group: DuplicateGroup, keep: DuplicateTokenCandidate) => {
    setResolvingGroupId(group.id);
    let mutated = false;
    try {
      mutated = (await resolveGroup(group, keep)) > 0;
      groupConfirm.reset();
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] resolve failed:', err);
      onError('Cleanup failed — refresh and review remaining tokens.');
      if (mutated) onMutate();
      onRefreshValidation();
    } finally {
      setResolvingGroupId(null);
    }
  };

  const handleBulkResolve = async () => {
    setBulkResolving(true);
    let mutated = false;
    try {
      for (const group of lintDuplicateGroups) {
        const keep = keptTokens.get(group.id);
        if (!keep) throw new Error('Select a token to keep for every group first.');
        setResolvingGroupId(group.id);
        mutated = (await resolveGroup(group, keep)) > 0 || mutated;
      }
      bulkConfirm.reset();
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] bulk resolve failed:', err);
      onError(mutated
        ? 'Batch partially applied — validation refreshed.'
        : 'Select a token to keep for every group first.');
      if (mutated) onMutate();
      onRefreshValidation();
    } finally {
      setResolvingGroupId(null);
      setBulkResolving(false);
    }
  };

  const btnBase = 'text-[10px] px-2 py-1 rounded transition-colors';
  const btnAccent = `${btnBase} bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40`;

  const content = (
    <div className={`divide-y divide-[var(--color-figma-border)] ${embedded ? 'h-full overflow-y-auto' : ''}`}>
          {/* Bulk toolbar */}
          <div className="px-3 py-2.5">
            <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/35 px-2.5 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {configuredCount}/{lintDuplicateGroups.length} selected · {aliasCount} aliases
                </div>
                <button
                  disabled={bulkResolving || !allConfigured}
                  onClick={() => bulkConfirm.trigger('bulk', handleBulkResolve)}
                  className={btnAccent}
                >
                  {bulkResolving
                    ? 'Resolving\u2026'
                    : bulkConfirm.isPending('bulk')
                      ? `Confirm? ${aliasCount} token${aliasCount !== 1 ? 's' : ''} will become aliases`
                      : `Apply all selections (${aliasCount})`}
                </button>
              </div>
            </div>
          </div>

          {/* Groups */}
          {lintDuplicateGroups.map(group => {
            const keep = keptTokens.get(group.id) ?? null;
            const others = keep ? group.tokens.filter(t => tokenKey(t) !== tokenKey(keep)) : [];
            const isResolving = resolvingGroupId === group.id;
            const isExpanded = expandedGroupId === group.id;
            const isConfigured = Boolean(keep);

            return (
              <div key={group.id} className="px-3 py-2.5">
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => setExpandedGroupId(cur => cur === group.id ? null : group.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left bg-[var(--color-figma-bg)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
                    {group.colorHex && <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{group.tokens.length} matching tokens</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]">{group.typeLabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isConfigured ? 'border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'}`}>
                          {isConfigured ? 'Ready' : 'Choose which to keep'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate">
                        Shared value: {truncateValue(group.valueLabel)}
                      </p>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-[var(--color-figma-border)] p-3 flex flex-col gap-2">
                      {/* Token radios */}
                      <fieldset className="flex flex-col gap-1.5">
                        <legend className="sr-only">Choose which token to keep</legend>
                        {group.tokens.map(token => {
                          const isSelected = keep ? tokenKey(token) === tokenKey(keep) : false;
                          const radioId = `keep-${group.id}-${tokenKey(token)}`;
                          const diffLabels = keep && !isSelected ? getDiffLabels(keep, token) : [];

                          return (
                            <label
                              key={tokenKey(token)}
                              htmlFor={radioId}
                              className={`rounded border p-2 cursor-pointer ${isSelected ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/20 hover:border-[var(--color-figma-text-secondary)]/40'} transition-colors`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  id={radioId}
                                  name={`keep-${group.id}`}
                                  checked={isSelected}
                                  onChange={() => setSelectedKeepKeys(prev => ({ ...prev, [group.id]: tokenKey(token) }))}
                                  className="sr-only peer"
                                />
                                <span className={`w-3 h-3 rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${isSelected ? 'border-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)]'}`}>
                                  {isSelected && <span className="w-[7px] h-[7px] rounded-full bg-[var(--color-figma-accent)]" />}
                                </span>
                                {token.colorHex && <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: token.colorHex }} />}
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{token.path}</span>
                                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{token.collectionId}</span>
                                {onNavigateToToken && (
                                  <button
                                    onClick={(e) => { e.preventDefault(); onNavigateToToken(token.path, token.collectionId); }}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent)] transition-colors shrink-0"
                                  >
                                    Open
                                  </button>
                                )}
                              </div>
                              {diffLabels.length > 0 && (
                                <p className="mt-1 pl-5 text-[10px] text-[var(--color-figma-text-secondary)]">
                                  Differs: {diffLabels.join(', ')}
                                </p>
                              )}
                            </label>
                          );
                        })}
                      </fieldset>

                      {/* Resolve action */}
                      {keep && (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <p className="text-[10px] text-[var(--color-figma-text-secondary)] min-w-0">
                            Keep <span className="font-mono text-[var(--color-figma-text)]">{keep.path}</span>, alias {others.length} to it
                          </p>
                          <button
                            disabled={isResolving}
                            onClick={() => {
                              groupConfirm.trigger(group.id, () => handleResolve(group, keep));
                            }}
                            className={`${btnAccent} shrink-0`}
                          >
                            {isResolving
                              ? 'Resolving\u2026'
                              : groupConfirm.isPending(group.id)
                                ? `Confirm? ${others.length} token${others.length !== 1 ? 's' : ''} will become alias${others.length !== 1 ? 'es' : ''}`
                                : `Keep & alias others (${others.length})`}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowDuplicates(v => !v)}
        className="w-full px-3 py-2.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Duplicates</span>
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? 's' : ''} · {totalDuplicateAliases} alias{totalDuplicateAliases !== 1 ? 'es' : ''}
          </span>
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform text-[var(--color-figma-text-secondary)] ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
      </button>
      {showDuplicates && content}
    </div>
  );
}
