import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../Spinner';
import { useGitSync } from '../../hooks/useGitSync';
import { swatchBgColor } from '../../shared/colorUtils';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { GitSubPanel } from './GitSubPanel';

type RepositoryConfirmAction = 'git-push' | 'git-pull' | 'git-commit' | 'apply-diff' | null;

interface GitWorkflowPanelProps {
  serverUrl: string;
  connected: boolean;
}

export function GitWorkflowPanel({ serverUrl, connected }: GitWorkflowPanelProps) {
  const git = useGitSync({ serverUrl, connected });
  const [confirmAction, setConfirmAction] = useState<RepositoryConfirmAction>(null);

  return (
    <>
      <div className="rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
        <div className="border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--color-figma-text)]">Repository workflow</div>
          <div className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
            Commit, push, pull, and merge resolution.
          </div>
        </div>

        {!connected ? (
          <div className="px-4 py-6 text-[11px] text-[var(--color-figma-text-secondary)]">
            Connect to manage repository.
          </div>
        ) : (
          <GitSubPanel git={git} diffFilter="" onRequestConfirm={setConfirmAction} />
        )}
      </div>

      {confirmAction === 'git-pull' && (
        <GitPreviewModal
          title="Pull from remote"
          subtitle="Incoming changes from remote."
          confirmLabel="Pull"
          preview={git.pullPreview}
          loading={git.pullPreviewLoading}
          fetchPreview={git.fetchPullPreview}
          onCancel={() => {
            setConfirmAction(null);
            git.clearPullPreview();
          }}
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
          subtitle="Outgoing changes."
          confirmLabel="Push"
          preview={git.pushPreview}
          loading={git.pushPreviewLoading}
          fetchPreview={git.fetchPushPreview}
          onCancel={() => {
            setConfirmAction(null);
            git.clearPushPreview();
          }}
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
        <ApplyRepositoryDiffModal
          diffChoices={git.diffChoices}
          onCancel={() => setConfirmAction(null)}
          onConfirm={async () => {
            setConfirmAction(null);
            await git.applyDiff();
          }}
        />
      )}
    </>
  );
}

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
  preview: import('../../hooks/useGitDiff').GitPreview | null;
  loading: boolean;
  fetchPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedSets, setExpandedSets] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const bySet = useMemo(() => {
    if (!preview?.changes) {
      return [] as Array<{
        set: string;
        added: import('../../hooks/useGitDiff').TokenChange[];
        modified: import('../../hooks/useGitDiff').TokenChange[];
        removed: import('../../hooks/useGitDiff').TokenChange[];
      }>;
    }
    const map = new Map<string, {
      added: import('../../hooks/useGitDiff').TokenChange[];
      modified: import('../../hooks/useGitDiff').TokenChange[];
      removed: import('../../hooks/useGitDiff').TokenChange[];
    }>();
    for (const change of preview.changes) {
      if (!map.has(change.set)) {
        map.set(change.set, { added: [], modified: [], removed: [] });
      }
      const entry = map.get(change.set)!;
      if (change.status === 'added') entry.added.push(change);
      else if (change.status === 'modified') entry.modified.push(change);
      else entry.removed.push(change);
    }
    return [...map.entries()].map(([set, value]) => ({ set, ...value }));
  }, [preview?.changes]);

  const totalAdded = bySet.reduce((count, set) => count + set.added.length, 0);
  const totalModified = bySet.reduce((count, set) => count + set.modified.length, 0);
  const totalRemoved = bySet.reduce((count, set) => count + set.removed.length, 0);

  const toggleSet = (set: string) => {
    setExpandedSets(prev => {
      const next = new Set(prev);
      if (next.has(set)) next.delete(set);
      else next.add(set);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
      >
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
              {preview.commits.length > 0 && (
                <div className="mb-3">
                  <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
                    {preview.commits.length} commit{preview.commits.length !== 1 ? 's' : ''}
                  </div>
                  <div className="space-y-0.5">
                    {preview.commits.map(commit => (
                      <div key={commit.hash} className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-mono text-[var(--color-figma-text-tertiary)] shrink-0">
                          {commit.hash.slice(0, 7)}
                        </span>
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate">{commit.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {bySet.length === 0 && preview.commits.length === 0 ? (
                <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                  No changes to {confirmLabel.toLowerCase()}.
                </p>
              ) : bySet.length === 0 ? (
                <p className="py-2 text-[10px] text-[var(--color-figma-text-secondary)]">
                  No token changes.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2 text-[10px]">
                    {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded} added</span>}
                    {totalModified > 0 && <span className="text-[var(--color-figma-warning,#e5a000)]">~{totalModified} modified</span>}
                    {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">−{totalRemoved} removed</span>}
                    <span className="text-[var(--color-figma-text-secondary)] ml-auto">
                      {bySet.length} set{bySet.length !== 1 ? 's' : ''}
                    </span>
                  </div>

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
                            <svg
                              width="8"
                              height="8"
                              viewBox="0 0 8 8"
                              fill="currentColor"
                              className={`text-[var(--color-figma-text-tertiary)] shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            >
                              <path d="M2 1l4 3-4 3V1z" />
                            </svg>
                            <span className="text-[10px] font-medium text-[var(--color-figma-text)] flex-1 truncate">{set}</span>
                            <span className="flex items-center gap-2 text-[10px] font-mono shrink-0">
                              {added.length > 0 && <span className="text-[var(--color-figma-success)]">+{added.length}</span>}
                              {modified.length > 0 && <span className="text-[var(--color-figma-warning,#e5a000)]">~{modified.length}</span>}
                              {removed.length > 0 && <span className="text-[var(--color-figma-error)]">−{removed.length}</span>}
                            </span>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] divide-y divide-[var(--color-figma-border)]">
                              {allChanges.map(change => (
                                <TokenChangeRow key={change.path} change={change} />
                              ))}
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
  tokenPreview: import('../../hooks/useGitDiff').TokenChange[] | null;
  tokenPreviewLoading: boolean;
  fetchTokenPreview: () => Promise<void>;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    if (tokenPreview === null && !tokenPreviewLoading) {
      fetchTokenPreview();
    }
  }, [tokenPreview, tokenPreviewLoading, fetchTokenPreview]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const selectedSet = new Set(selectedFiles);
  const stagedChanges = allChanges.filter(change => selectedSet.has(change.file));
  const skippedCount = allChanges.length - stagedChanges.length;

  const relevantTokenChanges = useMemo(() => {
    if (!tokenPreview) return [];
    const selectedSetNames = new Set(selectedFiles.map(file => file.replace('.tokens.json', '')));
    return tokenPreview.filter(change => selectedSetNames.has(change.set));
  }, [selectedFiles, tokenPreview]);

  const changesByFile = useMemo(() => {
    const map = new Map<string, import('../../hooks/useGitDiff').TokenChange[]>();
    for (const change of relevantTokenChanges) {
      const fileName = `${change.set}.tokens.json`;
      const existing = map.get(fileName);
      if (existing) existing.push(change);
      else map.set(fileName, [change]);
    }
    return map;
  }, [relevantTokenChanges]);

  const totalAdded = relevantTokenChanges.filter(change => change.status === 'added').length;
  const totalModified = relevantTokenChanges.filter(change => change.status === 'modified').length;
  const totalRemoved = relevantTokenChanges.filter(change => change.status === 'removed').length;

  const toggleExpand = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-[380px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Commit changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review before committing.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="mb-2 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]">
            <div className="text-[10px] text-[var(--color-figma-text-tertiary)] mb-0.5">Message</div>
            <div className="text-[11px] text-[var(--color-figma-text)] font-medium">{commitMsg}</div>
          </div>

          <div className="mb-2">
            <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1 flex items-center justify-between">
              <span>
                {stagedChanges.length} file{stagedChanges.length !== 1 ? 's' : ''} to commit
                {skippedCount > 0 && (
                  <span className="text-[var(--color-figma-text-tertiary)]"> ({skippedCount} skipped)</span>
                )}
              </span>
              {!tokenPreviewLoading && relevantTokenChanges.length > 0 && (
                <span className="flex gap-1.5 text-[9px] font-mono">
                  {totalAdded > 0 && <span className="text-[var(--color-figma-success)]">+{totalAdded}</span>}
                  {totalModified > 0 && <span className="text-[var(--color-figma-warning)]">~{totalModified}</span>}
                  {totalRemoved > 0 && <span className="text-[var(--color-figma-error)]">−{totalRemoved}</span>}
                </span>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
              {tokenPreviewLoading && (
                <div className="flex items-center gap-2 py-3 justify-center">
                  <Spinner size="md" className="text-[var(--color-figma-text-secondary)]" />
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Loading token changes…</span>
                </div>
              )}
              {stagedChanges.map(change => {
                const fileTokenChanges = changesByFile.get(change.file) ?? [];
                const hasTokenChanges = fileTokenChanges.length > 0;
                const isExpanded = expandedFiles.has(change.file);
                const addedCount = fileTokenChanges.filter(item => item.status === 'added').length;
                const modifiedCount = fileTokenChanges.filter(item => item.status === 'modified').length;
                const removedCount = fileTokenChanges.filter(item => item.status === 'removed').length;

                return (
                  <div key={change.file}>
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1 ${hasTokenChanges ? 'cursor-pointer hover:bg-[var(--color-figma-bg-hover)]' : ''}`}
                      onClick={() => hasTokenChanges && toggleExpand(change.file)}
                    >
                      <span className={`w-3 h-3 flex items-center justify-center shrink-0 ${hasTokenChanges ? '' : 'opacity-0'}`}>
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 8 8"
                          fill="currentColor"
                          className={`transition-transform ${isExpanded ? 'rotate-90' : ''} text-[var(--color-figma-text-tertiary)]`}
                        >
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold w-3 shrink-0 ${
                          change.status === 'M'
                            ? 'text-[var(--color-figma-warning)]'
                            : change.status === 'A'
                              ? 'text-[var(--color-figma-success)]'
                              : change.status === 'D'
                                ? 'text-[var(--color-figma-error)]'
                                : 'text-[var(--color-figma-text-secondary)]'
                        }`}
                      >
                        {change.status}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0">
                        {change.file}
                      </span>
                      {hasTokenChanges && (
                        <span className="flex gap-1.5 text-[9px] font-mono shrink-0">
                          {addedCount > 0 && <span className="text-[var(--color-figma-success)]">+{addedCount}</span>}
                          {modifiedCount > 0 && <span className="text-[var(--color-figma-warning)]">~{modifiedCount}</span>}
                          {removedCount > 0 && <span className="text-[var(--color-figma-error)]">−{removedCount}</span>}
                        </span>
                      )}
                    </div>
                    {isExpanded && hasTokenChanges && (
                      <div className="bg-[var(--color-figma-bg-secondary)] border-t border-[var(--color-figma-border)]">
                        {fileTokenChanges.map(item => (
                          <TokenChangeRow key={`${item.path}-${item.status}`} change={item} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {!tokenPreviewLoading && tokenPreview !== null && relevantTokenChanges.length === 0 && stagedChanges.some(change => change.file.endsWith('.tokens.json')) && (
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] py-1 flex items-center gap-1.5">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[var(--color-figma-success)] shrink-0"
                aria-hidden="true"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
              No token value changes.
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
            {busy ? 'Committing…' : `Commit ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplyRepositoryDiffModal({
  diffChoices,
  onCancel,
  onConfirm,
}: {
  diffChoices: Record<string, 'push' | 'pull' | 'skip'>;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const pushFiles = Object.entries(diffChoices).filter(([, choice]) => choice === 'push').map(([file]) => file);
  const pullFiles = Object.entries(diffChoices).filter(([, choice]) => choice === 'pull').map(([file]) => file);
  const skipCount = Object.values(diffChoices).filter(choice => choice === 'skip').length;
  const hasChanges = pushFiles.length > 0 || pullFiles.length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  const sections: Array<{ label: string; arrow: string; files: string[] }> = [];
  if (pushFiles.length > 0) sections.push({ label: 'Push to remote', arrow: '↑', files: pushFiles });
  if (pullFiles.length > 0) sections.push({ label: 'Pull to local', arrow: '↓', files: pullFiles });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="w-[360px] max-h-[70vh] flex flex-col rounded-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-[12px] font-semibold text-[var(--color-figma-text)]">Apply changes</h3>
          <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
            Review sync directions before applying.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {!hasChanges ? (
            <p className="py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
              Nothing to apply.
            </p>
          ) : (
            <>
              {sections.map(section => (
                <div key={section.label} className="mb-3">
                  <div className="text-[10px] font-medium text-[var(--color-figma-text-secondary)] mb-1">
                    {section.arrow} {section.label} ({section.files.length})
                  </div>
                  <div className="max-h-28 overflow-y-auto rounded border border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)]">
                    {section.files.map(file => (
                      <div key={file} className="px-2 py-1 text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={file}>
                        {file}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {skipCount > 0 && (
                <p className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  {skipCount} file{skipCount !== 1 ? 's' : ''} skipped.
                </p>
              )}
            </>
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
            disabled={busy || !hasChanges}
            className="flex-1 px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:bg-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {busy && <Spinner size="sm" className="text-white" />}
            {busy ? 'Applying…' : 'Apply changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TokenChangeRow({ change }: { change: import('../../hooks/useGitDiff').TokenChange }) {
  const statusColor =
    change.status === 'added'
      ? 'text-[var(--color-figma-success)]'
      : change.status === 'removed'
        ? 'text-[var(--color-figma-error)]'
        : 'text-[var(--color-figma-warning)]';
  const statusChar = change.status === 'added' ? '+' : change.status === 'removed' ? '−' : '~';
  const valueToString = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));
  const isColor = change.type === 'color';
  const beforeValue = change.before != null ? valueToString(change.before) : undefined;
  const afterValue = change.after != null ? valueToString(change.after) : undefined;

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`text-[10px] font-mono font-bold w-3 shrink-0 ${statusColor}`}>{statusChar}</span>
        <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={change.path}>
          {change.path}
        </span>
      </div>
      {change.status === 'modified' && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 text-[10px] font-mono">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-error)] shrink-0 w-3">−</span>
            {isColor && isHexColor(beforeValue) && <DiffSwatch hex={beforeValue} />}
            <span className="text-[var(--color-figma-text-secondary)] truncate" title={beforeValue}>
              {truncateValue(beforeValue ?? '', 40)}
            </span>
          </div>
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[var(--color-figma-success)] shrink-0 w-3">+</span>
            {isColor && isHexColor(afterValue) && <DiffSwatch hex={afterValue} />}
            <span className="text-[var(--color-figma-text)] truncate" title={afterValue}>
              {truncateValue(afterValue ?? '', 40)}
            </span>
          </div>
        </div>
      )}
      {change.status === 'added' && afterValue !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(afterValue) && <DiffSwatch hex={afterValue} />}
          <span className="text-[var(--color-figma-text-secondary)] truncate" title={afterValue}>
            {truncateValue(afterValue, 40)}
          </span>
        </div>
      )}
      {change.status === 'removed' && beforeValue !== undefined && (
        <div className="ml-4 mt-0.5 flex items-center gap-1 text-[10px] font-mono min-w-0">
          {isColor && isHexColor(beforeValue) && <DiffSwatch hex={beforeValue} />}
          <span className="text-[var(--color-figma-text-secondary)] line-through truncate" title={beforeValue}>
            {truncateValue(beforeValue, 40)}
          </span>
        </div>
      )}
    </div>
  );
}

function truncateValue(value: string, max = 24): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
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
