import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import {
  DEFAULT_DURATION_TOKEN_VALUE,
  normalizeDurationTokenValue,
} from '../../shared/tokenValueParsing';

const DURATION_PRESETS = [100, 150, 200, 300, 500];

interface DurationEditorProps {
  value: unknown;
  onChange: (value: { value: number; unit: 'ms' | 's' }) => void;
  autoFocus?: boolean;
}

export const DurationEditor = memo(function DurationEditor({
  value,
  onChange,
  autoFocus,
}: DurationEditorProps) {
  const duration = normalizeDurationTokenValue(
    value,
    DEFAULT_DURATION_TOKEN_VALUE,
  );
  const update = (patch: Partial<typeof duration>) =>
    onChange({ ...duration, ...patch });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={duration.unit === 'ms' ? 50 : 0.05}
          value={duration.value}
          onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
          autoFocus={autoFocus}
          className={AUTHORING.input + ' flex-1'}
        />
        <select
          value={duration.unit}
          onChange={e => update({ unit: e.target.value as 'ms' | 's' })}
          className={AUTHORING.input + ' w-16'}
        >
          <option value="ms">ms</option>
          <option value="s">s</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {DURATION_PRESETS.map(p => (
          <button
            type="button"
            key={p}
            onClick={() => onChange({ value: p, unit: 'ms' })}
            className={`px-2 py-0.5 rounded border text-secondary transition-colors ${duration.value === p && duration.unit === 'ms' ? 'border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >
            {p}ms
          </button>
        ))}
      </div>
    </div>
  );
});
