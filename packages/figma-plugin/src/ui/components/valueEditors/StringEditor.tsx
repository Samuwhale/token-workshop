import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import type { BasicValueEditorProps } from './valueEditorShared';

export const StringEditor = memo(function StringEditor({
  value,
  onChange,
  autoFocus,
}: BasicValueEditorProps<string>) {
  return (
    <input
      type="text"
      value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      autoFocus={autoFocus}
      className={AUTHORING.input}
    />
  );
});
