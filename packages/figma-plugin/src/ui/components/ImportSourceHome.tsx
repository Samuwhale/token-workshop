import { FileCode2, Layers3, Table2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useImportSourceContext } from "./ImportPanelContext";

const SOURCE_BUTTON_CLASS =
  "flex flex-1 items-center justify-center gap-2 rounded border border-[var(--color-figma-border)] px-3 py-2 text-body font-medium text-[color:var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-hover)]";

function SourceButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={SOURCE_BUTTON_CLASS}>
      {icon}
      {label}
    </button>
  );
}

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
    <div className="tm-import-home">
      <div className="tm-import-home__section">
        <div className="text-body font-medium text-[color:var(--color-figma-text)]">
          Bring tokens into this library
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-secondary)]">
          Start from this Figma file, a token file, or code values that should become tokens.
        </div>
      </div>

      <div className="tm-import-home__section">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          From this Figma file
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Keep existing collection and mode structure when importing variables.
        </div>
        <div className="tm-import-home__actions">
          <SourceButton
            icon={<Table2 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadVariables}
            label="Figma variables"
          />
          <SourceButton
            icon={<Layers3 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadStyles}
            label="Figma styles"
          />
        </div>
      </div>

      <div className="tm-import-home__section">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          From another token source
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Drop a token file or a source your team already uses.
        </div>
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`tm-import-home__dropzone flex flex-col items-center justify-center gap-1 rounded border border-dashed transition-colors cursor-pointer ${
            isDragging
              ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
              : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)]'
          }`}
          onClick={handleBrowseFile}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleBrowseFile(); }}
        >
          {isDragging ? (
            <Upload
              size={20}
              strokeWidth={1.5}
              className="text-[color:var(--color-figma-text-accent)]"
              aria-hidden
            />
          ) : (
            <FileCode2
              size={20}
              strokeWidth={1.5}
              className="text-[color:var(--color-figma-text-tertiary)]"
              aria-hidden
            />
          )}
          <span className={`text-body ${isDragging ? 'text-[color:var(--color-figma-text-accent)]' : 'text-[color:var(--color-figma-text-secondary)]'}`}>
            {isDragging ? 'Drop to import' : 'Drop a file or click to browse'}
          </span>
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)] text-center">
          JSON · CSS · Tailwind · Tokens Studio
        </div>
      </div>

      {fileImportValidation && (
        <div className={`rounded px-2.5 py-1.5 text-secondary ${
          validationIsError
            ? 'bg-[var(--color-figma-error)]/8 text-[color:var(--color-figma-text-error)]'
            : fileImportValidation.status === 'partial'
              ? 'bg-[var(--color-figma-warning)]/8 text-[color:var(--color-figma-text-warning)]'
              : 'bg-[var(--color-figma-success)]/8 text-[color:var(--color-figma-text-success)]'
        }`}>
          {fileImportValidation.summary}
          {fileImportValidation.detail && (
            <span className="text-[color:var(--color-figma-text-secondary)]"> {fileImportValidation.detail}</span>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.css,.js,.ts,.mjs,.cjs,application/json,text/css"
        className="sr-only"
        onChange={handleUnifiedFileChange}
      />
    </div>
  );
}
