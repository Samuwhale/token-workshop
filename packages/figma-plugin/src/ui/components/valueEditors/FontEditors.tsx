import { memo } from 'react';
import { FontFamilyPicker } from '../FontFamilyPicker';
import { AUTHORING } from '../../shared/editorClasses';
import { FONT_WEIGHTS, type BasicValueEditorProps } from './valueEditorShared';

export const FontFamilyEditor = memo(function FontFamilyEditor({
  value,
  onChange,
  autoFocus,
  availableFonts = [],
}: BasicValueEditorProps<string> & { availableFonts?: string[] }) {
  return (
    <FontFamilyPicker
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      availableFonts={availableFonts}
      autoFocus={autoFocus}
    />
  );
});

export const FontWeightEditor = memo(function FontWeightEditor({
  value,
  onChange,
}: BasicValueEditorProps<number>) {
  const w = typeof value === 'number' ? value : 400;
  return (
    <select
      value={w}
      onChange={e => onChange(parseInt(e.target.value, 10))}
      className={AUTHORING.input}
    >
      {FONT_WEIGHTS.map(fw => (
        <option key={fw.value} value={fw.value}>{fw.label}</option>
      ))}
    </select>
  );
});
