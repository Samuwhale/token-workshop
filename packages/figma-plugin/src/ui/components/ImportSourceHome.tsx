import type { ReactNode } from "react";
import {
  FileCode2,
  Layers3,
  Table2,
  Upload,
} from "lucide-react";
import { useImportSourceContext } from "./ImportPanelContext";
import { Button } from "../primitives";

function SourceButton({
  icon,
  label,
  description,
  variant = "secondary",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  variant?: "primary" | "secondary";
  onClick: () => void;
}) {
  const descriptionClassName =
    variant === "primary"
      ? "text-[color:var(--color-figma-text-onbrand)] opacity-75"
      : "text-[color:var(--color-figma-text-tertiary)]";

  return (
    <Button
      type="button"
      onClick={onClick}
      variant={variant}
      size="md"
      wrap
      className="flex-1 justify-start px-3"
    >
      {icon}
      <span className="flex min-w-0 flex-col items-start gap-0.5">
        <span>{label}</span>
        {description ? (
          <span
            className={`text-[var(--font-size-xs)] font-normal leading-tight ${descriptionClassName}`}
          >
            {description}
          </span>
        ) : null}
      </span>
    </Button>
  );
}

export function ImportSourceHome() {
  const {
    isDragging,
    fileImportValidation,
    unifiedFileInputRef,
    handleReadVariables,
    handleReadStyles,
    handleBrowseFile,
    handleUnifiedFileChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useImportSourceContext();

  const validationIsError =
    fileImportValidation &&
    (fileImportValidation.status === "error" ||
      fileImportValidation.status === "unsupported");

  return (
    <div className="tm-import-home">
      <div className="tm-import-home__section">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          From this Figma file
        </div>
        <div className="tm-import-home__actions">
          <SourceButton
            icon={<Table2 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadVariables}
            label="Figma variables"
            description="Keep collections and modes"
            variant="primary"
          />
          <SourceButton
            icon={<Layers3 size={14} strokeWidth={1.75} aria-hidden />}
            onClick={handleReadStyles}
            label="Figma styles"
            description="Import color, text, effect styles"
          />
        </div>
      </div>

      <div className="tm-import-home__section">
        <div className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">
          From a file
        </div>
        <div className="text-secondary text-[color:var(--color-figma-text-tertiary)]">
          Drop JSON, CSS, Tailwind, or Tokens Studio files.
        </div>
        <button
          type="button"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`tm-import-home__dropzone flex flex-col items-center justify-center gap-1 rounded border border-dashed transition-colors cursor-pointer ${
            isDragging
              ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5"
              : "border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)]"
          }`}
          onClick={handleBrowseFile}
          aria-describedby="import-source-file-types"
          aria-label="Import token file"
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
          <span
            className={`text-body ${isDragging ? "text-[color:var(--color-figma-text-accent)]" : "text-[color:var(--color-figma-text-secondary)]"}`}
          >
            {isDragging ? "Drop to import" : "Drop a file or click to browse"}
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
              ? "bg-[var(--color-figma-error)]/8 text-[color:var(--color-figma-text-error)]"
              : fileImportValidation.status === "partial"
                ? "bg-[var(--color-figma-warning)]/8 text-[color:var(--color-figma-text-warning)]"
                : "bg-[var(--color-figma-success)]/8 text-[color:var(--color-figma-text-success)]"
          }`}
          role={validationIsError ? "alert" : "status"}
          aria-live={validationIsError ? "assertive" : "polite"}
        >
          {fileImportValidation.summary}
          {fileImportValidation.detail && (
            <span className="text-[color:var(--color-figma-text-secondary)]">
              {" "}
              {fileImportValidation.detail}
            </span>
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
    </div>
  );
}
