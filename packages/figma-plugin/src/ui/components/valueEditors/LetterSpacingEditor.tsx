import { inputClass } from '../../shared/editorClasses';

const LETTER_SPACING_UNITS = ['px', 'rem', 'em', '%'];

export function LetterSpacingEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const num = typeof value?.value === 'number' ? value.value : typeof value === 'number' ? value : 0;
  const unit: string = value?.unit || 'px';
  const update = (patch: { value?: number; unit?: string }) =>
    onChange({ value: num, unit, ...patch });
  return (
    <div className="flex gap-2">
      <input
        type="number"
        step={unit === 'px' ? 0.5 : 0.01}
        value={num}
        onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
        className={inputClass + ' flex-1'}
      />
      <select
        value={unit}
        onChange={e => update({ unit: e.target.value })}
        className={inputClass + ' w-16'}
      >
        {LETTER_SPACING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
}
