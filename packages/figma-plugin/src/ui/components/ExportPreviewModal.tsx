import { useEffect, useRef } from "react";
import { Spinner } from "./Spinner";
import type { ExportResultFile } from "../hooks/useExportResults";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { exportFileId, splitExportFilePath } from "../shared/exportFileHelpers";
import { Button } from "../primitives";

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
  const getTabDomId = (file: ExportResultFile) =>
    `export-preview-tab-${exportFileId(file).replace(/[^a-z0-9_-]+/gi, "-")}`;
  const panelDomId = "export-preview-panel";

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
        <div className="tm-modal-header tm-modal-header--split border-b border-[var(--color-figma-border)]">
          <div className="tm-modal-header__headline">
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
                className="text-[color:var(--color-figma-text-accent)]"
                aria-hidden="true"
              >
                <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
              </svg>
              <span className="tm-dialog-title">Export preview</span>
            </div>
            <div className="tm-modal-meta">
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
          <div className="tm-modal-header__actions">
            <button
              type="button"
              onClick={onClose}
              className="tm-modal-close-button"
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
        </div>

        <div
          role="tablist"
          aria-label="Export files"
          className="tm-modal-tablist"
          onKeyDown={(event) => {
            const activeElement = document.activeElement;
            if (!(activeElement instanceof HTMLButtonElement)) {
              return;
            }
            const tabs = Array.from(
              dialogRef.current?.querySelectorAll<HTMLButtonElement>(
                'button[role="tab"]',
              ) ?? [],
            );
            const currentIndex = tabs.indexOf(activeElement);
            if (currentIndex < 0) {
              return;
            }

            const focusTab = (nextIndex: number) => {
              const targetIndex = (nextIndex + tabs.length) % tabs.length;
              const nextTab = tabs[targetIndex];
              if (!nextTab) {
                return;
              }
              nextTab.focus();
              onFileSelect(targetIndex);
            };

            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              focusTab(currentIndex + 1);
              return;
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              focusTab(currentIndex - 1);
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              focusTab(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              focusTab(tabs.length - 1);
            }
          }}
        >
          {results.map((file, i) => {
            const { fileName, directory } = splitExportFilePath(file.path);
            const tabId = getTabDomId(file);
            return (
              <button
                key={exportFileId(file)}
                type="button"
                id={tabId}
                role="tab"
                aria-selected={i === fileIndex}
                aria-controls={panelDomId}
                tabIndex={i === fileIndex ? 0 : -1}
                onClick={() => onFileSelect(i)}
                className={`tm-modal-tab ${i === fileIndex ? "tm-modal-tab--active" : ""}`}
              >
                <span className="shrink-0 rounded bg-[var(--color-figma-accent)]/10 px-1 py-0.5 text-[var(--font-size-xs)] font-medium uppercase font-sans text-[color:var(--color-figma-text-accent)]">
                  {file.platform}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="tm-modal-tab__title font-mono leading-snug" title={file.path}>
                    {fileName}
                  </span>
                  {directory ? (
                    <span
                      className="tm-modal-tab__meta pt-0.5 text-[var(--font-size-xs)] text-[color:var(--color-figma-text-tertiary)]"
                      title={directory}
                    >
                      {directory}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* Code viewer */}
        <div
          id={panelDomId}
          role="tabpanel"
          aria-labelledby={activeFile ? getTabDomId(activeFile) : undefined}
          tabIndex={0}
          className="tm-export-preview__viewport flex-1 overflow-auto border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]"
        >
          {activeFile && (
            <table className="tm-export-preview__table min-w-full w-max border-collapse">
              <tbody>
                {lines.map((line, lineIdx) => (
                  <tr
                    key={lineIdx}
                    className="hover:bg-[var(--color-figma-bg-hover)]/50"
                  >
                    <td className="tm-export-preview__line-number px-2 py-0 text-secondary font-mono text-[color:var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                      {lineIdx + 1}
                    </td>
                    <td className="tm-export-preview__line px-3 py-0 text-secondary font-mono text-[color:var(--color-figma-text)] whitespace-pre">
                      {line || "\u00A0"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="tm-modal-footer border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] pt-2.5">
          <span className="min-w-0 flex-1 self-center text-secondary text-[color:var(--color-figma-text-tertiary)]">
            {lines.length} line{lines.length !== 1 ? "s" : ""}
          </span>
          <div className="flex min-w-0 flex-[2] flex-wrap items-stretch justify-end gap-2">
            <Button
              onClick={() => activeFile && onCopyFile(activeFile)}
              variant="secondary"
              size="md"
              className="min-w-[140px] flex-1 whitespace-normal"
              title={`Copy ${activeFile?.path}`}
            >
              {activeFile && copiedFile === exportFileId(activeFile) ? (
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
            </Button>
            <Button
              onClick={() => activeFile && onDownloadFile(activeFile)}
              variant="secondary"
              size="md"
              className="min-w-[140px] flex-1 whitespace-normal"
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
            </Button>
            <Button
              onClick={onDownloadZip}
              disabled={zipProgress !== null}
              variant="primary"
              size="md"
              className="min-w-[160px] flex-1 basis-full whitespace-normal"
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
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
