import { useEffect, useRef } from "react";
import { Spinner } from "./Spinner";
import type { ExportResultFile } from "../hooks/useExportResults";
import { useFocusTrap } from "../hooks/useFocusTrap";

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
  const lines = activeFile?.content.split("\n") ?? [];
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const platformIds = Array.from(new Set(results.map((f) => f.platform)));

  return (
    <div
      className="tm-modal-shell"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="tm-modal-panel tm-modal-panel--preview"
        role="dialog"
        aria-modal="true"
        aria-label="Export Preview"
      >
        {/* Header */}
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-[var(--color-figma-border)] px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--color-figma-accent)]"
              aria-hidden="true"
            >
              <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
            </svg>
            <span className="text-body font-semibold text-[var(--color-figma-text)]">
              Export Preview
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
              aria-label="Close preview"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="min-w-0 basis-full break-words text-secondary text-[var(--color-figma-text-tertiary)]">
            {results.length} file{results.length !== 1 ? "s" : ""} ·{" "}
            {platformIds.join(", ")}
            {selectedCollectionCount !== null &&
              selectedCollectionCount !== undefined &&
              ` · ${selectedCollectionCount} collection${selectedCollectionCount !== 1 ? "s" : ""}`}
            {changesOnly &&
              changedTokenCount != null &&
              ` · ${changedTokenCount} changed token${changedTokenCount !== 1 ? "s" : ""}`}
          </div>
        </div>

        {/* File tabs */}
        <div
          role="tablist"
          aria-label="Export files"
          className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto px-2 pt-2 scrollbar-thin"
        >
          {results.map((file, i) => (
            <button
              key={file.path}
              type="button"
              role="tab"
              aria-selected={i === fileIndex}
              onClick={() => onFileSelect(i)}
              className={`flex min-w-[160px] max-w-[min(360px,80vw)] shrink-0 items-start gap-1.5 rounded-t-md border border-b-0 px-2 py-1.5 text-secondary text-left transition-colors ${
                i === fileIndex
                  ? "bg-[var(--color-figma-bg-secondary)] border-[var(--color-figma-border)] text-[var(--color-figma-text)]"
                  : "bg-transparent border-transparent text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)]"
              }`}
            >
              <span className="shrink-0 rounded bg-[var(--color-figma-accent)]/10 px-1 py-0.5 text-[8px] font-medium uppercase font-sans text-[var(--color-figma-accent)]">
                {file.platform}
              </span>
              <span
                className="min-w-0 break-all font-mono leading-snug"
                title={file.path}
              >
                {file.path}
              </span>
            </button>
          ))}
        </div>

        {/* Code viewer */}
        <div className="flex-1 overflow-auto border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          {activeFile && (
            <table className="min-w-full w-max border-collapse">
              <tbody>
                {lines.map((line, lineIdx) => (
                  <tr
                    key={lineIdx}
                    className="hover:bg-[var(--color-figma-bg-hover)]/50"
                  >
                    <td className="px-2 py-0 text-secondary font-mono text-[var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                      {lineIdx + 1}
                    </td>
                    <td className="px-3 py-0 text-secondary font-mono text-[var(--color-figma-text)] whitespace-pre">
                      {line || "\u00A0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2.5">
          <span className="min-w-0 flex-1 text-secondary text-[var(--color-figma-text-tertiary)]">
            {lines.length} line{lines.length !== 1 ? "s" : ""}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-stretch justify-end gap-2">
            <button
              type="button"
              onClick={() => activeFile && onCopyFile(activeFile)}
              className="flex min-w-[140px] flex-1 items-center justify-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              title={`Copy ${activeFile?.path}`}
            >
              {copiedFile === activeFile?.path ? (
                <>
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied
                </>
              ) : (
                <>
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy file
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => activeFile && onDownloadFile(activeFile)}
              className="flex min-w-[140px] flex-1 items-center justify-center gap-1 rounded border border-[var(--color-figma-border)] px-2 py-1 text-secondary text-[var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              title={`Download ${activeFile?.path}`}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download file
            </button>
            <button
              type="button"
              onClick={onDownloadZip}
              disabled={zipProgress !== null}
              className="flex min-w-[160px] flex-1 basis-full items-center justify-center gap-1 rounded bg-[var(--color-figma-accent)] px-2 py-1 text-secondary font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              title={`Download all ${results.length} files as ${(zipFilename || "tokens").replace(/\.zip$/i, "")}.zip${nestByPlatform ? " (nested by platform)" : ""}`}
            >
              {zipProgress !== null ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  {zipProgress < 100 ? `${zipProgress}%` : "…"}
                </>
              ) : (
                <>
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
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
