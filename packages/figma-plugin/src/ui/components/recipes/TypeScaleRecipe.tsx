import { useState } from 'react';
import type { TypeScaleConfig, TypeScaleStep, GeneratedTokenResult } from '../../hooks/useRecipes';
import type { TokenMapEntry } from '../../../shared/types';
import { OverrideRow, formatValue, isDimensionLike } from './recipeShared';
import { TypeScaleStaircaseEditor } from './TypeScaleStaircaseEditor';
import { TokenRefInput } from '../TokenRefInput';

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
  ratio: 1.333,
  unit: 'rem',
  baseStep: 'base',
  roundTo: 3,
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const TYPE_RATIO_PRESETS = [
  { label: 'Minor Second', description: '1.067 — subtle, tight steps', value: 1.067 },
  { label: 'Major Second', description: '1.125 — gentle, body text', value: 1.125 },
  { label: 'Minor Third', description: '1.2 — moderate, common for UI', value: 1.2 },
  { label: 'Major Third', description: '1.25 — balanced, Tailwind default', value: 1.25 },
  { label: 'Perfect Fourth', description: '1.333 — strong hierarchy', value: 1.333 },
  { label: 'Golden Ratio', description: '1.618 — dramatic jumps', value: 1.618 },
];

export const TYPE_STEP_PRESETS = [
  {
    label: 'T-shirt (7)',
    description: 'xs through 3xl',
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
    description: '2xs through 4xl',
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
    description: '10–48 by pixel size',
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
// Parameter presets — named starting-point combinations
// ---------------------------------------------------------------------------

export interface TypeScaleParameterPreset {
  id: string;
  label: string;
  description: string;
  config: Pick<TypeScaleConfig, 'steps' | 'ratio' | 'unit' | 'baseStep' | 'roundTo'>;
}

export const TYPE_SCALE_PARAMETER_PRESETS: TypeScaleParameterPreset[] = [
  {
    id: 'tight',
    label: 'Tight',
    description: 'Small ratios for dense UIs',
    config: {
      steps: [
        { name: 'xs', exponent: -2 },
        { name: 'sm', exponent: -1 },
        { name: 'base', exponent: 0 },
        { name: 'lg', exponent: 1 },
        { name: 'xl', exponent: 2 },
      ],
      ratio: 1.125,
      unit: 'rem',
      baseStep: 'base',
      roundTo: 3,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Clear hierarchy for most UIs',
    config: {
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
    },
  },
  {
    id: 'expressive',
    label: 'Expressive',
    description: 'Large jumps for editorial layouts',
    config: {
      steps: [
        { name: 'sm', exponent: -1 },
        { name: 'base', exponent: 0 },
        { name: 'lg', exponent: 1 },
        { name: 'xl', exponent: 2 },
        { name: '2xl', exponent: 3 },
        { name: '3xl', exponent: 4 },
        { name: '4xl', exponent: 5 },
      ],
      ratio: 1.414,
      unit: 'rem',
      baseStep: 'base',
      roundTo: 2,
    },
  },
];

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

// Specimen text labels assigned from largest step down
const SPECIMEN_LABELS = ['Display', 'Heading', 'Subheading', 'Body Large', 'Body text', 'Small text', 'Caption', 'Fine print'];

function toPx(t: GeneratedTokenResult): number {
  const numVal = isDimensionLike(t.value) ? t.value.value : parseFloat(formatValue(t.value)) || 0;
  const unit = isDimensionLike(t.value) ? t.value.unit : '';
  return numVal * (unit === 'rem' ? 16 : 1);
}

export function TypeScalePreview({ tokens, overrides, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  const pxValues = tokens.map(toPx);
  const maxPx = Math.max(...pxValues, 1);

  // Sort descending by px (largest first) for both ruler and specimen
  const sorted = tokens
    .map((t, i) => ({ t, px: pxValues[i] }))
    .sort((a, b) => b.px - a.px);

  return (
    <div className="flex flex-col gap-2">
      {/* Scale ruler */}
      <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5">
        <div className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase tracking-wider mb-1.5">Scale ruler</div>
        <div className="flex flex-col gap-1">
          {sorted.map(({ t, px }, rank) => {
            const barWidth = (px / maxPx) * 100;
            const prevPx = rank > 0 ? sorted[rank - 1].px : null;
            const ratio = prevPx ? (prevPx / px).toFixed(3) : null;
            return (
              <div key={t.stepName} className="flex items-center gap-1.5">
                <span className="w-8 text-right text-[9px] font-mono text-[var(--color-figma-text-secondary)] shrink-0">{t.stepName}</span>
                <div className="flex-1 flex items-center min-w-0">
                  <div className="h-2 rounded-sm bg-[var(--color-figma-accent)]/50" style={{ width: `${barWidth}%`, minWidth: 2 }} />
                </div>
                <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)] shrink-0 w-[88px] text-right">
                  {formatValue(t.value)} → {Math.round(px)}px
                </span>
                <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-50 shrink-0 w-9 text-right">
                  {ratio ? `÷${ratio}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Typography specimen */}
      <div className="flex flex-col gap-0.5">
        {sorted.map(({ t, px }, rank) => {
          const label = SPECIMEN_LABELS[Math.min(rank, SPECIMEN_LABELS.length - 1)];
          // Scale proportionally: largest step anchored at 48px, all others scaled relative to it
          const displayPx = Math.max(9, Math.round((px / maxPx) * 48));
          const lineHeight = displayPx >= 24 ? 1.15 : 1.3;
          return (
            <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear} isOverwrite={overwritePaths?.has(t.path)}>
              <span
                className="flex-1 text-[var(--color-figma-text)] font-medium truncate"
                style={{ fontSize: `${displayPx}px`, lineHeight }}
              >
                {label}
              </span>
              <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono shrink-0 ml-2 whitespace-nowrap">
                {formatValue(t.value)} → {Math.round(px)}px
              </span>
            </OverrideRow>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function TypeScaleConfigEditor({ config, onChange, onInteractionStart, sourceValue, allTokensFlat, pathToCollectionId }: {
  config: TypeScaleConfig;
  onChange: (c: TypeScaleConfig) => void;
  /** Call at the start of each discrete user interaction so the undo system can
   *  flush the previous snapshot before this one begins. */
  onInteractionStart?: () => void;
  sourceValue?: number;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}) {
  const [customRatio, setCustomRatio] = useState('');
  const [isCustomRatio, setIsCustomRatio] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [showFullEditor, setShowFullEditor] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareRatio, setCompareRatio] = useState<number>(() => {
    // Default B to the next preset up from the current ratio
    const idx = TYPE_RATIO_PRESETS.findIndex(p => Math.abs(p.value - config.ratio) < 0.0001);
    return TYPE_RATIO_PRESETS[(idx + 1) % TYPE_RATIO_PRESETS.length]?.value ?? 1.333;
  });
  const [isCustomCompareRatio, setIsCustomCompareRatio] = useState(false);
  const [customCompareRatio, setCustomCompareRatio] = useState('');

  const activePresetRatio = TYPE_RATIO_PRESETS.find(p => Math.abs(p.value - config.ratio) < 0.0001);
  const activeComparePresetRatio = TYPE_RATIO_PRESETS.find(p => Math.abs(p.value - compareRatio) < 0.0001);
  const activeStepPresetIdx = TYPE_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const handleRatioPreset = (val: number) => { onInteractionStart?.(); setIsCustomRatio(false); onChange({ ...config, ratio: val }); };
  const handleCustomRatioCommit = () => {
    const val = parseFloat(customRatio);
    if (!isNaN(val) && val > 1) onChange({ ...config, ratio: Math.round(val * 1000) / 1000 });
  };
  const handleCompareRatioPreset = (val: number) => { setIsCustomCompareRatio(false); setCompareRatio(val); };
  const handleCustomCompareRatioCommit = () => {
    const val = parseFloat(customCompareRatio);
    if (!isNaN(val) && val > 1) setCompareRatio(Math.round(val * 1000) / 1000);
  };
  const applyCompareRatio = () => {
    onInteractionStart?.();
    onChange({ ...config, ratio: compareRatio });
    setIsCustomRatio(false);
    setCompareMode(false);
  };
  const swapAB = () => {
    const prevA = config.ratio;
    onChange({ ...config, ratio: compareRatio });
    setCompareRatio(prevA);
    setIsCustomRatio(false);
    setIsCustomCompareRatio(false);
  };
  const updateStep = (idx: number, updates: Partial<TypeScaleStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    const baseStep = updates.name && config.steps[idx]?.name === config.baseStep ? updates.name : config.baseStep;
    onChange({ ...config, steps, baseStep });
  };
  const addStep = () => {
    const maxExp = Math.max(...config.steps.map(s => s.exponent), 0);
    onChange({ ...config, steps: [...config.steps, { name: String(maxExp + 1), exponent: maxExp + 1 }] });
  };
  const removeStep = (idx: number) => {
    const removed = config.steps[idx];
    const steps = config.steps.filter((_, i) => i !== idx);
    // If removing the base step, pick the step with exponent closest to 0
    let baseStep = config.baseStep;
    if (removed?.name === config.baseStep && steps.length > 0) {
      baseStep = steps.reduce((best, s) => Math.abs(s.exponent) < Math.abs(best.exponent) ? s : best).name;
    }
    onChange({ ...config, steps, baseStep });
  };
  const setBaseStep = (name: string) => onChange({ ...config, baseStep: name });

  const effectiveSourceValue = sourceValue !== undefined && sourceValue > 0 ? sourceValue : 1;
  const compareConfig: TypeScaleConfig = { ...config, ratio: compareRatio };

  // Detect which parameter preset matches the current config
  const activeParamPresetId = TYPE_SCALE_PARAMETER_PRESETS.find(p =>
    Math.abs(p.config.ratio - config.ratio) < 0.001 &&
    p.config.steps.length === config.steps.length &&
    p.config.steps.every((s, i) => s.name === config.steps[i]?.name) &&
    p.config.unit === config.unit &&
    p.config.roundTo === config.roundTo
  )?.id;

  const handleParamPresetSelect = (preset: TypeScaleParameterPreset) => {
    onInteractionStart?.();
    setIsCustomRatio(false);
    onChange({
      ...config,
      steps: preset.config.steps.map(s => ({ ...s })),
      ratio: preset.config.ratio,
      unit: preset.config.unit,
      baseStep: preset.config.baseStep,
      roundTo: preset.config.roundTo,
    });
    setShowFullEditor(false);
    setShowSteps(false);
  };

  const setRatioTokenRef = (tokenPath: string, resolvedValue: unknown) => {
    const numVal = typeof resolvedValue === 'number' ? resolvedValue : parseFloat(String(resolvedValue));
    const safeVal = isFinite(numVal) && numVal > 1 ? numVal : config.ratio;
    setIsCustomRatio(false);
    onChange({ ...config, ratio: safeVal, $tokenRefs: { ...config.$tokenRefs, ratio: tokenPath } });
  };

  const clearRatioTokenRef = () => {
    const refs = { ...config.$tokenRefs };
    delete refs.ratio;
    onChange({ ...config, $tokenRefs: Object.keys(refs).length > 0 ? refs : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Parameter preset picker */}
      <div>
        <div className="grid grid-cols-3 gap-1.5">
          {TYPE_SCALE_PARAMETER_PRESETS.map(preset => {
            const isActive = activeParamPresetId === preset.id;
            const base = effectiveSourceValue > 0 ? effectiveSourceValue : 16;
            const baseUnit = preset.config.unit === 'rem' ? base / 16 : base;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleParamPresetSelect(preset)}
                title={preset.description}
                className={`flex flex-col items-stretch rounded-md border p-1.5 transition-colors ${
                  isActive
                    ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/8'
                    : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]/40 hover:bg-[var(--color-figma-bg-hover)]'
                }`}
              >
                <div className="flex items-baseline gap-px h-5 mb-1 overflow-hidden">
                  {preset.config.steps.slice(0, 5).map((step, i) => {
                    const size = Math.max(6, Math.min(20, baseUnit * Math.pow(preset.config.ratio, step.exponent) * (preset.config.unit === 'rem' ? 16 : 1)));
                    return (
                      <span
                        key={i}
                        className={`font-medium leading-none ${isActive ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'}`}
                        style={{ fontSize: `${size}px` }}
                      >A</span>
                    );
                  })}
                </div>
                <span className={`text-[9px] font-medium text-center ${
                  isActive ? 'text-[var(--color-figma-accent)]' : 'text-[var(--color-figma-text-secondary)]'
                }`}>{preset.label}</span>
              </button>
            );
          })}
        </div>
        <TokenRefInput
          label="Scale ratio"
          tokenRef={config.$tokenRefs?.ratio}
          valueLabel={String(config.ratio)}
          filterType="number"
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          onLink={setRatioTokenRef}
          onUnlink={clearRatioTokenRef}
        >
          <div className="mt-3 flex items-center justify-between rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
            <span>
              Ratio <span className="font-mono text-[var(--color-figma-text)]">{config.ratio}</span>
            </span>
            {activePresetRatio && (
              <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                {activePresetRatio.label}
              </span>
            )}
          </div>
        </TokenRefInput>
        <button
          type="button"
          onClick={() => setShowFullEditor(v => !v)}
          className="mt-1.5 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] flex items-center gap-1"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform ${showFullEditor ? 'rotate-90' : ''}`}><path d="M2 1l4 3-4 3" /></svg>
          Customize
        </button>
      </div>

      {showFullEditor && <>
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Scale ratio</label>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Current: {config.ratio}</span>
          <button
            onClick={() => setCompareMode(v => !v)}
            title="Compare two ratios side by side"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium border transition-colors ${compareMode ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
              <rect x="0.5" y="2" width="3.5" height="6" rx="0.5" />
              <rect x="6" y="2" width="3.5" height="6" rx="0.5" />
              <line x1="4.75" y1="5" x2="5.25" y2="5" strokeWidth="1" />
            </svg>
            A/B
          </button>
        </div>

        {compareMode ? (
          /* ── Compare mode: A and B columns ── */
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              {/* Config A */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/30">A</span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono">{config.ratio}</span>
                  {activePresetRatio && <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-60 truncate">{activePresetRatio.label}</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  {TYPE_RATIO_PRESETS.map(preset => (
                    <button key={preset.value} title={`${preset.label} — ${preset.description}`}
                      onClick={() => handleRatioPreset(preset.value)}
                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors text-left truncate ${!isCustomRatio && activePresetRatio?.value === preset.value ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    >{preset.label} <span className="font-mono opacity-70">({preset.value})</span></button>
                  ))}
                  <input type="number" min="1.001" max="4" step="0.001"
                    value={isCustomRatio ? customRatio : config.ratio}
                    onFocus={onInteractionStart}
                    onChange={e => { setIsCustomRatio(true); setCustomRatio(e.target.value); }}
                    onBlur={handleCustomRatioCommit} onKeyDown={e => e.key === 'Enter' && handleCustomRatioCommit()}
                    aria-label="Custom scale ratio A"
                    className="mt-0.5 w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                </div>
              </div>

              {/* Config B */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">B</span>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] font-mono">{compareRatio}</span>
                  {activeComparePresetRatio && <span className="text-[8px] text-[var(--color-figma-text-secondary)] opacity-60 truncate">{activeComparePresetRatio.label}</span>}
                </div>
                <div className="flex flex-col gap-0.5">
                  {TYPE_RATIO_PRESETS.map(preset => (
                    <button key={preset.value} title={`${preset.label} — ${preset.description}`}
                      onClick={() => handleCompareRatioPreset(preset.value)}
                      className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors text-left truncate ${!isCustomCompareRatio && activeComparePresetRatio?.value === preset.value ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                    >{preset.label} <span className="font-mono opacity-70">({preset.value})</span></button>
                  ))}
                  <input type="number" min="1.001" max="4" step="0.001"
                    value={isCustomCompareRatio ? customCompareRatio : compareRatio}
                    onChange={e => { setIsCustomCompareRatio(true); setCustomCompareRatio(e.target.value); }}
                    onBlur={handleCustomCompareRatioCommit} onKeyDown={e => e.key === 'Enter' && handleCustomCompareRatioCommit()}
                    aria-label="Custom scale ratio B"
                    className="mt-0.5 w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                </div>
              </div>
            </div>

            {/* Side-by-side staircase previews */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[8px] font-bold text-[var(--color-figma-accent)]">A</span>
                  <span className="text-[8px] text-[var(--color-figma-text-secondary)]">ratio: {config.ratio}</span>
                </div>
                <TypeScaleStaircaseEditor
                  config={config}
                  sourceValue={effectiveSourceValue}
                  onChange={c => { setIsCustomRatio(false); onChange(c); }}
                />
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[8px] font-bold text-[var(--color-figma-text-secondary)]">B</span>
                  <span className="text-[8px] text-[var(--color-figma-text-secondary)]">ratio: {compareRatio}</span>
                </div>
                <TypeScaleStaircaseEditor
                  config={compareConfig}
                  sourceValue={effectiveSourceValue}
                  onChange={c => { setIsCustomCompareRatio(false); setCompareRatio(c.ratio); }}
                />
              </div>
            </div>

            {/* Action row */}
            <div className="flex items-center gap-1.5">
              <button onClick={applyCompareRatio}
                className="flex-1 px-2 py-1 rounded text-[10px] font-medium border border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/20 transition-colors"
              >Use B ({compareRatio})</button>
              <button onClick={swapAB}
                title="Swap A and B ratios"
                className="px-2 py-1 rounded text-[10px] border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
              >
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 3h8M7 1l2 2-2 2" />
                  <path d="M11 7H3M5 5l-2 2 2 2" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          /* ── Normal mode ── */
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
                className="w-20 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]" />
            </div>
          </div>
        )}
      </div>
      {!compareMode && (
        <TypeScaleStaircaseEditor
          config={config}
          sourceValue={effectiveSourceValue}
          onChange={c => { setIsCustomRatio(false); onChange(c); }}
        />
      )}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5">
          {TYPE_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} title={preset.description} onClick={() => { onInteractionStart?.(); setShowSteps(false); onChange({ ...config, steps: preset.steps.map(s => ({ ...s })), baseStep: preset.steps.find(s => s.exponent === 0)?.name ?? preset.steps[Math.floor(preset.steps.length / 2)]?.name ?? config.baseStep }); }}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!showSteps && activeStepPresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
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
                  placeholder="name" className="w-14 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]" />
                <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">exp</span>
                <input type="number" step="1" value={step.exponent} onChange={e => updateStep(i, { exponent: Number(e.target.value) })}
                  aria-label={`Step ${step.name} exponent`}
                  className="w-14 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] focus-visible:border-[var(--color-figma-accent)]" />
                <button onClick={() => setBaseStep(step.name)} title={step.name === config.baseStep ? 'Base step (ratio^0)' : 'Set as base step'} aria-label={`Set ${step.name} as base step`}
                  className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors shrink-0 ${step.name === config.baseStep ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >base</button>
                <button onClick={() => removeStep(i)} title="Remove step" aria-label="Remove step" className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">&times;</button>
              </div>
            ))}
            <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">+ Add step</button>
          </div>
        )}
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
      </>}
    </div>
  );
}
