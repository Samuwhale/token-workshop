import { memo } from 'react';
import type { BasicValueEditorProps } from './valueEditorShared';

export const BooleanEditor = memo(function BooleanEditor({
  value,
  onChange,
}: BasicValueEditorProps<boolean>) {
  const checked = value === true;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-8 h-4 rounded-full transition-colors ${checked ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <span className="text-body text-[color:var(--color-figma-text)]">{checked ? 'true' : 'false'}</span>
    </div>
  );
});
