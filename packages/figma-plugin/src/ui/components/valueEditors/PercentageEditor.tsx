import { memo } from 'react';
import { inputClass } from '../../shared/editorClasses';

export const PercentageEditor = memo(function PercentageEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        step={1}
        value={num}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={inputClass + ' flex-1'}
      />
      <span className="text-[11px] text-[var(--color-figma-text-secondary)] shrink-0">%</span>
    </div>
  );
});
