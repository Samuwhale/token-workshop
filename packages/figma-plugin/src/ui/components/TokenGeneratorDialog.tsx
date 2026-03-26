import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SemanticMappingDialog } from './SemanticMappingDialog';
import type {
  TokenGenerator,
  GeneratorType,
  ColorRampConfig,
  TypeScaleConfig,
  TypeScaleStep,
  SpacingScaleConfig,
  SpacingStep,
  OpacityScaleConfig,
  BorderRadiusScaleConfig,
  BorderRadiusStep,
  ZIndexScaleConfig,
  CustomScaleConfig,
  CustomScaleStep,
  ContrastCheckConfig,
  ContrastCheckStep,
  GeneratorConfig,
  GeneratedTokenResult,
  GeneratorTemplate,
  InputTable,
  InputTableRow,
} from '../hooks/useGenerators';
import { wcagContrast } from '../shared/colorUtils';

// ---------------------------------------------------------------------------
// Default configs
// ---------------------------------------------------------------------------

const DEFAULT_COLOR_RAMP_CONFIG: ColorRampConfig = {
  steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  lightEnd: 97,
  darkEnd: 8,
  chromaBoost: 1.0,
  includeSource: false,
};

const DEFAULT_CONTRAST_CHECK_CONFIG: ContrastCheckConfig = {
  backgroundHex: '#ffffff',
  steps: [],
  levels: ['AA', 'AAA'],
};

const DEFAULT_TYPE_SCALE_CONFIG: TypeScaleConfig = {
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
};

const DEFAULT_SPACING_SCALE_CONFIG: SpacingScaleConfig = {
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

const DEFAULT_OPACITY_SCALE_CONFIG: OpacityScaleConfig = {
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

const DEFAULT_BORDER_RADIUS_CONFIG: BorderRadiusScaleConfig = {
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

const DEFAULT_Z_INDEX_CONFIG: ZIndexScaleConfig = {
  steps: [
    { name: 'below', value: -1 },
    { name: 'base', value: 0 },
    { name: 'raised', value: 10 },
    { name: 'dropdown', value: 100 },
    { name: 'sticky', value: 200 },
    { name: 'overlay', value: 300 },
    { name: 'modal', value: 400 },
    { name: 'toast', value: 500 },
  ],
};

const DEFAULT_CUSTOM_CONFIG: CustomScaleConfig = {
  outputType: 'number',
  steps: [
    { name: 'sm', index: -2, multiplier: 0.5 },
    { name: 'md', index: 0, multiplier: 1 },
    { name: 'lg', index: 2, multiplier: 2 },
  ],
  formula: 'base * multiplier',
  roundTo: 2,
};

// ---------------------------------------------------------------------------
// Preset constants
// ---------------------------------------------------------------------------

const COLOR_STEP_PRESETS = [
  { label: 'Tailwind (11)', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] },
  { label: 'Material (10)', steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { label: 'Compact (5)', steps: [100, 300, 500, 700, 900] },
];

const TYPE_RATIO_PRESETS = [
  { label: 'Minor Second', value: 1.067 },
  { label: 'Major Second', value: 1.125 },
  { label: 'Minor Third', value: 1.2 },
  { label: 'Major Third', value: 1.25 },
  { label: 'Perfect Fourth', value: 1.333 },
  { label: 'Golden Ratio', value: 1.618 },
];

const TYPE_STEP_PRESETS = [
  {
    label: 'T-shirt (7)',
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

const SPACING_STEP_PRESETS = [
  {
    label: 'Tailwind',
    steps: DEFAULT_SPACING_SCALE_CONFIG.steps,
  },
  {
    label: '8pt Grid',
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

const OPACITY_PRESETS = [
  { label: 'Full range (13)', steps: DEFAULT_OPACITY_SCALE_CONFIG.steps },
  {
    label: 'Compact (5)',
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
// Auto-detect helper
// ---------------------------------------------------------------------------

function detectGeneratorType(sourceTokenType: string, sourceTokenValue: any): GeneratorType {
  if (sourceTokenType === 'color') return 'colorRamp';
  if (sourceTokenType === 'number') return 'opacityScale';
  if (sourceTokenType === 'dimension' || sourceTokenType === 'fontSize') {
    let numVal = 0;
    if (typeof sourceTokenValue === 'number') numVal = sourceTokenValue;
    else if (typeof sourceTokenValue === 'string') {
      numVal = parseFloat(sourceTokenValue) || 0;
    } else if (sourceTokenValue && typeof sourceTokenValue === 'object') {
      numVal = parseFloat(sourceTokenValue.value) || 0;
    }
    return numVal < 50 ? 'typeScale' : 'spacingScale';
  }
  return 'colorRamp';
}

function suggestTargetGroup(sourceTokenPath: string): string {
  const parts = sourceTokenPath.split('.');
  if (parts.length <= 1) return sourceTokenPath;
  return parts.slice(0, -1).join('.');
}

function autoName(sourceTokenPath: string | undefined, type: GeneratorType): string {
  const typeLabels: Record<GeneratorType, string> = {
    colorRamp: 'Color Ramp',
    typeScale: 'Type Scale',
    spacingScale: 'Spacing Scale',
    opacityScale: 'Opacity Scale',
    borderRadiusScale: 'Border Radius Scale',
    zIndexScale: 'Z-Index Scale',
    customScale: 'Custom Scale',
    contrastCheck: 'Contrast Check',
  };
  if (sourceTokenPath) return `${sourceTokenPath} ${typeLabels[type]}`;
  return typeLabels[type];
}

function defaultConfigForType(type: GeneratorType): GeneratorConfig {
  switch (type) {
    case 'colorRamp': return { ...DEFAULT_COLOR_RAMP_CONFIG, steps: [...DEFAULT_COLOR_RAMP_CONFIG.steps] };
    case 'typeScale': return { ...DEFAULT_TYPE_SCALE_CONFIG, steps: DEFAULT_TYPE_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'spacingScale': return { ...DEFAULT_SPACING_SCALE_CONFIG, steps: DEFAULT_SPACING_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'opacityScale': return { steps: DEFAULT_OPACITY_SCALE_CONFIG.steps.map(s => ({ ...s })) };
    case 'borderRadiusScale': return { ...DEFAULT_BORDER_RADIUS_CONFIG, steps: DEFAULT_BORDER_RADIUS_CONFIG.steps.map(s => ({ ...s })) };
    case 'zIndexScale': return { steps: DEFAULT_Z_INDEX_CONFIG.steps.map(s => ({ ...s })) };
    case 'customScale': return { ...DEFAULT_CUSTOM_CONFIG, steps: DEFAULT_CUSTOM_CONFIG.steps.map(s => ({ ...s })) };
    case 'contrastCheck': return { ...DEFAULT_CONTRAST_CHECK_CONFIG, steps: [] };
  }
}

// ---------------------------------------------------------------------------
// Preview rendering helpers
// ---------------------------------------------------------------------------

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'value' in (value as any) && 'unit' in (value as any)) {
    return `${(value as any).value}${(value as any).unit}`;
  }
  return String(value);
}

function ColorSwatchPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
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

function TypeScalePreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const valStr = formatValue(t.value);
        const numVal = typeof t.value === 'object' && t.value !== null && 'value' in t.value
          ? (t.value as any).value
          : parseFloat(valStr) || 0;
        const unit = typeof t.value === 'object' && t.value !== null && 'unit' in t.value
          ? (t.value as any).unit
          : '';
        const displayPx = Math.max(8, Math.min(32, numVal * (unit === 'rem' ? 16 : 1)));
        return (
          <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
            <span className="text-[var(--color-figma-text)] leading-none font-medium" style={{ fontSize: `${displayPx}px` }}>Ag</span>
            <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 ml-auto">{valStr}</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

function SpacingPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  const maxVal = Math.max(...tokens.map(t => {
    const v = t.value as any;
    return typeof v === 'object' ? v.value ?? 0 : parseFloat(String(v)) || 0;
  }), 1);
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => {
        const v = t.value as any;
        const val = typeof v === 'object' ? v.value ?? 0 : parseFloat(String(v)) || 0;
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

function OpacityPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
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
            <span className="w-10 text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 text-right">{Math.round(pct)}%</span>
          </OverrideRow>
        );
      })}
    </div>
  );
}

function GenericPreview({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {tokens.map((t) => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
          <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate text-right">
            {formatValue(t.value)}
          </span>
        </OverrideRow>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contrast Check preview (standalone — no overrides)
// ---------------------------------------------------------------------------

const WCAG_AA_NORMAL = 4.5;
const WCAG_AAA_NORMAL = 7;

function ContrastCheckPreview({ tokens }: { tokens: GeneratedTokenResult[] }) {
  if (tokens.length === 0) {
    return (
      <div className="text-[10px] text-[var(--color-figma-text-secondary)] text-center py-2">
        Add colors in the config to see contrast results.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {tokens.map(t => {
        const ratio = typeof t.value === 'number' ? t.value : null;
        const passAA = ratio !== null && ratio >= WCAG_AA_NORMAL;
        const passAAA = ratio !== null && ratio >= WCAG_AAA_NORMAL;
        return (
          <div key={t.stepName} className="flex items-center gap-2 px-1 py-1 rounded">
            {/* Color swatch — we get the hex from the step name mapping in config; use a neutral swatch */}
            <span className="w-8 text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 text-right font-mono">{t.stepName}</span>
            <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text)]">
              {ratio !== null ? ratio.toFixed(2) + ':1' : '—'}
            </span>
            <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${passAA ? 'bg-green-500/15 text-green-600' : 'bg-red-500/15 text-red-500'}`}>
              AA{passAA ? ' ✓' : ' ✗'}
            </span>
            <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${passAAA ? 'bg-green-500/15 text-green-600' : 'bg-[var(--color-figma-text-tertiary)]/15 text-[var(--color-figma-text-secondary)]'}`}>
              AAA{passAAA ? ' ✓' : ' ✗'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Override row + table
// ---------------------------------------------------------------------------

function OverrideRow({ token, override, onOverrideChange, onOverrideClear, children }: {
  token: GeneratedTokenResult;
  override?: { value: unknown; locked: boolean };
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const isLocked = override?.locked ?? false;
  const isOverridden = Boolean(override);

  const handleStartEdit = () => {
    setEditValue(formatValue(token.value));
    setEditing(true);
  };

  const handleCommit = () => {
    if (editValue.trim()) {
      onOverrideChange(token.stepName, editValue.trim(), true);
    }
    setEditing(false);
  };

  return (
    <div className={`flex items-center gap-1.5 px-1 py-0.5 rounded ${isOverridden ? 'bg-[var(--color-figma-accent)]/8' : ''}`}>
      <span className="w-8 text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 text-right font-mono">{token.stepName}</span>
      {children}
      {editing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={e => { if (e.key === 'Enter') handleCommit(); if (e.key === 'Escape') setEditing(false); }}
          className="w-20 px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] text-[9px] font-mono outline-none shrink-0"
        />
      ) : (
        <button
          onClick={isOverridden ? () => onOverrideClear(token.stepName) : handleStartEdit}
          title={isOverridden ? 'Click to clear override' : 'Click to pin a custom value'}
          className={`shrink-0 p-0.5 rounded transition-colors ${
            isLocked
              ? 'text-[var(--color-figma-accent)] hover:text-[var(--color-figma-error)]'
              : 'text-[var(--color-figma-text-secondary)] opacity-30 hover:opacity-100 hover:text-[var(--color-figma-accent)]'
          }`}
        >
          {isLocked ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="5" width="8" height="6" rx="1" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0V5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="5" width="8" height="6" rx="1" />
              <path d="M4 5V3.5a2 2 0 0 1 4 0" strokeDasharray="2 1" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

function OverrideTable({ tokens, overrides, onOverrideChange, onOverrideClear }: {
  tokens: GeneratedTokenResult[];
  overrides: Record<string, { value: unknown; locked: boolean }>;
  onOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  onOverrideClear: (stepName: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 mt-1 border-t border-[var(--color-figma-border)] pt-1.5">
      {tokens.map(t => (
        <OverrideRow key={t.stepName} token={t} override={overrides[t.stepName]} onOverrideChange={onOverrideChange} onOverrideClear={onOverrideClear}>
          <span className="flex-1 text-[9px] font-mono text-[var(--color-figma-text-secondary)] truncate">{formatValue(t.value)}</span>
        </OverrideRow>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contrast Check config editor
// ---------------------------------------------------------------------------

function ContrastCheckConfigEditor({ config, onChange }: { config: ContrastCheckConfig; onChange: (c: ContrastCheckConfig) => void }) {
  const bgColorInputRef = useRef<HTMLInputElement>(null);

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
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Background color</label>
        <div className="flex items-center gap-2">
          <button
            className="w-6 h-6 rounded border border-[var(--color-figma-border)] shrink-0"
            style={{ background: bgHex6 }}
            onClick={() => bgColorInputRef.current?.click()}
            title="Pick background color"
          />
          <input
            ref={bgColorInputRef}
            type="color"
            className="sr-only"
            key={bgHex6}
            defaultValue={bgHex6}
            onBlur={e => onChange({ ...config, backgroundHex: e.target.value })}
          />
          <input
            type="text"
            value={config.backgroundHex}
            onChange={e => onChange({ ...config, backgroundHex: e.target.value })}
            className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]"
            placeholder="#ffffff"
          />
        </div>
        <div className="flex gap-2 mt-1.5">
          <button onClick={() => onChange({ ...config, backgroundHex: '#ffffff' })}
            className={`px-2 py-0.5 rounded text-[9px] border ${config.backgroundHex === '#ffffff' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'}`}>
            White
          </button>
          <button onClick={() => onChange({ ...config, backgroundHex: '#000000' })}
            className={`px-2 py-0.5 rounded text-[9px] border ${config.backgroundHex === '#000000' ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'}`}>
            Black
          </button>
        </div>
      </div>

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
            const passAA = ratio !== null && ratio >= WCAG_AA_NORMAL;
            return (
              <div key={idx} className="flex items-center gap-1.5">
                <ColorStepSwatch hex={step.hex} onHexChange={hex => updateStep(idx, { hex })} />
                <input type="text" value={step.name} onChange={e => updateStep(idx, { name: e.target.value })}
                  placeholder="name"
                  className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
                <input type="text" value={step.hex} onChange={e => updateStep(idx, { hex: e.target.value })}
                  placeholder="#000000"
                  className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
                {ratio !== null && (
                  <span className={`text-[8px] font-medium shrink-0 ${passAA ? 'text-green-600' : 'text-red-500'}`}>
                    {ratio.toFixed(1)}
                  </span>
                )}
                <button onClick={() => removeStep(idx)}
                  className="shrink-0 text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[12px] leading-none">×</button>
              </div>
            );
          })}
          <button onClick={addStep} className="text-[9px] text-[var(--color-figma-accent)] hover:underline text-left mt-0.5">
            + Add color
          </button>
        </div>
      </div>
    </div>
  );
}

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
      />
      <input ref={ref} type="color" className="sr-only" key={hex6} defaultValue={hex6}
        onBlur={e => onHexChange(e.target.value)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-config editors
// ---------------------------------------------------------------------------

function ColorRampConfigEditor({ config, onChange }: { config: ColorRampConfig; onChange: (c: ColorRampConfig) => void }) {
  const activePresetIdx = COLOR_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s === config.steps[i])
  );
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5 flex-wrap">
          {COLOR_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} onClick={() => onChange({ ...config, steps: [...preset.steps] })}
              className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${activePresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Light end L* <span className="text-[var(--color-figma-text)]">{config.lightEnd}</span></label>
          <input type="range" min={80} max={99} step={1} value={config.lightEnd} onChange={e => onChange({ ...config, lightEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </div>
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Dark end L* <span className="text-[var(--color-figma-text)]">{config.darkEnd}</span></label>
          <input type="range" min={2} max={30} step={1} value={config.darkEnd} onChange={e => onChange({ ...config, darkEnd: Number(e.target.value) })} className="w-full accent-[var(--color-figma-accent)] h-1.5" />
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Chroma boost <span className="text-[var(--color-figma-text)]">{config.chromaBoost.toFixed(1)}x</span></label>
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

function TypeScaleConfigEditor({ config, onChange }: { config: TypeScaleConfig; onChange: (c: TypeScaleConfig) => void }) {
  const [customRatio, setCustomRatio] = useState('');
  const [isCustomRatio, setIsCustomRatio] = useState(false);
  const activePresetRatio = TYPE_RATIO_PRESETS.find(p => Math.abs(p.value - config.ratio) < 0.0001);
  const activeStepPresetIdx = TYPE_STEP_PRESETS.findIndex(
    p => p.steps.length === config.steps.length && p.steps.every((s, i) => s.name === config.steps[i]?.name)
  );
  const handleRatioPreset = (val: number) => { setIsCustomRatio(false); onChange({ ...config, ratio: val }); };
  const handleCustomRatioCommit = () => {
    const val = parseFloat(customRatio);
    if (!isNaN(val) && val > 1) onChange({ ...config, ratio: Math.round(val * 1000) / 1000 });
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Scale ratio</label>
        <div className="flex flex-col gap-1">
          <div className="flex gap-1 flex-wrap">
            {TYPE_RATIO_PRESETS.map(preset => (
              <button key={preset.value} onClick={() => handleRatioPreset(preset.value)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${!isCustomRatio && activePresetRatio?.value === preset.value ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
              >{preset.label.split(' ')[0]} ({preset.value})</button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Custom:</span>
            <input type="number" min="1.001" max="4" step="0.001" value={isCustomRatio ? customRatio : config.ratio}
              onChange={e => { setIsCustomRatio(true); setCustomRatio(e.target.value); }}
              onBlur={handleCustomRatioCommit} onKeyDown={e => e.key === 'Enter' && handleCustomRatioCommit()}
              className="w-20 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
        <div className="flex gap-1.5">
          {TYPE_STEP_PRESETS.map((preset, i) => (
            <button key={preset.label} onClick={() => onChange({ ...config, steps: preset.steps.map(s => ({ ...s })) })}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-medium border transition-colors ${activeStepPresetIdx === i ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >{preset.label}</button>
          ))}
        </div>
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
    </div>
  );
}

function SpacingScaleConfigEditor({ config, onChange }: { config: SpacingScaleConfig; onChange: (c: SpacingScaleConfig) => void }) {
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
            <button key={preset.label} onClick={() => { setIsCustom(false); onChange({ ...config, steps: preset.steps.map(s => ({ ...s })) }); }}
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

function OpacityScaleConfigEditor({ config, onChange }: { config: OpacityScaleConfig; onChange: (c: OpacityScaleConfig) => void }) {
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
            <button key={preset.label} onClick={() => { setIsCustom(false); onChange({ steps: preset.steps.map(s => ({ ...s })) }); }}
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
            {customError && <p className="text-[10px] text-[var(--color-figma-error)] mt-0.5">{customError}</p>}
            <button onClick={handleCustomCommit} className="mt-1 px-2 py-1 rounded bg-[var(--color-figma-accent)] text-white text-[10px] hover:bg-[var(--color-figma-accent-hover)]">Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BorderRadiusConfigEditor({ config, onChange }: { config: BorderRadiusScaleConfig; onChange: (c: BorderRadiusScaleConfig) => void }) {
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
                placeholder="name" className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
              {step.exactValue !== undefined ? (
                <>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">exact:</span>
                  <input type="number" value={step.exactValue} onChange={e => updateStep(i, { exactValue: Number(e.target.value) })}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: undefined, multiplier: 1 })} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">×exact</button>
                </>
              ) : (
                <>
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">×</span>
                  <input type="number" step="0.1" value={step.multiplier} onChange={e => updateStep(i, { multiplier: Number(e.target.value) })}
                    className="w-16 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                  <button onClick={() => updateStep(i, { exactValue: 0 })} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]">+exact</button>
                </>
              )}
              <button onClick={() => removeStep(i)} className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">×</button>
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

function ZIndexConfigEditor({ config, onChange }: { config: ZIndexScaleConfig; onChange: (c: ZIndexScaleConfig) => void }) {
  const updateStep = (idx: number, updates: Partial<{ name: string; value: number }>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ steps });
  };
  const addStep = () => onChange({ steps: [...config.steps, { name: 'new', value: 0 }] });
  const removeStep = (idx: number) => onChange({ steps: config.steps.filter((_, i) => i !== idx) });
  return (
    <div className="flex flex-col gap-2">
      <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">Steps</label>
      {config.steps.map((step, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={step.name} onChange={e => updateStep(i, { name: e.target.value })}
            placeholder="name" className="w-20 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
          <input type="number" value={step.value} onChange={e => updateStep(i, { value: Number(e.target.value) })}
            className="flex-1 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
          <button onClick={() => removeStep(i)} className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">×</button>
        </div>
      ))}
      <button onClick={addStep} className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left">+ Add step</button>
    </div>
  );
}

const DTCG_OUTPUT_TYPES = ['number', 'dimension', 'percentage', 'duration'];

function CustomScaleConfigEditor({ config, onChange }: { config: CustomScaleConfig; onChange: (c: CustomScaleConfig) => void }) {
  const updateStep = (idx: number, updates: Partial<CustomScaleStep>) => {
    const steps = config.steps.map((s, i) => i === idx ? { ...s, ...updates } : s);
    onChange({ ...config, steps });
  };
  const addStepAbove = () => {
    const maxIdx = Math.max(...config.steps.map(s => s.index), 0);
    onChange({ ...config, steps: [...config.steps, { name: `step${maxIdx + 1}`, index: maxIdx + 1, multiplier: 1 }] });
  };
  const addStepBelow = () => {
    const minIdx = Math.min(...config.steps.map(s => s.index), 0);
    onChange({ ...config, steps: [{ name: `step${minIdx - 1}`, index: minIdx - 1, multiplier: 1 }, ...config.steps] });
  };
  const removeStep = (idx: number) => onChange({ ...config, steps: config.steps.filter((_, i) => i !== idx) });
  const sortedSteps = [...config.steps].sort((a, b) => a.index - b.index);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
          Formula
          <span className="ml-1 text-[9px] opacity-70">variables: base, index, multiplier, prev</span>
        </label>
        <input value={config.formula} onChange={e => onChange({ ...config, formula: e.target.value })}
          placeholder="base * multiplier"
          className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
        <div className="flex gap-1 mt-1 flex-wrap">
          {['base * multiplier', 'base + index * 8', 'base * (1.25 ** index)', 'prev + 8'].map(ex => (
            <button key={ex} onClick={() => onChange({ ...config, formula: ex })}
              className="px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[9px] font-mono text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
            >{ex}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Output type</label>
          <select value={config.outputType} onChange={e => onChange({ ...config, outputType: e.target.value })}
            className="px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]">
            {DTCG_OUTPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {config.outputType === 'dimension' && (
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Unit</label>
            <div className="flex gap-1">
              {(['px', 'rem', 'em', '%'] as const).map(u => (
                <button key={u} onClick={() => onChange({ ...config, unit: u })}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${config.unit === u ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                >{u}</button>
              ))}
            </div>
          </div>
        )}
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
      <div>
        <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
          Steps
          <span className="ml-1 text-[9px] opacity-70">index 0 = base token value</span>
        </label>
        <div className="flex flex-col gap-1">
          <button onClick={addStepAbove} className="text-[9px] text-[var(--color-figma-accent)] hover:underline text-left">+ Add step above</button>
          {sortedSteps.map((step, sortedIdx) => {
            const origIdx = config.steps.indexOf(step);
            return (
              <div key={sortedIdx} className="flex items-center gap-1.5">
                <input value={step.name} onChange={e => updateStep(origIdx, { name: e.target.value })}
                  placeholder="name" className="w-14 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] font-mono outline-none focus:border-[var(--color-figma-accent)]" />
                <span className="text-[9px] text-[var(--color-figma-text-secondary)]">idx</span>
                <input type="number" value={step.index} onChange={e => updateStep(origIdx, { index: Number(e.target.value) })}
                  className="w-12 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                <span className="text-[9px] text-[var(--color-figma-text-secondary)]">×</span>
                <input type="number" step="0.1" value={step.multiplier ?? 1} onChange={e => updateStep(origIdx, { multiplier: Number(e.target.value) })}
                  className="w-12 px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]" />
                <button onClick={() => removeStep(origIdx)} className="ml-auto text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] text-[10px]">×</button>
              </div>
            );
          })}
          <button onClick={addStepBelow} className="text-[9px] text-[var(--color-figma-accent)] hover:underline text-left">+ Add step below</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export interface TokenGeneratorDialogProps {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  allSets: string[];
  activeSet: string;
  existingGenerator?: TokenGenerator;
  /** Pre-fill from a quick-start template */
  template?: GeneratorTemplate;
  onClose: () => void;
  onSaved: (info?: { targetGroup: string }) => void;
}

const TYPE_LABELS: Record<GeneratorType, string> = {
  colorRamp: 'Color Ramp',
  typeScale: 'Type Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Border Radius',
  zIndexScale: 'Z-Index',
  customScale: 'Custom',
  contrastCheck: 'Contrast Check',
};

// Types that require a source token
const SOURCE_REQUIRED_TYPES: GeneratorType[] = ['colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale'];
// Types that work standalone (no source)
const STANDALONE_TYPES: GeneratorType[] = ['opacityScale', 'zIndexScale', 'contrastCheck'];
// Types that work either way
const FLEXIBLE_TYPES: GeneratorType[] = ['customScale'];

const ALL_TYPES: GeneratorType[] = [
  'colorRamp', 'typeScale', 'spacingScale', 'borderRadiusScale',
  'opacityScale', 'zIndexScale', 'customScale', 'contrastCheck',
];

export function TokenGeneratorDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenType = '',
  sourceTokenValue,
  allSets,
  activeSet,
  existingGenerator,
  template,
  onClose,
  onSaved,
}: TokenGeneratorDialogProps) {
  const isEditing = Boolean(existingGenerator);

  const recommendedType = useMemo(() => {
    if (sourceTokenPath && sourceTokenType) {
      return detectGeneratorType(sourceTokenType, sourceTokenValue);
    }
    return undefined;
  }, [sourceTokenPath, sourceTokenType, sourceTokenValue]);

  const initialType: GeneratorType =
    existingGenerator?.type ??
    template?.generatorType ??
    recommendedType ??
    'customScale';

  const [selectedType, setSelectedType] = useState<GeneratorType>(initialType);
  const [name, setName] = useState(
    existingGenerator?.name ??
    (template ? template.label : autoName(sourceTokenPath, initialType))
  );
  const [targetSet, setTargetSet] = useState(existingGenerator?.targetSet ?? activeSet);
  const [targetGroup, setTargetGroup] = useState(
    existingGenerator?.targetGroup ??
    (template ? template.defaultPrefix : (sourceTokenPath ? suggestTargetGroup(sourceTokenPath) : ''))
  );

  // Build per-type config map
  const [configs, setConfigs] = useState<Partial<Record<GeneratorType, GeneratorConfig>>>(() => {
    const base: Partial<Record<GeneratorType, GeneratorConfig>> = {};
    for (const t of ALL_TYPES) {
      if (existingGenerator?.type === t) {
        base[t] = existingGenerator.config;
      } else if (template?.generatorType === t) {
        base[t] = template.config;
      } else {
        base[t] = defaultConfigForType(t);
      }
    }
    return base;
  });

  // Local overrides state (for the "pending" state before save)
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, { value: unknown; locked: boolean }>>(
    existingGenerator?.overrides ?? {}
  );

  // Preview state
  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Semantic mapping flow (after successful create)
  const [showSemanticMapping, setShowSemanticMapping] = useState(false);
  const [savedTokens, setSavedTokens] = useState<GeneratedTokenResult[]>([]);
  const [savedTargetGroup, setSavedTargetGroup] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const nameWasAutoRef = useRef(!existingGenerator && !template);
  const handleTypeChange = (type: GeneratorType) => {
    setSelectedType(type);
    if (nameWasAutoRef.current) setName(autoName(sourceTokenPath, type));
  };

  // Whether current type needs a source token
  const typeNeedsSource = SOURCE_REQUIRED_TYPES.includes(selectedType);
  const hasSource = Boolean(sourceTokenPath);

  const fetchPreview = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const body = {
          type: selectedType,
          sourceToken: sourceTokenPath || undefined,
          targetGroup,
          targetSet,
          config: configs[selectedType],
          overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        };
        const res = await fetch(`${serverUrl}/api/generators/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string };
          setPreviewError(data.error || `Preview failed (${res.status})`);
          setPreviewTokens([]);
        } else {
          const data = await res.json() as { count: number; tokens: GeneratedTokenResult[] };
          setPreviewTokens(data.tokens ?? []);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPreviewError(err instanceof Error ? err.message : 'Preview failed');
        setPreviewTokens([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
  }, [serverUrl, selectedType, sourceTokenPath, targetGroup, targetSet, configs, pendingOverrides]);

  useEffect(() => {
    fetchPreview();
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [fetchPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleOverrideChange = (stepName: string, value: string, locked: boolean) => {
    setPendingOverrides(prev => ({ ...prev, [stepName]: { value, locked } }));
  };

  const handleOverrideClear = (stepName: string) => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      delete next[stepName];
      return next;
    });
  };

  const clearAllOverrides = () => setPendingOverrides({});
  const lockedCount = Object.values(pendingOverrides).filter(o => o.locked).length;

  const handleSave = async () => {
    if (!targetGroup.trim()) { setSaveError('Target group is required.'); return; }
    if (!name.trim()) { setSaveError('Generator name is required.'); return; }
    if (typeNeedsSource && !hasSource) { setSaveError('This generator type requires a source token.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        type: selectedType,
        name: name.trim(),
        sourceToken: sourceTokenPath || undefined,
        targetSet,
        targetGroup: targetGroup.trim(),
        config: configs[selectedType],
        overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
      };
      let res: Response;
      if (isEditing && existingGenerator) {
        res = await fetch(`${serverUrl}/api/generators/${existingGenerator.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${serverUrl}/api/generators`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(data.error || `Failed to save (${res.status})`);
        setSaving(false);
        return;
      }
      // For new generators (not edits), offer semantic mapping if there are preview tokens
      if (!isEditing && previewTokens.length > 0) {
        setSavedTokens(previewTokens);
        setSavedTargetGroup(targetGroup.trim());
        setShowSemanticMapping(true);
        setSaving(false);
        return;
      }
      onSaved({ targetGroup: targetGroup.trim() });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setSaving(false);
    }
  };

  const currentConfig = configs[selectedType]!;
  const handleConfigChange = (type: GeneratorType, cfg: GeneratorConfig) => {
    setConfigs(prev => ({ ...prev, [type]: cfg }));
  };

  // Determine which types to show: if no source, only show standalone/flexible; if source, show all
  const availableTypes = hasSource ? ALL_TYPES : [...STANDALONE_TYPES, ...FLEXIBLE_TYPES];

  if (showSemanticMapping) {
    return (
      <SemanticMappingDialog
        serverUrl={serverUrl}
        generatedTokens={savedTokens}
        generatorType={selectedType}
        targetGroup={savedTargetGroup}
        targetSet={targetSet}
        onClose={() => { setShowSemanticMapping(false); onSaved({ targetGroup: savedTargetGroup }); }}
        onCreated={() => { setShowSemanticMapping(false); onSaved({ targetGroup: savedTargetGroup }); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)] shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">
              {isEditing ? 'Edit Generator' : template ? template.label : 'New Token Generator'}
            </span>
            {sourceTokenPath ? (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-mono truncate max-w-[220px]">
                {sourceTokenPath}
              </span>
            ) : (
              <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Standalone generator</span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Type selector */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">
              Generator type
              {recommendedType && (
                <span className="ml-1 text-[var(--color-figma-accent)]">(recommended: {TYPE_LABELS[recommendedType]})</span>
              )}
            </label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_TYPES.map(type => {
                const disabled = !availableTypes.includes(type);
                return (
                  <button
                    key={type}
                    onClick={() => !disabled && handleTypeChange(type)}
                    disabled={disabled}
                    className={`px-2 py-1.5 rounded text-[10px] font-medium border transition-colors text-left flex items-center gap-1.5 ${
                      disabled
                        ? 'opacity-30 cursor-not-allowed border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)]'
                        : selectedType === type
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                    }`}
                  >
                    {type === recommendedType && <span className="text-[8px] leading-none">★</span>}
                    {TYPE_LABELS[type]}
                    {STANDALONE_TYPES.includes(type) && <span className="text-[8px] ml-auto opacity-60">standalone</span>}
                  </button>
                );
              })}
            </div>
            {typeNeedsSource && !hasSource && (
              <p className="text-[9px] text-[var(--color-figma-error)] mt-1">
                This type requires a source token. Open from a token's editor, or switch to a standalone type.
              </p>
            )}
          </div>

          {/* Config */}
          <div className="border border-[var(--color-figma-border)] rounded p-3 bg-[var(--color-figma-bg-secondary)]">
            <span className="block text-[10px] font-medium text-[var(--color-figma-text)] mb-3">{TYPE_LABELS[selectedType]} settings</span>
            {selectedType === 'colorRamp' && <ColorRampConfigEditor config={currentConfig as ColorRampConfig} onChange={cfg => handleConfigChange('colorRamp', cfg)} />}
            {selectedType === 'typeScale' && <TypeScaleConfigEditor config={currentConfig as TypeScaleConfig} onChange={cfg => handleConfigChange('typeScale', cfg)} />}
            {selectedType === 'spacingScale' && <SpacingScaleConfigEditor config={currentConfig as SpacingScaleConfig} onChange={cfg => handleConfigChange('spacingScale', cfg)} />}
            {selectedType === 'opacityScale' && <OpacityScaleConfigEditor config={currentConfig as OpacityScaleConfig} onChange={cfg => handleConfigChange('opacityScale', cfg)} />}
            {selectedType === 'borderRadiusScale' && <BorderRadiusConfigEditor config={currentConfig as BorderRadiusScaleConfig} onChange={cfg => handleConfigChange('borderRadiusScale', cfg)} />}
            {selectedType === 'zIndexScale' && <ZIndexConfigEditor config={currentConfig as ZIndexScaleConfig} onChange={cfg => handleConfigChange('zIndexScale', cfg)} />}
            {selectedType === 'customScale' && <CustomScaleConfigEditor config={currentConfig as CustomScaleConfig} onChange={cfg => handleConfigChange('customScale', cfg)} />}
            {selectedType === 'contrastCheck' && <ContrastCheckConfigEditor config={currentConfig as ContrastCheckConfig} onChange={cfg => handleConfigChange('contrastCheck', cfg)} />}
          </div>

          {/* Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
                Preview
                {previewTokens.length > 0 && <span className="ml-1 text-[var(--color-figma-text)]">({previewTokens.length} tokens)</span>}
              </label>
              <div className="flex items-center gap-2">
                {lockedCount > 0 && (
                  <button onClick={clearAllOverrides} className="text-[9px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 3L6 7M6 3l4 4"/><path d="M2 7h4v3H2z"/></svg>
                    Clear {lockedCount} override{lockedCount !== 1 ? 's' : ''}
                  </button>
                )}
                {previewLoading && (
                  <svg className="w-3 h-3 animate-spin text-[var(--color-figma-text-secondary)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>
            </div>

            {previewError && (
              <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-1.5">{previewError}</div>
            )}

            {/* Contrast check preview is always shown (even when 0 tokens, to guide the user) */}
            {selectedType === 'contrastCheck' && (
              <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)]">
                <ContrastCheckPreview tokens={previewTokens} />
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && previewTokens.length > 0 && (
              <div className="border border-[var(--color-figma-border)] rounded p-2.5 bg-[var(--color-figma-bg-secondary)]">
                {selectedType === 'colorRamp' && (
                  <ColorSwatchPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {selectedType === 'typeScale' && (
                  <TypeScalePreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {(selectedType === 'spacingScale' || selectedType === 'borderRadiusScale') && (
                  <SpacingPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {selectedType === 'opacityScale' && (
                  <OpacityPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
                {(selectedType === 'zIndexScale' || selectedType === 'customScale') && (
                  <GenericPreview tokens={previewTokens} overrides={pendingOverrides} onOverrideChange={handleOverrideChange} onOverrideClear={handleOverrideClear} />
                )}
              </div>
            )}

            {selectedType !== 'contrastCheck' && !previewError && !previewLoading && previewTokens.length === 0 && (
              <div className="text-[10px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)] rounded px-2 py-2 bg-[var(--color-figma-bg-secondary)]">
                No preview available.
              </div>
            )}
          </div>

          {/* Target */}
          <div className="flex flex-col gap-2.5">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Target</span>
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target set</label>
              <select value={targetSet} onChange={e => setTargetSet(e.target.value)}
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]">
                {allSets.map(s => <option key={s} value={s}>{s}</option>)}
                {allSets.length === 0 && <option value={activeSet}>{activeSet}</option>}
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Target group path</label>
              <input type="text" value={targetGroup} onChange={e => setTargetGroup(e.target.value)} placeholder="e.g. spacing"
                className={`w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono ${!targetGroup.trim() ? 'border-[var(--color-figma-error)]' : 'border-[var(--color-figma-border)]'}`} />
              <p className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5">
                Tokens: <span className="font-mono">{targetGroup || '…'}.{'{'+'step}'}</span>
              </p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Generator name</label>
            <input type="text" value={name} onChange={e => { nameWasAutoRef.current = false; setName(e.target.value); }}
              placeholder="My generator"
              className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]" />
          </div>

          {saveError && <div className="text-[10px] text-[var(--color-figma-error)]">{saveError}</div>}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] shrink-0">
          <button onClick={onClose} className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]">Cancel</button>
          <button onClick={handleSave} disabled={saving || !targetGroup.trim() || !name.trim() || (typeNeedsSource && !hasSource)}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50">
            {saving
              ? (isEditing ? 'Saving…' : 'Creating…')
              : isEditing
                ? 'Update generator'
                : previewTokens.length > 0
                  ? `Create (${previewTokens.length} tokens)`
                  : 'Create generator'
            }
          </button>
        </div>
      </div>
    </div>
  );
}
