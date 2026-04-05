import { inputClass } from '../../shared/editorClasses';

const LINE_HEIGHT_UNITS = ['px', 'rem', 'em', '%'];

export function LineHeightEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const isDimension = typeof value === 'object' && value !== null && 'value' in value;
  const num = isDimension ? (value.value ?? 0) : (typeof value === 'number' ? value : 1.5);
  const unit: string = isDimension ? (value.unit || 'px') : '';

  const setUnitless = (n: number) => onChange(n);
  const setDimension = (patch: { value?: number; unit?: string }) => {
    const base = isDimension ? { value: num, unit: unit || 'px' } : { value: num, unit: 'px' };
    onChange({ ...base, ...patch });
  };

  const toggleMode = () => {
    if (isDimension) {
      onChange(num);
    } else {
      onChange({ value: num, unit: 'px' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <input
          type="number"
          step={isDimension ? 1 : 0.1}
          min={0}
          value={num}
          onChange={e => {
            const n = parseFloat(e.target.value) || 0;
            isDimension ? setDimension({ value: n }) : setUnitless(n);
          }}
          className={inputClass + ' flex-1'}
        />
        {isDimension ? (
          <select
            value={unit}
            onChange={e => setDimension({ unit: e.target.value })}
            className={inputClass + ' w-16'}
          >
            {LINE_HEIGHT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        ) : (
          <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 w-16 text-center">unitless</span>
        )}
      </div>
      <button
        type="button"
        onClick={toggleMode}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline bg-transparent border-none p-0 cursor-pointer self-start"
      >
        Switch to {isDimension ? 'unitless' : 'dimension'}
      </button>
    </div>
  );
}
