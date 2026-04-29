import { useState, memo } from 'react';
import { AUTHORING } from '../../shared/editorClasses';

export const CustomEditor = memo(function CustomEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const isObj = typeof value === 'object' && value !== null;
  const [text, setText] = useState(() => isObj ? JSON.stringify(value, null, 2) : String(value ?? ''));
  const [parseError, setParseError] = useState<string | null>(null);

  const commit = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      onChange(parsed);
      setParseError(null);
    } catch (e) {
      console.debug('[CustomEditor] JSON parse failed, treating as string:', e);
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
          try {
            JSON.parse(e.target.value);
            setParseError(null);
          } catch (e) {
            console.debug('[CustomEditor] live JSON validation failed:', e);
            setParseError('Not valid JSON — will be saved as string');
          }
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
