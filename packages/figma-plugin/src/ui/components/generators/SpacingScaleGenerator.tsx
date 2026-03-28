import { useState, useCallback } from 'react';
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
];

// ---------------------------------------------------------------------------
// Preview (also used by borderRadiusScale)
// ---------------------------------------------------------------------------

export function SpacingPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
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
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
            <div className="flex-1 h-2 rounded-sm bg-[var(--color-figma-bg)] overflow-hidden">
              <div className="h-full rounded-sm bg-[var(--color-figma-accent)]" style={{ width: `${pct}%`, opacity: 0.7 }} />
            </div>
            <span className="w-14 text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 text-right">{formatValue(t.value)}</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function SpacingScaleConfigEditor({ config, onChange }: { config: SpacingScaleConfig; onChange: (c: SpacingScaleConfig) => void }) {
  const [customText, setCustomText] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [customError, setCustomError] = useState('');
  const activePresetIdx = SPACING_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const handleCustomCommit = useCallback(() => {
    const parts = customText.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) { setCustomError('Enter comma-separated multipliers.'); return; }
    const steps: SpacingStep[] = [];
    for (const part of parts) {
      const num = parseFloat(part);
      if (isNaN(num) || num <= 0) { setCustomError(`Invalid value: "${part}"`); return; }
      steps.push({ name: String(num), multiplier: num });
    }
    setCustomError('');
    onChange({ ...config, steps });
  }, [customText, config, onChange]);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5 flex-wrap">
          {SPACING_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => { setIsCustom(false); onChange({ ...config, steps: preset.steps.map(s => ({ ...s })) }); }}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!isCustom && activePresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
          <button onClick={() => { setIsCustom(true); setCustomText(config.steps.map(s => s.multiplier).join(', ')); }}
            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${isCustom ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >Custom</button>
        </div>
        {isCustom && (
          <div className="mt-1.5">
            <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="0.5, 1, 1.5, 2, 3, 4, ..." rows={2}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none font-mono" />
            {customError && <p className="text-[10px] text-[var(--color-figma-error)] mt-0.5">{customError}</p>}
            <button onClick={handleCustomCommit} className="mt-1 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] hover:bg-[var(--color-figma-accent-hover)]">Apply</button>
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
