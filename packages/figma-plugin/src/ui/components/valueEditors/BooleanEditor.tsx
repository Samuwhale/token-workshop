import { memo } from 'react';

export const BooleanEditor = memo(function BooleanEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
      <span className="text-body text-[var(--color-figma-text)]">{value ? 'true' : 'false'}</span>
    </div>
  );
});
