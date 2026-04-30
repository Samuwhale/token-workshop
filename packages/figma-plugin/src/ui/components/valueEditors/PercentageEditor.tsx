import { memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import type { BasicValueEditorProps } from './valueEditorShared';

export const PercentageEditor = memo(function PercentageEditor({
  value,
  onChange,
}: BasicValueEditorProps<number>) {
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        step={1}
        value={num}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={AUTHORING.input + ' flex-1'}
      />
      <span className="text-body text-[color:var(--color-figma-text-secondary)] shrink-0">%</span>
    </div>
  );
});
