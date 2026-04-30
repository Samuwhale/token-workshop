import { getErrorMessage } from '../shared/utils';
import { dispatchToast } from '../shared/toastBus';
import { useState, useCallback, useEffect, useRef } from 'react';
import { resolveAllAliases } from '../../shared/resolveAlias';
import { getPluginMessageFromEvent } from '../../shared/utils';
import type {
  StylesAppliedMessage,
  TokenMapEntry,
  VariableSyncToken,
  VariablesAppliedMessage,
} from '../../shared/types';
import { useFigmaMessage } from './useFigmaMessage';
import { extractSyncApplyResult } from './useTokenSyncBase';
import { usePersistedJsonState } from './usePersistedState';
import { STORAGE_KEYS } from '../shared/storage';
import { isReference, parseReference, type TokenCollection } from '@tokenmanager/core';
import { buildStylePublishTokens } from '../shared/stylePublish';

// Publish-time target. Variables carry every token type; Styles carry only the
// four DTCG types Figma exposes as native styles. The user does not pick — we
// always fan out to whichever primitives each token needs.
type ApplyResult = {
  count: number;
  total: number;
  failures: { path: string; error: string }[];
  skipped: Array<{ path: string; $type: string }>;
};

function preserveTypographyReferences(
  rawEntry: TokenMapEntry | undefined,
  resolvedEntry: TokenMapEntry,
): TokenMapEntry {
  if (
    resolvedEntry.$type !== 'typography' ||
    !rawEntry ||
    rawEntry.$type !== 'typography' ||
    rawEntry.$value === null ||
    typeof rawEntry.$value !== 'object' ||
    Array.isArray(rawEntry.$value) ||
    resolvedEntry.$value === null ||
    typeof resolvedEntry.$value !== 'object' ||
    Array.isArray(resolvedEntry.$value)
  ) {
    return resolvedEntry;
  }

  return {
    ...resolvedEntry,
    $value: {
      ...(resolvedEntry.$value as Record<string, unknown>),
      ...(rawEntry.$value as Record<string, unknown>),
    } as TokenMapEntry['$value'],
  };
}

function hasDerivation(entry: TokenMapEntry): boolean {
  const tokenManager = entry.$extensions?.tokenmanager;
  return Boolean(
    tokenManager &&
    typeof tokenManager === 'object' &&
    !Array.isArray(tokenManager) &&
    'derivation' in tokenManager,
  );
}

function getVariablePublishEntry(
  rawEntry: TokenMapEntry,
  resolvedEntry: TokenMapEntry,
): TokenMapEntry {
  return hasDerivation(rawEntry) ? resolvedEntry : rawEntry;
}

function getAliasTargetCollectionId(
  value: unknown,
  pathToCollectionId: Record<string, string>,
): string | undefined {
  return typeof value === 'string' && isReference(value)
    ? pathToCollectionId[parseReference(value)]
    : undefined;
}

export type PublishPending =
  | { scope: 'group'; groupPath: string; collectionId: string; tokenCount: number }
  | { scope: 'collection'; collectionId: string; tokenCount: number };

export function useFigmaSync(
  connected: boolean,
  collections: TokenCollection[],
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>,
  collectionMap: Record<string, string>,
  modeMap: Record<string, string>,
) {
  const [publishPending, setPublishPending] = useState<PublishPending | null>(null);
  const [publishApplying, setPublishApplying] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ current: number; total: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const [createStyles] = usePersistedJsonState<boolean>(STORAGE_KEYS.PUBLISH_CREATE_STYLES, true);

  const abortRef = useRef(new AbortController());
  useEffect(() => {
    const controller = abortRef.current;
    return () => { controller.abort(); };
  }, []);

  const toProgressPayload = (
    msg: { current?: number; total?: number } | null,
  ): { current: number; total: number } | null => {
    if (
      !msg ||
      typeof msg.current !== 'number' ||
      !Number.isFinite(msg.current) ||
      typeof msg.total !== 'number' ||
      !Number.isFinite(msg.total)
    ) {
      return null;
    }
    return {
      current: msg.current,
      total: msg.total,
    };
  };

  // Both variable- and style-sync progress messages map onto the single publish
  // progress indicator. The user sees one ongoing operation, not two.
  useEffect(() => {
    const signal = abortRef.current.signal;
    const handler = (ev: MessageEvent) => {
      if (signal.aborted) return;
      const msg = getPluginMessageFromEvent<{ type?: string; current?: number; total?: number }>(ev);
      if (msg?.type === 'variable-sync-progress' || msg?.type === 'style-sync-progress') {
        const progress = toProgressPayload(msg);
        if (progress) {
          setPublishProgress(progress);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const sendStyleApply = useFigmaMessage<ApplyResult, StylesAppliedMessage>({
    responseType: 'styles-applied',
    errorType: 'styles-apply-error',
    timeout: 15000,
    extractResponse: extractSyncApplyResult,
  });

  const sendVarApply = useFigmaMessage<ApplyResult, VariablesAppliedMessage>({
    responseType: 'variables-applied',
    errorType: 'apply-variables-error',
    timeout: 30000,
    extractResponse: extractSyncApplyResult,
  });

  const handlePublish = useCallback(async () => {
    const pending = publishPending;
    if (!pending || !connected) return;
    const targetCollectionId = pending.collectionId;
    const scopedRawMap = perCollectionFlat[targetCollectionId] ?? {};
    const pathToCollectionId: Record<string, string> = {};
    const rawMap = Object.entries(perCollectionFlat).reduce<Record<string, TokenMapEntry>>(
      (accumulator, [sourceCollectionId, collectionFlat]) => {
        for (const [path, entry] of Object.entries(collectionFlat)) {
          if (!(path in accumulator)) {
            accumulator[path] = entry;
            pathToCollectionId[path] = sourceCollectionId;
          }
        }
        return accumulator;
      },
      {},
    );
    Object.assign(rawMap, scopedRawMap);
    for (const path of Object.keys(scopedRawMap)) {
      pathToCollectionId[path] = targetCollectionId;
    }

    setPublishPending(null);
    setPublishApplying(true);
    setPublishProgress(null);
    setPublishError(null);

    try {
      const resolved = resolveAllAliases(rawMap);
      const tokens: VariableSyncToken[] = [];
      const stylePaths: string[] = [];
      const scopedPaths = Object.keys(scopedRawMap).filter((path) =>
        pending.scope === 'group'
          ? path === pending.groupPath || path.startsWith(`${pending.groupPath}.`)
          : true,
      );
      for (const path of scopedPaths) {
        const rawEntry = rawMap[path];
        const resolvedEntry = resolved[path];
        if (!rawEntry || !resolvedEntry) {
          continue;
        }
        const styleAwareEntry = preserveTypographyReferences(rawEntry, resolvedEntry);
        const variableEntry = getVariablePublishEntry(rawEntry, resolvedEntry);
        tokens.push({
          path,
          $type: variableEntry.$type,
          $value: variableEntry.$value,
          collectionId: targetCollectionId,
          aliasTargetCollectionId: getAliasTargetCollectionId(variableEntry.$value, pathToCollectionId),
        });
        if (
          styleAwareEntry.$type === 'color' ||
          styleAwareEntry.$type === 'gradient' ||
          styleAwareEntry.$type === 'typography' ||
          styleAwareEntry.$type === 'shadow'
        ) {
          stylePaths.push(path);
        }
      }

      const varResult = await sendVarApply('apply-variables', { tokens, collectionMap, modeMap });
      const styleResult = createStyles
        ? await sendStyleApply('apply-styles', {
            tokens: buildStylePublishTokens({
              targets: stylePaths.map((path) => ({
                path,
                collectionId: targetCollectionId,
              })),
              collections,
              perCollectionFlat,
              collectionMap,
              modeMap,
            }),
          })
        : null;

      const allFailures = [
        ...varResult.failures,
        ...(styleResult?.failures ?? []),
      ];
      const varCount = varResult.count;
      const styleCount = styleResult?.count ?? 0;

      if (allFailures.length > 0) {
        const failedPaths = allFailures.map(f => f.path).join(', ');
        setPublishError(`Applied ${varCount} variable${varCount !== 1 ? 's' : ''}${styleResult ? ` and ${styleCount} style${styleCount !== 1 ? 's' : ''}` : ''}. Failed: ${failedPaths}`);
      } else {
        const parts: string[] = [];
        parts.push(`${varCount} variable${varCount !== 1 ? 's' : ''}`);
        if (styleResult) parts.push(`${styleCount} style${styleCount !== 1 ? 's' : ''}`);
        dispatchToast(`Applied ${parts.join(' · ')} to Figma`, 'success', {
          destination: { kind: 'workspace', topTab: 'publish', subTab: 'publish-figma' },
        });
      }
    } catch (err) {
      if (abortRef.current.signal.aborted) return;
      console.error(`Failed to apply ${pending.scope} to Figma:`, err);
      setPublishError(getErrorMessage(err, `Failed to apply ${pending.scope} to Figma`));
    } finally {
      if (!abortRef.current.signal.aborted) {
        setPublishApplying(false);
        setPublishProgress(null);
      }
    }
  }, [
    publishPending,
    connected,
    collections,
    perCollectionFlat,
    collectionMap,
    modeMap,
    createStyles,
    sendVarApply,
    sendStyleApply,
  ]);

  return {
    publishPending,
    setPublishPending,
    publishApplying,
    publishProgress,
    publishError,
    handlePublish,
  };
}
