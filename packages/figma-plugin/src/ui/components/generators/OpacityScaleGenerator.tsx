import { useState } from 'react';
import type { OpacityScaleConfig, GeneratedTokenResult } from '../../hooks/useGenerators';
import { OverrideRow } from './generatorShared';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_OPACITY_SCALE_CONFIG: OpacityScaleConfig = {
  steps: [
    { name: '0', value: 0 },
    { name: '5', value: 5 },
    { name: '10', value: 10 },
    { name: '20', value: 20 },
    { name: '30', value: 30 },
    { name: '40', value: 40 },
    { name: '50', value: 50 },
    { name: '60', value: 60 },
    { name: '70', value: 70 },
    { name: '80', value: 80 },
    { name: '90', value: 90 },
    { name: '95', value: 95 },
    { name: '100', value: 100 },
  ],
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const OPACITY_PRESETS = [
  { label: 'Full range (13)', description: '13 steps: 0, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100% — fine-grained opacity control', steps: DEFAULT_OPACITY_SCALE_CONFIG.steps },
  {
    label: 'Compact (5)',
    description: '5 steps: 0, 25, 50, 75, 100% — simple quarter increments',
    steps: [
      { name: '0', value: 0 },
      { name: '25', value: 25 },
      { name: '50', value: 50 },
      { name: '75', value: 75 },
      { name: '100', value: 100 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function OpacityPreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const val = Number(t.value);
        const pct = Math.min(100, Math.max(0, val * 100));
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
            <div className="flex-1 h-2 rounded-sm overflow-hidden bg-[var(--color-figma-bg)]">
              <div className="h-full rounded-sm bg-[var(--color-figma-text)]" style={{ width: `${pct}%`, opacity: val }} />
            </div>
            <span className="w-10 text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 text-right">{Math.round(pct)}%</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function OpacityScaleConfigEditor({ config, onChange }: { config: OpacityScaleConfig; onChange: (c: OpacityScaleConfig) => void }) {
  const [showSteps, setShowSteps] = useState(false);
  const activePresetIdx = OPACITY_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const updateStep = (idx: number, updates: Partial<{ name: string; value: number }>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ steps });
  };
  const addStep = () => {
    const maxVal = Math.max(...config.steps.map(s => s.value), 0);
    const next = Math.min(100, maxVal + 10);
    onChange({ steps: [...config.steps, { name: String(next), value: next }] });
  };
  const removeStep = (idx: number) => onChange({ steps: config.steps.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Preset</label>
        <div className="flex gap-1.5 flex-wrap">
          {OPACITY_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => { setShowSteps(false); onChange({ steps: preset.steps.map(s => ({ ...s })) }); }}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!showSteps && activePresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
        </div>
        <button onClick={() => setShowSteps(v => !v)} className="mt-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${showSteps ? 'rotate-90' : ''}`}><path d="M2 1l4 3-4 3" /></svg>
          Edit steps ({config.steps.length})
        </button>
        {showSteps && (
          <div className="mt-1.5 flex flex-col gap-1">
            {config.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={step.name} onChange={e => updateStep(i, { name: e.target.value })}
                  aria-label={`Step ${i + 1} name`}
                  placeholder="name" className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]" />
                <input type="number" min="0" max="100" step="5" value={step.value} onChange={e => updateStep(i, { value: Number(e.target.value), name: step.name === String(step.value) ? e.target.value : step.name })}
                  aria-label={`Step ${step.name} value`}
                  className="w-14 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">%</span>
                <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">&times;</button>
              </div>
            ))}
            <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">+ Add step</button>
          </div>
        )}
      </div>
    </div>
  );
}
