import { FontFamilyPicker } from '../FontFamilyPicker';
import { inputClass } from '../../shared/editorClasses';
import { FONT_WEIGHTS } from './valueEditorShared';

export function FontFamilyEditor({ value, onChange, autoFocus, availableFonts }: { value: any; onChange: (v: any) => void; autoFocus?: boolean; availableFonts?: string[] }) {
  return (
    <FontFamilyPicker
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      availableFonts={availableFonts || []}
      autoFocus={autoFocus}
    />
  );
}

export function FontWeightEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const w = typeof value === 'number' ? value : 400;
  return (
    <select
      value={w}
      onChange={e => onChange(parseInt(e.target.value))}
      className={inputClass}
    >
      {FONT_WEIGHTS.map(fw => (
        <option key={fw.value} value={fw.value}>{fw.label}</option>
      ))}
    </select>
  );
}
