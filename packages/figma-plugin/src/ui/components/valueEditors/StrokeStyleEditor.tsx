import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';

const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];

export const StrokeStyleEditor = memo(function StrokeStyleEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <select
      value={typeof value === 'string' ? value : 'solid'}
      onChange={e => onChange(e.target.value)}
      className={AUTHORING.input}
    >
      {STROKE_STYLES.map(s => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
});
