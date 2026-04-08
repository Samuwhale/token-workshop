import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { dispatchToast } from '../shared/toastBus';
import { describeError } from '../shared/utils';
import { Spinner } from './Spinner';
import { ConfirmModal } from './ConfirmModal';
import { useSyncEntity, type SyncMessages } from '../hooks/useSyncEntity';
import { useGitSync } from '../hooks/useGitSync';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { swatchBgColor } from '../shared/colorUtils';
import { SyncSubPanel } from './publish/SyncSubPanel';
import { GitSubPanel } from './publish/GitSubPanel';
import { ApplyDiffConfirmModal } from './publish/PublishModals';
import { usePanelHelp, PanelHelpIcon, PanelHelpBanner } from './PanelHelpHint';
import { useOrphanCleanup } from '../hooks/useOrphanCleanup';
import { useReadinessChecks } from '../hooks/useReadinessChecks';
import { usePublishAll, type ConfirmAction, type PublishAllSections } from '../hooks/usePublishAll';
import type { VarSnapshot, StyleSnapshot, VariablesAppliedMessage, StylesAppliedMessage, VariablesReadMessage, StylesReadMessage } from '../../shared/types';
import { FIGMA_SCOPES } from './MetadataEditor';

/* ── Sync entity types ───────────────────────────────────────────────────── */

// Unified row type — superset of what both variable and style sync need.
interface DiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;   // display string (always a string, even for styles)
  figmaValue?: string;   // display string
  localRaw?: any;        // raw $value (used in apply/pull payloads)
  figmaRaw?: any;        // raw $value
  localType?: string;
  figmaType?: string;
  /** Scopes from the local token's $extensions['com.figma.scopes'] */
  localScopes?: string[];
  /** Scopes currently on the matching Figma variable */
  figmaScopes?: string[];
}

// ── Static message configs (stable module-level refs required by useFigmaMessage) ──

const VAR_MESSAGES: SyncMessages<VarSnapshot> = {
  readSendType: 'read-variables', readResponseType: 'variables-read', readTimeout: 10000,
  extractReadResponse: (msg: VariablesReadMessage) => msg.collections ?? [],
  applySendType: 'apply-variables', applyResponseType: 'variables-applied', applyErrorType: 'apply-variables-error', applyTimeout: 30000,
  extractApplySnapshot: (msg: VariablesAppliedMessage) => msg.varSnapshot ?? undefined,
  revertSendType: 'revert-variables', revertResponseType: 'variables-reverted', revertTimeout: 30000,
};

const STYLE_MESSAGES: SyncMessages<StyleSnapshot> = {
  readSendType: 'read-styles', readResponseType: 'styles-read', readErrorType: 'styles-read-error', readTimeout: 10000,
  extractReadResponse: (msg: StylesReadMessage) => msg.tokens ?? [],
  applySendType: 'apply-styles', applyResponseType: 'styles-applied', applyErrorType: 'styles-apply-error', applyTimeout: 15000,
  extractApplySnapshot: (msg: StylesAppliedMessage) => msg.styleSnapshot ?? undefined,
  revertSendType: 'revert-styles', revertResponseType: 'styles-reverted', revertTimeout: 30000,
};

// ── Sync builders factory ─────────────────────────────────────────────────
// Eliminates the parallel var/style builder function sets that differed only
// in field names (value vs raw), type filtering, conflict comparison, and
// value summarization.

interface TokenEntry {
  raw: any;
  type: string;
  scopes?: string[];
}

interface SyncBuildersSpec {
  /** Extract a raw value + type (+ optional scopes) from a Figma token */
  fromFigmaToken: (token: any) => TokenEntry;
  /** Extract a raw value + type (+ optional scopes) from a local token; return null to exclude */
  fromLocalToken: (token: any) => TokenEntry | null;
  /** Are two raw values equal? */
  isEqual: (a: any, b: any) => boolean;
  /** Convert raw value to a display string for the UI */
  displayValue: (raw: any, type: string) => string;
}

function scopesEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const aArr = a?.length ? [...a].sort() : [];
  const bArr = b?.length ? [...b].sort() : [];
  return aArr.length === bArr.length && aArr.every((s, i) => s === bArr[i]);
}

function createSyncBuilders(spec: SyncBuildersSpec) {
  return {
    buildFigmaMap: (tokens: any[]) =>
      new Map(tokens.map(t => [t.path, spec.fromFigmaToken(t)])),

    buildLocalMap: (tokens: Map<string, any>) => {
      const m = new Map<string, TokenEntry>();
      for (const [path, token] of tokens) {
        const entry = spec.fromLocalToken(token);
        if (entry !== null) m.set(path, entry);
      }
      return m;
    },

    buildLocalOnlyRow: (path: string, local: TokenEntry): DiffRow => ({
      path, cat: 'local-only',
      localRaw: local.raw, localValue: spec.displayValue(local.raw, local.type), localType: local.type,
      localScopes: local.scopes,
    }),

    buildFigmaOnlyRow: (path: string, figma: TokenEntry): DiffRow => ({
      path, cat: 'figma-only',
      figmaRaw: figma.raw, figmaValue: spec.displayValue(figma.raw, figma.type), figmaType: figma.type,
      figmaScopes: figma.scopes,
    }),

    buildConflictRow: (path: string, local: TokenEntry, figma: TokenEntry): DiffRow => ({
      path, cat: 'conflict',
      localRaw: local.raw, figmaRaw: figma.raw,
      localValue: spec.displayValue(local.raw, local.type),
      figmaValue: spec.displayValue(figma.raw, figma.type),
      localType: local.type, figmaType: figma.type,
      localScopes: local.scopes,
      figmaScopes: figma.scopes,
    }),

    isConflict: (local: TokenEntry, figma: TokenEntry) =>
      !spec.isEqual(local.raw, figma.raw) || !scopesEqual(local.scopes, figma.scopes),

    buildPullPayload: (row: DiffRow) => ({ $type: row.figmaType ?? 'string', $value: row.figmaRaw }),
  };
}

// ── Builder specs ─────────────────────────────────────────────────────────

const VAR_SYNC_SPEC: SyncBuildersSpec = {
  fromFigmaToken: (t) => ({
    raw: String(t.$value ?? ''),
    type: String(t.$type ?? 'string'),
    scopes: Array.isArray(t.$scopes) ? t.$scopes : undefined,
  }),
  fromLocalToken: (t) => {
    const scopes: string[] | undefined =
      Array.isArray(t.$extensions?.['com.figma.scopes']) ? t.$extensions['com.figma.scopes'] :
      Array.isArray(t.$scopes) ? t.$scopes :
      undefined;
    return { raw: String(t.$value), type: String(t.$type ?? 'string'), scopes };
  },
  isEqual: (a, b) => a === b,
  displayValue: (raw) => raw,
};

const STYLE_TYPES = new Set(['color', 'gradient', 'typography', 'shadow']);

function summarizeStyleValue(value: any, type: string): string {
  if (type === 'color') return String(value);
  if (type === 'gradient' && value && typeof value === 'object' && Array.isArray(value.stops)) {
    const gradType = value.type ?? 'linear';
    const stopColors = (value.stops as Array<{ color?: string }>).map(s => s?.color ?? '').filter(Boolean).join(' → ');
    return `${gradType}: ${stopColors}`.slice(0, 48);
  }
  if (type === 'typography' && value && typeof value === 'object') {
    const family = Array.isArray(value.fontFamily) ? value.fontFamily[0] : value.fontFamily;
    const size = typeof value.fontSize === 'object' ? `${value.fontSize.value}${value.fontSize.unit}` : String(value.fontSize ?? '');
    return `${family ?? ''}${size ? ' ' + size : ''}`.trim() || JSON.stringify(value).slice(0, 28);
  }
  if (type === 'shadow') {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((s: any) => s?.color ?? '').join(', ').slice(0, 28);
  }
  return JSON.stringify(value).slice(0, 28);
}

const STYLE_SYNC_SPEC: SyncBuildersSpec = {
  fromFigmaToken: (t) => ({ raw: t.$value, type: String(t.$type ?? 'string') }),
  fromLocalToken: (t) => {
    const type = String(t.$type ?? 'string');
    if (!STYLE_TYPES.has(type)) return null;
    return { raw: t.$value, type };
  },
  isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  displayValue: summarizeStyleValue,
};

const varBuilders = createSyncBuilders(VAR_SYNC_SPEC);
const styleBuilders = createSyncBuilders(STYLE_SYNC_SPEC);

/* ── Types ───────────────────────────────────────────────────────────────── */

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
  /** Increments whenever tokens are edited — used to detect stale readiness results */
  tokenChangeKey?: number;
}

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({ serverUrl, connected, activeSet, collectionMap = {}, modeMap = {}, tokenChangeKey }: PublishPanelProps) {
  const help = usePanelHelp('publish');

  // ── Rename history for variable name propagation ──
  // Eagerly fetched from the server so applyVariables can rename existing Figma
  // variables instead of creating orphans when tokens are renamed between syncs.
  const renamesRef = useRef<Array<{ oldPath: string; newPath: string }>>([]);
  useEffect(() => {
    if (!connected || !serverUrl) { renamesRef.current = []; return; }
    fetch(`${serverUrl}/api/operations/path-renames`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { renames?: Array<{ oldPath: string; newPath: string }> } | null) => {
        renamesRef.current = data?.renames ?? [];
      })
      .catch(() => { renamesRef.current = []; });
  }, [connected, serverUrl, tokenChangeKey]);

  // ── Section accordion state ──
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['figma-variables', 'figma-styles']));
  const toggleSection = (id: string) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // ── Scope overrides: user-edited scopes for variable push rows ──
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, string[]>>({});

  // ── Extracted hooks ──
  const varSync = useSyncEntity<DiffRow, VarSnapshot>(serverUrl, activeSet, connected, VAR_MESSAGES, {
    progressEventType: 'variable-sync-progress',
    ...varBuilders,
    buildApplyPayload: (rows) => ({
      tokens: rows.map(r => {
        const scopes = scopeOverrides[r.path] ?? r.localScopes;
        const extensions = scopes?.length ? { 'com.figma.scopes': scopes } : {};
        return {
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw ?? '',
          $extensions: extensions,
          setName: activeSet,
        };
      }),
      collectionMap, modeMap,
      renames: renamesRef.current.length > 0 ? renamesRef.current : undefined,
    }),
    buildRevertPayload: (snapshot) => ({ varSnapshot: snapshot }),
    onApplySuccess: (result) => {
      if ((result.overwritten ?? 0) > 0) {
        const skippedCount = result.skipped?.length ?? 0;
        const skippedNote = skippedCount > 0 ? ` · ${skippedCount} skipped (unsupported type)` : '';
        dispatchToast(`Variables synced — ${result.created ?? 0} created, ${result.overwritten} updated${skippedNote}`, 'success');
      }
    },
    successMessage: 'Variable sync applied', compareErrorLabel: 'Compare variables', applyErrorLabel: 'Apply variable sync',
    revertSuccessMessage: 'Variable sync reverted', revertErrorMessage: 'Failed to revert variable sync',
    autoComputeOnConnect: true,
  });

  const styleSync = useSyncEntity<DiffRow, StyleSnapshot>(serverUrl, activeSet, connected, STYLE_MESSAGES, {
    progressEventType: 'style-sync-progress',
    ...styleBuilders,
    buildApplyPayload: (rows) => ({ tokens: rows.map(r => ({ path: r.path, $type: r.localType ?? 'string', $value: r.localRaw })) }),
    buildRevertPayload: (snapshot) => ({ styleSnapshot: snapshot }),
    successMessage: 'Style sync applied', compareErrorLabel: 'Compare styles', applyErrorLabel: 'Apply style sync',
    revertSuccessMessage: 'Style sync reverted', revertErrorMessage: 'Failed to revert style sync',
    autoComputeOnConnect: true,
  });

  const git = useGitSync({ serverUrl, connected });

  // ── Shared diff filter ──
  const [diffFilter] = useState('');

  // ── Confirmation modal state ──
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // ── Late-bound trampoline refs (breaks circular hook dependency) ──
  const onOrphanDeletionCompleteRef = useRef<() => void>(() => {});
  const stableOnOrphanDeletionComplete = useCallback(() => onOrphanDeletionCompleteRef.current(), []);
  const setReadinessErrorRef = useRef<(msg: string | null) => void>(() => {});
  const stableSetReadinessError = useCallback((msg: string | null) => setReadinessErrorRef.current(msg), []);
  const markChecksStaleRef = useRef<() => void>(() => {});
  const stableMarkChecksStale = useCallback(() => markChecksStaleRef.current(), []);

  const orphanCleanup = useOrphanCleanup({
    collectionMap,
    onDeletionComplete: stableOnOrphanDeletionComplete,
    setReadinessError: stableSetReadinessError,
  });

  const readiness = useReadinessChecks({
    serverUrl, activeSet, connected,
    collectionMap, modeMap, tokenChangeKey,
    readFigmaTokens: varSync.readFigmaTokens,
    setOrphanConfirm: orphanCleanup.setOrphanConfirm,
  });

  const publishAll = usePublishAll({
    varSync, styleSync, git,
    setConfirmAction,
    markChecksStale: stableMarkChecksStale,
  });

  // Wire trampolines to real implementations (runs every render — that's intentional)
  onOrphanDeletionCompleteRef.current = readiness.runReadinessChecks;
  setReadinessErrorRef.current = readiness.setReadinessError;
  markChecksStaleRef.current = () => readiness.setChecksStale(true);

  // Destructure for ergonomic JSX access
  const {
    readinessChecks, readinessLoading, readinessError, setChecksStale,
    runReadinessChecks, readinessFails, readinessPasses, readinessBlockingFails, isReadinessOutdated,
  } = readiness;
  const { orphansDeleting, orphanConfirm, setOrphanConfirm, executeOrphanDeletion } = orphanCleanup;
  const {
    publishAllStep, publishAllError, publishAllGitSkipped, setPublishAllGitSkipped,
    compareAllLoading, hasVarChanges, hasStyleChanges,
    effectiveHasGitDiffChanges, hasMergeConflicts, publishAllAvailable, publishAllBusy,
    gitDiffPendingCount, handleOpenPublishAll, compareAll, runPublishAll, quickSync, quickSyncing,
  } = publishAll;
  const hasFigmaSyncChanges = hasVarChanges || hasStyleChanges;
  const hasOnlyGitChanges = !hasFigmaSyncChanges && effectiveHasGitDiffChanges;

  // ── Broadcast pending count to Ship tab badge ────────────────────────────
  // Fires whenever either check completes (or resets). Clears on unmount.
  useEffect(() => {
    const varCount = varSync.checked ? varSync.syncCount : 0;
    const styleCount = styleSync.checked ? styleSync.syncCount : 0;
    window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: varCount + styleCount } }));
    return () => {
      window.dispatchEvent(new CustomEvent('publish-pending-count', { detail: { total: 0 } }));
    };
  }, [varSync.checked, varSync.syncCount, styleSync.checked, styleSync.syncCount]);

  /* ── Not connected ─────────────────────────────────────────────────────── */

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to sync tokens with Figma
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
    <div className="flex flex-col h-full">
      {/* ── Pre-publish readiness gate ──────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              readinessLoading ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' :
              isReadinessOutdated ? 'bg-yellow-400' :
              readinessFails === 0 && readinessPasses > 0 ? 'bg-[var(--color-figma-success)]' :
              readinessBlockingFails > 0 ? 'bg-[var(--color-figma-error)]' :
              readinessFails > 0 ? 'bg-yellow-500' :
              'bg-[var(--color-figma-border)]'
            }`} />
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Figma Sync Readiness</span>
            {readinessBlockingFails > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] font-medium">{readinessBlockingFails} blocking</span>
            )}
            {readinessFails > readinessBlockingFails && readinessBlockingFails === 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-700 font-medium">{readinessFails} optional</span>
            )}
            {readinessFails > readinessBlockingFails && readinessBlockingFails > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-400/15 text-yellow-700 font-medium">+{readinessFails - readinessBlockingFails} optional</span>
            )}
            {readinessFails === 0 && readinessPasses > 0 && !isReadinessOutdated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Ready</span>
            )}
            {isReadinessOutdated && !readinessLoading && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-700 font-medium" title="Tokens changed since last check">Outdated</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <PanelHelpIcon panelKey="publish" title="Sync to Figma" expanded={help.expanded} onToggle={help.toggle} />
            <button
              onClick={runReadinessChecks}
              disabled={readinessLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {readinessLoading ? 'Checking\u2026' : readinessChecks.length > 0 ? 'Re-check' : 'Run checks'}
            </button>
          </div>
        </div>

        {readinessError && (
          <div role="alert" className="mt-1.5 text-[10px] text-[var(--color-figma-error)]">{readinessError}</div>
        )}

        {readinessChecks.length > 0 && (
          <>
            {readinessBlockingFails > 0 && (
              <div className="mt-2 flex items-start gap-1.5 px-2.5 py-2 rounded bg-[var(--color-figma-error)]/8 border border-[var(--color-figma-error)]/20">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-[var(--color-figma-error)]">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
                <div className="text-[10px] text-[var(--color-figma-error)] leading-relaxed">
                  <span className="font-medium">{readinessBlockingFails} required {readinessBlockingFails === 1 ? 'issue' : 'issues'} must be resolved before syncing to Figma.</span>
                  {' '}Fix items marked <span className="font-medium">Required</span> first, then re-check.
                </div>
              </div>
            )}
            {readinessFails > 0 && readinessBlockingFails === 0 && (
              <div className="mt-2 flex items-center gap-1.5 px-2.5 py-2 rounded bg-[var(--color-figma-warning)]/8 border border-[var(--color-figma-warning)]/20">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-yellow-600">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
                  Optional improvements remain. You can sync to Figma now or address them first.
                </span>
              </div>
            )}
            <div className="mt-2 divide-y divide-[var(--color-figma-border)] rounded border border-[var(--color-figma-border)] overflow-hidden">
              {readinessChecks.map(check => (
                <div key={check.id} className={`px-3 py-2 ${check.status === 'fail' ? 'bg-[var(--color-figma-bg)]' : 'bg-[var(--color-figma-bg)]'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 ${check.status === 'pass' ? 'text-[var(--color-figma-success)]' : check.blocking ? 'text-[var(--color-figma-error)]' : 'text-yellow-600'}`}>
                      {check.status === 'pass' ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-[var(--color-figma-text)]">{check.label}</span>
                        {check.status === 'fail' && (
                          <span className={`text-[9px] px-1 py-0 rounded font-medium leading-4 ${
                            check.blocking
                              ? 'bg-[var(--color-figma-error)]/12 text-[var(--color-figma-error)]'
                              : 'bg-yellow-400/15 text-yellow-700'
                          }`}>
                            {check.blocking ? 'Required' : 'Optional'}
                          </span>
                        )}
                        {check.count !== undefined && check.status === 'fail' && (
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">{check.count} affected</span>
                        )}
                      </div>
                      {check.detail && check.status === 'fail' && (
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1 leading-relaxed">{check.detail}</div>
                      )}
                    </div>
                    {check.fixLabel && check.onFix && (
                      <button
                        onClick={check.onFix}
                        disabled={orphansDeleting}
                        className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 shrink-0 disabled:opacity-40 mt-0.5"
                      >
                        {orphansDeleting && check.id === 'orphans' ? 'Deleting\u2026' : check.fixLabel}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!readinessLoading && readinessChecks.length === 0 && !readinessError && (
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Click <strong className="font-medium text-[var(--color-figma-text)]">Run checks</strong> to validate before syncing to Figma.
          </div>
        )}
      </div>

      {/* ── Publish all banner ──────────────────────────────────────────── */}
      {(publishAllAvailable || publishAllBusy || quickSyncing || compareAllLoading) && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 p-2.5">
            {(publishAllBusy || quickSyncing || compareAllLoading) ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" className="text-[var(--color-figma-accent)]" />
                <span className="text-[10px] text-[var(--color-figma-text)] font-medium">
                  {compareAllLoading && 'Comparing\u2026'}
                  {!compareAllLoading && publishAllStep === 'variables' && (quickSyncing ? 'Syncing variables to Figma\u2026' : 'Applying variable sync changes\u2026')}
                  {!compareAllLoading && publishAllStep === 'styles' && (quickSyncing ? 'Syncing styles to Figma\u2026' : 'Applying style sync changes\u2026')}
                  {!compareAllLoading && publishAllStep === 'git' && 'Applying advanced Git changes\u2026'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {hasOnlyGitChanges
                      ? 'Advanced Git workflow ready'
                      : hasMergeConflicts
                        ? 'Figma sync ready'
                        : 'Review sync destinations'}
                  </span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {hasOnlyGitChanges
                      ? `${gitDiffPendingCount} git file${gitDiffPendingCount !== 1 ? 's' : ''} with local changes`
                      : [
                        hasVarChanges ? `${varSync.syncCount} variable change${varSync.syncCount !== 1 ? 's' : ''}` : null,
                        hasStyleChanges ? `${styleSync.syncCount} style change${styleSync.syncCount !== 1 ? 's' : ''}` : null,
                        effectiveHasGitDiffChanges ? `${gitDiffPendingCount} git file${gitDiffPendingCount !== 1 ? 's' : ''} available in advanced workflow` : null,
                      ].filter(Boolean).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasFigmaSyncChanges && (
                    <button
                      onClick={quickSync}
                      title="Compare and apply all variable and style changes to Figma immediately, without preview"
                      className="text-[10px] px-2.5 py-1 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] font-medium hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                    >
                      Sync Figma now
                    </button>
                  )}
                  <button
                    onClick={handleOpenPublishAll}
                    className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)]"
                  >
                    {hasOnlyGitChanges
                      ? 'Review Git changes'
                      : hasMergeConflicts
                        ? 'Review Figma sync'
                        : 'Choose destinations'}
                  </button>
                </div>
              </div>
            )}
            {effectiveHasGitDiffChanges && !publishAllBusy && !hasOnlyGitChanges && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M12 20v-6M12 4v4M6.5 7.5l2.8 2.8M14.7 13.7l2.8 2.8M4 12h4M16 12h4M6.5 16.5l2.8-2.8M14.7 10.3l2.8-2.8" />
                </svg>
                Git stays optional here. Open the advanced Git workflow only if you want to include repository changes in the same review.
              </div>
            )}
            {hasMergeConflicts && !publishAllBusy && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
                Git excluded — {git.mergeConflicts.length} conflict{git.mergeConflicts.length !== 1 ? 's' : ''} must be resolved in the advanced Git workflow first
              </div>
            )}
            {publishAllError && (
              <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">
                Sync failed: {publishAllError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Git-skipped notification ────────────────────────────────────── */}
      {publishAllGitSkipped && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-figma-warning)]/40 bg-[var(--color-figma-warning)]/8 p-2.5">
            <div className="flex items-start gap-2">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-yellow-600">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-[var(--color-figma-text)]">Advanced Git workflow was skipped</p>
                <p className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5">
                  Variables and styles were synced to Figma, but Git was not included because {git.mergeConflicts.length} merge conflict{git.mergeConflicts.length !== 1 ? 's' : ''} must be resolved first.
                </p>
                <button
                  onClick={() => {
                    setPublishAllGitSkipped(false);
                    setOpenSections(prev => { const next = new Set(prev); next.add('git'); return next; });
                    document.getElementById('publish-section-git')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="mt-1 text-[10px] text-[var(--color-figma-accent)] hover:underline font-medium"
                >
                  Open advanced Git workflow \u2192
                </button>
              </div>
              <button
                onClick={() => setPublishAllGitSkipped(false)}
                aria-label="Dismiss"
                className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {help.expanded && (
        <PanelHelpBanner
          title="Sync to Figma"
          description="Run readiness checks, compare local tokens against Figma variables and styles, and sync the destinations you choose. Git stays available as an optional advanced workflow instead of part of the primary designer path."
          onDismiss={help.dismiss}
        />
      )}

      {/* ── Compare Figma destinations toolbar ─────────────────────────── */}
      <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0 flex items-center justify-end">
        <button
          onClick={async () => {
            setOpenSections(new Set(['figma-variables', 'figma-styles']));
            await compareAll();
          }}
          disabled={compareAllLoading || varSync.loading || styleSync.loading}
          title="Compare variables and styles in parallel"
          className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-secondary)] disabled:opacity-40 transition-colors flex items-center gap-1"
        >
          {compareAllLoading ? (
            <>
              <Spinner size="sm" />
              Comparing\u2026
            </>
          ) : (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
              </svg>
              Compare Figma targets
            </>
          )}
        </button>
      </div>

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
      {/* ── Section: Figma Variables ─────────────────────────────────────── */}
        <Section
          title="Figma Variables"
        open={openSections.has('figma-variables')}
        onToggle={() => toggleSection('figma-variables')}
        badge={
          varSync.loading ? null :
          varSync.checked && varSync.rows.length === 0
            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
            : varSync.rows.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varSync.rows.length} differ</span>
              : null
        }
      >
        <SyncSubPanel
          sync={varSync}
          activeSet={activeSet}
          diffFilter={diffFilter}
          onRequestConfirm={(action) => setConfirmAction(action as ConfirmAction)}
          onRevert={varSync.revert}
          description="Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back."
          sectionLabel="Token differences"
          previewAction="preview-vars"
          applyAction="apply-vars"
          inSyncMessage="Local tokens match Figma variables."
          notCheckedMessage={<>Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.</>}
          revertDescription="Restore Figma variables to their pre-sync state"
          scopeOverrides={scopeOverrides}
          onScopesChange={(path, scopes) => setScopeOverrides(prev => ({ ...prev, [path]: scopes }))}
          getScopeOptions={(type) => FIGMA_SCOPES[type ?? ''] ?? []}
        />
      </Section>

        {/* ── Section: Figma Styles ────────────────────────────────────── */}
        <Section
          title="Figma Styles"
          open={openSections.has('figma-styles')}
          onToggle={() => toggleSection('figma-styles')}
          badge={
            styleSync.checked && styleSync.rows.length === 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
              : styleSync.rows.length > 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{styleSync.rows.length} differ</span>
                : null
          }
        >
          <SyncSubPanel
            sync={styleSync}
            activeSet={activeSet}
            diffFilter={diffFilter}
            onRequestConfirm={(action) => setConfirmAction(action as ConfirmAction)}
            onRevert={styleSync.revert}
            description="Sync color, text, and effect styles between local tokens and Figma styles."
            sectionLabel="Style differences"
            previewAction="preview-styles"
            applyAction="apply-styles"
            inSyncMessage="Local tokens match Figma styles."
            notCheckedMessage={<>Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which color, text, and effect styles differ.</>}
            revertDescription="Restore Figma styles to their pre-sync state"
          />
        </Section>

        {/* ── Section: Git ─────────────────────────────────────────────── */}
        <div id="publish-section-git">
        <Section
          title="Advanced Git workflow"
          open={openSections.has('git')}
          onToggle={() => toggleSection('git')}
          badge={
            git.gitLoading ? null :
            !git.gitStatus?.isRepo ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] font-medium border border-[var(--color-figma-border)]">No repo</span> :
            git.mergeConflicts.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] font-medium">{git.mergeConflicts.length} conflict{git.mergeConflicts.length !== 1 ? 's' : ''}</span> :
            git.allChanges.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{git.allChanges.length} unsaved</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Up to date</span>
          }
        >
          <div className="mx-3 mt-3 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            Use this only when repository sync belongs in the same workflow as your Figma changes. Variables and styles can be synced to Figma without touching Git.
          </div>

          {git.gitError && (
            <div role="alert" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
              {git.gitError}
            </div>
          )}

          {git.gitLoading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
              <Spinner size="md" className="text-[var(--color-figma-accent)]" />
              Loading Git status...
            </div>
          )}

          {!git.gitLoading && !git.gitStatus?.isRepo && (
            <div className="flex flex-col items-center justify-center py-6 gap-4 px-6">
              <p className="text-[12px] text-[var(--color-figma-text-secondary)]">No Git repository initialized</p>
              <div className="w-full flex flex-col gap-2">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote URL (optional)</label>
                <input
                  type="text"
                  value={git.remoteUrl}
                  onChange={e => git.setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                  className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:focus-visible:border-[var(--color-figma-accent)]"
                />
              </div>
              <button
                onClick={() => git.doAction('init', git.remoteUrl ? { remoteUrl: git.remoteUrl } : undefined)}
                disabled={git.actionLoading !== null}
                className="w-full px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >
                {git.actionLoading === 'init' ? 'Initializing\u2026' : 'Initialize Repository'}
              </button>
            </div>
          )}

          {!git.gitLoading && git.gitStatus?.isRepo && (
            <GitSubPanel
              git={git}
              diffFilter={diffFilter}
              onRequestConfirm={setConfirmAction}
            />
          )}
        </Section>
        </div>
      </div>
    </div>

    {/* ── Confirmation modals ── */}
    {confirmAction === 'preview-vars' && (
      <SyncPreviewModal
        title="Variable sync preview"
        rows={varSync.rows}
        dirs={varSync.dirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'preview-styles' && (
      <SyncPreviewModal
        title="Style sync preview"
        rows={styleSync.rows}
        dirs={styleSync.dirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'apply-vars' && (
      <SyncPreviewModal
        title="Apply variable sync"
        rows={varSync.rows}
        dirs={varSync.dirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await varSync.applyDiff();
          setChecksStale(true);
        }}
        confirmLabel={`Apply ${varSync.syncCount} change${varSync.syncCount !== 1 ? 's' : ''}`}
      />
    )}

    {confirmAction === 'apply-styles' && (
      <SyncPreviewModal
        title="Apply style sync"
        rows={styleSync.rows}
        dirs={styleSync.dirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await styleSync.applyDiff();
          setChecksStale(true);
        }}
        confirmLabel={`Apply ${styleSync.syncCount} change${styleSync.syncCount !== 1 ? 's' : ''}`}
      />
    )}

    {confirmAction === 'git-pull' && (
      <GitPreviewModal
        title="Pull from remote"
        subtitle="Incoming changes from remote — nothing has been applied yet."
        confirmLabel="Pull"
        preview={git.pullPreview}
        loading={git.pullPreviewLoading}
        fetchPreview={git.fetchPullPreview}
        onCancel={() => { setConfirmAction(null); git.clearPullPreview(); }}
        onConfirm={async () => {
          setConfirmAction(null);
          git.clearPullPreview();
          await git.doAction('pull');
        }}
      />
    )}

    {confirmAction === 'git-push' && (
      <GitPreviewModal
        title={`Push to remote${git.gitStatus?.branch ? ` (${git.gitStatus.branch})` : ''}`}
        subtitle="Outgoing changes — nothing has been pushed yet."
        confirmLabel="Push"
        preview={git.pushPreview}
        loading={git.pushPreviewLoading}
        fetchPreview={git.fetchPushPreview}
        onCancel={() => { setConfirmAction(null); git.clearPushPreview(); }}
        onConfirm={async () => {
          setConfirmAction(null);
          git.clearPushPreview();
          await git.doAction('push');
        }}
      />
    )}

    {confirmAction === 'git-commit' && (
      <CommitPreviewModal
        selectedFiles={[...git.selectedFiles]}
        allChanges={git.allChanges}
        commitMsg={git.commitMsg}
        tokenPreview={git.tokenPreview}
        tokenPreviewLoading={git.tokenPreviewLoading}
        fetchTokenPreview={git.fetchTokenPreview}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await git.doAction('commit', { message: git.commitMsg, files: [...git.selectedFiles] });
          git.setCommitMsg('');
        }}
      />
    )}

    {confirmAction === 'apply-diff' && (
      <ApplyDiffConfirmModal
        diffChoices={git.diffChoices}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await git.applyDiff();
          setChecksStale(true);
        }}
      />
    )}

    {confirmAction === 'publish-all' && (
      <PublishAllPreviewModal
        hasVarChanges={hasVarChanges}
        hasStyleChanges={hasStyleChanges}
        hasGitDiffChanges={effectiveHasGitDiffChanges}
        varRows={varSync.rows}
        varDirs={varSync.dirs}
        varPushCount={varSync.pushCount}
        varPullCount={varSync.pullCount}
        styleRows={styleSync.rows}
        styleDirs={styleSync.dirs}
        stylePushCount={styleSync.pushCount}
        stylePullCount={styleSync.pullCount}
        gitDiffChoices={git.diffChoices}
        mergeConflictCount={git.mergeConflicts.length}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async (sections) => {
          setConfirmAction(null);
          await runPublishAll(sections);
        }}
      />
    )}
    {orphanConfirm && (
      <ConfirmModal
        title={`Delete ${orphanConfirm.orphanPaths.length} orphan variable${orphanConfirm.orphanPaths.length !== 1 ? 's' : ''}?`}
        description="These Figma variables have no matching token in the local token set. Deletion is permanent and may break references in other design files."
        confirmLabel="Delete"
        danger
        wide
        onCancel={() => setOrphanConfirm(null)}
        onConfirm={executeOrphanDeletion}
      >
        <div className="mt-2 max-h-[160px] overflow-y-auto rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {orphanConfirm.orphanPaths.map(p => (
            <div key={p} className="px-3 py-1 text-[10px] font-mono text-[var(--color-figma-text)] border-b border-[var(--color-figma-border)] last:border-b-0 truncate" title={p}>
              {p}
            </div>
          ))}
        </div>
      </ConfirmModal>
    )}
    </>
  );
}

/* ── Shared types ───────────────────────────────────────────────────────── */

interface PreviewRow {
  path: string;
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
}

/* ── SyncDiffSummary (used inside apply confirm modals) ──────────────── */

function SyncDiffSummary({ rows, dirs }: {
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
}) {
  const pushRows = rows.filter(r => dirs[r.path] === 'push');
  const pullRows = rows.filter(r => dirs[r.path] === 'pull');
  const skipCount = rows.filter(r => dirs[r.path] === 'skip').length;

  const sections: { label: string; arrow: string; items: PreviewRow[]; direction: 'push' | 'pull' }[] = [];
  if (pushRows.length > 0) sections.push({ label: 'Push to Figma', arrow: '\u2191', items: pushRows, direction: 'push' });
  if (pullRows.length > 0) sections.push({ label: 'Pull to local', arrow: '\u2193', items: pullRows, direction: 'pull' });

  if (sections.length === 0) {
    return <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)]">No changes to apply (all skipped).</p>;
  }

  return (
    <div className="mt-2">
      {sections.map(section => (
        <div key={section.label} className="mb-2">
          <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
            {section.arrow} {section.label} ({section.items.length})
          </div>
          <div className="max-h-36 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
            {section.items.map(r => {
              const isColor = r.localType === 'color' || r.figmaType === 'color';
              const beforeVal = section.direction === 'push' ? r.figmaValue : r.localValue;
              const afterVal = section.direction === 'push' ? r.localValue : r.figmaValue;
              return (
                <div key={r.path} className="px-2 py-1">
                  <div className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</div>
                  {r.cat === 'conflict' && (
                    <div className="flex flex-col gap-0.5 mt-0.5 ml-1 text-[10px] font-mono">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                        {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                        <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeVal ?? ''}>{truncateValue(beforeVal ?? '', 36)}</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                        {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                        <span className="text-[var(--color-figma-text)] truncate" title={afterVal ?? ''}>{truncateValue(afterVal ?? '', 36)}</span>
                      </div>
                    </div>
                  )}
                  {r.cat !== 'conflict' && (r.localValue ?? r.figmaValue) !== undefined && (
                    <div className="flex items-center gap-1 mt-0.5 ml-1 text-[10px] font-mono min-w-0">
                      {isColor && isHexColor(r.localValue ?? r.figmaValue) && <DiffSwatch hex={(r.localValue ?? r.figmaValue)!} />}
                      <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue ?? r.figmaValue}>{truncateValue((r.localValue ?? r.figmaValue) ?? '', 36)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {skipCount > 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">{skipCount} item{skipCount !== 1 ? 's' : ''} skipped.</p>
      )}
    </div>
  );
}

/* ── SyncPreviewModal ───────────────────────────────────────────────────── */

function SyncPreviewModal({
  title,
  rows,
  dirs,
  onClose,
  onConfirm,
  confirmLabel,
}: {
  title: string;
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const pushAdds = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'local-only');
  const pushUpdates = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'conflict');
  const pullAdds = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'figma-only');
  const pullUpdates = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'conflict');
  const deletesFromFigma = rows.filter(r => dirs[r.path] === 'pull' && r.cat === 'local-only');
  const deletesFromLocal = rows.filter(r => dirs[r.path] === 'push' && r.cat === 'figma-only');
  const skipped = rows.filter(r => dirs[r.path] === 'skip');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const sections: { label: string; badge: string; rows: PreviewRow[]; color: string }[] = [
    { label: 'Add to Figma', badge: '+', rows: pushAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in Figma', badge: '~', rows: pushUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from Figma', badge: '-', rows: deletesFromLocal, color: 'var(--color-figma-error)' },
    { label: 'Add to local', badge: '+', rows: pullAdds, color: 'var(--color-figma-success)' },
    { label: 'Update in local', badge: '~', rows: pullUpdates, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Remove from local', badge: '-', rows: deletesFromFigma, color: 'var(--color-figma-error)' },
    { label: 'Skipped', badge: '·', rows: skipped, color: 'var(--color-figma-text-tertiary)' },
  ].filter(s => s.rows.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="preview-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            {onConfirm ? 'Review changes before applying.' : 'Dry run \u2014 no changes will be written.'}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {sections.length === 0 ? (
            <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">Nothing to sync — all items skipped.</p>
          ) : (
            sections.map(section => (
              <div key={section.label} className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded"
                    style={{ color: section.color }}
                  >
                    {section.badge}
                  </span>
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                    {section.label} ({section.rows.length})
                  </span>
                </div>
                <div className="ml-5 space-y-0">
                  {section.rows.map(r => {
                    const valStr = (v: string | undefined) => v ?? '';
                    const isColor = r.localType === 'color' || r.figmaType === 'color';
                    // Determine before/after based on section direction
                    const isPush = section.label.includes('Figma');
                    const beforeVal = isPush ? r.figmaValue : r.localValue;
                    const afterVal = isPush ? r.localValue : r.figmaValue;
                    return (
                      <div key={r.path} className="py-1 border-b border-[var(--color-figma-border)] last:border-b-0">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={r.path}>{r.path}</span>
                        </div>
                        {r.cat === 'conflict' && (
                          <div className="ml-2 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                              {isColor && isHexColor(beforeVal) && <DiffSwatch hex={beforeVal} />}
                              <span className="text-[var(--color-figma-text-secondary)] truncate" title={valStr(beforeVal)}>{truncateValue(valStr(beforeVal), 40)}</span>
                            </div>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                              {isColor && isHexColor(afterVal) && <DiffSwatch hex={afterVal} />}
                              <span className="text-[var(--color-figma-text)] truncate" title={valStr(afterVal)}>{truncateValue(valStr(afterVal), 40)}</span>
                            </div>
                          </div>
                        )}
                        {r.cat === 'local-only' && r.localValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.localValue) && <DiffSwatch hex={r.localValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.localValue}>{truncateValue(r.localValue, 40)}</span>
                          </div>
                        )}
                        {r.cat === 'figma-only' && r.figmaValue !== undefined && (
                          <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                            {isColor && isHexColor(r.figmaValue) && <DiffSwatch hex={r.figmaValue} />}
                            <span className="text-[var(--color-figma-text-secondary)] truncate" title={r.figmaValue}>{truncateValue(r.figmaValue, 40)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          {onConfirm ? (
            <>
              <button
                onClick={onClose}
                disabled={busy}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  try { await onConfirm(); } finally { setBusy(false); }
                }}
                disabled={busy || sections.length === 0}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {busy && <Spinner size="sm" className="text-white" />}
                {busy ? 'Applying\u2026' : (confirmLabel ?? 'Apply')}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── GitPreviewModal (push / pull dry-run) ─────────────────────────────── */

function GitPreviewModal({
  title,
  subtitle,
  confirmLabel,
  preview,
  loading,
  fetchPreview,
  onCancel,
  onConfirm,
}: {
  title: string;
  subtitle: string;
  confirmLabel: string;
  preview: import('../hooks/useGitDiff').GitPreview | null;
  loading: boolean;
  fetchPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  // Group changes by set name, preserving order of first appearance
  const bySet = useMemo(() => {
    if (!preview?.changes) return [] as Array<{
      set: string;
      added: import('../hooks/useGitDiff').TokenChange[];
      modified: import('../hooks/useGitDiff').TokenChange[];
      removed: import('../hooks/useGitDiff').TokenChange[];
    }>;
    const map = new Map<string, {
      added: import('../hooks/useGitDiff').TokenChange[];
      modified: import('../hooks/useGitDiff').TokenChange[];
      removed: import('../hooks/useGitDiff').TokenChange[];
    }>();
    for (const c of preview.changes) {
      if (!map.has(c.set)) map.set(c.set, { added: [], modified: [], removed: [] });
      const entry = map.get(c.set)!;
      if (c.status === 'added') entry.added.push(c);
      else if (c.status === 'modified') entry.modified.push(c);
      else entry.removed.push(c);
    }
    return [...map.entries()].map(([set, v]) => ({ set, ...v }));
  }, [preview?.changes]);

  const totalAdded = bySet.reduce((n, s) => n + s.added.length, 0);
  const totalModified = bySet.reduce((n, s) => n + s.modified.length, 0);
  const totalRemoved = bySet.reduce((n, s) => n + s.removed.length, 0);

  const toggleSet = (set: string) => {
    setExpandedSets(prev => {
      const next = new Set(prev);
      if (next.has(set)) next.delete(set); else next.add(set);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">{title}</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">{subtitle}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {loading && (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Fetching preview…</span>
            </div>
          )}

          {!loading && preview && (
            <>
              {/* Commits */}
              {preview.commits.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
                    {preview.commits.length} commit{preview.commits.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-0.5">
                    {preview.commits.map(c => (
                      <div key={c.hash} className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] shrink-0">{c.hash.slice(0, 7)}</span>
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate">{c.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Token changes — set-level summary with expandable per-token detail */}
              {bySet.length === 0 && preview.commits.length === 0 ? (
                <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">No changes to {confirmLabel.toLowerCase()}.</p>
              ) : bySet.length === 0 ? (
                <p className="py-2 text-[10px] text-[var(--color-figma-text-secondary)]">No token-level changes (non-token files only).</p>
              ) : (
                <>
                  {/* Totals bar */}
                  <div className="flex items-center gap-3 mb-2 text-[10px]">
                    {totalAdded > 0 && <span style={{ color: 'var(--color-figma-success)' }}>+{totalAdded} added</span>}
                    {totalModified > 0 && <span style={{ color: 'var(--color-figma-warning, #e5a000)' }}>~{totalModified} modified</span>}
                    {totalRemoved > 0 && <span style={{ color: 'var(--color-figma-error)' }}>&minus;{totalRemoved} removed</span>}
                    <span className="text-[var(--color-figma-text-secondary)] ml-auto">{bySet.length} set{bySet.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Per-set rows */}
                  <div className="space-y-px">
                    {bySet.map(({ set, added, modified, removed }) => {
                      const isExpanded = expandedSets.has(set);
                      const allChanges = [...added, ...modified, ...removed];
                      return (
                        <div key={set} className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                          <button
                            className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                            onClick={() => toggleSet(set)}
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`text-[var(--color-figma-text-tertiary)] shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 truncate">{set}</span>
                            <span className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                              {added.length > 0 && <span style={{ color: 'var(--color-figma-success)' }}>+{added.length}</span>}
                              {modified.length > 0 && <span style={{ color: 'var(--color-figma-warning, #e5a000)' }}>~{modified.length}</span>}
                              {removed.length > 0 && <span style={{ color: 'var(--color-figma-error)' }}>&minus;{removed.length}</span>}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] divide-y divide-[var(--color-figma-border)]">
                              {allChanges.map(change => {
                                const isColor = change.type === 'color';
                                const valStr = (v: any): string => typeof v === 'string' ? v : JSON.stringify(v);
                                const beforeStr = change.before != null ? valStr(change.before) : undefined;
                                const afterStr = change.after != null ? valStr(change.after) : undefined;
                                const statusColor = change.status === 'added'
                                  ? 'var(--color-figma-success)'
                                  : change.status === 'removed'
                                  ? 'var(--color-figma-error)'
                                  : 'var(--color-figma-warning, #e5a000)';
                                const statusBadge = change.status === 'added' ? '+' : change.status === 'removed' ? '\u2212' : '~';
                                return (
                                  <div key={change.path} className="px-3 py-1">
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-[9px] font-bold w-3 shrink-0" style={{ color: statusColor }}>{statusBadge}</span>
                                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>{change.path}</span>
                                    </div>
                                    {change.status === 'modified' && (
                                      <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                                          {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
                                          <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr ?? '', 40)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                                          {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
                                          <span className="text-[var(--color-figma-text)] truncate" title={afterStr}>{truncateValue(afterStr ?? '', 40)}</span>
                                        </div>
                                      </div>
                                    )}
                                    {change.status === 'added' && afterStr !== undefined && (
                                      <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                        {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
                                        <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterStr}>{truncateValue(afterStr, 40)}</span>
                                      </div>
                                    )}
                                    {change.status === 'removed' && beforeStr !== undefined && (
                                      <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                        {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
                                        <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr, 40)}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── CommitPreviewModal ─────────────────────────────────────────────────── */

function CommitPreviewModal({
  selectedFiles,
  allChanges,
  commitMsg,
  tokenPreview,
  tokenPreviewLoading,
  fetchTokenPreview,
  onCancel,
  onConfirm,
}: {
  selectedFiles: string[];
  allChanges: { file: string; status: string }[];
  commitMsg: string;
  tokenPreview: import('../hooks/useGitDiff').TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Auto-fetch token preview on mount if not already loaded
  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading) {
      fetchTokenPreview();
    }
  }, [tokenPreview, tokenPreviewLoading, fetchTokenPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const selectedSet = new Set(selectedFiles);
  const stagedChanges = allChanges.filter(c => selectedSet.has(c.file));
  const skippedCount = allChanges.length - stagedChanges.length;

  // Filter token preview to only show changes from selected files
  const relevantTokenChanges = useMemo(() => {
    if (!tokenPreview) return [];
    const selectedSetNames = new Set(selectedFiles.map(f => f.replace('.tokens.json', '')));
    return tokenPreview.filter(c => selectedSetNames.has(c.set));
  }, [tokenPreview, selectedFiles]);

  // Group token changes by file
  const changesByFile = useMemo(() => {
    const map = new Map<string, import('../hooks/useGitDiff').TokenChange[]>();
    for (const tc of relevantTokenChanges) {
      const fileName = tc.set + '.tokens.json';
      const arr = map.get(fileName);
      if (arr) arr.push(tc);
      else map.set(fileName, [tc]);
    }
    return map;
  }, [relevantTokenChanges]);

  const totalAdded = relevantTokenChanges.filter(c => c.status === 'added').length;
  const totalModified = relevantTokenChanges.filter(c => c.status === 'modified').length;
  const totalRemoved = relevantTokenChanges.filter(c => c.status === 'removed').length;

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Commit changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review what will be committed before proceeding.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {/* Commit message */}
          <div className="mb-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
            <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5">Message</div>
            <div className="text-[11px] text-[var(--color-figma-text)] font-medium">{commitMsg}</div>
          </div>

          {/* File list with per-file token changes */}
          <div className="mb-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1 flex items-center justify-between">
              <span>
                {stagedChanges.length} file{stagedChanges.length !== 1 ? 's' : ''} to commit
                {skippedCount > 0 && <span className="text-[var(--color-figma-text-tertiary)]"> ({skippedCount} skipped)</span>}
              </span>
              {!tokenPreviewLoading && relevantTokenChanges.length > 0 && (
                <span className="flex gap-1.5 text-[9px] font-mono">
                  {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded}</span>}
                  {totalModified > 0 && <span className="text-[var(--color-figma-warning)]">~{totalModified}</span>}
                  {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">&minus;{totalRemoved}</span>}
                </span>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {tokenPreviewLoading && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Loading token changes\u2026</span>
                </div>
              )}
              {stagedChanges.map((change, i) => {
                const fileTokenChanges = changesByFile.get(change.file) ?? [];
                const hasTokenChanges = fileTokenChanges.length > 0;
                const isExpanded = expandedFiles.has(change.file);
                const addedCount = fileTokenChanges.filter(c => c.status === 'added').length;
                const modifiedCount = fileTokenChanges.filter(c => c.status === 'modified').length;
                const removedCount = fileTokenChanges.filter(c => c.status === 'removed').length;

                return (
                  <div key={i}>
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1 ${hasTokenChanges ? 'cursor-pointer hover:bg-[var(--color-figma-bg-hover)]' : ''}`}
                      onClick={() => hasTokenChanges && toggleExpand(change.file)}
                    >
                      {/* Expand chevron */}
                      <span className={`w-3 h-3 flex items-center justify-center shrink-0 ${hasTokenChanges ? '' : 'opacity-0'}`}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}>
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </span>
                      <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${
                        change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                        change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                        change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                        'text-[var(--color-figma-text-secondary)]'
                      }`}>
                        {change.status}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0">{change.file}</span>
                      {/* Per-file token counts */}
                      {hasTokenChanges && (
                        <span className="flex gap-1.5 text-[9px] font-mono shrink-0">
                          {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                          {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                          {removedCount > 0 && <span className="text-[var(--color-figma-error)]">&minus;{removedCount}</span>}
                        </span>
                      )}
                    </div>
                    {isExpanded && hasTokenChanges && (
                      <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                        {fileTokenChanges.map((tc, j) => (
                          <TokenChangeRow key={j} change={tc} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!tokenPreviewLoading && tokenPreview !== null && relevantTokenChanges.length === 0 && stagedChanges.some(c => c.file.endsWith('.tokens.json')) && (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1 flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              No token value changes detected (formatting or metadata only).
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? 'Committing\u2026' : `Commit ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PublishAllPreviewModal ─────────────────────────────────────────────── */

function PublishAllPreviewModal({
  hasVarChanges,
  hasStyleChanges,
  hasGitDiffChanges,
  varRows,
  varDirs,
  varPushCount,
  varPullCount,
  styleRows,
  styleDirs,
  stylePushCount,
  stylePullCount,
  gitDiffChoices,
  mergeConflictCount,
  onCancel,
  onConfirm,
}: {
  hasVarChanges: boolean;
  hasStyleChanges: boolean;
  hasGitDiffChanges: boolean;
  varRows: PreviewRow[];
  varDirs: Record<string, 'push' | 'pull' | 'skip'>;
  varPushCount: number;
  varPullCount: number;
  styleRows: PreviewRow[];
  styleDirs: Record<string, 'push' | 'pull' | 'skip'>;
  stylePushCount: number;
  stylePullCount: number;
  gitDiffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  mergeConflictCount: number;
  onCancel: () => void;
  onConfirm: (sections: PublishAllSections) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [includeVars, setIncludeVars] = useState(hasVarChanges);
  const [includeStyles, setIncludeStyles] = useState(hasStyleChanges);
  const [includeGit, setIncludeGit] = useState(hasGitDiffChanges);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const gitPushCount = Object.values(gitDiffChoices).filter(c => c === 'push').length;
  const gitPullCount = Object.values(gitDiffChoices).filter(c => c === 'pull').length;
  const hasAnyChanges = hasVarChanges || hasStyleChanges || hasGitDiffChanges;
  const hasOnlyGitChanges = !hasVarChanges && !hasStyleChanges && hasGitDiffChanges;
  const anySelected = (includeVars && hasVarChanges) || (includeStyles && hasStyleChanges) || (includeGit && hasGitDiffChanges);

  const handleConfirm = async () => {
    setBusy(true);
    setConfirmError(null);
    try { await onConfirm({ vars: includeVars, styles: includeStyles, git: includeGit }); } catch (err) { setConfirmError(describeError(err)); setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div ref={dialogRef} className="w-[400px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true" aria-labelledby="publish-all-modal-title">
        <div className="px-4 pt-4 pb-2">
          <h3 id="publish-all-modal-title" className="text-[12px] font-semibold text-[var(--color-figma-text)]">
            {mergeConflictCount > 0 ? 'Review Figma sync' : 'Review sync destinations'}
          </h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review each destination before you sync it.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-3">
          {mergeConflictCount > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-[var(--color-figma-text-secondary)]">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Git excluded — <span className="font-medium text-[var(--color-figma-text)]">{mergeConflictCount} merge conflict{mergeConflictCount !== 1 ? 's' : ''}</span> must be resolved in the advanced Git workflow first.
              </div>
            </div>
          )}

          {/* All in sync — shown when auto-compare found no pending changes */}
          {!hasAnyChanges && (
            <div className="py-3 text-[10px] text-[var(--color-figma-text-secondary)] text-center">
              Everything is already in sync — nothing to apply.
            </div>
          )}

          {/* Variables section */}
          {hasVarChanges && (
            <div className={includeVars ? '' : 'opacity-50'}>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeVars}
                  onChange={e => setIncludeVars(e.target.checked)}
                  className="w-3 h-3 accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Variables</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    varPushCount > 0 ? `\u2191 ${varPushCount} to Figma` : null,
                    varPullCount > 0 ? `\u2193 ${varPullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </label>
              <SyncDiffSummary rows={varRows} dirs={varDirs} />
            </div>
          )}

          {/* Styles section */}
          {hasStyleChanges && (
            <div className={includeStyles ? '' : 'opacity-50'}>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeStyles}
                  onChange={e => setIncludeStyles(e.target.checked)}
                  className="w-3 h-3 accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Styles</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    stylePushCount > 0 ? `\u2191 ${stylePushCount} to Figma` : null,
                    stylePullCount > 0 ? `\u2193 ${stylePullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </label>
              <SyncDiffSummary rows={styleRows} dirs={styleDirs} />
            </div>
          )}

          {/* Git section */}
          {hasGitDiffChanges && (
            <div className={includeGit ? '' : 'opacity-50'}>
              <label className="flex items-center gap-1.5 mb-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeGit}
                  onChange={e => setIncludeGit(e.target.checked)}
                  className="w-3 h-3 accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Advanced Git workflow</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    gitPushCount > 0 ? `\u2191 ${gitPushCount} file${gitPushCount !== 1 ? 's' : ''} to remote` : null,
                    gitPullCount > 0 ? `\u2193 ${gitPullCount} file${gitPullCount !== 1 ? 's' : ''} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </label>
              {(() => {
                const pushFiles = Object.entries(gitDiffChoices).filter(([, c]) => c === 'push').map(([f]) => f);
                const pullFiles = Object.entries(gitDiffChoices).filter(([, c]) => c === 'pull').map(([f]) => f);
                const sections: { arrow: string; label: string; files: string[] }[] = [];
                if (pushFiles.length > 0) sections.push({ arrow: '\u2191', label: 'Push to remote', files: pushFiles });
                if (pullFiles.length > 0) sections.push({ arrow: '\u2193', label: 'Pull to local', files: pullFiles });
                return sections.map(section => (
                  <div key={section.label} className="mb-2">
                    <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
                      {section.arrow} {section.label} ({section.files.length})
                    </div>
                    <div className="max-h-24 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
                      {section.files.map(f => (
                        <div key={f} className="px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={f}>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {confirmError && (
          <p className="px-4 pb-2 text-[10px] text-[var(--color-figma-error)] break-words" role="alert">{confirmError}</p>
        )}
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)] flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Cancel
          </button>
          {hasAnyChanges ? (
            <button
              onClick={handleConfirm}
              disabled={busy || !anySelected}
              title={!anySelected ? 'Select at least one destination to sync' : undefined}
              className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {busy && <Spinner size="sm" className="text-white" />}
              {busy ? 'Applying\u2026' : !anySelected ? 'Nothing selected' : hasOnlyGitChanges ? 'Apply Git changes' : mergeConflictCount > 0 ? 'Sync without Git' : 'Sync selected'}
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Section accordion ───────────────────────────────────────────────────── */

function Section({ title, open, onToggle, badge, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-figma-border)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-medium text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
            <path d="M2 1l4 3-4 3V1z" />
          </svg>
          {title}
        </span>
        {badge}
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

/* ── Display helpers ─────────────────────────────────────────────────────── */

function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

function isHexColor(v: string | undefined): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v);
}

function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}

/* ── Inline token change row ────────────────────────────────────────────── */

function TokenChangeRow({ change }: { change: import('../hooks/useGitDiff').TokenChange }) {
  const statusColor =
    change.status === 'added' ? 'text-[var(--color-figma-success)]' :
    change.status === 'removed' ? 'text-[var(--color-figma-error)]' :
    'text-[var(--color-figma-warning)]';
  const statusChar = change.status === 'added' ? '+' : change.status === 'removed' ? '\u2212' : '~';
  const valStr = (v: any) => typeof v === 'string' ? v : JSON.stringify(v);
  const isColor = change.type === 'color';
  const beforeStr = change.before != null ? valStr(change.before) : undefined;
  const afterStr = change.after != null ? valStr(change.after) : undefined;

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${statusColor}`}>{statusChar}</span>
        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>{change.path}</span>
      </div>
      {change.status === 'modified' && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
            {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
            <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr ?? '', 40)}</span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
            {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
            <span className="text-[var(--color-figma-text)] truncate" title={afterStr}>{truncateValue(afterStr ?? '', 40)}</span>
          </div>
        </div>
      )}
      {change.status === 'added' && afterStr !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
          <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterStr}>{truncateValue(afterStr, 40)}</span>
        </div>
      )}
      {change.status === 'removed' && beforeStr !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
          <span className="text-[var(--color-figma-text-secondary)] line-through truncate" title={beforeStr}>{truncateValue(beforeStr, 40)}</span>
        </div>
      )}
    </div>
  );
}
