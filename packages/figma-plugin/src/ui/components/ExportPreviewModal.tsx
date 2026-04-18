import { useEffect, useRef } from 'react';
import { Spinner } from './Spinner';
import type { ExportResultFile } from '../hooks/useExportResults';

export interface ExportPreviewModalProps {
  results: ExportResultFile[];
  fileIndex: number;
  onFileSelect: (i: number) => void;
  zipProgress: number | null;
  zipFilename: string;
  nestByPlatform: boolean;
  copiedFile: string | null;
  changesOnly?: boolean;
  changedTokenCount?: number | null;
  selectedCollectionCount?: number | null; // null = all collections
  onDownloadZip: () => void;
  onDownloadFile: (file: ExportResultFile) => void;
  onCopyFile: (file: ExportResultFile) => void;
  onClose: () => void;
}

export function ExportPreviewModal({
  results,
  fileIndex,
  onFileSelect,
  zipProgress,
  zipFilename,
  nestByPlatform,
  copiedFile,
  changesOnly,
  changedTokenCount,
  selectedCollectionCount,
  onDownloadZip,
  onDownloadFile,
  onCopyFile,
  onClose,
}: ExportPreviewModalProps) {
  const activeFile = results[fileIndex] ?? results[0];
  const lines = activeFile?.content.split('\n') ?? [];
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const platformIds = Array.from(new Set(results.map(f => f.platform)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--color-figma-overlay)]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="w-full rounded-t-xl border border-b-0 border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-2xl flex flex-col"
        style={{ maxHeight: 'calc(100vh - 40px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Export Preview"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-accent)]" aria-hidden="true">
              <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
            </svg>
            <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">Export Preview</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
              {results.length} file{results.length !== 1 ? 's' : ''} · {platformIds.join(', ')}
              {selectedCollectionCount !== null && selectedCollectionCount !== undefined && ` · ${selectedCollectionCount} collection${selectedCollectionCount !== 1 ? 's' : ''}`}
              {changesOnly && changedTokenCount != null && ` · ${changedTokenCount} changed token${changedTokenCount !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={onClose}
              className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Close preview"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* File tabs */}
        <div role="tablist" aria-label="Export files" className="flex gap-0.5 overflow-x-auto px-2 pt-2 shrink-0 scrollbar-thin">
          {results.map((file, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === fileIndex}
              onClick={() => onFileSelect(i)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-t-md border border-b-0 text-[10px] font-mono whitespace-nowrap transition-colors shrink-0 ${
                i === fileIndex
                  ? 'bg-[var(--color-figma-bg-secondary)] border-[var(--color-figma-border)] text-[var(--color-figma-text)]'
                  : 'bg-transparent border-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]'
              }`}
            >
              <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium uppercase font-sans">
                {file.platform}
              </span>
              {file.path}
            </button>
          ))}
        </div>

        {/* Code viewer */}
        <div className="flex-1 overflow-auto border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {activeFile && (
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((line, lineIdx) => (
                  <tr key={lineIdx} className="hover:bg-[var(--color-figma-bg-hover)]/50">
                    <td className="px-2 py-0 text-[10px] font-mono text-[var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                      {lineIdx + 1}
                    </td>
                    <td className="px-3 py-0 text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre break-all">
                      {line || '\u00A0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-3 py-2.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shrink-0">
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
            {lines.length} line{lines.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => activeFile && onCopyFile(activeFile)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title={`Copy ${activeFile?.path}`}
            >
              {copiedFile === activeFile?.path ? (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy file
                </>
              )}
            </button>
            <button
              onClick={() => activeFile && onDownloadFile(activeFile)}
              className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              title={`Download ${activeFile?.path}`}
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download file
            </button>
            <button
              onClick={onDownloadZip}
              disabled={zipProgress !== null}
              className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50 transition-colors"
              title={`Download all ${results.length} files as ${(zipFilename || 'tokens').replace(/\.zip$/i, '')}.zip${nestByPlatform ? ' (nested by platform)' : ''}`}
            >
              {zipProgress !== null ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  {zipProgress < 100 ? `${zipProgress}%` : '…'}
                </>
              ) : (
                <>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download ZIP
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
