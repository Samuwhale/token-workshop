import { useEffect, useMemo, useState } from 'react';
import { createTokenBody, updateToken } from '../shared/tokenMutations';
import type { DuplicateGroup } from '../hooks/useHealthData';
import { getCollectionDisplayName } from '../shared/libraryCollections';
import { ConfirmModal } from './ConfirmModal';

type DuplicateTokenCandidate = DuplicateGroup['tokens'][number];

interface DuplicateDetectionPanelProps {
  serverUrl: string;
  lintDuplicateGroups: DuplicateGroup[];
  totalDuplicateAliases: number;
  onNavigateToToken?: (path: string, collectionId: string) => void;
  onError: (msg: string) => void;
  onMutate: () => Promise<void> | void;
  collectionDisplayNames?: Record<string, string>;
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
  collectionDisplayNames,
  embedded,
}: DuplicateDetectionPanelProps) {
  const [showDuplicates, setShowDuplicates] = useState(embedded ?? false);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [selectedKeepKeys, setSelectedKeepKeys] = useState<Record<string, string>>({});
  const [resolvingGroupId, setResolvingGroupId] = useState<string | null>(null);
  const [bulkResolving, setBulkResolving] = useState(false);
  const [pendingResolveGroup, setPendingResolveGroup] = useState<{
    group: DuplicateGroup;
    keep: DuplicateTokenCandidate;
  } | null>(null);
  const [pendingBulkResolve, setPendingBulkResolve] = useState(false);

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

  useEffect(() => {
    const validGroupIds = new Set(lintDuplicateGroups.map((group) => group.id));
    setSelectedKeepKeys((currentKeys) => {
      const nextKeys = Object.fromEntries(
        Object.entries(currentKeys).filter(([groupId, keepKey]) => {
          const group = lintDuplicateGroups.find((candidate) => candidate.id === groupId);
          return group != null && group.tokens.some((token) => tokenKey(token) === keepKey);
        }),
      );
      return Object.keys(nextKeys).length === Object.keys(currentKeys).length
        ? currentKeys
        : nextKeys;
    });
    setExpandedGroupId((currentGroupId) =>
      currentGroupId && !validGroupIds.has(currentGroupId) ? null : currentGroupId,
    );
    setResolvingGroupId((currentGroupId) =>
      currentGroupId && !validGroupIds.has(currentGroupId) ? null : currentGroupId,
    );
  }, [lintDuplicateGroups]);

  const configuredCount = keptTokens.size;
  const allConfigured = configuredCount === lintDuplicateGroups.length;
  const aliasCount = lintDuplicateGroups.reduce(
    (sum, g) => (keptTokens.has(g.id) ? sum + g.tokens.length - 1 : sum), 0,
  );
  const unsafeConfiguredGroups = useMemo(() => {
    const unsafe = new Set<string>();
    for (const group of lintDuplicateGroups) {
      const keep = keptTokens.get(group.id);
      if (!keep) continue;
      const hasSamePathInAnotherCollection = group.tokens.some(
        (token) =>
          token.path === keep.path &&
          token.collectionId !== keep.collectionId,
      );
      if (hasSamePathInAnotherCollection) {
        unsafe.add(group.id);
      }
    }
    return unsafe;
  }, [keptTokens, lintDuplicateGroups]);
  const canApplyAllSelections = allConfigured && unsafeConfiguredGroups.size === 0;

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
      if (mutated) {
        await onMutate();
      }
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] resolve failed:', err);
      onError('Cleanup failed — refresh and review remaining tokens.');
      if (mutated) {
        await onMutate();
      }
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
        if (unsafeConfiguredGroups.has(group.id)) {
          throw new Error('Resolve duplicate paths before applying aliases.');
        }
        setResolvingGroupId(group.id);
        mutated = (await resolveGroup(group, keep)) > 0 || mutated;
      }
      if (mutated) {
        await onMutate();
      }
    } catch (err) {
      console.warn('[DuplicateDetectionPanel] bulk resolve failed:', err);
      onError(mutated
        ? 'Batch partially applied — validation refreshed.'
        : 'Select a token to keep for every group first.');
      if (mutated) {
        await onMutate();
      }
    } finally {
      setResolvingGroupId(null);
      setBulkResolving(false);
    }
  };

  const btnBase = 'text-secondary px-2 py-1 rounded transition-colors';
  const btnAccent = `${btnBase} bg-[var(--color-figma-action-bg)] text-[color:var(--color-figma-text-onbrand)] hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40`;

  const content = (
    <div className={embedded ? 'h-full overflow-y-auto' : ''}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--color-figma-border)]">
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          {configuredCount}/{lintDuplicateGroups.length} selected · {aliasCount} aliases
        </div>
        <button
          disabled={bulkResolving || !canApplyAllSelections}
          onClick={() => setPendingBulkResolve(true)}
          className={btnAccent}
          title={
            !allConfigured
              ? 'Choose one token to keep in every duplicate group'
              : unsafeConfiguredGroups.size > 0
                ? 'Resolve duplicate token paths before aliasing across collections'
                : undefined
          }
        >
          {bulkResolving
            ? 'Resolving\u2026'
            : `Apply all selections (${aliasCount})`}
        </button>
      </div>

      {lintDuplicateGroups.map(group => {
        const keep = keptTokens.get(group.id) ?? null;
        const others = keep ? group.tokens.filter(t => tokenKey(t) !== tokenKey(keep)) : [];
        const isResolving = resolvingGroupId === group.id;
        const isExpanded = expandedGroupId === group.id;
        const unsafeAliasTarget = keep
          ? others.some(
              (token) =>
                token.path === keep.path &&
                token.collectionId !== keep.collectionId,
            )
          : false;

        return (
          <div key={group.id} className="border-b border-[var(--color-figma-border)]">
            <button
              onClick={() => setExpandedGroupId(cur => cur === group.id ? null : group.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              aria-expanded={isExpanded}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 opacity-60 ${isExpanded ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
              {group.colorHex && <div className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: group.colorHex }} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="text-secondary font-medium text-[color:var(--color-figma-text)]">
                    {group.tokens.length} matching {group.typeLabel}
                  </span>
                  <span className="text-secondary font-mono text-[color:var(--color-figma-text-secondary)] truncate">
                    {truncateValue(group.valueLabel)}
                  </span>
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="px-3 py-2 flex flex-col gap-2 bg-[var(--color-figma-bg-secondary)]/20">
                <fieldset className="flex flex-col">
                  <legend className="sr-only">Choose which token to keep</legend>
                  {group.tokens.map(token => {
                    const isSelected = keep ? tokenKey(token) === tokenKey(keep) : false;
                    const radioId = `keep-${group.id}-${tokenKey(token)}`;
                    const diffLabels = keep && !isSelected ? getDiffLabels(keep, token) : [];

                    return (
                      <label
                        key={tokenKey(token)}
                        htmlFor={radioId}
                        className={`cursor-pointer py-1 ${isSelected ? '' : 'opacity-70 hover:opacity-100'}`}
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
                          <span className="text-secondary font-mono text-[color:var(--color-figma-text)] truncate flex-1">{token.path}</span>
                          <span className="text-secondary text-[color:var(--color-figma-text-tertiary)] shrink-0">
                            {getCollectionDisplayName(token.collectionId, collectionDisplayNames)}
                          </span>
                          {onNavigateToToken && (
                            <button
                              onClick={(e) => { e.preventDefault(); onNavigateToToken(token.path, token.collectionId); }}
                              className="text-secondary shrink-0 text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:underline"
                            >
                              Open
                            </button>
                          )}
                        </div>
                        {diffLabels.length > 0 && (
                          <p className="mt-0.5 pl-5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
                            Differs: {diffLabels.join(', ')}
                          </p>
                        )}
                      </label>
                    );
                  })}
                </fieldset>

                {keep && (
                  <div className="flex flex-col gap-1 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-secondary text-[color:var(--color-figma-text-secondary)] min-w-0">
                        Keep <span className="font-mono text-[color:var(--color-figma-text)]">{keep.path}</span>
                        {" "}in {getCollectionDisplayName(keep.collectionId, collectionDisplayNames)}, alias {others.length} to it
                      </p>
                      <button
                        disabled={isResolving || unsafeAliasTarget}
                        onClick={() => setPendingResolveGroup({ group, keep })}
                        className={`${btnAccent} shrink-0`}
                        title={
                          unsafeAliasTarget
                            ? 'A token with this same path exists in another collection. Rename one path before aliasing.'
                            : undefined
                        }
                      >
                        {isResolving
                          ? 'Resolving\u2026'
                          : `Keep & alias others (${others.length})`}
                      </button>
                    </div>
                    {unsafeAliasTarget ? (
                      <p className="text-secondary text-[color:var(--color-figma-text-error)]">
                        This path exists in more than one collection. Rename one duplicate before turning the others into aliases.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderPlanRows = (tokens: DuplicateTokenCandidate[]) => (
    <div className="max-h-40 overflow-y-auto rounded bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
      {tokens.slice(0, 8).map((token) => (
        <div key={tokenKey(token)} className="flex min-w-0 items-center gap-2 py-0.5 text-secondary">
          <span className="min-w-0 flex-1 truncate font-mono text-[color:var(--color-figma-text)]">{token.path}</span>
          <span className="shrink-0 text-[color:var(--color-figma-text-tertiary)]">
            {getCollectionDisplayName(token.collectionId, collectionDisplayNames)}
          </span>
        </div>
      ))}
      {tokens.length > 8 ? (
        <div className="py-0.5 text-secondary text-[color:var(--color-figma-text-tertiary)]">
          +{tokens.length - 8} more
        </div>
      ) : null}
    </div>
  );

  const singleResolveDialog = pendingResolveGroup ? (() => {
    const { group, keep } = pendingResolveGroup;
    const others = group.tokens.filter((token) => tokenKey(token) !== tokenKey(keep));
    return (
      <ConfirmModal
        title={`Alias ${others.length} duplicate token${others.length === 1 ? '' : 's'}?`}
        description={`Keep ${keep.path} in ${getCollectionDisplayName(keep.collectionId, collectionDisplayNames)}. The duplicate tokens below will reference it.`}
        confirmLabel="Alias duplicates"
        onConfirm={async () => {
          setPendingResolveGroup(null);
          await handleResolve(group, keep);
        }}
        onCancel={() => setPendingResolveGroup(null)}
      >
        {renderPlanRows(others)}
      </ConfirmModal>
    );
  })() : null;

  const bulkResolveDialog = pendingBulkResolve ? (
    <ConfirmModal
      title={`Alias ${aliasCount} duplicate token${aliasCount === 1 ? '' : 's'}?`}
      description="Each selected keep token stays direct. The other duplicates in those groups will become aliases."
      confirmLabel="Apply selections"
      confirmDisabled={!canApplyAllSelections || bulkResolving}
      onConfirm={async () => {
        setPendingBulkResolve(false);
        await handleBulkResolve();
      }}
      onCancel={() => setPendingBulkResolve(false)}
    >
      {renderPlanRows(
        lintDuplicateGroups.flatMap((group) => {
          const keep = keptTokens.get(group.id);
          return keep
            ? group.tokens.filter((token) => tokenKey(token) !== tokenKey(keep))
            : [];
        }),
      )}
    </ConfirmModal>
  ) : null;

  if (embedded) {
    return (
      <>
        {content}
        {singleResolveDialog}
        {bulkResolveDialog}
      </>
    );
  }

  return (
    <>
      <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
        <button
          onClick={() => setShowDuplicates(v => !v)}
          className="w-full px-3 py-2.5 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <span className="text-body font-semibold text-[color:var(--color-figma-text)]">Duplicates</span>
            <span className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
              {lintDuplicateGroups.length} group{lintDuplicateGroups.length !== 1 ? 's' : ''} · {totalDuplicateAliases} alias{totalDuplicateAliases !== 1 ? 'es' : ''}
            </span>
          </span>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform text-[color:var(--color-figma-text-secondary)] ${showDuplicates ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
        </button>
        {showDuplicates && content}
      </div>
      {singleResolveDialog}
      {bulkResolveDialog}
    </>
  );
}
