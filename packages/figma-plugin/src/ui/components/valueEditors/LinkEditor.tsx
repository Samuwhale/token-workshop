import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';

export const LinkEditor = memo(function LinkEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const url = typeof value === 'string' ? value : '';
  return (
    <div className="flex gap-2 items-center">
      <input
        type="url"
        value={url}
        onChange={e => onChange(e.target.value)}
        placeholder="https://…"
        className={AUTHORING.input + ' flex-1'}
      />
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Open link"
          className="shrink-0 p-1 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
          </svg>
        </a>
      )}
    </div>
  );
});
