import type { BorderRadiusScaleConfig, BorderRadiusStep, GeneratedTokenResult } from '../../hooks/useRecipes';
import { OverrideRow, formatValue, isDimensionLike } from './recipeShared';

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
                placeholder="name" className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]" />
              {step.exactValue !== undefined ? (
                <>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">exact:</span>
                  <input type="number" value={step.exactValue} onChange={e => updateStep(i, { exactValue: Number(e.target.value) })}
                    aria-label={`Step ${step.name} exact value`}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: undefined, multiplier: 1 })} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">×exact</button>
                </>
              ) : (
                <>
                  <span className="text-[10px] text-[var(--color-figma-text-secondary)]">×</span>
                  <input type="number" step="0.1" value={step.multiplier} onChange={e => updateStep(i, { multiplier: Number(e.target.value) })}
                    aria-label={`Step ${step.name} multiplier`}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: 0 })} className="text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">+exact</button>
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

// ---------------------------------------------------------------------------
// Preview — shows rectangles with actual corner radii instead of bar charts
// ---------------------------------------------------------------------------

// ViewBox dimensions for the preview rect
const PREVIEW_W = 44;
const PREVIEW_H = 24;
// Max rx in viewBox units — half the height gives a full pill
const MAX_RX = PREVIEW_H / 2;

export function BorderRadiusPreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const val = isDimensionLike(t.value) ? t.value.value : parseFloat(String(t.value)) || 0;
        // Map the px value directly to SVG rx, capping at MAX_RX so large values become pills
        const rx = Math.min(val, MAX_RX);
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
            <div className="flex-1 flex items-center pl-1">
              <svg width={PREVIEW_W} height={PREVIEW_H} viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} fill="none" aria-hidden="true">
                <rect x="0" y="0" width={PREVIEW_W} height={PREVIEW_H} rx={rx} ry={rx}
                  fill="var(--color-figma-accent)" fillOpacity="0.7" />
              </svg>
            </div>
            <span className="w-14 text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 text-right">{formatValue(t.value)}</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}
