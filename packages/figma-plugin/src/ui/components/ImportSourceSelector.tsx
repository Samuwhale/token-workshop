import React, { useCallback, useEffect, useState } from 'react';
import { useImportPanel } from './ImportPanelContext';

type SourceFamily = 'figma' | 'token-files' | 'code' | 'migration';

interface SelectorOption {
  id: string;
  title: string;
  description: string;
  iconBgClass: string;
  iconStroke: string;
  onClick: () => void;
  icon: React.ReactNode;
}

interface FamilyOption extends SelectorOption {
  family: SourceFamily;
}

function SelectorCard({
  title,
  description,
  iconBgClass,
  iconStroke,
  icon,
  onClick,
}: SelectorOption) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-3 rounded border border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
    >
      <div className={`w-8 h-8 rounded flex items-center justify-center ${iconBgClass}`}>
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
            stroke: iconStroke,
          })
          : icon}
      </div>
      <div className="flex-1 text-left">
        <div className="text-[11px] font-medium text-[var(--color-figma-text)]">{title}</div>
        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">{description}</div>
      </div>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-[var(--color-figma-text-secondary)]">
        <path d="M2 1l4 3-4 3V1z" />
      </svg>
    </button>
  );
}

function InfoCallout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] text-[10px] text-[var(--color-figma-text-secondary)]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-[1px]" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>{children}</span>
    </div>
  );
}

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
    handleBack,
  } = useImportPanel();
  const [activeFamily, setActiveFamily] = useState<SourceFamily | null>(null);

  const handleReturn = useCallback(() => {
    if (activeFamily) {
      setActiveFamily(null);
      return;
    }
    handleBack();
  }, [activeFamily, handleBack]);

  // Escape goes up one level in the selector before falling back to the panel-level back action.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleReturn();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleReturn]);

  const familyOptions: FamilyOption[] = [
    {
      id: 'family-figma',
      family: 'figma',
      title: 'From Figma',
      description: 'Read variables or styles from the current file',
      iconBgClass: 'bg-[var(--color-figma-accent)]/10',
      iconStroke: 'var(--color-figma-accent)',
      onClick: () => setActiveFamily('figma'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      ),
    },
    {
      id: 'family-token-files',
      family: 'token-files',
      title: 'From token files',
      description: 'Import DTCG token files from JSON exports',
      iconBgClass: 'bg-[#27ae60]/10',
      iconStroke: '#27ae60',
      onClick: () => setActiveFamily('token-files'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
    },
    {
      id: 'family-code',
      family: 'code',
      title: 'From code',
      description: 'Extract tokens from CSS custom properties or Tailwind config',
      iconBgClass: 'bg-[#2965f1]/10',
      iconStroke: '#2965f1',
      onClick: () => setActiveFamily('code'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
        </svg>
      ),
    },
    {
      id: 'family-migration',
      family: 'migration',
      title: 'Migrate from another tool',
      description: 'Bring in token exports from Tokens Studio',
      iconBgClass: 'bg-[#e67e22]/10',
      iconStroke: '#e67e22',
      onClick: () => setActiveFamily('migration'),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          <circle cx="12" cy="12" r="3" fill="#e67e22" stroke="none" />
        </svg>
      ),
    },
  ];

  const familyFormats: Record<SourceFamily, SelectorOption[]> = {
    figma: [
      {
        id: 'variables',
        title: 'Figma Variables',
        description: 'Read variables from this file and map them to token sets',
        iconBgClass: 'bg-[var(--color-figma-accent)]/10',
        iconStroke: 'var(--color-figma-accent)',
        onClick: handleReadVariables,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        ),
      },
      {
        id: 'styles',
        title: 'Figma Styles',
        description: 'Read paint, text, and effect styles from this file',
        iconBgClass: 'bg-[#9b59b6]/10',
        iconStroke: '#9b59b6',
        onClick: handleReadStyles,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        ),
      },
    ],
    'token-files': [
      {
        id: 'json',
        title: 'DTCG JSON file',
        description: 'Load a DTCG-format .json token file or drag and drop it here',
        iconBgClass: 'bg-[#27ae60]/10',
        iconStroke: '#27ae60',
        onClick: handleReadJson,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        ),
      },
    ],
    code: [
      {
        id: 'css',
        title: 'CSS custom properties',
        description: 'Parse --custom-property declarations from a CSS file or drag and drop one',
        iconBgClass: 'bg-[#2965f1]/10',
        iconStroke: '#2965f1',
        onClick: handleReadCSS,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
            <path d="M4 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
            <path d="M14 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
            <path d="M14 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
          </svg>
        ),
      },
      {
        id: 'tailwind',
        title: 'Tailwind config',
        description: 'Parse theme values from tailwind.config and related config files',
        iconBgClass: 'bg-[#06b6d4]/10',
        iconStroke: '#06b6d4',
        onClick: handleReadTailwind,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.62 7.15 14.48 6 12 6z" />
            <path d="M7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C11.62 13.15 10.48 12 8 12z" />
          </svg>
        ),
      },
    ],
    migration: [
      {
        id: 'tokens-studio',
        title: 'Tokens Studio export',
        description: 'Load a Tokens Studio JSON export, including multi-set exports',
        iconBgClass: 'bg-[#e67e22]/10',
        iconStroke: '#e67e22',
        onClick: handleReadTokensStudio,
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
            <circle cx="12" cy="12" r="3" fill="#e67e22" stroke="none" />
          </svg>
        ),
      },
    ],
  };

  const activeFamilyOption = activeFamily
    ? familyOptions.find(option => option.family === activeFamily) ?? null
    : null;

  const familyNotes: Record<SourceFamily, React.ReactNode> = {
    figma: (
      <>
        <strong className="font-medium text-[var(--color-figma-text)]">Figma Variables</strong> require a
        {' '}<strong className="font-medium text-[var(--color-figma-text)]">Figma Professional</strong>{' '}
        plan (or above) and at least one local variable collection in this file.
      </>
    ),
    'token-files': (
      <>
        Use this for DTCG-compatible token JSON files. Drag and drop works here too if you already have the file handy.
      </>
    ),
    code: (
      <>
        CSS and Tailwind imports parse static values only. Dynamic expressions such as <code className="font-mono text-[9px]">calc()</code>, functions, or arrays are skipped and listed after import.
      </>
    ),
    migration: (
      <>
        Tokens Studio imports support both single-set and multi-set JSON exports.
      </>
    ),
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-1">
        Import Source
      </div>
      {!activeFamily ? (
        <>
          <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
            Start by choosing the kind of source you are importing from.
          </div>
          <div className="flex flex-col gap-2">
            {familyOptions.map(option => (
              <SelectorCard key={option.id} {...option} />
            ))}
          </div>
          <InfoCallout>
            Drag and drop also works for supported file-based imports: DTCG JSON, Tokens Studio JSON, CSS, and Tailwind config files.
          </InfoCallout>
        </>
      ) : (
        <>
          <button
            onClick={() => setActiveFamily(null)}
            className="inline-flex items-center gap-1 self-start text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="text-current rotate-180">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            Back to source families
          </button>
          <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
            {activeFamilyOption?.title ?? 'Choose a source'}:
          </div>
          <div className="flex flex-col gap-2">
            {familyFormats[activeFamily].map(option => (
              <SelectorCard key={option.id} {...option} />
            ))}
          </div>
          <InfoCallout>{familyNotes[activeFamily]}</InfoCallout>
        </>
      )}

      <input
        ref={fileInputRef as React.LegacyRef<HTMLInputElement>}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleJsonFileChange}
      />
      <input
        ref={tokensStudioFileInputRef as React.LegacyRef<HTMLInputElement>}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={handleTokensStudioFileChange}
      />
      <input
        ref={cssFileInputRef as React.LegacyRef<HTMLInputElement>}
        type="file"
        accept=".css,text/css"
        className="sr-only"
        onChange={handleCSSFileChange}
      />
      <input
        ref={tailwindFileInputRef as React.LegacyRef<HTMLInputElement>}
        type="file"
        accept=".js,.ts,.mjs,.cjs"
        className="sr-only"
        onChange={handleTailwindFileChange}
      />
    </div>
  );
}
