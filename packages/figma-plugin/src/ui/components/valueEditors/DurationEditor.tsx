import { memo } from 'react';
import { inputClass } from '../../shared/editorClasses';

const DURATION_PRESETS = [100, 150, 200, 300, 500];

export const DurationEditor = memo(function DurationEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  const ms = typeof value?.value === 'number' ? value.value : typeof value === 'number' ? value : 200;
  const unit: 'ms' | 's' = value?.unit === 's' ? 's' : 'ms';
  const update = (patch: { value?: number; unit?: 'ms' | 's' }) =>
    onChange({ value: ms, unit, ...patch });
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={unit === 'ms' ? 50 : 0.05}
          value={ms}
          onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
          autoFocus={autoFocus}
          className={inputClass + ' flex-1'}
        />
        <select
          value={unit}
          onChange={e => update({ unit: e.target.value as 'ms' | 's' })}
          className={inputClass + ' w-16'}
        >
          <option value="ms">ms</option>
          <option value="s">s</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {DURATION_PRESETS.map(p => (
          <button
            key={p}
            onClick={() => onChange({ value: p, unit: 'ms' })}
            className={`px-2 py-0.5 rounded border text-secondary transition-colors ${ms === p && unit === 'ms' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >
            {p}ms
          </button>
        ))}
      </div>
    </div>
  );
});
