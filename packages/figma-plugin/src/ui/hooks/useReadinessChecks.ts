import { useState, useRef, useEffect, useCallback } from 'react';
import { getTokenLifecycle } from '@tokenmanager/core';
import type { OrphanVariableDeleteTarget, VariableSyncToken } from '../../shared/types';
import { postPluginMessage } from '../../shared/utils';
import { describeError } from '../shared/utils';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';
import {
  getSyncRowsByCategory,
  getDiffRowId,
  loadVariablePublishSnapshot,
  type ResolverPublishSyncMapping,
  type VariablePublishCompareMode,
} from '../shared/syncWorkflow';
import type {
  PublishPreflightActionId,
  PublishPreflightCluster,
  PublishPreflightStage,
} from '../shared/syncWorkflow';
import type { ValidationSnapshot } from './useValidationCache';
import type { OrphanConfirmState } from './useOrphanCleanup';

const READINESS_TIMEOUT_MS = 15_000;
const BLOCKING_VALIDATION_RULES = new Set(['broken-alias', 'circular-reference']);
const DEFAULT_VARIABLE_COLLECTION_NAME = 'TokenManager';

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function summarizeValidationIssues(
  issues: Array<{ rule: string; severity: 'error' | 'warning' | 'info' }>,
): string {
  const counts = {
    brokenAlias: 0,
    circularReference: 0,
    typeMismatch: 0,
    otherErrors: 0,
  };

  for (const issue of issues) {
    if (issue.severity !== 'error') continue;
    if (issue.rule === 'broken-alias') counts.brokenAlias += 1;
    else if (issue.rule === 'circular-reference') counts.circularReference += 1;
    else if (issue.rule === 'type-mismatch') counts.typeMismatch += 1;
    else counts.otherErrors += 1;
  }

  const parts = [
    counts.brokenAlias > 0 ? formatCount(counts.brokenAlias, 'broken alias') : null,
    counts.circularReference > 0 ? formatCount(counts.circularReference, 'circular reference') : null,
    counts.typeMismatch > 0 ? formatCount(counts.typeMismatch, 'type mismatch', 'type mismatches') : null,
    counts.otherErrors > 0 ? formatCount(counts.otherErrors, 'other error') : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'No active error-level audit findings.';
}

interface UseReadinessChecksParams {
  serverUrl: string;
  currentCollectionId: string;
  connected: boolean;
  collectionMap: Record<string, string>;
  modeMap: Record<string, string>;
  tokenChangeKey?: number;
  readFigmaTokens: () => Promise<unknown[]>;
  setOrphanConfirm: (val: OrphanConfirmState | null) => void;
  refreshValidation: () => Promise<ValidationSnapshot | null>;
  resolverName?: string | null;
  resolverPublishMappings?: ResolverPublishSyncMapping[];
  compareMode?: VariablePublishCompareMode;
}

interface ClusterDraft {
  id: string;
  label: string;
  severity: PublishPreflightCluster['severity'];
  affectedCount?: number;
  detail?: string;
  recommendedActionLabel?: string;
  recommendedActionId?: PublishPreflightActionId;
}

type VariableSyncSnapshot = Awaited<ReturnType<typeof loadVariableSyncSnapshot>>;

interface ResolverOrphanCleanupPlan {
  orphanPaths: string[];
  targets: OrphanVariableDeleteTarget[];
}

function parseResolverRowId(rowId: string): { mappingKey: string; path: string } | null {
  const separatorIndex = rowId.indexOf('::');
  if (separatorIndex === -1) return null;
  return {
    mappingKey: rowId.slice(0, separatorIndex),
    path: rowId.slice(separatorIndex + 2),
  };
}

function getResolverCollectionName(mapping: ResolverPublishSyncMapping): string {
  return mapping.collectionName?.trim() || DEFAULT_VARIABLE_COLLECTION_NAME;
}

function buildResolverOrphanCleanupPlan(
  snapshot: VariableSyncSnapshot,
  resolverPublishMappings: ResolverPublishSyncMapping[],
): ResolverOrphanCleanupPlan {
  const mappingByKey = new Map(resolverPublishMappings.map((mapping) => [mapping.key, mapping]));
  const localPresenceByCollectionPath = new Set<string>();

  for (const rowId of snapshot.localMap.keys()) {
    const parsed = parseResolverRowId(rowId);
    if (!parsed) continue;
    const mapping = mappingByKey.get(parsed.mappingKey);
    if (!mapping) continue;
    localPresenceByCollectionPath.add(`${getResolverCollectionName(mapping)}\u0000${parsed.path}`);
  }

  const groupedTargets = new Map<string, { path: string; collectionName: string; modeNames: string[] }>();

  for (const row of getSyncRowsByCategory(snapshot.rows).figmaOnly) {
    const rowId = getDiffRowId(row);
    const parsed = parseResolverRowId(rowId);
    if (!parsed) continue;
    const mapping = mappingByKey.get(parsed.mappingKey);
    if (!mapping) continue;

    const collectionName = getResolverCollectionName(mapping);
    const collectionPathKey = `${collectionName}\u0000${row.path}`;
    if (localPresenceByCollectionPath.has(collectionPathKey)) continue;

    const existing = groupedTargets.get(collectionPathKey);
    if (existing) {
      if (!existing.modeNames.includes(mapping.modeName)) {
        existing.modeNames.push(mapping.modeName);
      }
      continue;
    }

    groupedTargets.set(collectionPathKey, {
      path: row.path,
      collectionName,
      modeNames: [mapping.modeName],
    });
  }

  const targets = Array.from(groupedTargets.values()).map<OrphanVariableDeleteTarget>((target) => ({
    path: target.path,
    collectionName: target.collectionName,
    modeNames: target.modeNames,
  }));

  const orphanPaths = targets.map((target) => {
    const modeLabel = target.modeNames && target.modeNames.length > 0 ? ` / ${target.modeNames.join(', ')}` : '';
    return `${target.path} (${target.collectionName}${modeLabel})`;
  });

  return { orphanPaths, targets };
}

async function loadVariableSyncSnapshot(
  serverUrl: string,
  currentCollectionId: string,
  readFigmaTokens: () => Promise<unknown[]>,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
  resolverName?: string | null,
  resolverPublishMappings?: ResolverPublishSyncMapping[],
) {
  return loadVariablePublishSnapshot({
    serverUrl,
    currentCollectionId,
    collectionMap,
    modeMap,
    readFigmaTokens,
    figmaTimeoutMs: READINESS_TIMEOUT_MS,
    figmaTimeoutMessage: 'No response from Figma after 15 s — make sure the plugin is open and try again.',
    resolverName,
    resolverPublishMappings,
  });
}

export interface UseReadinessChecksReturn {
  readinessChecks: PublishPreflightCluster[];
  failingReadinessChecks: PublishPreflightCluster[];
  blockingReadinessChecks: PublishPreflightCluster[];
  advisoryReadinessChecks: PublishPreflightCluster[];
  preflightStage: PublishPreflightStage;
  readinessLoading: boolean;
  readinessError: string | null;
  setReadinessError: React.Dispatch<React.SetStateAction<string | null>>;
  checksStale: boolean;
  setChecksStale: React.Dispatch<React.SetStateAction<boolean>>;
  runReadinessChecks: () => Promise<void>;
  triggerReadinessAction: (actionId: PublishPreflightActionId) => Promise<void>;
  readinessFails: number;
  readinessPasses: number;
  readinessBlockingFails: number;
  isReadinessOutdated: boolean;
}

export function useReadinessChecks({
  serverUrl,
  currentCollectionId,
  connected,
  collectionMap,
  modeMap,
  tokenChangeKey,
  readFigmaTokens,
  setOrphanConfirm,
  refreshValidation,
  resolverName,
  resolverPublishMappings,
  compareMode = 'standard',
}: UseReadinessChecksParams): UseReadinessChecksReturn {
  const [readinessChecks, setReadinessChecks] = useState<PublishPreflightCluster[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [checksRunAtKey, setChecksRunAtKey] = useState<number | null>(null);
  const [checksStale, setChecksStale] = useState(false);

  const isRunningRef = useRef(false);
  const latestTokenChangeKeyRef = useRef<number | undefined>(tokenChangeKey);
  useEffect(() => { latestTokenChangeKeyRef.current = tokenChangeKey; }, [tokenChangeKey]);

  const runReadinessChecks = useCallback(async () => {
    if (!currentCollectionId || isRunningRef.current) return;
    isRunningRef.current = true;
    setReadinessLoading(true);
    setReadinessError(null);

    try {
      const snapshot = await loadVariableSyncSnapshot(
        serverUrl,
        currentCollectionId,
        readFigmaTokens,
        collectionMap,
        modeMap,
        resolverName,
        resolverPublishMappings,
      );
      const validationSnapshot = await refreshValidation();
      const activeValidationIssues =
        validationSnapshot?.issues.filter((issue) => issue.collectionId === currentCollectionId && issue.severity === 'error') ?? [];
      const { localOnly: missingInFigma, figmaOnly: rawOrphans } = getSyncRowsByCategory(snapshot.rows);
      const resolverOrphanPlan = compareMode === 'resolver-publish' && resolverPublishMappings
        ? buildResolverOrphanCleanupPlan(snapshot, resolverPublishMappings)
        : null;
      const orphanCount = resolverOrphanPlan?.targets.length ?? rawOrphans.length;
      const missingScopes = Array.from(snapshot.figmaMap.values()).filter((token) =>
        !token.scopes || token.scopes.length === 0 || (token.scopes.length === 1 && token.scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = Array.from(snapshot.figmaMap.values()).filter((token) => !token.description);
      const draftTokens = Array.from(snapshot.localTokens.values()).filter((token) => getTokenLifecycle(token) === 'draft');
      const blockingValidationIssues = activeValidationIssues.filter((issue) => BLOCKING_VALIDATION_RULES.has(issue.rule));

      const drafts: ClusterDraft[] = [
        {
          id: 'all-vars',
          label: 'Missing Figma variables',
          severity: 'blocking',
          affectedCount: missingInFigma.length || undefined,
          detail: missingInFigma.length > 0
            ? compareMode === 'resolver-publish'
              ? 'Some mapped resolver outputs are still missing in their target Figma modes. Sync the resolver mappings before compare/apply can reflect the saved mode routing.'
              : 'Some local tokens are not yet published as Figma variables. Push them first so compare/apply runs against the full collection.'
            : undefined,
          recommendedActionLabel: missingInFigma.length > 0
            ? compareMode === 'resolver-publish'
              ? `Sync ${missingInFigma.length} missing mapped variable${missingInFigma.length === 1 ? '' : 's'}`
              : `Push ${missingInFigma.length} missing variable${missingInFigma.length === 1 ? '' : 's'}`
            : undefined,
          recommendedActionId: missingInFigma.length > 0 ? 'push-missing-variables' : undefined,
        },
        {
          id: 'orphans',
          label: 'Orphaned Figma variables',
          severity: 'blocking',
          affectedCount: orphanCount || undefined,
          detail: orphanCount > 0
            ? compareMode === 'resolver-publish'
              ? 'Some mapped Figma collections still contain variables that are absent from every saved resolver output targeting that collection. Delete those resolver-targeted orphans before syncing again.'
              : 'Figma still contains variables that no longer exist in this collection. Review or delete them before syncing again.'
            : undefined,
          recommendedActionLabel: orphanCount > 0
            ? compareMode === 'resolver-publish'
              ? `Delete ${orphanCount} mapped orphan variable${orphanCount === 1 ? '' : 's'}`
              : `Delete ${orphanCount} orphan variable${orphanCount === 1 ? '' : 's'}`
            : undefined,
          recommendedActionId: orphanCount > 0 ? 'delete-orphan-variables' : undefined,
        },
        {
          id: 'scopes',
          label: 'Unscoped variables',
          severity: 'blocking',
          affectedCount: missingScopes.length || undefined,
          detail: missingScopes.length > 0
            ? 'Some Figma variables still allow every binding. Review the variable differences and assign the scopes designers should actually use.'
            : undefined,
          recommendedActionLabel: missingScopes.length > 0 ? 'Review variable scopes' : undefined,
          recommendedActionId: missingScopes.length > 0 ? 'review-variable-scopes' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Missing descriptions',
          severity: 'advisory',
          affectedCount: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0
            ? 'Descriptions are optional for publishing, but they make the synced variables much easier to understand inside Figma.'
            : undefined,
          recommendedActionLabel: missingDescriptions.length > 0 ? 'Add token descriptions in the Tokens workspace' : undefined,
          recommendedActionId: missingDescriptions.length > 0 ? 'add-token-descriptions' : undefined,
        },
        {
          id: 'blocking-lint-errors',
          label: 'Broken alias chains',
          severity: 'blocking',
          affectedCount: blockingValidationIssues.length || undefined,
          detail: blockingValidationIssues.length > 0
            ? `${summarizeValidationIssues(blockingValidationIssues)} would publish invalid Figma variable references. Fix these Audit findings before compare/apply unlocks.`
            : undefined,
          recommendedActionLabel: blockingValidationIssues.length > 0 ? 'Review in Audit' : undefined,
          recommendedActionId: blockingValidationIssues.length > 0 ? 'review-audit-findings' : undefined,
        },
        {
          id: 'lint-errors',
          label: 'Active audit errors',
          severity: 'advisory',
          affectedCount: activeValidationIssues.length || undefined,
          detail: activeValidationIssues.length > 0
            ? `${summarizeValidationIssues(activeValidationIssues)} still need review in Audit before shipping this library.`
            : undefined,
          recommendedActionLabel: activeValidationIssues.length > 0 ? 'Review in Audit' : undefined,
          recommendedActionId: activeValidationIssues.length > 0 ? 'review-audit-findings' : undefined,
        },
        {
          id: 'draft-tokens',
          label: 'Draft lifecycle tokens',
          severity: 'advisory',
          affectedCount: draftTokens.length || undefined,
          detail: draftTokens.length > 0
            ? `${formatCount(draftTokens.length, 'draft token')} in this collection still carries lifecycle="draft". Review them in Tokens before publishing to Figma.`
            : undefined,
          recommendedActionLabel: draftTokens.length > 0 ? 'Review draft tokens in Tokens' : undefined,
          recommendedActionId: draftTokens.length > 0 ? 'review-draft-tokens' : undefined,
        },
      ];

      setReadinessChecks(drafts.map((draft) => ({
        id: draft.id,
        label: draft.label,
        severity: draft.severity,
        status: draft.affectedCount && draft.affectedCount > 0 ? 'fail' : 'pass',
        affectedCount: draft.affectedCount,
        detail: draft.detail,
        recommendedActionLabel: draft.recommendedActionLabel,
        recommendedActionId: draft.recommendedActionId,
      })));

      const runKey = tokenChangeKey ?? 0;
      setChecksRunAtKey(runKey);
      setChecksStale(false);
      lsSet(STORAGE_KEYS.READINESS_CHANGE_KEY, String(runKey));
    } catch (err) {
      setReadinessError(describeError(err, 'Readiness checks'));
    } finally {
      setReadinessLoading(false);
      isRunningRef.current = false;

      const thisRunKey = tokenChangeKey ?? 0;
      const latestKey = latestTokenChangeKeyRef.current ?? 0;
      if (latestKey !== thisRunKey) {
        Promise.resolve().then(() => runReadinessChecksRef.current());
      }
    }
  }, [
    currentCollectionId,
    collectionMap,
    compareMode,
    modeMap,
    readFigmaTokens,
    refreshValidation,
    resolverName,
    resolverPublishMappings,
    serverUrl,
    tokenChangeKey,
  ]);

  const triggerReadinessAction = useCallback(async (actionId: PublishPreflightActionId) => {
    if (!currentCollectionId) return;

    try {
      if (actionId === 'push-missing-variables') {
        const snapshot: VariableSyncSnapshot = await loadVariableSyncSnapshot(
          serverUrl,
          currentCollectionId,
          readFigmaTokens,
          collectionMap,
          modeMap,
          resolverName,
          resolverPublishMappings,
        );
        const tokens: VariableSyncToken[] = getSyncRowsByCategory(snapshot.rows).localOnly.map((row) => {
          const local = snapshot.localMap.get(getDiffRowId(row));
          const scopes = local?.scopes;
          return {
            path: row.path,
            $type: row.localType ?? local?.type ?? 'string',
            $value: (row.localRaw ?? local?.raw ?? '') as VariableSyncToken['$value'],
            $extensions: scopes?.length ? { 'com.figma.scopes': scopes } : undefined,
            collectionId: currentCollectionId,
          };
        });

        if (tokens.length === 0) return;

        if (!postPluginMessage({ type: 'apply-variables', tokens, collectionMap, modeMap })) {
          setReadinessError('Could not reach the Figma plugin host.');
        }
        return;
      }

      if (actionId === 'delete-orphan-variables') {
        const snapshot: VariableSyncSnapshot = await loadVariableSyncSnapshot(
          serverUrl,
          currentCollectionId,
          readFigmaTokens,
          collectionMap,
          modeMap,
          resolverName,
          resolverPublishMappings,
        );
        const localPaths = new Set<string>(snapshot.localTokens.keys());
        if (compareMode === 'resolver-publish' && resolverPublishMappings) {
          const resolverOrphanPlan = buildResolverOrphanCleanupPlan(snapshot, resolverPublishMappings);
          if (resolverOrphanPlan.targets.length === 0) return;
          setOrphanConfirm({
            orphanPaths: resolverOrphanPlan.orphanPaths,
            localPaths,
            targets: resolverOrphanPlan.targets,
          });
          return;
        }

        const orphanPaths = getSyncRowsByCategory(snapshot.rows).figmaOnly.map((row) => row.path);

        if (orphanPaths.length === 0) return;

        setOrphanConfirm({ orphanPaths, localPaths });
      }
    } catch (error) {
      setReadinessError(describeError(error, 'Readiness action'));
    }
  }, [
    currentCollectionId,
    collectionMap,
    compareMode,
    modeMap,
    readFigmaTokens,
    resolverName,
    resolverPublishMappings,
    serverUrl,
    setOrphanConfirm,
  ]);

  const runReadinessChecksRef = useRef(runReadinessChecks);
  useEffect(() => { runReadinessChecksRef.current = runReadinessChecks; }, [runReadinessChecks]);
  const restoredReadinessRef = useRef(false);

  useEffect(() => {
    restoredReadinessRef.current = false;
    setChecksRunAtKey(null);
    setChecksStale(false);
    setReadinessError(null);
    setReadinessChecks([]);
  }, [currentCollectionId]);

  useEffect(() => {
    if (restoredReadinessRef.current) return;
    if (!connected || !currentCollectionId || tokenChangeKey === undefined) return;
    restoredReadinessRef.current = true;
    const stored = lsGet(STORAGE_KEYS.READINESS_CHANGE_KEY);
    if (stored !== null && tokenChangeKey > parseInt(stored, 10)) {
      runReadinessChecksRef.current();
    }
  }, [currentCollectionId, connected, tokenChangeKey]);

  useEffect(() => {
    if (!connected || !currentCollectionId || tokenChangeKey === undefined) return;
    if (checksRunAtKey === null) return;
    if (tokenChangeKey === checksRunAtKey) return;
    runReadinessChecksRef.current();
  }, [currentCollectionId, checksRunAtKey, connected, tokenChangeKey]);

  useEffect(() => {
    if (!checksStale || !connected || !currentCollectionId) return;
    runReadinessChecksRef.current();
  }, [checksStale, connected, currentCollectionId]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = (event.data as { pluginMessage?: { type: string } })?.pluginMessage;
      if (msg?.type === 'variables-applied') {
        runReadinessChecksRef.current();
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const failingReadinessChecks = readinessChecks.filter((check) => check.status === 'fail');
  const blockingReadinessChecks = failingReadinessChecks.filter((check) => check.severity === 'blocking');
  const advisoryReadinessChecks = failingReadinessChecks.filter((check) => check.severity === 'advisory');
  const readinessFails = failingReadinessChecks.length;
  const readinessPasses = readinessChecks.filter((check) => check.status === 'pass').length;
  const readinessBlockingFails = blockingReadinessChecks.length;
  const isReadinessOutdated = readinessChecks.length > 0 && (
    checksStale ||
    (tokenChangeKey !== undefined && checksRunAtKey !== null && tokenChangeKey !== checksRunAtKey)
  );
  const preflightStage: PublishPreflightStage =
    readinessLoading ? 'running'
      : readinessChecks.length === 0 ? 'idle'
        : readinessBlockingFails > 0 ? 'blocked'
          : readinessFails > 0 ? 'advisory'
            : 'ready';

  return {
    readinessChecks,
    failingReadinessChecks,
    blockingReadinessChecks,
    advisoryReadinessChecks,
    preflightStage,
    readinessLoading,
    readinessError,
    setReadinessError,
    checksStale,
    setChecksStale,
    runReadinessChecks,
    triggerReadinessAction,
    readinessFails,
    readinessPasses,
    readinessBlockingFails,
    isReadinessOutdated,
  };
}
