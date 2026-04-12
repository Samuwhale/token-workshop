import type { Dispatch, SetStateAction } from 'react';
import { Spinner } from './Spinner';
import type { ExportMode } from './ExportPanel';
import type { ExportResultFile } from '../hooks/useExportResults';
import type { ExportedCollection, SavePhase } from '../hooks/useFigmaVariables';

interface ExportFooterProps {
  mode: ExportMode;
  connected: boolean;
  // Platform mode — diff/scope
  changesOnly: boolean;
  setChangesOnly: Dispatch<SetStateAction<boolean>>;
  diffPaths: string[] | null;
  diffLoading: boolean;
  isGitRepo: boolean | undefined;
  lastExportTimestamp: number | null;
  fetchDiff: () => Promise<void>;
  fetchDiffSince: (ts: number) => Promise<void>;
  // Platform mode — export
  results: ExportResultFile[];
  exporting: boolean;
  selected: Set<string>;
  selectedSets: Set<string> | null;
  zipProgress: number | null;
  handleExport: (showModal?: boolean) => Promise<void>;
  handleCopyAllPlatformResults: () => Promise<void>;
  handleDownloadZip: () => Promise<void>;
  // Figma variables mode
  figmaLoading: boolean;
  figmaCollections: ExportedCollection[];
  savePhase: SavePhase;
  copiedAll: boolean;
  selectedExportMode: string | null;
  setSelectedExportMode: Dispatch<SetStateAction<string | null>>;
  savePerMode: boolean;
  setSavePerMode: Dispatch<SetStateAction<boolean>>;
  handleExportFigmaVariables: () => void;
  handleCopyAll: () => Promise<void>;
  handlePreviewSave: () => Promise<void>;
}

export function ExportFooter({
  mode,
  connected,
  changesOnly, setChangesOnly, diffPaths, diffLoading, isGitRepo, lastExportTimestamp,
  fetchDiff, fetchDiffSince,
  results, exporting, selected, selectedSets, zipProgress,
  handleExport, handleCopyAllPlatformResults, handleDownloadZip,
  figmaLoading, figmaCollections, savePhase, copiedAll,
  selectedExportMode, setSelectedExportMode, savePerMode, setSavePerMode,
  handleExportFigmaVariables, handleCopyAll, handlePreviewSave,
}: ExportFooterProps) {
  const hasResolvedZeroChanges = changesOnly && diffPaths !== null && !diffLoading && diffPaths.length === 0;
  const exportDisabled = selected.size === 0
    || (selectedSets !== null && selectedSets.size === 0)
    || exporting
    || (changesOnly && isGitRepo === false)
    || hasResolvedZeroChanges;

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
      {/* Changes-only toggle pill */}
      {mode === 'platforms' && (
        <div className="flex items-center gap-2 pb-0.5">
          <button
            onClick={() => {
              const next = !changesOnly;
              setChangesOnly(next);
              if (next && connected && diffPaths === null) {
                fetchDiff();
              }
            }}
            title={changesOnly
              ? isGitRepo === false
                ? 'Currently exporting only tokens from files modified since the baseline. Click to export all tokens.'
                : 'Currently exporting only tokens with uncommitted git changes. Click to export all tokens.'
              : 'Export only tokens added or modified since your last git commit, or since a set baseline if git is unavailable.'}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors shrink-0 ${
              changesOnly
                ? 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-accent)]/15'
                : 'bg-transparent text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            Changes only
            {changesOnly && diffPaths !== null && !diffLoading && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold leading-none ${
                diffPaths.length === 0
                  ? 'bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)]'
                  : 'bg-[var(--color-figma-accent)] text-white'
              }`}>
                {diffPaths.length}
              </span>
            )}
            {changesOnly && diffLoading && (
              <Spinner size="sm" />
            )}
          </button>
          {!changesOnly && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
              Export tokens changed since last commit
            </span>
          )}
          {changesOnly && isGitRepo === false && lastExportTimestamp === null && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
              No baseline set — open Scope to configure
            </span>
          )}
          {changesOnly && isGitRepo === false && lastExportTimestamp !== null && diffPaths !== null && !diffLoading && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
              {diffPaths.length === 0
                ? 'No changes since last export'
                : `${diffPaths.length} token${diffPaths.length !== 1 ? 's' : ''} modified since last export`}
              {diffPaths.length > 0 && (
                <button
                  onClick={() => fetchDiffSince(lastExportTimestamp)}
                  title="Re-check for changes"
                  className="ml-1.5 text-[var(--color-figma-accent)] hover:underline"
                >Refresh</button>
              )}
            </span>
          )}
          {changesOnly && isGitRepo !== false && diffPaths !== null && !diffLoading && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
              {diffPaths.length === 0
                ? 'No uncommitted changes'
                : `${diffPaths.length} token${diffPaths.length !== 1 ? 's' : ''} added or modified`}
              {diffPaths.length > 0 && (
                <button
                  onClick={fetchDiff}
                  title="Re-check for changes"
                  className="ml-1.5 text-[var(--color-figma-accent)] hover:underline"
                >Refresh</button>
              )}
            </span>
          )}
          {changesOnly && diffLoading && (
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">Checking for changes…</span>
          )}
        </div>
      )}

      {/* Platform mode — result summary */}
      {mode === 'platforms' && results.length > 0 && (
        <div className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
          {results.length} file{results.length !== 1 ? 's' : ''} exported
          {selected.size > 0 && ` · ${Array.from(selected).join(', ')}`}
          {selectedSets !== null && ` · ${selectedSets.size} set${selectedSets.size !== 1 ? 's' : ''}`}
          {changesOnly && diffPaths !== null && ` · ${diffPaths.length} changed token${diffPaths.length !== 1 ? 's' : ''}`}
        </div>
      )}

      {/* Platform mode — with results */}
      {mode === 'platforms' && results.length > 0 && (
        <>
          <div className="flex gap-1.5">
            <button
              onClick={handleCopyAllPlatformResults}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy All
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={zipProgress !== null}
              className="flex-1 relative flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 disabled:opacity-60 transition-colors overflow-hidden"
              title={zipProgress !== null ? `Building ZIP… ${zipProgress}%` : `Download all ${results.length} file${results.length !== 1 ? 's' : ''} as a ZIP archive`}
            >
              {zipProgress !== null && (
                <span
                  className="absolute inset-0 bg-[var(--color-figma-accent)]/10 transition-all duration-150"
                  style={{ width: `${zipProgress}%` }}
                  aria-hidden="true"
                />
              )}
              {zipProgress !== null ? (
                <>
                  <Spinner />
                  {zipProgress < 100 ? `Building… ${zipProgress}%` : 'Finalizing…'}
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download ZIP
                </>
              )}
            </button>
          </div>
          <button
            onClick={() => handleExport(true)}
            disabled={exportDisabled}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
            title={hasResolvedZeroChanges
              ? 'No changed tokens to export'
              : 'Re-fetch tokens from the server and regenerate all platform files'}
          >
            {exporting ? (
              <>
                <Spinner />
                Exporting…
              </>
            ) : hasResolvedZeroChanges
              ? 'Re-export 0 Changed Tokens'
              : 'Re-export'}
          </button>
        </>
      )}

      {/* Platform mode — no results yet */}
      {mode === 'platforms' && results.length === 0 && (
        <>
          {selected.size > 0 && !(selectedSets !== null && selectedSets.size === 0) && !(changesOnly && isGitRepo === false) && (
            <div className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
              {Array.from(selected).join(', ')}
              {selectedSets !== null && ` · ${selectedSets.size} set${selectedSets.size !== 1 ? 's' : ''}`}
              {changesOnly
                ? diffPaths !== null
                  ? ` · ${diffPaths.length} changed token${diffPaths.length !== 1 ? 's' : ''}`
                  : ' · changes only'
                : ' · all tokens'}
            </div>
          )}
          <button
            onClick={() => handleExport(true)}
            disabled={exportDisabled}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
          >
            {exporting ? (
              <>
                <Spinner />
                Exporting…
              </>
            ) : selected.size === 0
              ? 'Select a platform to export'
              : selectedSets !== null && selectedSets.size === 0
              ? 'Select at least one set'
              : changesOnly && isGitRepo === false
              ? 'Changes only — requires git'
              : hasResolvedZeroChanges
              ? `Export 0 Changed Tokens · ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`
              : changesOnly && diffPaths !== null && diffPaths.length > 0
              ? `Export ${diffPaths.length} Changed Token${diffPaths.length !== 1 ? 's' : ''} · ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`
              : selectedSets !== null
              ? `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''} · ${selectedSets.size} Set${selectedSets.size !== 1 ? 's' : ''}`
              : `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`}
          </button>
          {selected.size === 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center leading-tight">
              Select at least one platform in the list above.
            </p>
          )}
          {selectedSets !== null && selectedSets.size === 0 && (
            <p className="text-[10px] text-[var(--color-figma-warning,#f59e0b)] text-center leading-tight">
              No token sets selected — open Token Sets above to choose which sets to include.
            </p>
          )}
          {changesOnly && isGitRepo === false && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center leading-tight">
              Changes-only without git requires a baseline — open Scope above to set one.
            </p>
          )}
          {hasResolvedZeroChanges && isGitRepo !== false && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] text-center leading-tight">
              No uncommitted token changes to export right now.
            </p>
          )}
        </>
      )}

      {/* Figma variables mode — no collections yet */}
      {mode === 'figma-variables' && figmaCollections.length === 0 && (
        <button
          onClick={handleExportFigmaVariables}
          disabled={figmaLoading}
          className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-70 transition-colors flex items-center justify-center gap-1.5"
        >
          {figmaLoading ? (
            <>
              <Spinner />
              Reading Variables…
            </>
          ) : (
            'Read Variables from Figma'
          )}
        </button>
      )}

      {/* Figma variables mode — collections loaded */}
      {mode === 'figma-variables' && figmaCollections.length > 0 && (() => {
        const allModes = Array.from(new Set(figmaCollections.flatMap(c => c.modes)));
        const hasMultiModeCols = figmaCollections.some(c => c.modes.length > 1);
        return (
          <>
            {hasMultiModeCols && (
              <div className="flex items-center gap-2">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">
                  Mode
                </label>
                <select
                  value={selectedExportMode ?? ''}
                  onChange={e => setSelectedExportMode(e.target.value || null)}
                  className="flex-1 px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[10px] text-[var(--color-figma-text)] font-mono focus:focus-visible:border-[var(--color-figma-accent)] transition-colors"
                  aria-label="Select mode for DTCG JSON export"
                >
                  <option value="">All modes (with $extensions)</option>
                  {allModes.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={handleCopyAll}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              {copiedAll ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied DTCG JSON
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  {selectedExportMode ? `Copy as DTCG JSON (${selectedExportMode})` : 'Copy as DTCG JSON'}
                </>
              )}
            </button>
            {hasMultiModeCols && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={savePerMode}
                  onChange={e => setSavePerMode(e.target.checked)}
                  className="w-3 h-3 rounded border border-[var(--color-figma-border)] accent-[var(--color-figma-accent)]"
                />
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                  Save one set per mode
                </span>
                <span className="text-[9px] text-[var(--color-figma-text-tertiary)] leading-tight">
                  ({figmaCollections.filter(c => c.modes.length > 1).reduce((n, c) => n + c.modes.length, 0) + figmaCollections.filter(c => c.modes.length === 1).length} sets)
                </span>
              </label>
            )}
            <button
              onClick={handlePreviewSave}
              disabled={savePhase === 'preview-loading' || !connected}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              title={!connected ? 'Connect to server to save tokens' : 'Review destination mapping, merge behavior, and append paths before saving'}
            >
              {savePhase === 'preview-loading' ? (
                <>
                  <Spinner />
                  Checking…
                </>
              ) : !connected ? 'Save to Token Server (offline)' : 'Review Save Plan…'}
            </button>
          </>
        );
      })()}
    </div>
  );
}
