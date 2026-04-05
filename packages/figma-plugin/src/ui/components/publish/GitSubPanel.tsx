import { useState, useMemo } from 'react';
import { formatRelativeTime } from '../../shared/changeHelpers';
import type { useGitSync } from '../../hooks/useGitSync';
import { FileTokenDiffList } from './PublishShared';

interface DiffLine {
  text: string;
  changed: boolean;
}

function computeLineDiff(a: string, b: string): { aLines: DiffLine[]; bLines: DiffLine[] } {
  if (a === b) {
    const lines = a.split('\n');
    const neutral = lines.map(text => ({ text, changed: false }));
    return { aLines: neutral, bLines: neutral.map(l => ({ ...l })) };
  }
  const aArr = a.split('\n');
  const bArr = b.split('\n');
  // Cap to prevent quadratic blowup on very large regions
  if (aArr.length > 300 || bArr.length > 300) {
    return {
      aLines: aArr.map(text => ({ text, changed: true })),
      bLines: bArr.map(text => ({ text, changed: true })),
    };
  }
  const m = aArr.length, n = bArr.length;
  // LCS DP
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = aArr[i - 1] === bArr[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  // Backtrack
  const aChanged = new Array(m).fill(true);
  const bChanged = new Array(n).fill(true);
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (aArr[i - 1] === bArr[j - 1]) {
      aChanged[i - 1] = false;
      bChanged[j - 1] = false;
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return {
    aLines: aArr.map((text, idx) => ({ text, changed: aChanged[idx] })),
    bLines: bArr.map((text, idx) => ({ text, changed: bChanged[idx] })),
  };
}

function DiffPre({ lines, side, isExpanded }: { lines: DiffLine[]; side: 'ours' | 'theirs'; isExpanded: boolean }) {
  const addedBg = side === 'ours' ? 'bg-[var(--color-figma-success)]/25' : 'bg-[var(--color-figma-accent)]/25';
  const addedText = side === 'ours' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-accent)]';
  return (
    <pre className={`text-[10px] font-mono whitespace-pre-wrap break-all overflow-y-auto leading-tight${isExpanded ? '' : ' max-h-28'}`}>
      {lines.map((line, idx) => (
        <span
          key={idx}
          className={`block px-1 -mx-1${line.changed ? ` ${addedBg} ${addedText}` : ' text-[var(--color-figma-text)]'}`}
        >
          {line.text || '\u00a0'}
        </span>
      ))}
    </pre>
  );
}

type GitSync = ReturnType<typeof useGitSync>;

interface GitSubPanelProps {
  git: GitSync;
  diffFilter: string;
  onRequestConfirm: (action: 'git-push' | 'git-pull' | 'git-commit' | 'apply-diff') => void;
}

export function GitSubPanel({ git, diffFilter, onRequestConfirm }: GitSubPanelProps) {
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [conflictHelpOpen, setConflictHelpOpen] = useState(false);

  const regionDiffs = useMemo(() => {
    const map = new Map<string, { aLines: DiffLine[]; bLines: DiffLine[] }>();
    for (const conflict of git.mergeConflicts) {
      for (const region of conflict.regions) {
        const key = `${conflict.file}:${region.index}`;
        map.set(key, computeLineDiff(region.ours, region.theirs));
      }
    }
    return map;
  }, [git.mergeConflicts]);

  const toggleRegionExpand = (key: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
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
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-medium ${git.allChanges.length > 0 ? 'text-yellow-600' : 'text-[var(--color-figma-success)]'}`}>
                  {git.allChanges.length > 0 ? `${git.allChanges.length} change${git.allChanges.length !== 1 ? 's' : ''}` : 'Clean'}
                </span>
                {git.gitStatus.remote && (git.gitStatus.status?.ahead ?? 0) > 0 && (
                  <span title={`${git.gitStatus.status!.ahead} saved version${git.gitStatus.status!.ahead !== 1 ? 's' : ''} ready to share — click Push`} className="text-[9px] font-medium px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]">
                    ↑{git.gitStatus.status!.ahead}
                  </span>
                )}
                {git.gitStatus.remote && (git.gitStatus.status?.behind ?? 0) > 0 && (
                  <span title={`${git.gitStatus.status!.behind} update${git.gitStatus.status!.behind !== 1 ? 's' : ''} from your team available — click Pull`} className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-500/10 text-amber-600">
                    ↓{git.gitStatus.status!.behind}
                  </span>
                )}
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

          {/* Version conflict resolver */}
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
                    Conflicting edits ({git.mergeConflicts.length} file{git.mergeConflicts.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <button
                  onClick={git.abortMerge}
                  disabled={git.actionLoading === 'abort'}
                  className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 disabled:opacity-40 transition-colors"
                >
                  {git.actionLoading === 'abort' ? 'Cancelling\u2026' : 'Cancel'}
                </button>
              </div>

              {/* "What does this mean?" expandable help */}
              <div className="border-b border-[var(--color-figma-border)]">
                <button
                  onClick={() => setConflictHelpOpen(o => !o)}
                  className="w-full px-3 py-1.5 flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] transition-colors"
                  aria-expanded={conflictHelpOpen}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`shrink-0 transition-transform ${conflictHelpOpen ? 'rotate-90' : ''}`} aria-hidden="true">
                    <path d="M2 1l4 3-4 3V1z" />
                  </svg>
                  <span>What does this mean?</span>
                </button>
                {conflictHelpOpen && (
                  <div className="px-3 pb-2.5 pt-1 text-[10px] text-[var(--color-figma-text-secondary)] flex flex-col gap-1.5 bg-[var(--color-figma-bg-secondary)]">
                    <p>You and someone else edited the same token file at the same time. The server can&rsquo;t automatically decide which edits to keep, so it&rsquo;s asking you.</p>
                    <p>For each conflicting section, choose:</p>
                    <ul className="flex flex-col gap-1 pl-3">
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--color-figma-success)] font-semibold shrink-0 mt-px">Your version</span>
                        <span>— the edits you made locally (keep your work)</span>
                      </li>
                      <li className="flex items-start gap-1.5">
                        <span className="text-[var(--color-figma-accent)] font-semibold shrink-0 mt-px">Server version</span>
                        <span>— what&rsquo;s already saved on the shared server (keep their work)</span>
                      </li>
                    </ul>
                    <p>After choosing, click <strong className="text-[var(--color-figma-text)]">Apply my choices</strong> to save the result.</p>
                  </div>
                )}
              </div>

              <div className="px-3 py-2 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)] flex items-center justify-between gap-2">
                <span>For each section, choose which version to keep.</span>
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => git.setConflictChoices(() => {
                      const next: Record<string, Record<number, 'ours' | 'theirs'>> = {};
                      for (const c of git.mergeConflicts) {
                        next[c.file] = {};
                        for (const r of c.regions) next[c.file][r.index] = 'ours';
                      }
                      return next;
                    })}
                    className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-success)]/40 text-[var(--color-figma-success)] hover:bg-[var(--color-figma-success)]/10 transition-colors"
                  >
                    All yours
                  </button>
                  <button
                    onClick={() => git.setConflictChoices(() => {
                      const next: Record<string, Record<number, 'ours' | 'theirs'>> = {};
                      for (const c of git.mergeConflicts) {
                        next[c.file] = {};
                        for (const r of c.regions) next[c.file][r.index] = 'theirs';
                      }
                      return next;
                    })}
                    className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)]/40 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors"
                  >
                    All server&rsquo;s
                  </button>
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                {git.mergeConflicts.map((conflict) => (
                  <div key={conflict.file} className="flex flex-col">
                    <div className="px-3 py-1.5 bg-[var(--color-figma-bg-secondary)] flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-[var(--color-figma-warning)]">!</span>
                      <span className="text-[10px] font-mono text-[var(--color-figma-text)] truncate" title={conflict.file}>{conflict.file}</span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] ml-auto shrink-0">{conflict.regions.length} section{conflict.regions.length !== 1 ? 's' : ''}</span>
                    </div>
                    {conflict.regions.map((region) => {
                      const choice = git.conflictChoices[conflict.file]?.[region.index] ?? 'theirs';
                      const regionKey = `${conflict.file}:${region.index}`;
                      const isExpanded = expandedRegions.has(regionKey);
                      const diff = regionDiffs.get(regionKey);
                      const changedCount = diff ? diff.aLines.filter(l => l.changed).length + diff.bLines.filter(l => l.changed).length : 0;
                      return (
                        <div key={region.index} className="border-t border-[var(--color-figma-border)]">
                          {changedCount > 0 && (
                            <div className="px-2 py-0.5 bg-[var(--color-figma-bg-secondary)] border-b border-[var(--color-figma-border)] flex items-center gap-1">
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)] shrink-0" aria-hidden="true">
                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                                {diff ? diff.aLines.filter(l => l.changed).length : 0} line{diff && diff.aLines.filter(l => l.changed).length !== 1 ? 's' : ''} changed in yours · {diff ? diff.bLines.filter(l => l.changed).length : 0} in server&rsquo;s
                              </span>
                            </div>
                          )}
                          <div className="flex">
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
                                <span className={`text-[10px] font-semibold ${choice === 'ours' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-text-secondary)]'}`}>Your version</span>
                                {choice === 'ours' && (
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                                )}
                              </div>
                              {diff ? (
                                region.ours
                                  ? <DiffPre lines={diff.aLines} side="ours" isExpanded={isExpanded} />
                                  : <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] italic">(empty)</span>
                              ) : (
                                <pre className={`text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre-wrap break-all overflow-y-auto leading-tight${isExpanded ? '' : ' max-h-28'}`}>{region.ours || '(empty)'}</pre>
                              )}
                            </button>
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
                                <span className={`text-[10px] font-semibold ${choice === 'theirs' ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'}`}>Server version</span>
                                {choice === 'theirs' && (
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                                )}
                              </div>
                              {diff ? (
                                region.theirs
                                  ? <DiffPre lines={diff.bLines} side="theirs" isExpanded={isExpanded} />
                                  : <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] italic">(empty)</span>
                              ) : (
                                <pre className={`text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre-wrap break-all overflow-y-auto leading-tight${isExpanded ? '' : ' max-h-28'}`}>{region.theirs || '(empty)'}</pre>
                              )}
                            </button>
                          </div>
                          <div className="border-t border-[var(--color-figma-border)] flex justify-center">
                            <button
                              onClick={() => toggleRegionExpand(regionKey)}
                              className="w-full px-2 py-0.5 text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-secondary)] transition-colors text-center"
                            >
                              {isExpanded ? 'Show less' : 'Show full context'}
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
                  {git.mergeConflicts.reduce((sum, c) => sum + c.regions.length, 0)} section{git.mergeConflicts.reduce((sum, c) => sum + c.regions.length, 0) !== 1 ? 's' : ''} to resolve
                </span>
                <button
                  onClick={git.resolveConflicts}
                  disabled={git.resolvingConflicts}
                  className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {git.resolvingConflicts ? 'Applying\u2026' : 'Apply my choices'}
                </button>
              </div>
            </div>
          )}

          {/* Changed files with inline token-level diff */}
          {git.allChanges.length > 0 && (
            <FileTokenDiffList
              allChanges={git.allChanges}
              selectedFiles={git.selectedFiles}
              setSelectedFiles={git.setSelectedFiles}
              tokenPreview={git.tokenPreview}
              tokenPreviewLoading={git.tokenPreviewLoading}
              fetchTokenPreview={git.fetchTokenPreview}
            />
          )}

          {/* Save version */}
          {!git.gitStatus.status?.isClean && (
            <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
              <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Save note</span>
                {git.commitMsgUserEdited?.current && (
                  <button
                    onClick={git.regenerateCommitMsg}
                    title="Re-generate from changed files"
                    className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    Suggest
                  </button>
                )}
              </div>
              <div className="p-3 flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={git.commitMsg}
                    onChange={e => git.setCommitMsg(e.target.value)}
                    placeholder="Describe what you changed\u2026"
                    aria-label="Save note (commit message)"
                    className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && git.commitMsg.trim() && git.selectedFiles.size > 0) onRequestConfirm('git-commit');
                    }}
                  />
                  {!git.commitMsgUserEdited?.current && git.commitMsg && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--color-figma-text-tertiary)] pointer-events-none select-none">auto</span>
                  )}
                </div>
                <button
                  onClick={() => onRequestConfirm('git-commit')}
                  disabled={!git.commitMsg.trim() || git.selectedFiles.size === 0 || git.actionLoading !== null}
                  className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {git.actionLoading === 'commit' ? 'Saving\u2026' : `Save ${git.selectedFiles.size === git.allChanges.length ? 'all' : git.selectedFiles.size} file${git.selectedFiles.size === 1 ? '' : 's'}`}
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
                className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]"
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
                    {filterLower && filteredFiles.length !== allFiles.length && (
                      <div className="px-3 py-1 text-[10px] text-[var(--color-figma-text-secondary)] border-b border-[var(--color-figma-border)]">
                        {filteredFiles.length} of {allFiles.length} file{allFiles.length !== 1 ? 's' : ''} match filter
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
                        onClick={() => onRequestConfirm('apply-diff')}
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

          {/* Get updates / Share */}
          {git.gitStatus?.remote && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <button
                  onClick={() => onRequestConfirm('git-pull')}
                  disabled={git.actionLoading !== null}
                  title="Download the latest token changes from your team"
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                >
                  {git.actionLoading === 'pull' ? 'Getting updates\u2026' : '\u2193 Get updates'}
                </button>
                <button
                  onClick={() => onRequestConfirm('git-push')}
                  disabled={git.actionLoading !== null}
                  title="Upload your saved versions to the shared server"
                  className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                >
                  {git.actionLoading === 'push' ? 'Sharing\u2026' : '\u2191 Share'}
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
    </div>
  );
}
