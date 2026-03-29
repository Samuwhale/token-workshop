import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

  // ── Section accordion state ──
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['figma-variables', 'figma-styles', 'git']));
  const toggleSection = (id: string) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

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

      {/* ── Sections ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
      {/* ── Section: Figma Variables ─────────────────────────────────────── */}
      <Section
        title="Figma Variables"
        open={openSections.has('figma-variables')}
        onToggle={() => toggleSection('figma-variables')}
        badge={
          varSync.varLoading ? null :
          varSync.varChecked && varSync.varRows.length === 0
            ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
            : varSync.varRows.length > 0
              ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varSync.varRows.length} differ</span>
              : null
        }
      >
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2">
          Sync token values between local files and Figma variables.
        </div>

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
            const filterLower = diffFilter.toLowerCase();
            const filteredStyleRows = filterLower
              ? styleSync.styleRows.filter(r => r.path.toLowerCase().includes(filterLower))
              : styleSync.styleRows;
            const localOnly = filteredStyleRows.filter(r => r.cat === 'local-only');
            const figmaOnly = filteredStyleRows.filter(r => r.cat === 'figma-only');
            const conflicts = filteredStyleRows.filter(r => r.cat === 'conflict');

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

                {filterLower && filteredStyleRows.length !== styleSync.styleRows.length && (
                  <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-t border-[var(--color-figma-border)]">
                    {filteredStyleRows.length} of {styleSync.styleRows.length} token{styleSync.styleRows.length !== 1 ? 's' : ''} match filter
                  </div>
                )}

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
        </Section>

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
              <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const gitPushCount = Object.values(gitDiffChoices).filter(c => c === 'push').length;
  const gitPullCount = Object.values(gitDiffChoices).filter(c => c === 'pull').length;

  const handleConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[400px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl" role="dialog" aria-modal="true">
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Publish all changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review all changes across variables, styles, and git before applying.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 flex flex-col gap-3">
          {mergeConflictCount > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5 text-[var(--color-figma-error)]">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
              </svg>
              <div className="text-[10px] text-[var(--color-figma-error)]">
                <span className="font-medium">{mergeConflictCount} merge conflict{mergeConflictCount !== 1 ? 's' : ''}</span> must be resolved before publishing. Open the Git section to resolve conflicts.
              </div>
            </div>
          )}

          {/* Variables section */}
          {hasVarChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Variables</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    varPushCount > 0 ? `\u2191 ${varPushCount} to Figma` : null,
                    varPullCount > 0 ? `\u2193 ${varPullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
              <SyncDiffSummary rows={varRows} dirs={varDirs} />
            </div>
          )}

          {/* Styles section */}
          {hasStyleChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Styles</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    stylePushCount > 0 ? `\u2191 ${stylePushCount} to Figma` : null,
                    stylePullCount > 0 ? `\u2193 ${stylePullCount} to local` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
              <SyncDiffSummary rows={styleRows} dirs={styleDirs} />
            </div>
          )}

          {/* Git section */}
          {hasGitDiffChanges && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-semibold text-[var(--color-figma-text)]">Git</span>
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  {[
                    gitPushCount > 0 ? `\u2191 ${gitPushCount} file${gitPushCount !== 1 ? 's' : ''} pushed` : null,
                    gitPullCount > 0 ? `\u2193 ${gitPullCount} file${gitPullCount !== 1 ? 's' : ''} pulled` : null,
                  ].filter(Boolean).join(' \u00b7 ')}
                </span>
              </div>
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
            disabled={busy || mergeConflictCount > 0}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? 'Publishing\u2026' : mergeConflictCount > 0 ? 'Resolve conflicts first' : 'Publish all'}
          </button>
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

/* ── Per-file token diff list (unified file + token preview) ───────────── */

function FileTokenDiffList({
  allChanges,
  selectedFiles,
  setSelectedFiles,
  tokenPreview,
  tokenPreviewLoading,
  fetchTokenPreview,
}: {
  allChanges: Array<{ file: string; status: string }>;
  selectedFiles: Set<string>;
  setSelectedFiles: React.Dispatch<React.SetStateAction<Set<string>>>;
  tokenPreview: import('../hooks/useGitDiff').TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
}) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Auto-fetch token preview when component mounts with changes
  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading && allChanges.length > 0) {
      fetchTokenPreview();
    }
  }, [allChanges.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group token changes by file
  const changesByFile = useMemo(() => {
    const map = new Map<string, import('../hooks/useGitDiff').TokenChange[]>();
    if (!tokenPreview) return map;
    for (const tc of tokenPreview) {
      const fileName = tc.set + '.tokens.json';
      const arr = map.get(fileName);
      if (arr) arr.push(tc);
      else map.set(fileName, [tc]);
    }
    return map;
  }, [tokenPreview]);

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  };

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allChanges.length > 0 && selectedFiles.size === allChanges.length}
            ref={el => { if (el) el.indeterminate = selectedFiles.size > 0 && selectedFiles.size < allChanges.length; }}
            onChange={e => {
              if (e.target.checked) {
                setSelectedFiles(new Set(allChanges.map(c => c.file)));
              } else {
                setSelectedFiles(new Set());
              }
            }}
            className="w-3 h-3"
          />
          Uncommitted changes
        </label>
        <span className="text-[10px] opacity-60">
          {selectedFiles.size}/{allChanges.length} selected
          {tokenPreviewLoading && (
            <span className="ml-1.5 inline-flex items-center gap-1">
              <Spinner size="xs" className="text-[var(--color-figma-text-secondary)]" />
            </span>
          )}
        </span>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
        {allChanges.map((change, i) => {
          const fileTokenChanges = changesByFile.get(change.file) ?? [];
          const isTokenFile = change.file.endsWith('.tokens.json');
          const hasTokenChanges = fileTokenChanges.length > 0;
          const isExpanded = expandedFiles.has(change.file);
          const addedCount = fileTokenChanges.filter(c => c.status === 'added').length;
          const modifiedCount = fileTokenChanges.filter(c => c.status === 'modified').length;
          const removedCount = fileTokenChanges.filter(c => c.status === 'removed').length;

          return (
            <div key={i}>
              <div className="flex items-center gap-2 px-3 py-1 hover:bg-[var(--color-figma-bg-hover)] group">
                {/* Expand chevron */}
                <button
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  disabled={!hasTokenChanges}
                  className="w-3 h-3 flex items-center justify-center shrink-0 disabled:opacity-0"
                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}>
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                </button>
                {/* Checkbox */}
                <label className="flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(change.file)}
                    onChange={e => {
                      setSelectedFiles(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(change.file); else next.delete(change.file);
                        return next;
                      });
                    }}
                    className="w-3 h-3"
                  />
                </label>
                {/* Status badge */}
                <span className={`text-[10px] font-mono font-bold w-3 flex-shrink-0 ${
                  change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                  change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                  change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                  'text-[var(--color-figma-text-secondary)]'
                }`}>
                  {change.status}
                </span>
                {/* File name — clickable to expand */}
                <button
                  onClick={() => hasTokenChanges && toggleExpand(change.file)}
                  className="text-[10px] text-[var(--color-figma-text)] truncate text-left flex-1 min-w-0"
                  disabled={!hasTokenChanges}
                >
                  {change.file}
                </button>
                {/* Per-file token change summary badges */}
                {isTokenFile && tokenPreview !== null && !tokenPreviewLoading && hasTokenChanges && (
                  <span className="flex gap-1.5 text-[9px] font-mono shrink-0 ml-auto">
                    {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                    {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                    {removedCount > 0 && <span className="text-[var(--color-figma-error)]">&minus;{removedCount}</span>}
                  </span>
                )}
                {isTokenFile && tokenPreview !== null && !tokenPreviewLoading && !hasTokenChanges && change.status !== 'D' && (
                  <span className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-tertiary)] shrink-0 ml-auto">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)]" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    no value changes
                  </span>
                )}
              </div>
              {/* Expanded token changes */}
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
      {/* Overall summary bar */}
      {tokenPreview !== null && !tokenPreviewLoading && tokenPreview.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] flex gap-3 text-[10px] text-[var(--color-figma-text-secondary)]">
          {tokenPreview.filter(c => c.status === 'added').length > 0 && <span className="text-[var(--color-figma-success)]">+{tokenPreview.filter(c => c.status === 'added').length} added</span>}
          {tokenPreview.filter(c => c.status === 'modified').length > 0 && <span className="text-[var(--color-figma-warning)]">~{tokenPreview.filter(c => c.status === 'modified').length} modified</span>}
          {tokenPreview.filter(c => c.status === 'removed').length > 0 && <span className="text-[var(--color-figma-error)]">&minus;{tokenPreview.filter(c => c.status === 'removed').length} removed</span>}
        </div>
      )}
    </div>
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
