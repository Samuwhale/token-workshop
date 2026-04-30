import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import type { BasicValueEditorProps } from './valueEditorShared';

const STROKE_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset'];

export const StrokeStyleEditor = memo(function StrokeStyleEditor({
  value,
  onChange,
}: BasicValueEditorProps<string>) {
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
