import { useEffect, useState, memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';
import type { BasicValueEditorProps } from './valueEditorShared';

function formatCustomValue(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value, null, 2)
    : String(value ?? '');
}

function getJsonParseError(raw: string): string | null {
  try {
    JSON.parse(raw);
    return null;
  } catch {
    return 'Not valid JSON - will be saved as string';
  }
}

export const CustomEditor = memo(function CustomEditor({
  value,
  onChange,
}: BasicValueEditorProps) {
  const [text, setText] = useState(() => formatCustomValue(value));
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    setText(formatCustomValue(value));
    setParseError(null);
  }, [value]);

  const commit = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      onChange(parsed);
      setParseError(null);
    } catch {
      onChange(raw);
      setParseError(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={e => {
          setText(e.target.value);
          setParseError(getJsonParseError(e.target.value));
        }}
        onBlur={e => commit(e.target.value)}
        rows={4}
        className={AUTHORING.input + ' font-mono resize-y'}
        placeholder='String, number, or JSON object'
      />
      {parseError && (
        <p className="text-secondary text-[color:var(--color-figma-text-warning)]">{parseError}</p>
      )}
    </div>
  );
});
