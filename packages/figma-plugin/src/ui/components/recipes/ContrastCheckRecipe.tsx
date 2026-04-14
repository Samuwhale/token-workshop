import { useRef } from 'react';
import type { ContrastCheckConfig, ContrastCheckStep, GeneratedTokenResult } from '../../hooks/useRecipes';
import type { TokenMapEntry } from '../../../shared/types';
import { wcagContrast } from '../../shared/colorUtils';
import { OverrideRow } from './recipeShared';
import { TokenRefInput } from '../TokenRefInput';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_CONTRAST_CHECK_CONFIG: ContrastCheckConfig = {
  backgroundHex: '#ffffff',
  steps: [
    { name: 'text.primary', hex: '#111827' },
    { name: 'text.secondary', hex: '#4B5563' },
    { name: 'icon.default', hex: '#6B7280' },
    { name: 'text.inverse', hex: '#FFFFFF' },
  ],
  levels: ['AA', 'AAA'],
};

// ---------------------------------------------------------------------------
// WCAG thresholds
// ---------------------------------------------------------------------------

const WCAG_AA_NORMAL = 4.5;
const WCAG_AAA_NORMAL = 7;

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export function ContrastCheckPreview({ tokens, config, overrides = {}, onOverrideChange, onOverrideClear, overwritePaths }: {
  tokens: GeneratedTokenResult[];
  config?: ContrastCheckConfig;
  overrides?: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange?: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear?: (stepName: string) => void;
  overwritePaths?: Set<string>;
}) {
  const hexByName: Record<string, string> = {};
  if (config) {
    for (const s of config.steps) hexByName[s.name] = s.hex;
  }

  if (tokens.length === 0) {
    return (
      <div className="text-[10px] text-[var(--color-figma-text-secondary)] text-center py-2">
        Add colors in the config to see contrast results.
      </div>
    );
  }

  const enforcedLevels = config?.levels?.length ? config.levels : (['AA'] as ('AA' | 'AAA')[]);
  const failThreshold = enforcedLevels.includes('AAA') ? WCAG_AAA_NORMAL : WCAG_AA_NORMAL;
  const strictestLabel = enforcedLevels.includes('AAA') ? 'AAA' : 'AA';
  const failCount = tokens.filter(t => (t.value as number) < failThreshold).length;

  const noop = () => {};

  return (
    <div className="flex flex-col gap-0.5">
      {failCount > 0 ? (
        <div className="flex items-center gap-1.5 px-1 py-1 mb-1 rounded bg-amber-500/10 border border-amber-500/20">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 shrink-0" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="text-[10px] text-amber-700 font-medium">
            {failCount} step{failCount !== 1 ? 's' : ''} fail{failCount === 1 ? 's' : ''} {strictestLabel}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 px-1 py-1 mb-1 rounded bg-green-500/10 border border-green-500/20">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 shrink-0" aria-hidden="true">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span className="text-[10px] text-green-700 font-medium">All steps pass {strictestLabel}</span>
        </div>
      )}
      {tokens.map(t => {
        const ratio = typeof t.value === 'number' ? t.value : null;
        const passAA = ratio !== null && ratio >= WCAG_AA_NORMAL;
        const passAAA = ratio !== null && ratio >= WCAG_AAA_NORMAL;
        const hex = hexByName[t.stepName];
        return (
          <OverrideRow
            key={t.stepName}
            token={t}
            override={overrides[t.stepName]}
            onOverrideChange={onOverrideChange ?? noop}
            onOverrideClear={onOverrideClear ?? noop}
            isOverwrite={overwritePaths?.has(t.path)}
          >
            {hex ? (
              <span className="w-4 h-4 rounded border border-[var(--color-figma-border)] shrink-0" style={{ background: hex }} />
            ) : (
              <span className="w-4 h-4 shrink-0" />
            )}
            <span className="flex-1 text-[10px] font-mono text-[var(--color-figma-text)]">
              {ratio !== null ? ratio.toFixed(2) + ':1' : '—'}
            </span>
            {enforcedLevels.includes('AA') && (
              <span className={`text-[8px] font-semibold px-1 py-0.5 rounded shrink-0 ${passAA ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'}`}>
                AA
              </span>
            )}
            {enforcedLevels.includes('AAA') && (
              <span className={`text-[8px] font-semibold px-1 py-0.5 rounded shrink-0 ${passAAA ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'}`}>
                AAA
              </span>
            )}
          </OverrideRow>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color step swatch (private sub-component)
// ---------------------------------------------------------------------------

function ColorStepSwatch({ hex, onHexChange }: { hex: string; onHexChange: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const hex6 = hex?.slice(0, 7) || '#000000';
  return (
    <>
      <button
        className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
        style={{ background: hex6 }}
        onClick={() => ref.current?.click()}
        title="Pick color"
        aria-label="Pick color"
      />
      <input ref={ref} type="color" className="sr-only" key={hex6} defaultValue={hex6}
        aria-label="Pick step color"
        onBlur={e => onHexChange(e.target.value)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function ContrastCheckConfigEditor({ config, onChange, allTokensFlat, pathToSet }: {
  config: ContrastCheckConfig;
  onChange: (c: ContrastCheckConfig) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}) {
  const bgColorInputRef = useRef<HTMLInputElement>(null);

  const setBgTokenRef = (tokenPath: string, resolvedValue: unknown) => {
    const colorVal = typeof resolvedValue === 'string' ? resolvedValue : config.backgroundHex;
    onChange({ ...config, backgroundHex: colorVal, $tokenRefs: { ...config.$tokenRefs, backgroundHex: tokenPath } });
  };

  const clearBgTokenRef = () => {
    const refs = { ...config.$tokenRefs };
    delete refs.backgroundHex;
    onChange({ ...config, $tokenRefs: Object.keys(refs).length > 0 ? refs : undefined });
  };

  const updateStep = (idx: number, patch: Partial<ContrastCheckStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...config, steps });
  };

  const addStep = () => {
    onChange({ ...config, steps: [...config.steps, { name: String(config.steps.length + 1), hex: '#000000' }] });
  };

  const removeStep = (idx: number) => {
    onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });
  };

  const toggleLevel = (level: 'AA' | 'AAA') => {
    const levels = config.levels.includes(level)
      ? config.levels.filter(l => l !== level)
      : [...config.levels, level];
    onChange({ ...config, levels });
  };

  const bgHex6 = config.backgroundHex?.slice(0, 7) || '#ffffff';

  return (
    <div className="flex flex-col gap-3">
      {/* Background color */}
      <TokenRefInput
        label="Background color"
        tokenRef={config.$tokenRefs?.backgroundHex}
        valueLabel={bgHex6}
        filterType="color"
        allTokensFlat={allTokensFlat}
        pathToSet={pathToSet}
        onLink={setBgTokenRef}
        onUnlink={clearBgTokenRef}
      >
        <div>
          <div className="flex items-center gap-2">
            <button
              className="w-6 h-6 rounded border border-[var(--color-figma-border)] shrink-0"
              style={{ background: bgHex6 }}
              onClick={() => bgColorInputRef.current?.click()}
              title="Pick background color"
              aria-label="Pick background color"
            />
            <input
              ref={bgColorInputRef}
              type="color"
              className="sr-only"
              key={bgHex6}
              defaultValue={bgHex6}
              aria-label="Pick background color"
              onBlur={e => onChange({ ...config, backgroundHex: e.target.value })}
            />
            <input
              type="text"
              value={config.backgroundHex}
              onChange={e => onChange({ ...config, backgroundHex: e.target.value })}
              aria-label="Background color hex value"
              className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
              placeholder="#ffffff"
            />
          </div>
          <div className="flex gap-2 mt-1.5">
            <button onClick={() => onChange({ ...config, backgroundHex: '#ffffff' })}
              className={`px-2 py-0.5 rounded text-[10px] border ${config.backgroundHex === '#ffffff' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'}`}>
              White
            </button>
            <button onClick={() => onChange({ ...config, backgroundHex: '#000000' })}
              className={`px-2 py-0.5 rounded text-[10px] border ${config.backgroundHex === '#000000' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'}`}>
              Black
            </button>
          </div>
        </div>
      </TokenRefInput>

      {/* WCAG levels */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Enforce levels</label>
        <div className="flex gap-2">
          {(['AA', 'AAA'] as const).map(level => (
            <label key={level} className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={config.levels.includes(level)} onChange={() => toggleLevel(level)}
                className="accent-[var(--color-figma-accent)] w-3 h-3" />
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">
                {level} ({level === 'AA' ? '4.5:1' : '7:1'})
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Color steps */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Colors to check</label>
        <div className="flex flex-col gap-1">
          {config.steps.map((step, idx) => {
            const ratio = wcagContrast(step.hex, config.backgroundHex);
            const cfgThreshold = config.levels?.includes('AAA') ? WCAG_AAA_NORMAL : WCAG_AA_NORMAL;
            const passAA = ratio !== null && ratio >= cfgThreshold;
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <ColorStepSwatch hex={step.hex} onHexChange={hex => updateStep(idx, { hex })} />
                <input type="text" value={step.name} onChange={e => updateStep(idx, { name: e.target.value })}
                  placeholder="name"
                  aria-label={`Color step ${idx + 1} name`}
                  className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]" />
                <input type="text" value={step.hex} onChange={e => updateStep(idx, { hex: e.target.value })}
                  placeholder="#000000"
                  aria-label={`Color step ${step.name} hex value`}
                  className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono focus-visible:border-[var(--color-figma-accent)]" />
                {ratio !== null && (
                  <span className={`text-[8px] font-medium shrink-0 ${passAA ? 'text-green-600' : 'text-red-500'}`}>
                    {ratio.toFixed(1)}
                  </span>
                )}
                <button onClick={() => removeStep(idx)} title="Remove step" aria-label="Remove step"
                  className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] leading-none">×</button>
              </div>
            );
          })}
          <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">
            + Add color
          </button>
        </div>
      </div>
    </div>
  );
}
