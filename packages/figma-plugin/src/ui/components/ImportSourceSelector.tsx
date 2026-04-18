import React from 'react';
import { useImportSourceContext } from './ImportPanelContext';
import {
  IMPORT_SOURCE_DEFINITIONS,
  type ImportSource,
  type SourceFamily,
} from './importPanelTypes';

const SOURCE_GROUPS: { label: string; family: SourceFamily; sources: ImportSource[] }[] = [
  { label: 'Figma', family: 'figma', sources: ['variables', 'styles'] },
  { label: 'Files', family: 'token-files', sources: ['json'] },
  { label: 'Code', family: 'code', sources: ['css', 'tailwind'] },
  { label: 'Migration', family: 'migration', sources: ['tokens-studio'] },
];

const SOURCE_ICONS: Record<ImportSource, React.ReactNode> = {
  variables: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  ),
  styles: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" strokeWidth="2" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  json: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  css: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2965f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
      <path d="M4 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
      <path d="M14 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
      <path d="M14 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
    </svg>
  ),
  tailwind: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.62 7.15 14.48 6 12 6z" />
      <path d="M7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C11.62 13.15 10.48 12 8 12z" />
    </svg>
  ),
  'tokens-studio': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
};

export function ImportSourceSelector() {
  const {
    isDragging,
    handleReadVariables,
    handleReadStyles,
    handleReadJson,
    handleReadCSS,
    handleReadTailwind,
    handleReadTokensStudio,
    handleJsonFileChange,
    handleCSSFileChange,
    handleTailwindFileChange,
    handleTokensStudioFileChange,
    fileInputRef,
    cssFileInputRef,
    tailwindFileInputRef,
    tokensStudioFileInputRef,
    fileImportValidation,
  } = useImportSourceContext();

  const formatHandlers: Record<ImportSource, () => void> = {
    variables: handleReadVariables,
    styles: handleReadStyles,
    json: handleReadJson,
    css: handleReadCSS,
    tailwind: handleReadTailwind,
    'tokens-studio': handleReadTokensStudio,
  };

  const validationIsError = fileImportValidation && (fileImportValidation.status === 'error' || fileImportValidation.status === 'unsupported');

  return (
    <div className="flex flex-col gap-2">
      {/* Drop zone */}
      <div
        className={`flex items-center justify-center rounded border border-dashed py-3 text-[10px] transition-colors ${
          isDragging
            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]'
            : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
        }`}
      >
        {isDragging ? 'Release to import' : 'Drop a token file here'}
      </div>

      {/* File validation feedback */}
      {fileImportValidation && (
        <div className={`rounded px-2.5 py-1.5 text-[10px] ${
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

      {/* Source list */}
      {SOURCE_GROUPS.map(group => (
        <div key={group.family}>
          <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-figma-text-tertiary)] mb-1">
            {group.label}
          </div>
          <div className="flex flex-col rounded border border-[var(--color-figma-border)] overflow-hidden divide-y divide-[var(--color-figma-border)]">
            {group.sources.map(source => {
              const def = IMPORT_SOURCE_DEFINITIONS[source];
              return (
                <button
                  key={source}
                  onClick={formatHandlers[source]}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
                >
                  <span className="shrink-0">{SOURCE_ICONS[source]}</span>
                  <span className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium text-[var(--color-figma-text)]">{def.shortLabel}</span>
                    <span className="ml-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">{def.description}</span>
                  </span>
                  <svg width="6" height="10" viewBox="0 0 6 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[var(--color-figma-text-tertiary)]">
                    <path d="M1 1l4 4-4 4" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Hidden file inputs */}
      <input ref={fileInputRef as React.LegacyRef<HTMLInputElement>} type="file" accept={IMPORT_SOURCE_DEFINITIONS.json.fileSupport?.accept} className="sr-only" onChange={handleJsonFileChange} />
      <input ref={tokensStudioFileInputRef as React.LegacyRef<HTMLInputElement>} type="file" accept={IMPORT_SOURCE_DEFINITIONS['tokens-studio'].fileSupport?.accept} className="sr-only" onChange={handleTokensStudioFileChange} />
      <input ref={cssFileInputRef as React.LegacyRef<HTMLInputElement>} type="file" accept={IMPORT_SOURCE_DEFINITIONS.css.fileSupport?.accept} className="sr-only" onChange={handleCSSFileChange} />
      <input ref={tailwindFileInputRef as React.LegacyRef<HTMLInputElement>} type="file" accept={IMPORT_SOURCE_DEFINITIONS.tailwind.fileSupport?.accept} className="sr-only" onChange={handleTailwindFileChange} />
    </div>
  );
}
