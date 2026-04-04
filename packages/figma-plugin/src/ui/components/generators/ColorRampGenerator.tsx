import { labToHex } from '@tokenmanager/core';
import type { ColorRampConfig, GeneratedTokenResult } from '../../hooks/useGenerators';
import type { TokenMapEntry } from '../../../shared/types';
import { OverrideRow, OverrideTable } from './generatorShared';
import { BezierCurveEditor } from './BezierCurveEditor';
import { wcagContrast } from '../../shared/colorUtils';
import { TokenRefInput } from '../TokenRefInput';

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
// Contrast preview
// ---------------------------------------------------------------------------

/** WCAG level: "AAA" ≥7:1, "AA" ≥4.5:1, null = fail */
function wcagLevel(ratio: number | null): 'AAA' | 'AA' | null {
  if (ratio === null) return null;
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  return null;
}

/** One row of contrast badges (vs white or vs black) aligned with the swatch columns. */
function ContrastBadgeRow({ tokens, bg, label }: {
  tokens: GeneratedTokenResult[];
  bg: '#ffffff' | '#000000';
  label: string;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <span className="w-[18px] shrink-0 text-[7px] text-[var(--color-figma-text-secondary)] leading-none select-none">{label}</span>
      <div className="flex gap-0.5 flex-1 min-w-0">
        {tokens.map((t) => {
          const hex = String(t.value);
          const ratio = wcagContrast(hex, bg);
          const level = wcagLevel(ratio);
          const ratioStr = ratio !== null ? `${ratio.toFixed(1)}:1` : 'n/a';
          const bgLabel = bg === '#ffffff' ? 'white' : 'black';
          return (
            <div
              key={t.stepName}
              className="flex-1 min-w-0 flex items-center justify-center"
              style={{ height: '13px' }}
              title={`${t.stepName} on ${bgLabel}: ${ratioStr}${level ? ` (${level})` : ' (fail AA)'}`}
            >
              {level ? (
                <span
                  className={`text-[6px] font-bold leading-none px-[2px] rounded-sm ${
                    level === 'AAA'
                      ? 'bg-green-500 text-white'
                      : 'bg-amber-400 text-white'
                  }`}
                >
                  {level}
                </span>
              ) : (
                <span className="text-[7px] text-[var(--color-figma-text-secondary)]/40 leading-none" aria-hidden="true">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function ColorSwatchPreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* Tall swatch strip with step labels — click any swatch to edit */}
      <div className="flex gap-0.5 rounded overflow-hidden" style={{ height: tokens.length > 7 ? '48px' : '56px' }}>
        {tokens.map((t) => {
          const hex = String(t.value);
          const idx = tokens.indexOf(t);
          const isLight = idx < tokens.length * 0.4;
          const isOverridden = Boolean(overrides[t.stepName]);
          return (
            <SwatchCell
              key={t.stepName}
              token={t}
              hex={hex}
              isLight={isLight}
              isOverridden={isOverridden}
              isOverwrite={overwritePaths?.has(t.path)}
              onOverrideChange={onOverrideChange}
              onOverrideClear={onOverrideClear}
            />
          );
        })}
      </div>
      {/* WCAG contrast badges: green=AAA (>=7:1), amber=AA (>=4.5:1), dash=fail */}
      {tokens.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <ContrastBadgeRow tokens={tokens} bg="#ffffff" label="on ◻" />
          <ContrastBadgeRow tokens={tokens} bg="#000000" label="on ◼" />
        </div>
      )}
      <OverrideTable tokens={tokens} overrides={overrides} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} overwritePaths={overwritePaths} />
    </div>
  );
}

/** Individual swatch cell with click-to-edit via native color input. */
function SwatchCell({
  token,
  hex,
  isLight,
  isOverridden,
  isOverwrite,
  onOverrideChange,
  onOverrideClear,
}: {
  token: GeneratedTokenResult;
  hex: string;
  isLight: boolean;
  isOverridden: boolean;
  isOverwrite?: boolean;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  const colorInputRef = { current: null as HTMLInputElement | null };
  const normalizedHex = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#808080';

  const handleClick = () => {
    colorInputRef.current?.click();
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onOverrideChange(token.stepName, e.target.value, true);
  };

  return (
    <div
      className="flex-1 min-w-0 relative flex flex-col items-center justify-end pb-1 cursor-pointer group/swatch"
      style={{ background: hex }}
      title={`${token.stepName}: ${hex} — click to edit`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(); } }}
    >
      {/* Hidden native color input */}
      <input
        ref={el => { colorInputRef.current = el; }}
        type="color"
        value={normalizedHex}
        onChange={handleColorChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        tabIndex={-1}
        aria-label={`Edit color for step ${token.stepName}`}
      />

      {/* Step label */}
      <span className={`text-[7px] font-mono leading-none ${isLight ? 'text-black/50' : 'text-white/60'}`}>{token.stepName}</span>

      {/* Lock badge for overridden swatches */}
      {isOverridden && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2" title="Locked override">
          <svg width="8" height="8" viewBox="0 0 12 12" fill="white" opacity="0.85" aria-hidden="true">
            <path d="M9 5V4a3 3 0 0 0-6 0v1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1ZM4 4a2 2 0 1 1 4 0v1H4V4Z" />
          </svg>
        </div>
      )}

      {/* Clear button appears on hover for overridden swatches */}
      {isOverridden && (
        <button
          onClick={e => { e.stopPropagation(); onOverrideClear(token.stepName); }}
          className="absolute top-0.5 right-0.5 p-0.5 rounded opacity-0 group-hover/swatch:opacity-100 transition-opacity bg-black/30 text-white hover:bg-red-500/80"
          title="Clear override"
          aria-label="Clear override"
        >
          <svg width="6" height="6" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      )}

      {/* Edit hint on hover */}
      <div className={`absolute inset-0 flex items-center justify-center opacity-0 group-hover/swatch:opacity-100 transition-opacity ${isLight ? 'bg-black/5' : 'bg-white/10'}`} aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5 1 11l.5-2.5Z" />
        </svg>
      </div>

      {isOverwrite && !isOverridden && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--color-figma-warning)]" aria-hidden="true" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function ColorRampConfigEditor({ config, onChange, sourceHex, allTokensFlat, pathToSet }: {
  config: ColorRampConfig;
  onChange: (c: ColorRampConfig) => void;
  sourceHex?: string;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}) {
  const activePresetIdx = COLOR_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s === config.steps[i])
  );

  const setTokenRef = (field: 'lightEnd' | 'darkEnd' | 'chromaBoost', tokenPath: string, resolvedValue: unknown) => {
    const numVal = typeof resolvedValue === 'number' ? resolvedValue : parseFloat(String(resolvedValue));
    const safeVal = isFinite(numVal) ? numVal : config[field];
    onChange({
      ...config,
      [field]: safeVal,
      $tokenRefs: { ...config.$tokenRefs, [field]: tokenPath },
    });
  };

  const clearTokenRef = (field: 'lightEnd' | 'darkEnd' | 'chromaBoost') => {
    const refs = { ...config.$tokenRefs };
    delete refs[field];
    const hasRefs = Object.keys(refs).length > 0;
    onChange({ ...config, $tokenRefs: hasRefs ? refs : undefined });
  };

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
        <TokenRefInput
          label="Light end L*"
          tokenRef={config.$tokenRefs?.lightEnd}
          valueLabel={String(config.lightEnd)}
          filterType="number"
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onLink={(path, val) => setTokenRef('lightEnd', path, val)}
          onUnlink={() => clearTokenRef('lightEnd')}
        >
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ background: lstarToSwatchHex(config.lightEnd) }}
              title={`L* ${config.lightEnd} neutral gray`}
            />
            <span className="text-[var(--color-figma-text)]">{config.lightEnd}</span>
          </div>
          <input type="range" min={80} max={99} step={1} value={config.lightEnd} onChange={e => onChange({ ...config, lightEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </TokenRefInput>
        <TokenRefInput
          label="Dark end L*"
          tokenRef={config.$tokenRefs?.darkEnd}
          valueLabel={String(config.darkEnd)}
          filterType="number"
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onLink={(path, val) => setTokenRef('darkEnd', path, val)}
          onUnlink={() => clearTokenRef('darkEnd')}
        >
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ background: lstarToSwatchHex(config.darkEnd) }}
              title={`L* ${config.darkEnd} neutral gray`}
            />
            <span className="text-[var(--color-figma-text)]">{config.darkEnd}</span>
          </div>
          <input type="range" min={2} max={30} step={1} value={config.darkEnd} onChange={e => onChange({ ...config, darkEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </TokenRefInput>
      </div>
      <BezierCurveEditor
        curve={config.lightnessCurve ?? [0.42, 0, 0.58, 1]}
        lightEnd={config.lightEnd}
        darkEnd={config.darkEnd}
        stepCount={config.steps.length}
        onChange={c => onChange({ ...config, lightnessCurve: c })}
        sourceHex={sourceHex}
        chromaBoost={config.chromaBoost}
      />
      <TokenRefInput
        label="Chroma boost"
        tokenRef={config.$tokenRefs?.chromaBoost}
        valueLabel={`${config.chromaBoost.toFixed(1)}x`}
        filterType="number"
        allTokensFlat={allTokensFlat}
        pathToSet={pathToSet}
        onLink={(path, val) => setTokenRef('chromaBoost', path, val)}
        onUnlink={() => clearTokenRef('chromaBoost')}
      >
        <div>
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-black/10 shrink-0"
              style={{ background: chromaBoostToSwatchHex(config.chromaBoost) }}
              title={`Chroma boost ${config.chromaBoost.toFixed(1)}x (reference hue)`}
            />
            <span className="text-[var(--color-figma-text)]">{config.chromaBoost.toFixed(1)}x</span>
          </div>
          <input type="range" min={0.3} max={2.0} step={0.1} value={config.chromaBoost} onChange={e => onChange({ ...config, chromaBoost: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">0.3 muted</span>
            <span className="text-[8px] text-[var(--color-figma-text-secondary)]">2.0 vivid</span>
          </div>
        </div>
      </TokenRefInput>
      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={config.includeSource} onChange={e => onChange({ ...config, includeSource: e.target.checked })} className="accent-[var(--color-figma-accent)] w-3 h-3" />
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Pin source color to step</span>
        </label>
        {config.includeSource && (
          <div className="mt-1.5 ml-5">
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Pin to step</label>
            <select value={config.sourceStep ?? config.steps[Math.floor(config.steps.length / 2)]} onChange={e => onChange({ ...config, sourceStep: Number(e.target.value) })}
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]">
              {config.steps.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
