import { inputClass } from '../../shared/editorClasses';

const FONT_STYLES = ['normal', 'italic', 'oblique'];

export function FontStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'normal'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {FONT_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

const TEXT_DECORATIONS = ['none', 'underline', 'overline', 'line-through'];

export function TextDecorationEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {TEXT_DECORATIONS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'];

export function TextTransformEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={inputClass}
    >
      {TEXT_TRANSFORMS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
