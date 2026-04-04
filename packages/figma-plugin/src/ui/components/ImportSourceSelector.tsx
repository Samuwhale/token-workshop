import { useImportPanel } from './ImportPanelContext';

export function ImportSourceSelector() {
  const {
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
  } = useImportPanel();

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1">
        Import Source
      </div>
      <button
        onClick={handleReadVariables}
        title="Reads variables from the currently open Figma file"
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[var(--color-figma-accent)]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Variables</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Read variables from this file and map to token sets</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[1px]" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>Requires a <strong className="font-medium text-[var(--color-figma-text)]">Figma Professional</strong> plan (or above) and at least one local variable collection defined in this file.</span>
      </div>
      <button
        onClick={handleReadStyles}
        title="Reads styles from the currently open Figma file"
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[#9b59b6]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9b59b6" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Figma Styles</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Read paint, text, and effect styles from this file</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <button
        onClick={handleReadJson}
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[#27ae60]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from JSON file</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Load a DTCG-format .json token file — or drag &amp; drop</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleJsonFileChange}
      />

      <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mt-2 mb-1">
        Migration
      </div>
      <button
        onClick={handleReadTokensStudio}
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[#e67e22]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e67e22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
            <circle cx="12" cy="12" r="3" fill="#e67e22" stroke="none" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Tokens Studio</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Load a Tokens Studio JSON export — single or multi-set</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <input
        ref={tokensStudioFileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleTokensStudioFileChange}
      />

      <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mt-2 mb-1">
        Code-first Sources
      </div>
      <button
        onClick={handleReadCSS}
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[#2965f1]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2965f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
            <path d="M4 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
            <path d="M14 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
            <path d="M14 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from CSS file</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Parse --custom-property declarations — or drag &amp; drop</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <input
        ref={cssFileInputRef}
        type="file"
        accept=".css,text/css"
        className="sr-only"
        onChange={handleCSSFileChange}
      />
      <button
        onClick={handleReadTailwind}
        className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <div className="w-8 h-8 rounded bg-[#06b6d4]/10 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.62 7.15 14.48 6 12 6z" />
            <path d="M7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C11.62 13.15 10.48 12 8 12z" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)]">Import from Tailwind config</div>
          <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Parse theme values from tailwind.config — or drag &amp; drop</div>
        </div>
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      <input
        ref={tailwindFileInputRef}
        type="file"
        accept=".js,.ts,.mjs,.cjs"
        className="sr-only"
        onChange={handleTailwindFileChange}
      />
      <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[1px]" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>CSS and Tailwind imports parse static values only. Dynamic expressions (e.g. <code className="font-mono text-[9px]">calc()</code>, JS functions, arrays) are skipped and listed after import.</span>
      </div>
    </div>
  );
}
