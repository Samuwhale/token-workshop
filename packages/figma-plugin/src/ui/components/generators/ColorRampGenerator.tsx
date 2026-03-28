import { labToHex } from '@tokenmanager/core';
import type { ColorRampConfig, GeneratedTokenResult } from '../../hooks/useGenerators';
import { OverrideRow, OverrideTable } from './generatorShared';
import { BezierCurveEditor } from './BezierCurveEditor';

/** Convert a Lab L* value to a neutral-gray hex swatch color. */
function lstarToSwatchHex(Lstar: number): string {
  return labToHex(Lstar, 0, 0);
}

/** Swatch hex for chroma boost: fixed reference hue (220°, blue-ish) at L=55, base chroma 25. */
function chromaBoostToSwatchHex(chromaBoost: number): string {
  const rad = (220 * Math.PI) / 180;
  const chroma = 25 * chromaBoost;
  return labToHex(55, chroma * Math.cos(rad), chroma * Math.sin(rad));
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_COLOR_RAMP_CONFIG: ColorRampConfig = {
  steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  lightEnd: 97,
  darkEnd: 8,
  chromaBoost: 1.0,
  includeSource: false,
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const COLOR_STEP_PRESETS = [
  { label: 'Tailwind (11)', description: '11 steps (50–950) matching the Tailwind CSS color palette', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] },
  { label: 'Material (10)', description: '10 steps (50–900) matching the Material Design color palette', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { label: 'Compact (5)', description: '5 steps (100, 300, 500, 700, 900) — minimal palette for simple use cases', steps: [100, 300, 500, 700, 900] },
];

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function ColorSwatchPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-0.5 rounded overflow-hidden h-8">
        {tokens.map((t) => (
          <div
            key={t.stepName}
            className="flex-1 min-w-0 relative"
            style={{ background: String(t.value) }}
            title={`${t.path}: ${String(t.value)}`}
          >
            {t.isOverridden && (
              <div className="absolute inset-0 flex items-center justify-center">
                <svg width="8" height="8" viewBox="0 0 12 12" fill="white" opacity="0.8">
                  <path d="M8 1.5L6.5 3 9 5.5l1.5-1.5L8 1.5zM5.5 4l-4 4 .5 2 2-.5 4-4L5.5 4z"/>
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {tokens.length > 0 && (
          <>
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{tokens[0].stepName}</span>
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{tokens[tokens.length - 1].stepName}</span>
          </>
        )}
      </div>
      <OverrideTable tokens={tokens} overrides={overrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function ColorRampConfigEditor({ config, onChange }: { config: ColorRampConfig; onChange: (c: ColorRampConfig) => void }) {
  const activePresetIdx = COLOR_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s === config.steps[i])
  );
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => onChange({ ...config, steps: [...preset.steps] })}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${activePresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            Light end L*
            <span
              className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ background: lstarToSwatchHex(config.lightEnd) }}
              title={`L* ${config.lightEnd} neutral gray`}
            />
            <span className="text-[var(--color-figma-text)]">{config.lightEnd}</span>
          </label>
          <input type="range" min={80} max={99} step={1} value={config.lightEnd} onChange={e => onChange({ ...config, lightEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </div>
        <div>
          <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            Dark end L*
            <span
              className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ background: lstarToSwatchHex(config.darkEnd) }}
              title={`L* ${config.darkEnd} neutral gray`}
            />
            <span className="text-[var(--color-figma-text)]">{config.darkEnd}</span>
          </label>
          <input type="range" min={2} max={30} step={1} value={config.darkEnd} onChange={e => onChange({ ...config, darkEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </div>
      </div>
      <BezierCurveEditor
        curve={config.lightnessCurve ?? [0.42, 0, 0.58, 1]}
        lightEnd={config.lightEnd}
        darkEnd={config.darkEnd}
        stepCount={config.steps.length}
        onChange={c => onChange({ ...config, lightnessCurve: c })}
      />
      <div>
        <label className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
          Chroma boost
          <span
            className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
            style={{ background: chromaBoostToSwatchHex(config.chromaBoost) }}
            title={`Chroma boost ${config.chromaBoost.toFixed(1)}x (reference hue)`}
          />
          <span className="text-[var(--color-figma-text)]">{config.chromaBoost.toFixed(1)}x</span>
        </label>
        <input type="range" min={0.3} max={2.0} step={0.1} value={config.chromaBoost} onChange={e => onChange({ ...config, chromaBoost: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        <div className="flex justify-between mt-0.5">
          <span className="text-[8px] text-[var(--color-figma-text-secondary)]">0.3 muted</span>
          <span className="text-[8px] text-[var(--color-figma-text-secondary)]">2.0 vivid</span>
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={config.includeSource} onChange={e => onChange({ ...config, includeSource: e.target.checked })} className="accent-[var(--color-figma-accent)] w-3 h-3" />
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Pin source color to step</span>
        </label>
        {config.includeSource && (
          <div className="mt-1.5 ml-5">
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Pin to step</label>
            <select value={config.sourceStep ?? config.steps[Math.floor(config.steps.length / 2)]} onChange={e => onChange({ ...config, sourceStep: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]">
              {config.steps.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
