import type { ZIndexScaleConfig } from '../../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_Z_INDEX_CONFIG: ZIndexScaleConfig = {
  steps: [
    { name: 'below', value: -1 },
    { name: 'base', value: 0 },
    { name: 'raised', value: 10 },
    { name: 'dropdown', value: 100 },
    { name: 'sticky', value: 200 },
    { name: 'overlay', value: 300 },
    { name: 'modal', value: 400 },
    { name: 'toast', value: 500 },
  ],
};

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function ZIndexConfigEditor({ config, onChange }: { config: ZIndexScaleConfig; onChange: (c: ZIndexScaleConfig) => void }) {
  const updateStep = (idx: number, updates: Partial<{ name: string; value: number }>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ steps });
  };
  const addStep = () => onChange({ steps: [...config.steps, { name: 'new', value: 0 }] });
  const removeStep = (idx: number) => onChange({ steps: config.steps.filter((_, i) => i !== idx) });
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-secondary text-[var(--color-figma-text-secondary)]">Steps</label>
      {config.steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={step.name} onChange={e => updateStep(i, { name: e.target.value })}
            aria-label={`Step ${i + 1} name`}
            placeholder="name" className="w-20 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary font-mono focus-visible:border-[var(--color-figma-accent)]" />
          <input type="number" value={step.value} onChange={e => updateStep(i, { value: Number(e.target.value) })}
            aria-label={`Step ${step.name} z-index value`}
            className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]" />
          <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-secondary">×</button>
        </div>
      ))}
      <button onClick={addStep} className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left">+ Add step</button>
    </div>
  );
}
