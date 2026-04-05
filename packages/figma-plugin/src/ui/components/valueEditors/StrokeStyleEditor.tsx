import { inputClass } from '../../shared/editorClasses';

const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];

export function StrokeStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'solid'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {STROKE_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
