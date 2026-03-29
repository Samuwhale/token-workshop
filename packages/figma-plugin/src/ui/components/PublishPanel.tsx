import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Spinner } from './Spinner';
import { flattenTokenGroup } from '@tokenmanager/core';
import { describeError } from '../shared/utils';
import { useVariableSync } from '../hooks/useVariableSync';
import { useStyleSync } from '../hooks/useStyleSync';
import { useGitSync } from '../hooks/useGitSync';
import { apiFetch } from '../shared/apiFetch';
import { VariableSyncSubPanel } from './publish/VariableSyncSubPanel';
import { StyleSyncSubPanel } from './publish/StyleSyncSubPanel';
import { GitSubPanel } from './publish/GitSubPanel';
import {
  SyncPreviewModal,
  GitPreviewModal,
  CommitPreviewModal,
  PublishAllPreviewModal,
  ApplyDiffConfirmModal,
} from './publish/PublishModals';

/* ── Types ───────────────────────────────────────────────────────────────── */

type PublishSubTab = 'variables' | 'styles' | 'git';

type ConfirmAction = 'apply-vars' | 'apply-styles' | 'preview-vars' | 'preview-styles' | 'git-push' | 'git-pull' | 'git-commit' | 'apply-diff' | 'publish-all' | null;

type PublishAllStep = 'variables' | 'styles' | 'git' | null;

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

const SUB_TAB_KEY = 'tm_publish_subtab';

const SUB_TABS: { id: PublishSubTab; label: string }[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'styles', label: 'Styles' },
  { id: 'git', label: 'Git' },
];

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({ serverUrl, connected, activeSet, collectionMap = {}, modeMap = {} }: PublishPanelProps) {
  // ── Sub-tab navigation ──
  const [activeSubTab, setActiveSubTab] = useState<PublishSubTab>(() => {
    const stored = localStorage.getItem(SUB_TAB_KEY);
    return (stored === 'variables' || stored === 'styles' || stored === 'git') ? stored : 'variables';
  });

  const setSubTab = (tab: PublishSubTab) => {
    setActiveSubTab(tab);
    localStorage.setItem(SUB_TAB_KEY, tab);
  };

  // ── Extracted hooks ──
  const varSync = useVariableSync({ serverUrl, connected, activeSet, collectionMap, modeMap });
  const styleSync = useStyleSync({ serverUrl, activeSet });
  const git = useGitSync({ serverUrl, connected });

  // ── Shared diff filter ──
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
  const hasMergeConflicts = git.mergeConflicts.length > 0;
  const publishAllSections = (hasVarChanges ? 1 : 0) + (hasStyleChanges ? 1 : 0) + (hasGitDiffChanges ? 1 : 0);
  const publishAllAvailable = publishAllSections >= 2;
  const publishAllBusy = publishAllStep !== null;
  const publishAllBlocked = hasMergeConflicts;

  const runPublishAll = useCallback(async () => {
    setPublishAllError(null);

    if (git.mergeConflicts.length > 0) {
      setPublishAllError(`Cannot publish: ${git.mergeConflicts.length} merge conflict${git.mergeConflicts.length !== 1 ? 's' : ''} must be resolved first`);
      return;
    }

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
            const TIMEOUTS = [10000, 20000, 30000];
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
                  setOrphansDeleting(false);
                  setReadinessError(describeError(err, 'Orphan deletion'));
                  return;
                }
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

  const readinessFails = readinessChecks.filter(c => c.status === 'fail').length;
  const readinessPasses = readinessChecks.filter(c => c.status === 'pass').length;

  /* ── Sub-tab status badges ─────────────────────────────────────────────── */

  const varBadge: { label: string; className: string } | null = useMemo(() => {
    if (varSync.varChecked && varSync.varRows.length === 0) return { label: 'In sync', className: 'bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]' };
    if (varSync.varRows.length > 0) return { label: `${varSync.varRows.length}`, className: 'bg-[var(--color-figma-warning)]/15 text-yellow-600' };
    return null;
  }, [varSync.varChecked, varSync.varRows.length]);

  const styleBadge: { label: string; className: string } | null = useMemo(() => {
    if (styleSync.styleChecked && styleSync.styleRows.length === 0) return { label: 'In sync', className: 'bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]' };
    if (styleSync.styleRows.length > 0) return { label: `${styleSync.styleRows.length}`, className: 'bg-[var(--color-figma-warning)]/15 text-yellow-600' };
    return null;
  }, [styleSync.styleChecked, styleSync.styleRows.length]);

  const gitBadge: { label: string; className: string } | null = useMemo(() => {
    if (git.gitLoading) return null;
    if (!git.gitStatus?.isRepo) return { label: 'No repo', className: 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]' };
    if (git.mergeConflicts.length > 0) return { label: `${git.mergeConflicts.length} conflict${git.mergeConflicts.length !== 1 ? 's' : ''}`, className: 'bg-[var(--color-figma-error)]/15 text-[var(--color-figma-error)]' };
    if (git.allChanges.length > 0) return { label: `${git.allChanges.length} change${git.allChanges.length !== 1 ? 's' : ''}`, className: 'bg-[var(--color-figma-warning)]/15 text-yellow-600' };
    if (git.gitStatus?.isRepo) return { label: 'Clean', className: 'bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)]' };
    return null;
  }, [git.gitLoading, git.gitStatus, git.mergeConflicts.length, git.allChanges.length]);

  const badgeByTab: Record<PublishSubTab, { label: string; className: string } | null> = {
    variables: varBadge,
    styles: styleBadge,
    git: gitBadge,
  };

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
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
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

      {/* ── Publish all banner ──────────────────────────────────────────── */}
      {(publishAllAvailable || publishAllBusy) && (
        <div className="px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex flex-col gap-1.5 rounded-lg border border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/5 p-2.5">
            {publishAllBusy ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" className="text-[var(--color-figma-accent)]" />
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
                  disabled={publishAllBlocked}
                  title={publishAllBlocked ? `Resolve ${git.mergeConflicts.length} merge conflict${git.mergeConflicts.length !== 1 ? 's' : ''} before publishing` : undefined}
                  className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  Publish all
                </button>
              </div>
            )}
            {publishAllBlocked && !publishAllBusy && (
              <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-error)]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
                Resolve {git.mergeConflicts.length} merge conflict{git.mergeConflicts.length !== 1 ? 's' : ''} in the Git tab before publishing
              </div>
            )}
            {publishAllError && (
              <div role="alert" className="text-[10px] text-[var(--color-figma-error)]">
                Publish all failed: {publishAllError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-tab navigation ──────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-3 border-b border-[var(--color-figma-border)] shrink-0 bg-[var(--color-figma-bg)]">
        {/* Diff filter */}
        {(varSync.varRows.length > 0 || styleSync.styleRows.length > 0 || (git.diffView && (git.diffView.localOnly.length + git.diffView.remoteOnly.length + git.diffView.conflicts.length) > 0)) && activeSubTab !== 'git' ? (
          <div className="relative flex-1 py-1.5 pr-2">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] pointer-events-none" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={diffFilter}
              onChange={e => setDiffFilter(e.target.value)}
              placeholder="Filter\u2026"
              aria-label="Filter diff rows"
              className="w-full pl-6 pr-5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] placeholder:text-[var(--color-figma-text-tertiary)]"
            />
            {diffFilter && (
              <button
                onClick={() => setDiffFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]"
                aria-label="Clear filter"
              >
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        ) : <div className="flex-1" />}

        <div className="flex items-stretch shrink-0">
          {SUB_TABS.map(tab => {
            const badge = badgeByTab[tab.id];
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`relative flex items-center gap-1 px-2.5 py-2 text-[10px] font-medium transition-colors whitespace-nowrap border-b-2 -mb-px ${
                  isActive
                    ? 'text-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                    : 'text-[var(--color-figma-text-secondary)] border-transparent hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-border)]'
                }`}
              >
                {tab.label}
                {badge && (
                  <span className={`text-[9px] px-1 py-0.5 rounded-full font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active sub-panel ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {activeSubTab === 'variables' && (
          <VariableSyncSubPanel
            varSync={varSync}
            activeSet={activeSet}
            diffFilter={diffFilter}
            onRequestConfirm={setConfirmAction}
          />
        )}
        {activeSubTab === 'styles' && (
          <StyleSyncSubPanel
            styleSync={styleSync}
            activeSet={activeSet}
            diffFilter={diffFilter}
            onRequestConfirm={setConfirmAction}
          />
        )}
        {activeSubTab === 'git' && (
          <GitSubPanel
            git={git}
            diffFilter={diffFilter}
            onRequestConfirm={setConfirmAction}
          />
        )}
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
      <SyncPreviewModal
        title="Apply variable sync"
        rows={varSync.varRows}
        dirs={varSync.varDirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await varSync.applyVarDiff();
        }}
        confirmLabel={`Apply ${varSync.varSyncCount} change${varSync.varSyncCount !== 1 ? 's' : ''}`}
      />
    )}

    {confirmAction === 'apply-styles' && (
      <SyncPreviewModal
        title="Apply style sync"
        rows={styleSync.styleRows}
        dirs={styleSync.styleDirs}
        onClose={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await styleSync.applyStyleDiff();
        }}
        confirmLabel={`Apply ${styleSync.styleSyncCount} change${styleSync.styleSyncCount !== 1 ? 's' : ''}`}
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
        }}
      />
    )}

    {confirmAction === 'publish-all' && (
      <PublishAllPreviewModal
        hasVarChanges={hasVarChanges}
        hasStyleChanges={hasStyleChanges}
        hasGitDiffChanges={hasGitDiffChanges}
        varRows={varSync.varRows}
        varDirs={varSync.varDirs}
        varPushCount={varSync.varPushCount}
        varPullCount={varSync.varPullCount}
        styleRows={styleSync.styleRows}
        styleDirs={styleSync.styleDirs}
        stylePushCount={styleSync.stylePushCount}
        stylePullCount={styleSync.stylePullCount}
        gitDiffChoices={git.diffChoices}
        mergeConflictCount={git.mergeConflicts.length}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          setConfirmAction(null);
          await runPublishAll();
        }}
      />
    )}
    </>
  );
}
