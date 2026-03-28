import type { BorderRadiusScaleConfig, BorderRadiusStep } from '../../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_BORDER_RADIUS_CONFIG: BorderRadiusScaleConfig = {
  steps: [
    { name: 'none', multiplier: 0, exactValue: 0 },
    { name: 'sm', multiplier: 0.5 },
    { name: 'md', multiplier: 1 },
    { name: 'lg', multiplier: 2 },
    { name: 'xl', multiplier: 3 },
    { name: '2xl', multiplier: 4 },
    { name: 'full', multiplier: 0, exactValue: 9999 },
  ],
  unit: 'px',
};

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function BorderRadiusConfigEditor({ config, onChange }: { config: BorderRadiusScaleConfig; onChange: (c: BorderRadiusScaleConfig) => void }) {
  const updateStep = (idx: number, updates: Partial<BorderRadiusStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ ...config, steps });
  };
  const addStep = () => {
    onChange({ ...config, steps: [...config.steps, { name: 'new', multiplier: 1 }] });
  };
  const removeStep = (idx: number) => {
    onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex flex-col gap-1">
          {config.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={step.name} onChange={e => updateStep(i, { name: e.target.value })}
                aria-label={`Step ${i + 1} name`}
                placeholder="name" className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
              {step.exactValue !== undefined ? (
                <>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">exact:</span>
                  <input type="number" value={step.exactValue} onChange={e => updateStep(i, { exactValue: Number(e.target.value) })}
                    aria-label={`Step ${step.name} exact value`}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: undefined, multiplier: 1 })} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">×exact</button>
                </>
              ) : (
                <>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">×</span>
                  <input type="number" step="0.1" value={step.multiplier} onChange={e => updateStep(i, { multiplier: Number(e.target.value) })}
                    aria-label={`Step ${step.name} multiplier`}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: 0 })} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">+exact</button>
                </>
              )}
              <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">×</button>
            </div>
          ))}
          <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">+ Add step</button>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Unit</label>
        <div className="flex gap-1">
          {(['px', 'rem'] as const).map(u => (
            <button key={u} onClick={() => onChange({ ...config, unit: u })}
              className={`px-3 py-1 rounded text-[10px] font-medium border transition-colors ${config.unit === u ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{u}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
