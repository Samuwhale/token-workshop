import { useState } from 'react';
import type { SpacingScaleConfig, SpacingStep, GeneratedTokenResult } from '../../hooks/useGenerators';
import { OverrideRow, formatValue, isDimensionLike } from './generatorShared';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_SPACING_SCALE_CONFIG: SpacingScaleConfig = {
  steps: [
    { name: '0.5', multiplier: 0.5 },
    { name: '1', multiplier: 1 },
    { name: '1.5', multiplier: 1.5 },
    { name: '2', multiplier: 2 },
    { name: '3', multiplier: 3 },
    { name: '4', multiplier: 4 },
    { name: '5', multiplier: 5 },
    { name: '6', multiplier: 6 },
    { name: '8', multiplier: 8 },
    { name: '10', multiplier: 10 },
    { name: '12', multiplier: 12 },
    { name: '16', multiplier: 16 },
    { name: '20', multiplier: 20 },
    { name: '24', multiplier: 24 },
  ],
  unit: 'px',
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const SPACING_STEP_PRESETS = [
  {
    label: 'Tailwind',
    description: '14 steps (0.5–24× base unit) matching the Tailwind CSS spacing scale',
    steps: DEFAULT_SPACING_SCALE_CONFIG.steps,
  },
  {
    label: '8pt Grid',
    description: '8 steps on a strict 8pt grid (1×–12× base unit) for pixel-perfect layouts',
    steps: [
      { name: '1', multiplier: 1 },
      { name: '2', multiplier: 2 },
      { name: '3', multiplier: 3 },
      { name: '4', multiplier: 4 },
      { name: '6', multiplier: 6 },
      { name: '8', multiplier: 8 },
      { name: '10', multiplier: 10 },
      { name: '12', multiplier: 12 },
    ] as SpacingStep[],
  },
  {
    label: 'Semantic',
    description: '5 named steps (sm, base, md, lg, xl) — intent-based responsive sizing',
    steps: [
      { name: 'sm', multiplier: 0.75 },
      { name: 'base', multiplier: 1 },
      { name: 'md', multiplier: 1.25 },
      { name: 'lg', multiplier: 1.5 },
      { name: 'xl', multiplier: 2 },
    ] as SpacingStep[],
  },
];

// ---------------------------------------------------------------------------
// Preview (also used by borderRadiusScale)
// ---------------------------------------------------------------------------

export function SpacingPreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  const maxVal = Math.max(...tokens.map(t => {
    return isDimensionLike(t.value) ? t.value.value : parseFloat(String(t.value)) || 0;
  }), 1);
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const val = isDimensionLike(t.value) ? t.value.value : parseFloat(String(t.value)) || 0;
        const pct = Math.max(4, (val / maxVal) * 100);
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
            <div className="flex-1 h-2 rounded-sm bg-[var(--color-figma-bg)] overflow-hidden">
              <div className="h-full rounded-sm bg-[var(--color-figma-accent)]" style={{ width: `${pct}%`, opacity: 0.7 }} />
            </div>
            <span className="w-14 text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 text-right">{formatValue(t.value)}</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function SpacingScaleConfigEditor({ config, onChange, onInteractionStart }: { config: SpacingScaleConfig; onChange: (c: SpacingScaleConfig) => void; onInteractionStart?: () => void }) {
  const [showSteps, setShowSteps] = useState(false);
  const activePresetIdx = SPACING_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const updateStep = (idx: number, updates: Partial<SpacingStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ ...config, steps });
  };
  const addStep = () => {
    const maxMult = Math.max(...config.steps.map(s => s.multiplier), 0);
    const next = Math.round((maxMult + 1) * 10) / 10;
    onChange({ ...config, steps: [...config.steps, { name: String(next), multiplier: next }] });
  };
  const removeStep = (idx: number) => onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5 flex-wrap">
          {SPACING_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => { onInteractionStart?.(); setShowSteps(false); onChange({ ...config, steps: preset.steps.map(s => ({ ...s })) }); }}
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
                <span className="text-[10px] text-[var(--color-figma-text-secondary)]">&times;</span>
                <input type="number" step="0.5" value={step.multiplier} onFocus={onInteractionStart} onChange={e => updateStep(i, { multiplier: Number(e.target.value), name: step.name === String(step.multiplier) ? e.target.value : step.name })}
                  aria-label={`Step ${step.name} multiplier`}
                  className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">&times;</button>
              </div>
            ))}
            <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">+ Add step</button>
          </div>
        )}
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
