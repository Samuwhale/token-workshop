import { useState } from 'react';
import type { TypeScaleConfig, TypeScaleStep, GeneratedTokenResult } from '../../hooks/useGenerators';
import { OverrideRow, formatValue, isDimensionLike } from './generatorShared';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_TYPE_SCALE_CONFIG: TypeScaleConfig = {
  steps: [
    { name: 'xs', exponent: -2 },
    { name: 'sm', exponent: -1 },
    { name: 'base', exponent: 0 },
    { name: 'lg', exponent: 1 },
    { name: 'xl', exponent: 2 },
    { name: '2xl', exponent: 3 },
    { name: '3xl', exponent: 4 },
  ],
  ratio: 1.25,
  unit: 'rem',
  baseStep: 'base',
  roundTo: 3,
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const TYPE_RATIO_PRESETS = [
  { label: 'Minor Second', description: 'Ratio 1.067 — very subtle scale, tight steps ideal for dense UIs', value: 1.067 },
  { label: 'Major Second', description: 'Ratio 1.125 — gentle scale, good for body text hierarchies', value: 1.125 },
  { label: 'Minor Third', description: 'Ratio 1.2 — moderate scale, common for UI type systems', value: 1.2 },
  { label: 'Major Third', description: 'Ratio 1.25 — balanced scale, used by Tailwind CSS', value: 1.25 },
  { label: 'Perfect Fourth', description: 'Ratio 1.333 — strong scale with clear visual hierarchy', value: 1.333 },
  { label: 'Golden Ratio', description: 'Ratio 1.618 — dramatic scale with large jumps between sizes', value: 1.618 },
];

const TYPE_STEP_PRESETS = [
  {
    label: 'T-shirt (7)',
    description: '7 named steps: xs, sm, base, lg, xl, 2xl, 3xl',
    steps: [
      { name: 'xs', exponent: -2 },
      { name: 'sm', exponent: -1 },
      { name: 'base', exponent: 0 },
      { name: 'lg', exponent: 1 },
      { name: 'xl', exponent: 2 },
      { name: '2xl', exponent: 3 },
      { name: '3xl', exponent: 4 },
    ] as TypeScaleStep[],
  },
  {
    label: 'Extended (9)',
    description: '9 named steps: 2xs through 4xl — wider range for complex type hierarchies',
    steps: [
      { name: '2xs', exponent: -3 },
      { name: 'xs', exponent: -2 },
      { name: 'sm', exponent: -1 },
      { name: 'base', exponent: 0 },
      { name: 'lg', exponent: 1 },
      { name: 'xl', exponent: 2 },
      { name: '2xl', exponent: 3 },
      { name: '3xl', exponent: 4 },
      { name: '4xl', exponent: 5 },
    ] as TypeScaleStep[],
  },
  {
    label: 'Numeric',
    description: '9 steps named by pixel size: 10, 12, 14, 16, 20, 24, 32, 40, 48',
    steps: [
      { name: '10', exponent: -3 },
      { name: '12', exponent: -2 },
      { name: '14', exponent: -1 },
      { name: '16', exponent: 0 },
      { name: '20', exponent: 1 },
      { name: '24', exponent: 2 },
      { name: '32', exponent: 3 },
      { name: '40', exponent: 4 },
      { name: '48', exponent: 5 },
    ] as TypeScaleStep[],
  },
];

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function TypeScalePreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const valStr = formatValue(t.value);
        const numVal = isDimensionLike(t.value) ? t.value.value : parseFloat(valStr) || 0;
        const unit = isDimensionLike(t.value) ? t.value.unit : '';
        const displayPx = Math.max(8, Math.min(32, numVal * (unit === 'rem' ? 16 : 1)));
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
            <span className="text-[var(--color-figma-text)] leading-none font-medium" style={{ fontSize: `${displayPx}px` }}>Ag</span>
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 ml-auto">{valStr}</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function TypeScaleConfigEditor({ config, onChange }: { config: TypeScaleConfig; onChange: (c: TypeScaleConfig) => void }) {
  const [customRatio, setCustomRatio] = useState('');
  const [isCustomRatio, setIsCustomRatio] = useState(false);
  const activePresetRatio = TYPE_RATIO_PRESETS.find(p => Math.abs(p.value - config.ratio) < 0.0001);
  const activeStepPresetIdx = TYPE_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const handleRatioPreset = (val: number) => { setIsCustomRatio(false); onChange({ ...config, ratio: val }); };
  const handleCustomRatioCommit = () => {
    const val = parseFloat(customRatio);
    if (!isNaN(val) && val > 1) onChange({ ...config, ratio: Math.round(val * 1000) / 1000 });
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Scale ratio</label>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 flex-wrap">
            {TYPE_RATIO_PRESETS.map(preset => (
              <button key={preset.value} title={`${preset.label} — ${preset.description}`} onClick={() => handleRatioPreset(preset.value)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!isCustomRatio && activePresetRatio?.value === preset.value ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >{preset.label.split(' ')[0]} ({preset.value})</button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Custom:</span>
            <input type="number" min="1.001" max="4" step="0.001" value={isCustomRatio ? customRatio : config.ratio}
              onChange={e => { setIsCustomRatio(true); setCustomRatio(e.target.value); }}
              onBlur={handleCustomRatioCommit} onKeyDown={e => e.key === 'Enter' && handleCustomRatioCommit()}
              aria-label="Custom scale ratio"
              className="w-20 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5">
          {TYPE_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => onChange({ ...config, steps: preset.steps.map(s => ({ ...s })) })}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${activeStepPresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Unit</label>
          <div className="flex gap-1">
            {(['rem', 'px'] as const).map(u => (
              <button key={u} onClick={() => onChange({ ...config, unit: u })}
                className={`px-3 py-1 rounded text-[10px] font-medium border transition-colors ${config.unit === u ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >{u}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Round to</label>
          <div className="flex gap-1">
            {([0, 1, 2, 3] as const).map(n => (
              <button key={n} onClick={() => onChange({ ...config, roundTo: n })}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${config.roundTo === n ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >{n}dp</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
