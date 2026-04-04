import type { DarkModeInversionConfig } from '../../hooks/useGenerators';
import type { TokenMapEntry } from '../../../shared/types';
import { TokenRefInput } from './TokenRefInput';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_DARK_MODE_INVERSION_CONFIG: DarkModeInversionConfig = {
  stepName: 'inverted',
  chromaBoost: 0,
};

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function DarkModeInversionConfigEditor({ config, onChange, allTokensFlat, pathToSet }: {
  config: DarkModeInversionConfig;
  onChange: (c: DarkModeInversionConfig) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}) {
  const handleChromaChange = (raw: string) => {
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange({ ...config, chromaBoost: Math.max(0, Math.min(2, num)) });
  };

  const setChromaTokenRef = (tokenPath: string, resolvedValue: unknown) => {
    const numVal = typeof resolvedValue === 'number' ? resolvedValue : parseFloat(String(resolvedValue));
    const safeVal = isFinite(numVal) ? Math.max(0, Math.min(2, numVal)) : config.chromaBoost;
    onChange({ ...config, chromaBoost: safeVal, $tokenRefs: { ...config.$tokenRefs, chromaBoost: tokenPath } });
  };

  const clearChromaTokenRef = () => {
    const refs = { ...config.$tokenRefs };
    delete refs.chromaBoost;
    onChange({ ...config, $tokenRefs: Object.keys(refs).length > 0 ? refs : undefined });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Description */}
      <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
        Generates a perceptual dark-mode equivalent of the source color by inverting its
        CIELAB lightness (100 − L) while preserving hue. Use chroma boost to control
        how much saturation is retained.
      </p>

      {/* Step name */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
          Step name
        </label>
        <input
          type="text"
          value={config.stepName}
          onChange={e => onChange({ ...config, stepName: e.target.value })}
          placeholder="inverted"
          aria-label="Step name"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
        />
        <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
          Token name for the generated dark-mode color.
        </p>
      </div>

      {/* Chroma boost */}
      <TokenRefInput
        label="Chroma boost"
        tokenRef={config.$tokenRefs?.chromaBoost}
        valueLabel={String(config.chromaBoost)}
        filterType="number"
        allTokensFlat={allTokensFlat}
        pathToSet={pathToSet}
        onLink={setChromaTokenRef}
        onUnlink={clearChromaTokenRef}
      >
        <div>
          <div className="flex items-center justify-end mb-1">
            <input
              type="number"
              value={config.chromaBoost}
              min={0}
              max={2}
              step={0.05}
              onChange={e => handleChromaChange(e.target.value)}
              aria-label="Chroma boost value"
              className="w-16 px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)] text-right"
            />
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={config.chromaBoost}
            onChange={e => onChange({ ...config, chromaBoost: parseFloat(e.target.value) })}
            aria-label="Chroma boost slider"
            className="w-full accent-[var(--color-figma-accent)]"
          />
          <div className="flex justify-between text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
            <span>0 — gray</span>
            <span>1 — preserve</span>
            <span>2 — boost</span>
          </div>
        </div>
      </TokenRefInput>
    </div>
  );
}
