import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';

const FONT_STYLES = ['normal', 'italic', 'oblique'];

export const FontStyleEditor = memo(function FontStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'normal'}
      onChange={e => onChange(e.target.value)}
      className={AUTHORING.input}
    >
      {FONT_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
});

const TEXT_DECORATIONS = ['none', 'underline', 'overline', 'line-through'];

export const TextDecorationEditor = memo(function TextDecorationEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={AUTHORING.input}
    >
      {TEXT_DECORATIONS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
});

const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'];

export const TextTransformEditor = memo(function TextTransformEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'none'}
      onChange={e => onChange(e.target.value)}
      className={AUTHORING.input}
    >
      {TEXT_TRANSFORMS.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
});
