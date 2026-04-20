import { useImportSourceContext } from './ImportPanelContext';

export function ImportSourceHome() {
  const {
    isDragging,
    fileImportValidation,
    fileInputRef,
    handleReadVariables,
    handleReadStyles,
    handleBrowseFile,
    handleUnifiedFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useImportSourceContext();

  const validationIsError = fileImportValidation && (fileImportValidation.status === 'error' || fileImportValidation.status === 'unsupported');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
          From this Figma file
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReadVariables}
            className="flex-1 flex items-center justify-center gap-2 rounded border border-[var(--color-figma-border)] px-3 py-2 text-body font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            Variables
          </button>
          <button
            onClick={handleReadStyles}
            className="flex-1 flex items-center justify-center gap-2 rounded border border-[var(--color-figma-border)] px-3 py-2 text-body font-medium text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            Styles
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-secondary font-medium text-[var(--color-figma-text-secondary)]">
          From a file
        </div>
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-6 transition-colors cursor-pointer ${
            isDragging
              ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
              : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)]'
          }`}
          onClick={handleBrowseFile}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBrowseFile(); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={isDragging ? 'var(--color-figma-accent)' : 'var(--color-figma-text-tertiary)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          <span className={`text-body ${isDragging ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'}`}>
            {isDragging ? 'Drop to import' : 'Drop a file or click to browse'}
          </span>
        </div>
        <div className="text-secondary text-[var(--color-figma-text-tertiary)] text-center">
          JSON · CSS · Tailwind · Tokens Studio
        </div>
      </div>

      {fileImportValidation && (
        <div className={`rounded px-2.5 py-1.5 text-secondary ${
          validationIsError
            ? 'bg-[var(--color-figma-error)]/8 text-[var(--color-figma-error)]'
            : fileImportValidation.status === 'partial'
              ? 'bg-[var(--color-figma-warning,#e8a100)]/8 text-[var(--color-figma-warning,#e8a100)]'
              : 'bg-[var(--color-figma-success)]/8 text-[var(--color-figma-success)]'
        }`}>
          {fileImportValidation.summary}
          {fileImportValidation.detail && (
            <span className="text-[var(--color-figma-text-secondary)]"> {fileImportValidation.detail}</span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef as React.LegacyRef<HTMLInputElement>}
        type="file"
        accept=".json,.css,.js,.ts,.mjs,.cjs,application/json,text/css"
        className="sr-only"
        onChange={handleUnifiedFileChange}
      />
    </div>
  );
}
