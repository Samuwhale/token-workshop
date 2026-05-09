import { memo } from 'react';
import type { BasicValueEditorProps } from './valueEditorShared';

export const BooleanEditor = memo(function BooleanEditor({
  value,
  onChange,
}: BasicValueEditorProps<boolean>) {
  const checked = value === true;
  const valueLabel = checked ? 'true' : 'false';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`Boolean value: ${valueLabel}`}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full outline-none transition-colors focus-visible:outline focus-visible:outline-[1.5px] focus-visible:outline-[var(--color-figma-accent)] ${
          checked ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'
        }`}
      >
        <div
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--color-figma-text-onbrand)] transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      <span className="text-body text-[color:var(--color-figma-text)]">{valueLabel}</span>
    </div>
  );
});
