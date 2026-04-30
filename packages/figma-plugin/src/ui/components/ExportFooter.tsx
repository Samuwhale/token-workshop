import { Spinner } from './Spinner';
import type { ExportResultFile } from '../hooks/useExportResults';

export interface ExportFooterProps {
  mode: 'platforms';
  connected: boolean;
  changesOnly: boolean;
  diffPaths: string[] | null;
  diffLoading: boolean;
  isGitRepo: boolean | undefined;
  lastExportTimestamp: number | null;
  results: ExportResultFile[];
  exporting: boolean;
  selected: Set<string>;
  selectedCollections: Set<string> | null;
  zipProgress: number | null;
  handleExport: (showModal?: boolean) => Promise<void>;
  handleCopyAllPlatformResults: () => Promise<void>;
  handleDownloadZip: () => Promise<void>;
}

export function ExportFooter({
  connected, changesOnly, diffPaths, diffLoading, isGitRepo, lastExportTimestamp,
  results, exporting, selected, selectedCollections, zipProgress,
  handleExport, handleCopyAllPlatformResults, handleDownloadZip,
}: ExportFooterProps) {
  const hasResolvedZeroChanges = changesOnly && diffPaths !== null && !diffLoading && diffPaths.length === 0;
  const changesOnlyNeedsBaseline = changesOnly && isGitRepo === false && lastExportTimestamp === null;
  const exportDisabled = selected.size === 0
    || (selectedCollections !== null && selectedCollections.size === 0)
    || !connected
    || exporting
    || changesOnlyNeedsBaseline
    || hasResolvedZeroChanges;
  const selectedPlatformCount = selected.size;
  const selectedCollectionCount = selectedCollections?.size ?? null;
  const resultSummaryParts = [
    `${results.length} file${results.length !== 1 ? 's' : ''} exported`,
    selectedPlatformCount > 0 ? `${selectedPlatformCount} platform${selectedPlatformCount !== 1 ? 's' : ''}` : null,
    selectedCollectionCount !== null ? `${selectedCollectionCount} collection${selectedCollectionCount !== 1 ? 's' : ''}` : null,
    changesOnly && diffPaths !== null
      ? `${diffPaths.length} changed token${diffPaths.length !== 1 ? 's' : ''}`
      : null,
  ].filter(Boolean);
  const pendingSummaryParts = [
    selectedPlatformCount > 0 ? `${selectedPlatformCount} platform${selectedPlatformCount !== 1 ? 's' : ''}` : null,
    selectedCollectionCount !== null ? `${selectedCollectionCount} collection${selectedCollectionCount !== 1 ? 's' : ''}` : null,
    changesOnly
      ? diffPaths !== null
        ? `${diffPaths.length} changed token${diffPaths.length !== 1 ? 's' : ''}`
        : 'changes only'
      : 'all tokens',
  ].filter(Boolean);

  return (
    <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2">
      {results.length > 0 && (
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-tight">
          {resultSummaryParts.join(' · ')}
        </div>
      )}

      {results.length > 0 && (
        <>
          <button
            onClick={() => handleExport(true)}
            disabled={exportDisabled}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-figma-action-bg)] px-3 py-2 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40"
            title={hasResolvedZeroChanges
              ? 'No changed tokens to export'
              : !connected
              ? 'Connect to the token server to export'
              : 'Re-fetch tokens from the server and regenerate all platform files'}
          >
            {exporting ? (
              <>
                <Spinner />
                Exporting…
              </>
            ) : !connected
              ? 'Connect to export'
              : hasResolvedZeroChanges
              ? 'Re-export 0 Changed Tokens'
              : 'Re-export'}
          </button>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={handleCopyAllPlatformResults}
              className="flex-1 basis-[140px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] text-secondary font-medium hover:text-[color:var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] transition-colors"
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
              className="relative flex-1 basis-[180px] flex items-center justify-center gap-1.5 overflow-hidden rounded-md border border-[var(--color-figma-border)] px-3 py-1.5 text-secondary font-medium text-[color:var(--color-figma-text-secondary)] transition-colors hover:text-[color:var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] disabled:opacity-60"
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
        </>
      )}

      {results.length === 0 && (
        <>
          {selected.size > 0 && !(selectedCollections !== null && selectedCollections.size === 0) && !changesOnlyNeedsBaseline && (
            <div className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-tight">
              {pendingSummaryParts.join(' · ')}
            </div>
          )}
          <button
            onClick={() => handleExport(true)}
            disabled={exportDisabled}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-figma-action-bg)] px-3 py-2 text-body font-medium text-[color:var(--color-figma-text-onbrand)] transition-colors hover:bg-[var(--color-figma-action-bg-hover)] disabled:opacity-40 whitespace-normal leading-tight text-center"
          >
            {exporting ? (
              <>
                <Spinner />
                Exporting…
              </>
            ) : !connected
              ? 'Connect to export'
              : selected.size === 0
              ? 'Select a platform'
              : selectedCollections !== null && selectedCollections.size === 0
              ? 'Select at least one collection'
              : changesOnlyNeedsBaseline
              ? 'Changes only — set baseline'
              : hasResolvedZeroChanges
              ? 'No changed tokens to export'
              : changesOnly && diffPaths !== null && diffPaths.length > 0
              ? `Export ${diffPaths.length} changed token${diffPaths.length !== 1 ? 's' : ''}`
              : selectedCollections !== null
              ? `Export ${selected.size} platform${selected.size !== 1 ? 's' : ''}`
              : `Export ${selected.size} platform${selected.size !== 1 ? 's' : ''}`}
          </button>
          {selected.size === 0 && (
            <p className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-tight">
              Select at least one platform in the list above.
            </p>
          )}
          {!connected && (
            <p className="text-secondary text-[color:var(--color-figma-text-warning)] leading-tight">
              Connect to the token server before exporting platform files.
            </p>
          )}
          {selectedCollections !== null && selectedCollections.size === 0 && (
            <p className="text-secondary text-[color:var(--color-figma-text-warning)] leading-tight">
              No collections selected — open Collections above to choose which collections to include.
            </p>
          )}
          {changesOnlyNeedsBaseline && (
            <p className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-tight">
              Changes-only without git requires a baseline — open Scope above to set one.
            </p>
          )}
          {hasResolvedZeroChanges && isGitRepo !== false && (
            <p className="text-secondary text-[color:var(--color-figma-text-tertiary)] leading-tight">
              No uncommitted token changes to export right now.
            </p>
          )}
        </>
      )}

    </div>
  );
}
