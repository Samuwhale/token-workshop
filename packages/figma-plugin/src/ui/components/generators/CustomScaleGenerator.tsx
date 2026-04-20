import type { TokenType } from '@tokenmanager/core';
import type { CustomScaleConfig, CustomScaleStep } from '../../hooks/useGenerators';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_CUSTOM_CONFIG: CustomScaleConfig = {
  outputType: 'number',
  steps: [
    { name: 'sm', index: -2, multiplier: 0.5 },
    { name: 'md', index: 0, multiplier: 1 },
    { name: 'lg', index: 2, multiplier: 2 },
  ],
  formula: 'base * multiplier',
  roundTo: 2,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DTCG_OUTPUT_TYPES: TokenType[] = ['number', 'dimension', 'percentage', 'duration'];

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function CustomScaleConfigEditor({ config, onChange }: { config: CustomScaleConfig; onChange: (c: CustomScaleConfig) => void }) {
  const updateStep = (idx: number, updates: Partial<CustomScaleStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ ...config, steps });
  };
  const addStepAbove = () => {
    const maxIdx = Math.max(...config.steps.map(s => s.index), 0);
    onChange({ ...config, steps: [...config.steps, { name: `step${maxIdx + 1}`, index: maxIdx + 1, multiplier: 1 }] });
  };
  const addStepBelow = () => {
    const minIdx = Math.min(...config.steps.map(s => s.index), 0);
    onChange({ ...config, steps: [{ name: `step${minIdx - 1}`, index: minIdx - 1, multiplier: 1 }, ...config.steps] });
  };
  const removeStep = (idx: number) => onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });
  const sortedSteps = [...config.steps].sort((a, b) => a.index - b.index);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">
          Formula
          <span className="ml-1 text-secondary opacity-70">variables: base, index, multiplier, prev</span>
        </label>
        <input value={config.formula} onChange={e => onChange({ ...config, formula: e.target.value })}
          placeholder="base * multiplier"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body font-mono focus-visible:border-[var(--color-figma-accent)]" />
        <div className="flex gap-1 mt-1 flex-wrap">
          {['base * multiplier', 'base + index * 8', 'base * (1.25 ** index)', 'prev + 8'].map(ex => (
            <button key={ex} onClick={() => onChange({ ...config, formula: ex })}
              className="px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-secondary font-mono text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >{ex}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">Output type</label>
          <select value={config.outputType} onChange={e => onChange({ ...config, outputType: e.target.value as TokenType })}
            className="px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-body focus-visible:border-[var(--color-figma-accent)]">
            {DTCG_OUTPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {config.outputType === 'dimension' && (
          <div>
            <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">Unit</label>
            <div className="flex gap-1">
              {(['px', 'rem', 'em', '%'] as const).map(u => (
                <button key={u} onClick={() => onChange({ ...config, unit: u })}
                  className={`px-2 py-1 rounded text-secondary font-medium border transition-colors ${config.unit === u ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >{u}</button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">Round to</label>
          <div className="flex gap-1">
            {([0, 1, 2, 3] as const).map(n => (
              <button key={n} onClick={() => onChange({ ...config, roundTo: n })}
                className={`px-2 py-1 rounded text-secondary font-medium border transition-colors ${config.roundTo === n ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >{n}dp</button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className="block text-secondary text-[var(--color-figma-text-secondary)] mb-1">
          Steps
          <span className="ml-1 text-secondary opacity-70">index 0 = base token value</span>
        </label>
        <div className="flex flex-col gap-1">
          <button onClick={addStepAbove} className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left">+ Add step above</button>
          {sortedSteps.map((step, sortedIdx) => {
            const origIdx = config.steps.indexOf(step);
            return (
              <div key={sortedIdx} className="flex items-center gap-1.5">
                <input value={step.name} onChange={e => updateStep(origIdx, { name: e.target.value })}
                  aria-label={`Step ${step.name} name`}
                  placeholder="name" className="w-14 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary font-mono focus-visible:border-[var(--color-figma-accent)]" />
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">idx</span>
                <input type="number" value={step.index} onChange={e => updateStep(origIdx, { index: Number(e.target.value) })}
                  aria-label={`Step ${step.name} index`}
                  className="w-12 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]" />
                <span className="text-secondary text-[var(--color-figma-text-secondary)]">×</span>
                <input type="number" step="0.1" value={step.multiplier ?? 1} onChange={e => updateStep(origIdx, { multiplier: Number(e.target.value) })}
                  aria-label={`Step ${step.name} multiplier`}
                  className="w-12 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-secondary focus-visible:border-[var(--color-figma-accent)]" />
                <button onClick={() => removeStep(origIdx)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-secondary">×</button>
              </div>
            );
          })}
          <button onClick={addStepBelow} className="text-secondary text-[var(--color-figma-accent)] hover:underline text-left">+ Add step below</button>
        </div>
      </div>
    </div>
  );
}
