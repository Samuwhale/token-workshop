import { Braces, Code2, FileCode2, Layers3, Table2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useImportSourceContext } from "./ImportPanelContext";
import { Button } from "../primitives";

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
    <Button
      type="button"
      onClick={onClick}
      variant="secondary"
      size="md"
      className="flex-1 justify-center px-3"
    >
      {icon}
      {label}
    </Button>
  );
}

export function ImportSourceHome() {
  const {
    isDragging,
    fileImportValidation,
    unifiedFileInputRef,
    jsonFileInputRef,
    cssFileInputRef,
    tailwindFileInputRef,
    tokensStudioFileInputRef,
    handleReadVariables,
    handleReadStyles,
    handleReadJson,
    handleReadCSS,
    handleReadTailwind,
    handleReadTokensStudio,
    handleBrowseFile,
    handleUnifiedFileChange,
    handleJsonFileChange,
    handleCSSFileChange,
    handleTailwindFileChange,
    handleTokensStudioFileChange,
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
          Choose a source
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
          <SourceButton
            icon={<Braces size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadJson}
            label="Token JSON"
          />
          <SourceButton
            icon={<Code2 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadCSS}
            label="CSS values"
          />
          <SourceButton
            icon={<Code2 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadTailwind}
            label="Tailwind config"
          />
          <SourceButton
            icon={<FileCode2 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadTokensStudio}
            label="Tokens Studio"
          />
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Variables keep Figma collection and mode structure. Token files import into the selected collection unless the file contains collections.
        </div>
      </div>

      <div className="tm-import-home__section">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          Drop a file
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Drop JSON, CSS, Tailwind config, or Tokens Studio export files here.
        </div>
        <button
          type="button"
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
          aria-describedby="import-source-file-types"
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
        </button>
        <div
          id="import-source-file-types"
          className="text-secondary text-[color:var(--color-figma-text-tertiary)] text-center"
        >
          JSON · CSS · Tailwind · Tokens Studio
        </div>
      </div>

      {fileImportValidation && (
        <div
          className={`rounded px-2.5 py-1.5 text-secondary ${
            validationIsError
            ? 'bg-[var(--color-figma-error)]/8 text-[color:var(--color-figma-text-error)]'
            : fileImportValidation.status === 'partial'
              ? 'bg-[var(--color-figma-warning)]/8 text-[color:var(--color-figma-text-warning)]'
              : 'bg-[var(--color-figma-success)]/8 text-[color:var(--color-figma-text-success)]'
          }`}
          role={validationIsError ? "alert" : "status"}
          aria-live={validationIsError ? "assertive" : "polite"}
        >
          {fileImportValidation.summary}
          {fileImportValidation.detail && (
            <span className="text-[color:var(--color-figma-text-secondary)]"> {fileImportValidation.detail}</span>
          )}
          {fileImportValidation.nextAction ? (
            <div className="mt-1 text-[color:var(--color-figma-text)]">
              {fileImportValidation.nextAction}
            </div>
          ) : null}
        </div>
      )}

      <input
        ref={unifiedFileInputRef}
        type="file"
        accept=".json,.css,.js,.ts,.mjs,.cjs,application/json,text/css"
        className="sr-only"
        onChange={handleUnifiedFileChange}
      />
      <input
        ref={jsonFileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleJsonFileChange}
      />
      <input
        ref={cssFileInputRef}
        type="file"
        accept=".css,text/css"
        className="sr-only"
        onChange={handleCSSFileChange}
      />
      <input
        ref={tailwindFileInputRef}
        type="file"
        accept=".js,.ts,.mjs,.cjs"
        className="sr-only"
        onChange={handleTailwindFileChange}
      />
      <input
        ref={tokensStudioFileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleTokensStudioFileChange}
      />
    </div>
  );
}
