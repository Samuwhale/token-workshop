import React, { useEffect } from 'react';
import { useImportPanel } from './ImportPanelContext';
import {
  IMPORT_FAMILY_DEFINITIONS,
  IMPORT_SOURCE_DEFINITIONS,
  type ImportSource,
  type SourceFamily,
} from './importPanelTypes';

interface SelectorOption {
  id: string;
  title: string;
  description: string;
  iconBgClass: string;
  iconStroke: string;
  onClick: () => void;
  icon: React.ReactNode;
}

const FAMILY_ORDER: SourceFamily[] = ['figma', 'token-files', 'code', 'migration'];
const FAMILY_FORMAT_ORDER: Record<SourceFamily, ImportSource[]> = {
  figma: ['variables', 'styles'],
  'token-files': ['json'],
  code: ['css', 'tailwind'],
  migration: ['tokens-studio'],
};

const FAMILY_META: Record<SourceFamily, Pick<SelectorOption, 'iconBgClass' | 'iconStroke' | 'icon'>> = {
  figma: {
    iconBgClass: 'bg-[var(--color-figma-accent)]/10',
    iconStroke: 'var(--color-figma-accent)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="9" y1="3" x2="9" y2="21" />
      </svg>
    ),
  },
  'token-files': {
    iconBgClass: 'bg-[#27ae60]/10',
    iconStroke: '#27ae60',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
  },
  code: {
    iconBgClass: 'bg-[#2965f1]/10',
    iconStroke: '#2965f1',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
      </svg>
    ),
  },
  migration: {
    iconBgClass: 'bg-[#e67e22]/10',
    iconStroke: '#e67e22',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
        <circle cx="12" cy="12" r="3" fill="#e67e22" stroke="none" />
      </svg>
    ),
  },
};

const SOURCE_META: Record<ImportSource, Pick<SelectorOption, 'iconBgClass' | 'iconStroke' | 'icon'>> = {
  variables: FAMILY_META.figma,
  styles: {
    iconBgClass: 'bg-[#9b59b6]/10',
    iconStroke: '#9b59b6',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  json: FAMILY_META['token-files'],
  css: {
    iconBgClass: 'bg-[#2965f1]/10',
    iconStroke: '#2965f1',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
        <path d="M4 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
        <path d="M14 7c0-1 .5-2 2-2s2 1 2 2v3c0 1 .5 2 2 2" />
        <path d="M14 17c0 1 .5 2 2 2s2-1 2-2v-3c0-1 .5-2 2-2" />
      </svg>
    ),
  },
  tailwind: {
    iconBgClass: 'bg-[#06b6d4]/10',
    iconStroke: '#06b6d4',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 6c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C15.62 7.15 14.48 6 12 6z" />
        <path d="M7 12c-2.67 0-4.33 1.33-5 4 1-1.33 2.17-1.83 3.5-1.5.76.19 1.3.74 1.9 1.35.98 1 2.12 2.15 4.6 2.15 2.67 0 4.33-1.33 5-4-1 1.33-2.17 1.83-3.5 1.5-.76-.19-1.3-.74-1.9-1.35C11.62 13.15 10.48 12 8 12z" />
      </svg>
    ),
  },
  'tokens-studio': FAMILY_META.migration,
};

const FAMILY_NOTES: Record<SourceFamily, React.ReactNode> = {
  figma: (
    <>
      <strong className="font-medium text-[var(--color-figma-text)]">Figma Variables</strong> require a{' '}
      <strong className="font-medium text-[var(--color-figma-text)]">Figma Professional</strong> plan (or above) and at least one local variable collection in this file.
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
      className="flex items-center gap-3 rounded border border-[var(--color-figma-border)] px-3 py-3 text-left transition-colors hover:bg-[var(--color-figma-bg-hover)]"
    >
      <div className={`flex h-8 w-8 items-center justify-center rounded ${iconBgClass}`}>
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<React.SVGProps<SVGSVGElement>>, {
            stroke: iconStroke,
          })
          : icon}
      </div>
      <div className="min-w-0 flex-1">
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
    <div className="flex items-start gap-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-[1px] shrink-0" aria-hidden="true">
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
    sourceFamily,
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
    selectSourceFamily,
  } = useImportPanel();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBack();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [handleBack]);

  const activeFamily = sourceFamily;

  const familyOptions: SelectorOption[] = FAMILY_ORDER.map((family) => {
    const definition = IMPORT_FAMILY_DEFINITIONS[family];
    return {
      id: `family-${family}`,
      title: definition.title,
      description: definition.description,
      onClick: () => selectSourceFamily(family),
      ...FAMILY_META[family],
    };
  });

  const formatHandlers: Record<ImportSource, () => void> = {
    variables: handleReadVariables,
    styles: handleReadStyles,
    json: handleReadJson,
    css: handleReadCSS,
    tailwind: handleReadTailwind,
    'tokens-studio': handleReadTokensStudio,
  };

  const formatOptions = activeFamily
    ? FAMILY_FORMAT_ORDER[activeFamily].map((source) => {
      const definition = IMPORT_SOURCE_DEFINITIONS[source];
      return {
        id: source,
        title: definition.label,
        description: definition.description,
        onClick: formatHandlers[source],
        ...SOURCE_META[source],
      };
    })
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-figma-text-secondary)]">
        Import Source
      </div>

      {!activeFamily ? (
        <>
          <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
            Start by choosing the kind of source you are importing from.
          </div>
          <div className="flex flex-col gap-2">
            {familyOptions.map((option) => (
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
            onClick={handleBack}
            className="inline-flex items-center gap-1 self-start text-[10px] text-[var(--color-figma-text-secondary)] transition-colors hover:text-[var(--color-figma-text)]"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="rotate-180 text-current">
              <path d="M2 1l4 3-4 3V1z" />
            </svg>
            Back to source families
          </button>
          <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
            {IMPORT_FAMILY_DEFINITIONS[activeFamily].title}:
          </div>
          <div className="flex flex-col gap-2">
            {formatOptions.map((option) => (
              <SelectorCard key={option.id} {...option} />
            ))}
          </div>
          <InfoCallout>{FAMILY_NOTES[activeFamily]}</InfoCallout>
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
