import type { AccessibleColorPairConfig } from '../../hooks/useRecipes';

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_ACCESSIBLE_PAIR_CONFIG: AccessibleColorPairConfig = {
  contrastLevel: 'AA',
  backgroundStep: 'bg',
  foregroundStep: 'fg',
};

// ---------------------------------------------------------------------------
// Config editor
// ---------------------------------------------------------------------------

export function AccessiblePairConfigEditor({ config, onChange }: {
  config: AccessibleColorPairConfig;
  onChange: (c: AccessibleColorPairConfig) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Description */}
      <p className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
        Generates a background token (source color) and a foreground token (black or white) that meets the required contrast.
      </p>

      {/* Contrast level */}
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Contrast level</label>
        <div className="flex gap-2">
          {(['AA', 'AAA'] as const).map(level => (
            <button
              key={level}
              onClick={() => onChange({ ...config, contrastLevel: level })}
              className={`px-3 py-1 rounded text-[10px] font-medium border transition-colors ${
                config.contrastLevel === level
                  ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                  : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
              }`}
            >
              {level} ({level === 'AA' ? '4.5:1' : '7:1'})
            </button>
          ))}
        </div>
      </div>

      {/* Step names */}
      <div className="flex flex-col gap-2">
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            Background step name
          </label>
          <input
            type="text"
            value={config.backgroundStep}
            onChange={e => onChange({ ...config, backgroundStep: e.target.value })}
            placeholder="bg"
            aria-label="Background step name"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
          />
          <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
            Token name for the background color.
          </p>
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
            Foreground step name
          </label>
          <input
            type="text"
            value={config.foregroundStep}
            onChange={e => onChange({ ...config, foregroundStep: e.target.value })}
            placeholder="fg"
            aria-label="Foreground step name"
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono focus-visible:border-[var(--color-figma-accent)]"
          />
          <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
            Token name for the foreground color.
          </p>
        </div>
      </div>
    </div>
  );
}
