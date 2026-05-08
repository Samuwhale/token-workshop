import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import type { BasicValueEditorProps } from './valueEditorShared';

export const StringEditor = memo(function StringEditor({
  value,
  onChange,
  autoFocus,
}: BasicValueEditorProps<string>) {
  const stringValue =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const rows = stringValue.includes('\n') || stringValue.length > 48 ? 3 : 2;

  return (
    <textarea
      value={stringValue}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      rows={rows}
      autoFocus={autoFocus}
      className={`${AUTHORING.input} min-h-[52px] resize-y py-1.5 leading-[var(--leading-body)]`}
    />
  );
});
