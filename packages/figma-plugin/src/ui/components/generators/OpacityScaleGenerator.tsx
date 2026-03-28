import { useState, useCallback } from 'react';
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

export function OpacityPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const val = Number(t.value);
        const pct = Math.min(100, Math.max(0, val * 100));
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
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
  const [isCustom, setIsCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState('');
  const activePresetIdx = OPACITY_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const handleCustomCommit = useCallback(() => {
    const parts = customText.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) { setCustomError('Enter comma-separated values 0–100.'); return; }
    const steps: Array<{ name: string; value: number }> = [];
    for (const part of parts) {
      const num = parseFloat(part);
      if (isNaN(num) || num < 0 || num > 100) { setCustomError(`Invalid value: "${part}"`); return; }
      steps.push({ name: String(num), value: num });
    }
    setCustomError('');
    onChange({ steps });
  }, [customText, onChange]);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Preset</label>
        <div className="flex gap-1.5 flex-wrap">
          {OPACITY_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => { setIsCustom(false); onChange({ steps: preset.steps.map(s => ({ ...s })) }); }}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!isCustom && activePresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
          <button onClick={() => { setIsCustom(true); setCustomText(config.steps.map(s => s.value).join(', ')); }}
            className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${isCustom ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >Custom</button>
        </div>
        {isCustom && (
          <div className="mt-1.5">
            <textarea value={customText} onChange={e => setCustomText(e.target.value)} placeholder="0, 10, 25, 50, 75, 100" rows={2}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none font-mono" />
            {customError && <p role="alert" className="text-[10px] text-[var(--color-figma-error)] mt-0.5">{customError}</p>}
            <button onClick={handleCustomCommit} className="mt-1 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] hover:bg-[var(--color-figma-accent-hover)]">Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}
