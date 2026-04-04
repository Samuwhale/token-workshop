import { useState } from 'react';
import type { ShadowScaleConfig, ShadowScaleStep, GeneratedTokenResult } from '../../hooks/useGenerators';
import type { TokenMapEntry } from '../../../shared/types';
import { OverrideRow, CompactColorInput } from './generatorShared';
import { TokenRefInput } from '../TokenRefInput';
import { Collapsible } from '../Collapsible';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_SHADOW_SCALE_CONFIG: ShadowScaleConfig = {
  color: '#000000',
  steps: [
    { name: 'sm',  offsetX: 0, offsetY: 1,  blur: 2,  spread: 0,  opacity: 0.05 },
    { name: 'md',  offsetX: 0, offsetY: 4,  blur: 6,  spread: -1, opacity: 0.1  },
    { name: 'lg',  offsetX: 0, offsetY: 10, blur: 15, spread: -3, opacity: 0.1  },
    { name: 'xl',  offsetX: 0, offsetY: 20, blur: 25, spread: -5, opacity: 0.1  },
    { name: '2xl', offsetX: 0, offsetY: 25, blur: 50, spread: -12, opacity: 0.25 },
  ],
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const SHADOW_PRESETS = [
  {
    label: 'Tailwind (5)',
    description: '5 semantic steps following Tailwind CSS shadow scale — sm through 2xl',
    color: '#000000',
    steps: DEFAULT_SHADOW_SCALE_CONFIG.steps,
  },
  {
    label: 'Material (5)',
    description: '5 elevation levels inspired by Material Design — 1dp through 16dp',
    color: '#000000',
    steps: [
      { name: '1dp',  offsetX: 0, offsetY: 1,  blur: 3,  spread: 0, opacity: 0.12 },
      { name: '2dp',  offsetX: 0, offsetY: 1,  blur: 5,  spread: 0, opacity: 0.14 },
      { name: '4dp',  offsetX: 0, offsetY: 2,  blur: 4,  spread: -1, opacity: 0.2  },
      { name: '8dp',  offsetX: 0, offsetY: 4,  blur: 5,  spread: -2, opacity: 0.2  },
      { name: '16dp', offsetX: 0, offsetY: 8,  blur: 10, spread: -4, opacity: 0.22 },
    ] as ShadowScaleStep[],
  },
  {
    label: 'Subtle (3)',
    description: '3 subtle steps — good for cards and surfaces with minimal depth',
    color: '#000000',
    steps: [
      { name: 'sm', offsetX: 0, offsetY: 1, blur: 2,  spread: 0, opacity: 0.04 },
      { name: 'md', offsetX: 0, offsetY: 2, blur: 8,  spread: 0, opacity: 0.06 },
      { name: 'lg', offsetX: 0, offsetY: 4, blur: 16, spread: 0, opacity: 0.08 },
    ] as ShadowScaleStep[],
  },
];

// ---------------------------------------------------------------------------
// Helper: format shadow value for display
// ---------------------------------------------------------------------------

function formatShadowStep(step: ShadowScaleStep): string {
  return `${step.offsetX}px ${step.offsetY}px ${step.blur}px ${step.spread}px @${Math.round(step.opacity * 100)}%`;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function ShadowPreview({ tokens, config, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  config: ShadowScaleConfig;
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  const bgBase = config.color.replace('#', '').slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      {tokens.map((t) => {
        const step = config.steps.find(s => s.name === t.stepName);
        const alpha = step ? Math.round(Math.max(0, Math.min(1, step.opacity)) * 255) : 0;
        const alphaHex = alpha.toString(16).padStart(2, '0');
        const shadowColor = `#${bgBase}${alphaHex}`;
        const shadowCss = step
          ? `${step.offsetX}px ${step.offsetY}px ${step.blur}px ${step.spread}px ${shadowColor}`
          : 'none';

        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
            <div className="flex flex-1 items-center gap-2 min-w-0">
              {/* Shadow swatch */}
              <div
                className="w-8 h-5 rounded shrink-0 bg-[var(--color-figma-bg)]"
                style={{ boxShadow: shadowCss }}
                title={shadowCss}
                aria-label={`Shadow preview for ${t.stepName}`}
              />
              {/* Description */}
              <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                {step ? formatShadowStep(step) : String(t.value)}
              </span>
            </div>
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function ShadowScaleConfigEditor({ config, onChange, allTokensFlat, pathToSet }: {
  config: ShadowScaleConfig;
  onChange: (c: ShadowScaleConfig) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}) {
  const [showSteps, setShowSteps] = useState(false);

  const activePresetIdx = SHADOW_PRESETS.findIndex(
    p => p.color === config.color && p.steps.length === config.steps.length &&
      p.steps.every((s, i) => s.name === config.steps[i]?.name),
  );

  const updateStep = (idx: number, updates: Partial<ShadowScaleStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ ...config, steps });
  };

  const addStep = () => {
    const last = config.steps[config.steps.length - 1];
    const next: ShadowScaleStep = last
      ? { name: `step${config.steps.length + 1}`, offsetX: 0, offsetY: last.offsetY * 2, blur: last.blur * 2, spread: last.spread, opacity: Math.min(1, last.opacity * 1.5) }
      : { name: 'new', offsetX: 0, offsetY: 4, blur: 8, spread: 0, opacity: 0.1 };
    onChange({ ...config, steps: [...config.steps, next] });
  };

  const removeStep = (idx: number) => onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });

  const setColorTokenRef = (tokenPath: string, resolvedValue: unknown) => {
    const colorVal = typeof resolvedValue === 'string' ? resolvedValue : config.color;
    onChange({ ...config, color: colorVal, $tokenRefs: { ...config.$tokenRefs, color: tokenPath } });
  };

  const clearColorTokenRef = () => {
    const refs = { ...config.$tokenRefs };
    delete refs.color;
    onChange({ ...config, $tokenRefs: Object.keys(refs).length > 0 ? refs : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Preset buttons */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Preset</label>
        <div className="flex gap-1.5 flex-wrap">
          {SHADOW_PRESETS.map((preset, i) => (
            <button
              key={preset.label}
              title={preset.description}
              onClick={() => { setShowSteps(false); onChange({ color: preset.color, steps: preset.steps.map(s => ({ ...s })) }); }}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                !showSteps && activePresetIdx === i
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >{preset.label}</button>
          ))}
        </div>
      </div>

      {/* Base color */}
      <TokenRefInput
        label="Shadow color"
        tokenRef={config.$tokenRefs?.color}
        valueLabel={config.color.slice(0, 7)}
        filterType="color"
        allTokensFlat={allTokensFlat}
        pathToSet={pathToSet}
        onLink={setColorTokenRef}
        onUnlink={clearColorTokenRef}
      >
        <div className="flex items-center gap-2">
          <CompactColorInput
            value={config.color}
            onChange={hex => onChange({ ...config, color: hex })}
            aria-label="Shadow base color"
          />
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">(opacity set per step)</span>
        </div>
      </TokenRefInput>

      {/* Steps toggle */}
      <Collapsible
        open={showSteps}
        onToggle={() => setShowSteps(v => !v)}
        label={`Edit steps (${config.steps.length})`}
      >
        <div className="mt-2 flex flex-col gap-1.5">
            {/* Column headers */}
            <div className="flex items-center gap-1 text-[9px] text-[var(--color-figma-text-secondary)] pl-0.5">
              <span className="w-12">Name</span>
              <span className="w-9 text-right">dX</span>
              <span className="w-9 text-right">dY</span>
              <span className="w-9 text-right">blur</span>
              <span className="w-9 text-right">spread</span>
              <span className="w-10 text-right">opacity</span>
            </div>
            {config.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <input
                  value={step.name}
                  onChange={e => updateStep(i, { name: e.target.value })}
                  aria-label={`Step ${i + 1} name`}
                  placeholder="name"
                  className="w-12 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]"
                />
                <input type="number" step="1" value={step.offsetX} onChange={e => updateStep(i, { offsetX: Number(e.target.value) })}
                  aria-label={`Step ${step.name} offsetX`}
                  className="w-9 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] text-right focus-visible:border-[var(--color-figma-accent)]" />
                <input type="number" step="1" value={step.offsetY} onChange={e => updateStep(i, { offsetY: Number(e.target.value) })}
                  aria-label={`Step ${step.name} offsetY`}
                  className="w-9 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] text-right focus-visible:border-[var(--color-figma-accent)]" />
                <input type="number" step="1" min="0" value={step.blur} onChange={e => updateStep(i, { blur: Number(e.target.value) })}
                  aria-label={`Step ${step.name} blur`}
                  className="w-9 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] text-right focus-visible:border-[var(--color-figma-accent)]" />
                <input type="number" step="1" value={step.spread} onChange={e => updateStep(i, { spread: Number(e.target.value) })}
                  aria-label={`Step ${step.name} spread`}
                  className="w-9 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] text-right focus-visible:border-[var(--color-figma-accent)]" />
                <input type="number" step="0.01" min="0" max="1" value={step.opacity} onChange={e => updateStep(i, { opacity: Number(e.target.value) })}
                  aria-label={`Step ${step.name} opacity`}
                  className="w-10 px-1 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] text-right focus-visible:border-[var(--color-figma-accent)]" />
                <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">&times;</button>
              </div>
            ))}
            <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">+ Add step</button>
          </div>
      </Collapsible>
    </div>
  );
}
