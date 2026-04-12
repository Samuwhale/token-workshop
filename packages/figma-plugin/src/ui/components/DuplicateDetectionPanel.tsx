import { useMemo, useState } from 'react';
import { createTokenBody, updateToken } from '../shared/tokenMutations';

export interface DuplicateTokenCandidate {
  path: string;
  setName: string;
  type: string;
  lifecycle?: 'draft' | 'published' | 'deprecated';
  scopes: string[];
  colorHex?: string;
}

export interface DuplicateGroup {
  id: string;
  valueLabel: string;
  typeLabel: string;
  tokens: DuplicateTokenCandidate[];
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

function tokenKey(token: { path: string; setName: string }): string {
  return `${token.setName}:${token.path}`;
}

function formatLifecycle(lifecycle?: DuplicateTokenCandidate['lifecycle']): string {
  return lifecycle ?? 'published';
}

function formatScopes(scopes: string[]): string {
  return scopes.length > 0 ? scopes.join(', ') : 'Any';
}

function truncateValue(value: string): string {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value;
}

function getMetadataDiffs(
  canonical: DuplicateTokenCandidate,
  candidate: DuplicateTokenCandidate,
): Array<{ label: string; canonical: string; candidate: string }> {
  const diffs: Array<{ label: string; canonical: string; candidate: string }> = [];

  if (canonical.setName !== candidate.setName) {
    diffs.push({
      label: 'Set',
      canonical: canonical.setName,
      candidate: candidate.setName,
    });
  }

  const canonicalLifecycle = formatLifecycle(canonical.lifecycle);
  const candidateLifecycle = formatLifecycle(candidate.lifecycle);
  if (canonicalLifecycle !== candidateLifecycle) {
    diffs.push({
      label: 'Lifecycle',
      canonical: canonicalLifecycle,
      candidate: candidateLifecycle,
    });
  }

  const canonicalScopes = formatScopes(canonical.scopes);
  const candidateScopes = formatScopes(candidate.scopes);
  if (canonicalScopes !== candidateScopes) {
    diffs.push({
      label: 'Scopes',
      canonical: canonicalScopes,
      candidate: candidateScopes,
    });
  }

  return diffs;
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
  const [selectedCanonicalKeys, setSelectedCanonicalKeys] = useState<Record<string, string>>({});
  const [deduplicatingGroupId, setDeduplicatingGroupId] = useState<string | null>(null);
  const [confirmDedupGroupId, setConfirmDedupGroupId] = useState<string | null>(null);
  const [bulkDeduplicating, setBulkDeduplicating] = useState(false);
  const [confirmBulkDedup, setConfirmBulkDedup] = useState(false);

  const selectedCanonicals = useMemo(() => {
    const next = new Map<string, DuplicateTokenCandidate>();
    for (const group of lintDuplicateGroups) {
      const selectedKey = selectedCanonicalKeys[group.id];
      if (!selectedKey) continue;
      const selectedToken = group.tokens.find(token => tokenKey(token) === selectedKey);
      if (selectedToken) next.set(group.id, selectedToken);
    }
    return next;
  }, [lintDuplicateGroups, selectedCanonicalKeys]);

  const configuredGroupCount = selectedCanonicals.size;
  const allGroupsConfigured = configuredGroupCount === lintDuplicateGroups.length;
  const configuredAliasCount = lintDuplicateGroups.reduce((sum, group) => (
    selectedCanonicals.has(group.id) ? sum + group.tokens.length - 1 : sum
  ), 0);

  if (lintDuplicateGroups.length === 0) return null;

  const patchTokenToAlias = async (token: DuplicateTokenCandidate, canonicalPath: string) => {
    await updateToken(serverUrl, token.setName, token.path, createTokenBody({ $value: `{${canonicalPath}}` }));
  };

  const resolveGroup = async (group: DuplicateGroup, canonical: DuplicateTokenCandidate) => {
    let updatedCount = 0;
    for (const token of group.tokens) {
      if (tokenKey(token) === tokenKey(canonical)) continue;
      await patchTokenToAlias(token, canonical.path);
      updatedCount += 1;
    }
    return updatedCount;
  };

  const handleDeduplicate = async (group: DuplicateGroup, canonical: DuplicateTokenCandidate) => {
    setDeduplicatingGroupId(group.id);
    let mutated = false;
    try {
      mutated = (await resolveGroup(group, canonical)) > 0;
      setConfirmDedupGroupId(null);
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] deduplicate failed:', err);
      onError('Duplicate cleanup failed — refresh validation and review the remaining tokens.');
      if (mutated) {
        onMutate();
      }
      onRefreshValidation();
    } finally {
      setDeduplicatingGroupId(null);
    }
  };

  const handleBulkDeduplicate = async () => {
    setBulkDeduplicating(true);
    let mutated = false;
    try {
      for (const group of lintDuplicateGroups) {
        const canonical = selectedCanonicals.get(group.id);
        if (!canonical) {
          throw new Error('Select a canonical token for every duplicate group before batch resolve.');
        }
        setDeduplicatingGroupId(group.id);
        mutated = (await resolveGroup(group, canonical)) > 0 || mutated;
      }
      setConfirmBulkDedup(false);
      onMutate();
      onRefreshValidation();
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] bulk deduplicate failed:', err);
      onError(mutated
        ? 'Batch cleanup stopped after partial progress — validation has been refreshed.'
        : 'Batch cleanup is blocked until every duplicate group has an explicit canonical token.');
      if (mutated) {
        onMutate();
      }
      onRefreshValidation();
    } finally {
      setDeduplicatingGroupId(null);
      setBulkDeduplicating(false);
    }
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowDuplicates(v => !v)}
        className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
          <span>Duplicate Values</span>
          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-hover)] font-mono normal-case">
            {lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? 's' : ''} · {totalDuplicateAliases} alias{totalDuplicateAliases !== 1 ? 'es' : ''}
          </span>
          <span className="normal-case font-normal opacity-60">shared values across multiple tokens</span>
        </span>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
      </button>
      {showDuplicates && (
        <div className="divide-y divide-[var(--color-figma-border)]">
          <div className="p-3 flex flex-col gap-2">
            <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/40 p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Batch resolve duplicate groups</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {configuredGroupCount}/{lintDuplicateGroups.length} configured
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Select one canonical token in every group before converting <span className="font-medium text-[var(--color-figma-text)]">{totalDuplicateAliases} duplicate token{totalDuplicateAliases !== 1 ? 's' : ''}</span> into aliases.
              </p>
              {confirmBulkDedup ? (
                <div className="flex flex-col gap-1.5 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5 p-2">
                  <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    Resolve {configuredAliasCount} duplicate token{configuredAliasCount !== 1 ? 's' : ''} across {lintDuplicateGroups.length} groups using your selected canonicals?
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    <button
                      disabled={bulkDeduplicating || !allGroupsConfigured}
                      onClick={handleBulkDeduplicate}
                      className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                    >
                      {bulkDeduplicating ? 'Resolving…' : `Confirm — resolve ${configuredAliasCount} aliases`}
                    </button>
                    <button
                      onClick={() => setConfirmBulkDedup(false)}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  disabled={bulkDeduplicating || !allGroupsConfigured}
                  onClick={() => setConfirmBulkDedup(true)}
                  className="self-start text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                >
                  {bulkDeduplicating ? 'Resolving…' : `Resolve all configured groups (${configuredAliasCount} aliases)`}
                </button>
              )}
              {!allGroupsConfigured && (
                <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Choose a canonical token in each group to unlock batch cleanup.
                </p>
              )}
            </div>
          </div>
          {lintDuplicateGroups.map(group => {
            const canonical = selectedCanonicals.get(group.id) ?? null;
            const others = canonical
              ? group.tokens.filter(token => tokenKey(token) !== tokenKey(canonical))
              : [];
            const isDeduplicating = deduplicatingGroupId === group.id;

            return (
              <div key={group.id} className="p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {group.colorHex && <div className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text)]">{group.tokens.length} matching tokens</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]">{group.typeLabel}</span>
                    </div>
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 font-mono truncate">
                      Shared value: {truncateValue(group.valueLabel)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  {group.tokens.map(token => {
                    const isSelected = canonical ? tokenKey(token) === tokenKey(canonical) : false;
                    return (
                      <div
                        key={tokenKey(token)}
                        className={`rounded border p-2 ${isSelected ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5' : 'border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/20'}`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => setSelectedCanonicalKeys(prev => ({ ...prev, [group.id]: tokenKey(token) }))}
                            className="flex-1 min-w-0 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full border ${isSelected ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] bg-transparent'}`} />
                              {token.colorHex && <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: token.colorHex }} />}
                              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{token.path}</span>
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{token.setName}</span>
                              {isSelected && <span className="text-[8px] text-[var(--color-figma-accent)] shrink-0 font-medium">canonical</span>}
                            </div>
                            <div className="mt-1 pl-5 flex flex-wrap gap-1">
                              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]">Lifecycle: {formatLifecycle(token.lifecycle)}</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]">Scopes: {formatScopes(token.scopes)}</span>
                            </div>
                          </button>
                          {onNavigateToToken && (
                            <button
                              onClick={() => onNavigateToToken(token.path, token.setName)}
                              className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                            >
                              Go →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canonical ? (
                  <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]/30 p-2.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-medium text-[var(--color-figma-text)]">Metadata preview</p>
                        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                          Keeping <span className="font-mono text-[var(--color-figma-text)]">{canonical.path}</span> and aliasing {others.length} token{others.length !== 1 ? 's' : ''} to it.
                        </p>
                      </div>
                      <button
                        disabled={isDeduplicating}
                        onClick={() => setConfirmDedupGroupId(group.id)}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors shrink-0"
                      >
                        {isDeduplicating ? 'Resolving…' : `Resolve group (${others.length} aliases)`}
                      </button>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {others.map(token => {
                        const diffs = getMetadataDiffs(canonical, token);
                        return (
                          <div key={tokenKey(token)} className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]/60 p-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1">{token.path}</span>
                              <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">{token.setName}</span>
                            </div>
                            {diffs.length > 0 ? (
                              <div className="mt-1 flex flex-col gap-1">
                                {diffs.map(diff => (
                                  <div key={`${tokenKey(token)}:${diff.label}`} className="text-[10px] text-[var(--color-figma-text-secondary)]">
                                    <span className="font-medium text-[var(--color-figma-text)]">{diff.label}:</span> {diff.candidate} → {diff.canonical}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                                Metadata matches the selected canonical token.
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-[var(--color-figma-warning)]/30 bg-[var(--color-figma-warning)]/5 p-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                    Choose the token to keep before resolving this group.
                  </div>
                )}

                {confirmDedupGroupId === group.id && canonical && (
                  <div className="flex flex-col gap-1.5 p-2 rounded border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/5">
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      Convert {others.length} token{others.length !== 1 ? 's' : ''} into aliases that point to <span className="font-mono text-[var(--color-figma-text)]">{canonical.path}</span>?
                    </p>
                    <div className="flex gap-2 mt-0.5">
                      <button
                        disabled={isDeduplicating}
                        onClick={() => handleDeduplicate(group, canonical)}
                        className="text-[10px] px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                      >
                        {isDeduplicating ? 'Resolving…' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDedupGroupId(null)}
                        className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
