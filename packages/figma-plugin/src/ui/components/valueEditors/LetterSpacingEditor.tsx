import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import { isValueRecord, type BasicValueEditorProps } from './valueEditorShared';

const LETTER_SPACING_UNITS = ['px', 'rem', 'em', '%'];

interface SpacingValue {
  value: number;
  unit: string;
}

export const LetterSpacingEditor = memo(function LetterSpacingEditor({
  value,
  onChange,
}: BasicValueEditorProps<SpacingValue>) {
  const num = isValueRecord(value) && typeof value.value === 'number'
    ? value.value
    : typeof value === 'number'
      ? value
      : 0;
  const unit = isValueRecord(value) && typeof value.unit === 'string' ? value.unit : 'px';
  const update = (patch: { value?: number; unit?: string }) =>
    onChange({ value: num, unit, ...patch });
  return (
    <div className="flex gap-2">
      <input
        type="number"
        step={unit === 'px' ? 0.5 : 0.01}
        value={num}
        onChange={e => update({ value: parseFloat(e.target.value) || 0 })}
        className={AUTHORING.input + ' flex-1'}
      />
      <select
        value={unit}
        onChange={e => update({ unit: e.target.value })}
        className={AUTHORING.input + ' w-16'}
      >
        {LETTER_SPACING_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
    </div>
  );
});
