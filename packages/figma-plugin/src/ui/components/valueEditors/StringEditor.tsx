import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';

export const StringEditor = memo(function StringEditor({ value, onChange, autoFocus }: { value: any; onChange: (v: any) => void; autoFocus?: boolean }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      autoFocus={autoFocus}
      className={AUTHORING.input}
    />
  );
});
