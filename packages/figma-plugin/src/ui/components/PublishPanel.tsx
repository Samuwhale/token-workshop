import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { swatchBgColor } from '../shared/colorUtils';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { useVariableSync } from '../hooks/useVariableSync';
import type { VarDiffRow } from '../hooks/useVariableSync';
import { useStyleSync } from '../hooks/useStyleSync';
import { useGitSync } from '../hooks/useGitSync';
import type { GitStatus } from '../hooks/useGitSync';
import { ConfirmModal } from './ConfirmModal';
import { apiFetch } from '../shared/apiFetch';
import { formatRelativeTime, Section } from '../shared/changeHelpers';

type ConfirmAction = 'apply-vars' | 'apply-styles' | 'preview-vars' | 'preview-styles' | 'git-push' | 'git-pull' | 'apply-diff' | 'publish-all' | null;

type PublishAllStep = 'variables' | 'styles' | 'git' | null;

/* ── Interfaces ──────────────────────────────────────────────────────────── */

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
}

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  count?: number;
  detail?: string;
  fixLabel?: string;
  onFix?: () => void;
}

/* ── Constants & helpers ─────────────────────────────────────────────────── */

function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({ serverUrl, connected, activeSet, collectionMap = {}, modeMap = {} }: PublishPanelProps) {
  // ── Section collapse ──
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['figma-variables', 'git']));
  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Extracted hooks ──
  const varSync = useVariableSync({ serverUrl, connected, activeSet, collectionMap, modeMap });
  const styleSync = useStyleSync({ serverUrl, activeSet });
  const git = useGitSync({ serverUrl, connected });

  // ── Diff filter state ──
  const [diffFilter, setDiffFilter] = useState('');

  // ── Readiness state ──
  const [readinessChecks, setReadinessChecks] = useState<ReadinessCheck[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [orphansDeleting, setOrphansDeleting] = useState(false);
  const orphansPendingRef = useRef<Map<string, (count: number) => void>>(new Map());

  // ── Confirmation modal state ──
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  // ── Publish-all state ──
  const [publishAllStep, setPublishAllStep] = useState<PublishAllStep>(null);
  const [publishAllError, setPublishAllError] = useState<string | null>(null);

  // ── Orphan deletion message handler ──
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'orphans-deleted' && msg.correlationId) {
        const resolve = orphansPendingRef.current.get(msg.correlationId);
        if (resolve) {
          orphansPendingRef.current.delete(msg.correlationId);
          resolve(msg.count ?? 0);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  /* ── Publish-all pending counts ─────────────────────────────────────── */

  const hasVarChanges = varSync.varChecked && varSync.varSyncCount > 0;
  const hasStyleChanges = styleSync.styleChecked && styleSync.styleSyncCount > 0;
  const gitDiffPendingCount = useMemo(
    () => Object.values(git.diffChoices).filter(c => c !== 'skip').length,
    [git.diffChoices],
  );
  const hasGitDiffChanges = git.diffView != null && gitDiffPendingCount > 0;
  const publishAllSections = (hasVarChanges ? 1 : 0) + (hasStyleChanges ? 1 : 0) + (hasGitDiffChanges ? 1 : 0);
  const publishAllAvailable = publishAllSections >= 2;
  const publishAllBusy = publishAllStep !== null;

  const runPublishAll = useCallback(async () => {
    setPublishAllError(null);
    try {
      if (hasVarChanges) {
        setPublishAllStep('variables');
        await varSync.applyVarDiff();
      }
      if (hasStyleChanges) {
        setPublishAllStep('styles');
        await styleSync.applyStyleDiff();
      }
      if (hasGitDiffChanges) {
        setPublishAllStep('git');
        await git.applyDiff();
      }
    } catch (err) {
      setPublishAllError(describeError(err));
    } finally {
      setPublishAllStep(null);
    }
  }, [hasVarChanges, hasStyleChanges, hasGitDiffChanges, varSync, styleSync, git]);

  /* ── Readiness callbacks ───────────────────────────────────────────────── */

  const runReadinessChecks = useCallback(async () => {
    if (!activeSet) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const figmaTokens = await varSync.readFigmaVariables();

      const data = await apiFetch<{ tokens?: Record<string, any> }>(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      const localTokens = flattenTokenGroup(data.tokens || {});
      const localFlat = Array.from(localTokens, ([path, token]) => ({
        path, value: String(token.$value), type: String(token.$type ?? 'string'),
      }));

      const figmaMap = new Map<string, any>(figmaTokens.map(t => [t.path, t]));
      const localPaths = new Set(localTokens.keys());

      const missingInFigma = localFlat.filter(t => !figmaMap.has(t.path));
      const missingScopes = figmaTokens.filter(t =>
        !t.$scopes || t.$scopes.length === 0 || (t.$scopes.length === 1 && t.$scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = figmaTokens.filter(t => !t.$description);
      const orphans = figmaTokens.filter(t => !localPaths.has(t.path));

      const checks: ReadinessCheck[] = [
        {
          id: 'all-vars',
          label: 'All tokens have Figma variables',
          status: missingInFigma.length === 0 ? 'pass' : 'fail',
          count: missingInFigma.length || undefined,
          fixLabel: missingInFigma.length > 0 ? `Push ${missingInFigma.length} missing` : undefined,
          onFix: missingInFigma.length > 0 ? () => {
            const tokens = missingInFigma.map(t => ({ path: t.path, $type: t.type, $value: t.value, setName: activeSet }));
            parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
          } : undefined,
        },
        {
          id: 'scopes',
          label: 'Scopes set for every variable',
          status: missingScopes.length === 0 ? 'pass' : 'fail',
          count: missingScopes.length || undefined,
          detail: missingScopes.length > 0 ? 'Open Figma Variables panel \u2192 select each variable \u2192 set scopes to limit where it can be applied.' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Descriptions populated',
          status: missingDescriptions.length === 0 ? 'pass' : 'fail',
          count: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0 ? 'Add $description fields to tokens in the token editor, then re-sync to Figma.' : undefined,
        },
        {
          id: 'orphans',
          label: 'No orphan Figma variables',
          status: orphans.length === 0 ? 'pass' : 'fail',
          count: orphans.length || undefined,
          fixLabel: orphans.length > 0 ? `Delete ${orphans.length} orphan${orphans.length !== 1 ? 's' : ''}` : undefined,
          onFix: orphans.length > 0 ? async () => {
            setOrphansDeleting(true);
            setReadinessError(null);
            const MAX_RETRIES = 2;
            const TIMEOUTS = [10000, 20000, 30000]; // escalating timeouts per attempt
            let succeeded = false;
            for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
              try {
                await new Promise<number>((resolve, reject) => {
                  const cid = `orphans-${Date.now()}-${Math.random()}`;
                  const timeout = setTimeout(() => { orphansPendingRef.current.delete(cid); reject(new Error('Timeout')); }, TIMEOUTS[attempt]);
                  orphansPendingRef.current.set(cid, (count) => { clearTimeout(timeout); resolve(count); });
                  parent.postMessage({ pluginMessage: { type: 'delete-orphan-variables', knownPaths: [...localPaths], collectionMap, correlationId: cid } }, '*');
                });
                succeeded = true;
                break;
              } catch (err) {
                const isTimeout = err instanceof Error && err.message === 'Timeout';
                if (!isTimeout) {
                  // Non-timeout error — surface immediately, don't retry
                  setOrphansDeleting(false);
                  setReadinessError(describeError(err, 'Orphan deletion'));
                  return;
                }
                // Timeout — retry with longer timeout on next attempt
              }
            }
            setOrphansDeleting(false);
            if (succeeded) {
              runReadinessChecks();
            } else {
              setReadinessError('Orphan deletion timed out after multiple attempts — the plugin did not respond. Click the button to try again.');
            }
          } : undefined,
        },
      ];
      setReadinessChecks(checks);
    } catch (err) {
      setReadinessError(describeError(err, 'Readiness checks'));
    } finally {
      setReadinessLoading(false);
    }
  }, [serverUrl, activeSet, varSync.readFigmaVariables, collectionMap, modeMap]);


  /* ── Computed values ───────────────────────────────────────────────────── */

  const readinessFails = readinessChecks.filter(c => c.status === 'fail').length;
  const readinessPasses = readinessChecks.filter(c => c.status === 'pass').length;

  /* ── Not connected ─────────────────────────────────────────────────────── */

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to publish tokens
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <>
    <div className="flex flex-col h-full">
      {/* ── Pre-publish readiness gate ──────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              readinessLoading ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' :
              readinessFails === 0 && readinessPasses > 0 ? 'bg-[var(--color-figma-success)]' :
              readinessFails > 0 ? 'bg-[var(--color-figma-error)]' :
              'bg-[var(--color-figma-border)]'
            }`} />
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Publish Readiness</span>
            {readinessFails > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] font-medium">{readinessFails} issue{readinessFails !== 1 ? 's' : ''}</span>
            )}
            {readinessFails === 0 && readinessPasses > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Ready</span>
            )}
          </div>
          <button
            onClick={runReadinessChecks}
            disabled={readinessLoading || !activeSet}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            {readinessLoading ? 'Checking\u2026' : readinessChecks.length > 0 ? 'Re-check' : 'Run checks'}
          </button>
        </div>

        {readinessError && (
          <div role="alert" className="mt-1.5 text-[10px] text-[var(--color-figma-error)]">{readinessError}</div>
        )}

        {readinessChecks.length > 0 && (
          <div className="mt-2 divide-y divide-[var(--color-figma-border)] rounded border border-[var(--color-figma-border)] overflow-hidden">
            {readinessChecks.map(check => (
              <div key={check.id} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-figma-bg)]">
                <span className={`shrink-0 ${check.status === 'pass' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
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
                  <div className="text-[10px] text-[var(--color-figma-text)]">{check.label}</div>
                  {check.count !== undefined && check.status === 'fail' && (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)]">{check.count} affected</div>
                  )}
                  {check.detail && check.status === 'fail' && (
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">{check.detail}</div>
                  )}
                </div>
                {check.fixLabel && check.onFix && (
                  <button
                    onClick={check.onFix}
                    disabled={orphansDeleting}
                    className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 shrink-0 disabled:opacity-40"
                  >
                    {orphansDeleting && check.id === 'orphans' ? 'Deleting\u2026' : check.fixLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readinessLoading && readinessChecks.length === 0 && !readinessError && (
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Click <strong className="font-medium text-[var(--color-figma-text)]">Run checks</strong> to validate before publishing.
          </div>
        )}
      </div>

      {/* ── Scrollable sections ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* ── All-synced banner ─────────────────────────────────────────── */}
        {varSync.varChecked && varSync.varRows.length === 0 &&
         styleSync.styleChecked && styleSync.styleRows.length === 0 &&
         !git.gitLoading && git.gitStatus?.isRepo && git.mergeConflicts.length === 0 && git.allChanges.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-5 px-4 rounded-lg bg-[var(--color-figma-success)]/10 border border-[var(--color-figma-success)]/25">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[12px] font-semibold text-[var(--color-figma-success)]">Everything is synced</span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] text-center">
              Figma variables, styles, and Git are all up to date.
            </span>
          </div>
        )}

        {/* ── Publish all ───────────────────────────────────────────────── */}
        {(publishAllAvailable || publishAllBusy) && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 p-3">
            {publishAllBusy ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin shrink-0 text-[var(--color-figma-accent)]" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="22 10" />
                </svg>
                <span className="text-[10px] text-[var(--color-figma-text)] font-medium">
                  {publishAllStep === 'variables' && 'Applying variable changes\u2026'}
                  {publishAllStep === 'styles' && 'Applying style changes\u2026'}
                  {publishAllStep === 'git' && 'Applying git diff changes\u2026'}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Publish all</span>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {[
                      hasVarChanges ? `${varSync.varSyncCount} variable${varSync.varSyncCount !== 1 ? 's' : ''}` : null,
                      hasStyleChanges ? `${styleSync.styleSyncCount} style${styleSync.styleSyncCount !== 1 ? 's' : ''}` : null,
                      hasGitDiffChanges ? `${gitDiffPendingCount} file${gitDiffPendingCount !== 1 ? 's' : ''}` : null,
                    ].filter(Boolean).join(', ')}
                  </span>
                </div>
                <button
                  onClick={() => setConfirmAction('publish-all')}
                  className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  Publish all
                </button>
              </div>
            )}
          </div>
        )}

        {publishAllError && (
          <div role="alert" className="text-[10px] text-[var(--color-figma-error)] px-1">
            Publish all failed: {publishAllError}
          </div>
        )}

        {/* ── Section: Figma Variables ──────────────────────────────────── */}
        <Section
          title="Figma Variables"
          open={openSections.has('figma-variables')}
          onToggle={() => toggleSection('figma-variables')}
          badge={
            varSync.varChecked && varSync.varRows.length === 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
              : varSync.varRows.length > 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varSync.varRows.length} differ</span>
                : null
          }
        >
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2">
            Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back.
          </div>

          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Token differences</span>
            <button
              onClick={varSync.computeVarDiff}
              disabled={varSync.varLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {varSync.varLoading ? 'Checking\u2026' : varSync.varChecked ? 'Re-check' : 'Compare'}
            </button>
          </div>

          {varSync.varError && (
            <div role="alert" className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{varSync.varError}</div>
          )}

          {varSync.varRows.length > 0 && (() => {
            const localOnly = varSync.varRows.filter(r => r.cat === 'local-only');
            const figmaOnly = varSync.varRows.filter(r => r.cat === 'figma-only');
            const conflicts = varSync.varRows.filter(r => r.cat === 'conflict');

            return (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
                  {(['push', 'pull', 'skip'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => varSync.setVarDirs(Object.fromEntries(varSync.varRows.map(r => [r.path, action])))}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                    >
                      {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-[var(--color-figma-border)] max-h-52 overflow-y-auto">
                  {localOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                    </div>
                  )}
                  {localOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'push'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {figmaOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                    </div>
                  )}
                  {figmaOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'pull'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {conflicts.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                      {conflicts.length > 1 && (
                        <span className="flex items-center gap-1">
                          {(['push', 'pull', 'skip'] as const).map(action => (
                            <button
                              key={action}
                              onClick={() => varSync.setVarDirs(prev => {
                                const next = { ...prev };
                                for (const r of conflicts) next[r.path] = action;
                                return next;
                              })}
                              className="text-[9px] px-1 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                            >
                              {action === 'push' ? '\u2191 Push' : action === 'pull' ? '\u2193 Pull' : 'Skip'} all
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                  {conflicts.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varSync.varDirs[row.path] ?? 'push'} onChange={d => varSync.setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                </div>

                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {varSync.varSyncCount === 0
                      ? 'Nothing to apply \u2014 all skipped'
                      : [
                          varSync.varPushCount > 0 ? `\u2191 ${varSync.varPushCount} to Figma` : null,
                          varSync.varPullCount > 0 ? `\u2193 ${varSync.varPullCount} to local` : null,
                        ].filter(Boolean).join(' \u00b7 ')
                    }
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => setConfirmAction('preview-vars')}
                      disabled={varSync.varSyncCount === 0}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setConfirmAction('apply-vars')}
                      disabled={varSync.varSyncing || varSync.varSyncCount === 0}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {varSync.varSyncing
                        ? (varSync.varProgress
                          ? `Syncing ${varSync.varProgress.current} / ${varSync.varProgress.total}\u2026`
                          : 'Syncing\u2026')
                        : `Apply ${varSync.varSyncCount > 0 ? varSync.varSyncCount + ' change' + (varSync.varSyncCount !== 1 ? 's' : '') : ''}`}
                    </button>
                  </span>
                </div>
              </>
            );
          })()}

          {!varSync.varLoading && !varSync.varError && (
            varSync.varChecked && varSync.varRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Local tokens match Figma variables.
              </div>
            ) : !varSync.varChecked && varSync.varRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.
              </div>
            ) : null
          )}
        </Section>

        {/* ── Section: Figma Styles ────────────────────────────────────── */}
        <Section
          title="Figma Styles"
          open={openSections.has('figma-styles')}
          onToggle={() => toggleSection('figma-styles')}
          badge={
            styleSync.styleChecked && styleSync.styleRows.length === 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
              : styleSync.styleRows.length > 0
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{styleSync.styleRows.length} differ</span>
                : null
          }
        >
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2">
            Sync color, text, and effect styles between local tokens and Figma styles.
          </div>

          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Style differences</span>
            <button
              onClick={styleSync.computeStyleDiff}
              disabled={styleSync.styleLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {styleSync.styleLoading ? 'Checking\u2026' : styleSync.styleChecked ? 'Re-check' : 'Compare'}
            </button>
          </div>

          {styleSync.styleError && (
            <div role="alert" className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{styleSync.styleError}</div>
          )}

          {styleSync.styleRows.length > 0 && (() => {
            const localOnly = styleSync.styleRows.filter(r => r.cat === 'local-only');
            const figmaOnly = styleSync.styleRows.filter(r => r.cat === 'figma-only');
            const conflicts = styleSync.styleRows.filter(r => r.cat === 'conflict');

            return (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
                  {(['push', 'pull', 'skip'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => styleSync.setStyleDirs(Object.fromEntries(styleSync.styleRows.map(r => [r.path, action])))}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                    >
                      {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-[var(--color-figma-border)] max-h-52 overflow-y-auto">
                  {localOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                    </div>
                  )}
                  {localOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleSync.styleDirs[row.path] ?? 'push'} onChange={d => styleSync.setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {figmaOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                    </div>
                  )}
                  {figmaOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleSync.styleDirs[row.path] ?? 'pull'} onChange={d => styleSync.setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {conflicts.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                      <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                      {conflicts.length > 1 && (
                        <span className="flex items-center gap-1">
                          {(['push', 'pull', 'skip'] as const).map(action => (
                            <button
                              key={action}
                              onClick={() => styleSync.setStyleDirs(prev => {
                                const next = { ...prev };
                                for (const r of conflicts) next[r.path] = action;
                                return next;
                              })}
                              className="text-[9px] px-1 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
                            >
                              {action === 'push' ? '\u2191 Push' : action === 'pull' ? '\u2193 Pull' : 'Skip'} all
                            </button>
                          ))}
                        </span>
                      )}
                    </div>
                  )}
                  {conflicts.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleSync.styleDirs[row.path] ?? 'push'} onChange={d => styleSync.setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                </div>

                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                    {styleSync.styleSyncCount === 0
                      ? 'Nothing to apply \u2014 all skipped'
                      : [
                          styleSync.stylePushCount > 0 ? `\u2191 ${styleSync.stylePushCount} to Figma` : null,
                          styleSync.stylePullCount > 0 ? `\u2193 ${styleSync.stylePullCount} to local` : null,
                        ].filter(Boolean).join(' \u00b7 ')
                    }
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={() => setConfirmAction('preview-styles')}
                      disabled={styleSync.styleSyncCount === 0}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] font-medium hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setConfirmAction('apply-styles')}
                      disabled={styleSync.styleSyncing || styleSync.styleSyncCount === 0}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {styleSync.styleSyncing
                        ? (styleSync.styleProgress
                          ? `Syncing ${styleSync.styleProgress.current} / ${styleSync.styleProgress.total}\u2026`
                          : 'Syncing\u2026')
                        : `Apply ${styleSync.styleSyncCount > 0 ? styleSync.styleSyncCount + ' change' + (styleSync.styleSyncCount !== 1 ? 's' : '') : ''}`}
                    </button>
                  </span>
                </div>
              </>
            );
          })()}

          {!styleSync.styleLoading && !styleSync.styleError && (
            styleSync.styleChecked && styleSync.styleRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Local tokens match Figma styles.
              </div>
            ) : !styleSync.styleChecked && styleSync.styleRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which color, text, and effect styles differ.
              </div>
            ) : null
          )}
        </Section>

        {/* ── Section: Git ─────────────────────────────────────────────── */}
        <Section
          title="Git"
          open={openSections.has('git')}
          onToggle={() => toggleSection('git')}
          badge={
            git.gitLoading ? null :
            !git.gitStatus?.isRepo ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] font-medium border border-[var(--color-figma-border)]">No repo</span> :
            git.mergeConflicts.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)] font-medium">{git.mergeConflicts.length} conflict{git.mergeConflicts.length !== 1 ? 's' : ''}</span> :
            git.allChanges.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{git.allChanges.length} uncommitted</span>
              : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Clean</span>
          }
        >
          {git.gitError && (
            <div role="alert" className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
              {git.gitError}
            </div>
          )}

          {git.gitLoading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
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
                  className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
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
            <div className="p-3 flex flex-col gap-2">
              {/* Branch */}
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 01-9 9" />
                    </svg>
                    <span className="text-[11px] font-medium truncate max-w-[140px]" title={git.gitStatus.branch || 'main'}>{git.gitStatus.branch || 'main'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${git.allChanges.length > 0 ? 'text-yellow-600' : 'text-[var(--color-figma-success)]'}`}>
                      {git.allChanges.length > 0 ? `${git.allChanges.length} change${git.allChanges.length !== 1 ? 's' : ''}` : 'Clean'}
                    </span>
                    <button
                      onClick={() => { git.setGitLoading(true); git.fetchStatus(); }}
                      disabled={git.gitLoading}
                      title="Refresh git status"
                      aria-label="Refresh git status"
                      className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-40"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={git.gitLoading ? 'animate-spin' : ''}>
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {git.branches.length > 1 && (
                  <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
                    <select
                      value={git.gitStatus.branch || ''}
                      onChange={e => git.doAction('checkout', { branch: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none"
                    >
                      {git.branches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Merge conflict resolver */}
              {git.mergeConflicts.length > 0 && (
                <div className="rounded border-2 border-[var(--color-figma-warning)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-warning)]/15 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      <span className="text-[11px] font-semibold text-[var(--color-figma-warning)]">
                        Merge conflicts ({git.mergeConflicts.length} file{git.mergeConflicts.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <button
                      onClick={git.abortMerge}
                      disabled={git.actionLoading === 'abort'}
                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 transition-colors"
                    >
                      {git.actionLoading === 'abort' ? 'Aborting\u2026' : 'Abort merge'}
                    </button>
                  </div>
                  <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
                    <span>For each conflict region, choose which version to keep: <strong className="text-[var(--color-figma-text)]">Ours</strong> (local) or <strong className="text-[var(--color-figma-text)]">Theirs</strong> (remote).</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {(['ours', 'theirs'] as const).map(side => (
                        <button
                          key={side}
                          onClick={() => git.setConflictChoices(() => {
                            const next: Record<string, Record<number, 'ours' | 'theirs'>> = {};
                            for (const c of git.mergeConflicts) {
                              next[c.file] = {};
                              for (const r of c.regions) next[c.file][r.index] = side;
                            }
                            return next;
                          })}
                          className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                            side === 'ours'
                              ? 'border-[var(--color-figma-success)]/40 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/10'
                              : 'border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10'
                          }`}
                        >
                          All {side}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                    {git.mergeConflicts.map((conflict) => (
                      <div key={conflict.file} className="flex flex-col">
                        <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center gap-1.5">
                          <span className="text-[10px] font-mono font-bold text-[var(--color-figma-warning)]">!</span>
                          <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={conflict.file}>{conflict.file}</span>
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto shrink-0">{conflict.regions.length} conflict{conflict.regions.length !== 1 ? 's' : ''}</span>
                        </div>
                        {conflict.regions.map((region) => {
                          const choice = git.conflictChoices[conflict.file]?.[region.index] ?? 'theirs';
                          return (
                            <div key={region.index} className="border-t border-[var(--color-figma-border)]">
                              <div className="flex">
                                {/* Ours */}
                                <button
                                  onClick={() => git.setConflictChoices(prev => ({
                                    ...prev,
                                    [conflict.file]: { ...prev[conflict.file], [region.index]: 'ours' },
                                  }))}
                                  className={`flex-1 text-left px-2 py-1 border-r border-[var(--color-figma-border)] transition-colors ${
                                    choice === 'ours'
                                      ? 'bg-[var(--color-figma-success)]/10'
                                      : 'bg-[var(--color-figma-bg)] opacity-50 hover:opacity-75'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-[10px] font-semibold ${choice === 'ours' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-secondary)]'}`}>Ours (local)</span>
                                    {choice === 'ours' && (
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                                    )}
                                  </div>
                                  <pre className="text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre-wrap break-all max-h-16 overflow-y-auto leading-tight">{region.ours || '(empty)'}</pre>
                                </button>
                                {/* Theirs */}
                                <button
                                  onClick={() => git.setConflictChoices(prev => ({
                                    ...prev,
                                    [conflict.file]: { ...prev[conflict.file], [region.index]: 'theirs' },
                                  }))}
                                  className={`flex-1 text-left px-2 py-1 transition-colors ${
                                    choice === 'theirs'
                                      ? 'bg-[var(--color-figma-accent)]/10'
                                      : 'bg-[var(--color-figma-bg)] opacity-50 hover:opacity-75'
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-[10px] font-semibold ${choice === 'theirs' ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'}`}>Theirs (remote)</span>
                                    {choice === 'theirs' && (
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                                    )}
                                  </div>
                                  <pre className="text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre-wrap break-all max-h-16 overflow-y-auto leading-tight">{region.theirs || '(empty)'}</pre>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                      {git.mergeConflicts.reduce((sum, c) => sum + c.regions.length, 0)} region{git.mergeConflicts.reduce((sum, c) => sum + c.regions.length, 0) !== 1 ? 's' : ''} to resolve
                    </span>
                    <button
                      onClick={git.resolveConflicts}
                      disabled={git.resolvingConflicts}
                      className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {git.resolvingConflicts ? 'Resolving\u2026' : 'Resolve all conflicts'}
                    </button>
                  </div>
                </div>
              )}

              {/* Changed files */}
              {git.allChanges.length > 0 && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium flex items-center justify-between">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={git.allChanges.length > 0 && git.selectedFiles.size === git.allChanges.length}
                        ref={el => { if (el) el.indeterminate = git.selectedFiles.size > 0 && git.selectedFiles.size < git.allChanges.length; }}
                        onChange={e => {
                          if (e.target.checked) {
                            git.setSelectedFiles(new Set(git.allChanges.map(c => c.file)));
                          } else {
                            git.setSelectedFiles(new Set());
                          }
                        }}
                        className="w-3 h-3"
                      />
                      Uncommitted changes
                    </label>
                    <span className="text-[10px] opacity-60">{git.selectedFiles.size}/{git.allChanges.length} selected</span>
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                    {git.allChanges.map((change, i) => (
                      <label key={i} className="flex items-center gap-2 px-3 py-1 cursor-pointer hover:bg-[var(--color-figma-bg-hover)]">
                        <input
                          type="checkbox"
                          checked={git.selectedFiles.has(change.file)}
                          onChange={e => {
                            git.setSelectedFiles(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(change.file); else next.delete(change.file);
                              return next;
                            });
                          }}
                          className="w-3 h-3 flex-shrink-0"
                        />
                        <span className={`text-[10px] font-mono font-bold w-3 flex-shrink-0 ${
                          change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                          change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                          change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                          'text-[var(--color-figma-text-secondary)]'
                        }`}>
                          {change.status}
                        </span>
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate">{change.file}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Token-level preview of uncommitted changes */}
              {git.allChanges.length > 0 && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                    <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Token-level preview</span>
                    <button
                      onClick={git.tokenPreview !== null ? git.clearTokenPreview : git.fetchTokenPreview}
                      disabled={git.tokenPreviewLoading}
                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      {git.tokenPreviewLoading ? 'Loading\u2026' : git.tokenPreview !== null ? 'Hide preview' : 'Preview changes'}
                    </button>
                  </div>
                  {git.tokenPreview !== null && (() => {
                    const changes = git.tokenPreview;
                    if (changes.length === 0) {
                      return (
                        <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          No token value changes detected.
                        </div>
                      );
                    }
                    const added = changes.filter(c => c.status === 'added');
                    const modified = changes.filter(c => c.status === 'modified');
                    const removed = changes.filter(c => c.status === 'removed');
                    return (
                      <>
                        <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex gap-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                          {added.length > 0 && <span className="text-[var(--color-figma-success)]">+{added.length} added</span>}
                          {modified.length > 0 && <span className="text-[var(--color-figma-warning)]">~{modified.length} modified</span>}
                          {removed.length > 0 && <span className="text-[var(--color-figma-error)]">-{removed.length} removed</span>}
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                          {changes.map((change, i) => {
                            const statusColor =
                              change.status === 'added' ? 'text-[var(--color-figma-success)]' :
                              change.status === 'removed' ? 'text-[var(--color-figma-error)]' :
                              'text-[var(--color-figma-warning)]';
                            const statusChar = change.status === 'added' ? '+' : change.status === 'removed' ? '\u2212' : '~';
                            const valStr = (v: any) => typeof v === 'string' ? v : JSON.stringify(v);
                            return (
                              <div key={i} className="px-3 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${statusColor}`}>{statusChar}</span>
                                  <span className="text-[10px] text-[var(--color-figma-text)] font-medium truncate" title={change.path}>{change.path}</span>
                                  <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0 ml-auto">{change.set}</span>
                                </div>
                                {change.status === 'modified' && (
                                  <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
                                    <div className="flex items-start gap-1">
                                      <span className="text-[var(--color-figma-error)] shrink-0 w-3">&minus;</span>
                                      <span className="text-[var(--color-figma-text-secondary)] break-all">{valStr(change.before)}</span>
                                    </div>
                                    <div className="flex items-start gap-1">
                                      <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
                                      <span className="text-[var(--color-figma-text)] break-all">{valStr(change.after)}</span>
                                    </div>
                                  </div>
                                )}
                                {change.status === 'added' && change.after !== undefined && (
                                  <div className="ml-4 mt-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] break-all">
                                    {valStr(change.after)}
                                  </div>
                                )}
                                {change.status === 'removed' && change.before !== undefined && (
                                  <div className="ml-4 mt-0.5 text-[10px] font-mono text-[var(--color-figma-text-secondary)] line-through break-all">
                                    {valStr(change.before)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                  {!git.tokenPreviewLoading && git.tokenPreview === null && (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                      Click <strong className="font-medium text-[var(--color-figma-text)]">Preview changes</strong> to see token-level additions, modifications, and deletions before committing.
                    </div>
                  )}
                </div>
              )}

              {/* Commit */}
              {!git.gitStatus.status?.isClean && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                    Commit message
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <input
                      type="text"
                      value={git.commitMsg}
                      onChange={e => git.setCommitMsg(e.target.value)}
                      placeholder="Describe your changes\u2026"
                      aria-label="Commit message"
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && git.commitMsg.trim() && git.selectedFiles.size > 0) git.doAction('commit', { message: git.commitMsg, files: [...git.selectedFiles] }).then(() => git.setCommitMsg(''));
                      }}
                    />
                    <button
                      onClick={() => git.doAction('commit', { message: git.commitMsg, files: [...git.selectedFiles] }).then(() => git.setCommitMsg(''))}
                      disabled={!git.commitMsg.trim() || git.selectedFiles.size === 0 || git.actionLoading !== null}
                      className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {git.actionLoading === 'commit' ? 'Committing\u2026' : `Commit ${git.selectedFiles.size === git.allChanges.length ? 'all' : git.selectedFiles.size} file${git.selectedFiles.size === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </div>
              )}

              {/* Remote URL */}
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                  Remote URL
                </div>
                <div className="px-3 py-2 flex gap-2">
                  <input
                    type="text"
                    value={git.remoteUrl}
                    onChange={e => git.setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    aria-label="Remote URL"
                    className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                  />
                  <button
                    onClick={() => git.doAction('remote', { url: git.remoteUrl })}
                    disabled={!git.remoteUrl || git.actionLoading !== null}
                    className="px-2 py-1 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-border)] disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Remote diff */}
              {git.gitStatus?.remote && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote differences</span>
                      {git.diffView && git.diffView.localOnly.length + git.diffView.remoteOnly.length + git.diffView.conflicts.length === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                      )}
                    </div>
                    <button
                      onClick={git.computeDiff}
                      disabled={git.diffLoading}
                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      {git.diffLoading ? 'Computing\u2026' : git.diffView ? 'Re-check' : 'Compare'}
                    </button>
                  </div>
                  {git.diffView && (() => {
                    const allFiles = [
                      ...git.diffView.localOnly.map(f => ({ file: f, cat: 'local' as const })),
                      ...git.diffView.remoteOnly.map(f => ({ file: f, cat: 'remote' as const })),
                      ...git.diffView.conflicts.map(f => ({ file: f, cat: 'conflict' as const })),
                    ];
                    if (allFiles.length === 0) {
                      return (
                        <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Local and remote are in sync.
                        </div>
                      );
                    }
                    const filterLower = diffFilter.toLowerCase();
                    const filteredFiles = filterLower
                      ? allFiles.filter(({ file }) => file.toLowerCase().includes(filterLower))
                      : allFiles;
                    const pendingCount = Object.values(git.diffChoices).filter(c => c !== 'skip').length;
                    return (
                      <>
                        {allFiles.length >= 5 && (
                          <div className="px-3 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                            <div className="relative">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                              <input
                                type="text"
                                value={diffFilter}
                                onChange={e => setDiffFilter(e.target.value)}
                                placeholder="Filter files…"
                                aria-label="Filter files"
                                className="w-full pl-6 pr-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
                              />
                              {diffFilter && (
                                <button
                                  onClick={() => setDiffFilter('')}
                                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                                  aria-label="Clear filter"
                                >
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            {diffFilter && (
                              <div className="text-[10px] text-[var(--color-figma-text-secondary)] mt-1">
                                {filteredFiles.length} of {allFiles.length} file{allFiles.length !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                          {filteredFiles.map(({ file, cat }) => {
                            const choice = git.diffChoices[file] ?? 'skip';
                            const catLabel = cat === 'local' ? 'Local only' : cat === 'remote' ? 'Remote only' : 'Values differ';
                            const catColor = cat === 'local' ? 'text-[var(--color-figma-success)]' : cat === 'remote' ? 'text-[var(--color-figma-accent)]' : 'text-yellow-600';
                            return (
                              <div key={file} className="flex items-center gap-2 px-3 py-1.5">
                                <span className={`text-[10px] font-medium shrink-0 w-20 ${catColor}`}>{catLabel}</span>
                                <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={file}>{file}</span>
                                <select
                                  value={choice}
                                  onChange={e => git.setDiffChoices(prev => ({ ...prev, [file]: e.target.value as 'push' | 'pull' | 'skip' }))}
                                  className="text-[10px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5"
                                >
                                  <option value="push">{'\u2191'} Push</option>
                                  <option value="pull">{'\u2193'} Pull</option>
                                  <option value="skip">Skip</option>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                            {pendingCount > 0 ? `${pendingCount} file${pendingCount !== 1 ? 's' : ''} will be updated` : 'All skipped'}
                          </span>
                          <button
                            onClick={() => setConfirmAction('apply-diff')}
                            disabled={git.applyingDiff || pendingCount === 0}
                            className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                          >
                            {git.applyingDiff ? 'Applying\u2026' : `Apply ${pendingCount > 0 ? pendingCount + ' change' + (pendingCount !== 1 ? 's' : '') : ''}`}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                  {!git.diffLoading && !git.diffView && (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                      Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which files differ between local and remote.
                    </div>
                  )}
                </div>
              )}

              {/* Push / Pull */}
              {git.gitStatus?.remote && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmAction('git-pull')}
                      disabled={git.actionLoading !== null}
                      className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      {git.actionLoading === 'pull' ? 'Pulling\u2026' : '\u2193 Pull'}
                    </button>
                    <button
                      onClick={() => setConfirmAction('git-push')}
                      disabled={git.actionLoading !== null}
                      className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {git.actionLoading === 'push' ? 'Pushing\u2026' : '\u2191 Push'}
                    </button>
                  </div>
                  {git.lastSynced && (
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-right">
                      Last synced: {formatRelativeTime(git.lastSynced)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>
      </div>
    </div>

    {/* ── Confirmation modals ── */}
    {confirmAction === 'preview-vars' && (
      <SyncPreviewModal
        title="Variable sync preview"
        rows={varSync.varRows}
        dirs={varSync.varDirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'preview-styles' && (
      <SyncPreviewModal
        title="Style sync preview"
        rows={styleSync.styleRows}
        dirs={styleSync.styleDirs}
        onClose={() => setConfirmAction(null)}
      />
    )}

    {confirmAction === 'apply-vars' && (
      <ConfirmModal
        title="Apply variable sync?"
        confirmLabel="Apply"
        wide
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await varSync.applyVarDiff();
        }}
      >
        <SyncDiffSummary rows={varSync.varRows} dirs={varSync.varDirs} />
      </ConfirmModal>
    )}

    {confirmAction === 'apply-styles' && (
      <ConfirmModal
        title="Apply style sync?"
        confirmLabel="Apply"
        wide
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await styleSync.applyStyleDiff();
        }}
      >
        <SyncDiffSummary rows={styleSync.styleRows} dirs={styleSync.styleDirs} />
      </ConfirmModal>
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

    {confirmAction === 'apply-diff' && (
      <ConfirmModal
        title="Apply file diff?"
        confirmLabel="Apply"
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await git.applyDiff();
        }}
      >
        <p className="mt-1.5 text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
          {(() => {
            const pushCount = Object.values(git.diffChoices).filter(c => c === 'push').length;
            const pullCount = Object.values(git.diffChoices).filter(c => c === 'pull').length;
            return [
              pushCount > 0 ? `↑ ${pushCount} file${pushCount !== 1 ? 's' : ''} pushed to remote` : null,
              pullCount > 0 ? `↓ ${pullCount} file${pullCount !== 1 ? 's' : ''} pulled to local` : null,
            ].filter(Boolean).join(', ');
          })()}
          . This will overwrite the target files.
        </p>
      </ConfirmModal>
    )}

    {confirmAction === 'publish-all' && (
      <ConfirmModal
        title="Publish all changes?"
        confirmLabel="Publish all"
        wide
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await runPublishAll();
        }}
      >
        <div className="flex flex-col gap-1.5 mt-1">
          {hasVarChanges && (
            <div className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              <strong className="font-medium text-[var(--color-figma-text)]">Variables:</strong>{' '}
              {[
                varSync.varPushCount > 0 ? `${varSync.varPushCount} pushed to Figma` : null,
                varSync.varPullCount > 0 ? `${varSync.varPullCount} pulled to local` : null,
              ].filter(Boolean).join(', ')}
            </div>
          )}
          {hasStyleChanges && (
            <div className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              <strong className="font-medium text-[var(--color-figma-text)]">Styles:</strong>{' '}
              {[
                styleSync.stylePushCount > 0 ? `${styleSync.stylePushCount} pushed to Figma` : null,
                styleSync.stylePullCount > 0 ? `${styleSync.stylePullCount} pulled to local` : null,
              ].filter(Boolean).join(', ')}
            </div>
          )}
          {hasGitDiffChanges && (
            <div className="text-[11px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              <strong className="font-medium text-[var(--color-figma-text)]">Git:</strong>{' '}
              {(() => {
                const pushCount = Object.values(git.diffChoices).filter(c => c === 'push').length;
                const pullCount = Object.values(git.diffChoices).filter(c => c === 'pull').length;
                return [
                  pushCount > 0 ? `${pushCount} file${pushCount !== 1 ? 's' : ''} pushed` : null,
                  pullCount > 0 ? `${pullCount} file${pullCount !== 1 ? 's' : ''} pulled` : null,
                ].filter(Boolean).join(', ');
              })()}
            </div>
          )}
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
}: {
  title: string;
  rows: PreviewRow[];
  dirs: Record<string, 'push' | 'pull' | 'skip'>;
  onClose: () => void;
}) {
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
            Dry run — no changes will be written.
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
        <div className="px-4 pb-4 pt-2 border-t border-[var(--color-figma-border)]">
          <button
            onClick={onClose}
            className="w-full px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Close
          </button>
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

  useEffect(() => {
    fetchPreview();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const added = preview?.changes.filter(c => c.status === 'added') ?? [];
  const modified = preview?.changes.filter(c => c.status === 'modified') ?? [];
  const removed = preview?.changes.filter(c => c.status === 'removed') ?? [];

  const sections: { label: string; badge: string; items: typeof added; color: string }[] = [
    { label: 'Added', badge: '+', items: added, color: 'var(--color-figma-success)' },
    { label: 'Modified', badge: '~', items: modified, color: 'var(--color-figma-warning, #e5a000)' },
    { label: 'Removed', badge: '\u2212', items: removed, color: 'var(--color-figma-error)' },
  ].filter(s => s.items.length > 0);

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
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-figma-text-secondary)]/30 border-t-[var(--color-figma-text-secondary)] animate-spin" />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Fetching preview…</span>
            </div>
          )}

          {!loading && preview && (
            <>
              {/* Commits */}
              {preview.commits.length > 0 && (
                <div className="mb-2">
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

              {/* Token changes */}
              {sections.length === 0 && preview.commits.length === 0 ? (
                <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">No changes to {confirmLabel.toLowerCase()}.</p>
              ) : sections.length === 0 ? (
                <p className="py-2 text-[10px] text-[var(--color-figma-text-secondary)]">No token-level changes (non-token files only).</p>
              ) : (
                sections.map(section => (
                  <div key={section.label} className="mb-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-bold w-3.5 h-3.5 flex items-center justify-center rounded" style={{ color: section.color }}>
                        {section.badge}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
                        {section.label} ({section.items.length})
                      </span>
                    </div>
                    <div className="ml-5 space-y-0">
                      {section.items.map(change => {
                        const isColor = change.type === 'color';
                        const beforeStr = change.before != null ? (typeof change.before === 'string' ? change.before : JSON.stringify(change.before)) : undefined;
                        const afterStr = change.after != null ? (typeof change.after === 'string' ? change.after : JSON.stringify(change.after)) : undefined;
                        return (
                          <div key={`${change.set}.${change.path}`} className="py-1 border-b border-[var(--color-figma-border)] last:border-b-0">
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={`${change.set} / ${change.path}`}>
                                {change.path}
                              </span>
                              <span className="text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0">{change.set}</span>
                            </div>
                            {change.status === 'modified' && (
                              <div className="ml-2 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
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
                              <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                {isColor && isHexColor(afterStr) && <DiffSwatch hex={afterStr} />}
                                <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterStr}>{truncateValue(afterStr, 40)}</span>
                              </div>
                            )}
                            {change.status === 'removed' && beforeStr !== undefined && (
                              <div className="ml-2 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
                                {isColor && isHexColor(beforeStr) && <DiffSwatch hex={beforeStr} />}
                                <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeStr}>{truncateValue(beforeStr, 40)}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
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
            {busy && <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" aria-hidden="true" />}
            {busy ? `${confirmLabel}…` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── VarDiffRowItem ──────────────────────────────────────────────────────── */

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

function ValueCell({ label, value, type }: { label: string; value: string | undefined; type: string | undefined }) {
  const v = value ?? '';
  const showSwatch = (type === 'color' || isHexColor(v)) && isHexColor(v);
  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] shrink-0">{label}</span>
      {showSwatch && <DiffSwatch hex={v} />}
      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={v}>{truncateValue(v)}</span>
    </div>
  );
}

function VarDiffRowItem({ row, dir, onChange }: {
  row: VarDiffRow;
  dir: 'push' | 'pull' | 'skip';
  onChange: (dir: 'push' | 'pull' | 'skip') => void;
}) {
  return (
    <div className="px-3 py-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={row.path}>{row.path}</span>
        <select
          value={dir}
          onChange={e => onChange(e.target.value as 'push' | 'pull' | 'skip')}
          className="text-[10px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5 shrink-0"
        >
          <option value="push">{'\u2191'} Push to Figma</option>
          <option value="pull">{'\u2193'} Pull to local</option>
          <option value="skip">Skip</option>
        </select>
      </div>
      {row.cat === 'conflict' && (
        <div className="flex items-center gap-1.5 pl-0.5">
          <ValueCell label="Local" value={row.localValue} type={row.localType} />
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="shrink-0 text-[var(--color-figma-text-tertiary)]" aria-hidden="true">
            <path d="M1 4h6M5 2l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <ValueCell label="Figma" value={row.figmaValue} type={row.figmaType} />
        </div>
      )}
      {row.cat === 'local-only' && row.localValue !== undefined && (
        <div className="flex items-center gap-1 pl-0.5">
          {(row.localType === 'color' || isHexColor(row.localValue)) && isHexColor(row.localValue) && <DiffSwatch hex={row.localValue} />}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.localValue)}</span>
        </div>
      )}
      {row.cat === 'figma-only' && row.figmaValue !== undefined && (
        <div className="flex items-center gap-1 pl-0.5">
          {(row.figmaType === 'color' || isHexColor(row.figmaValue)) && isHexColor(row.figmaValue) && <DiffSwatch hex={row.figmaValue} />}
          <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.figmaValue)}</span>
        </div>
      )}
    </div>
  );
}
