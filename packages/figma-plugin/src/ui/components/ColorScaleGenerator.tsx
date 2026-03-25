import { useState, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Color math — hex ↔ CIELAB
// ---------------------------------------------------------------------------

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function fromLinear(c: number): number {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function hexToLab(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  // sRGB → XYZ (D65)
  const X = 0.4124 * r + 0.3576 * g + 0.1805 * b;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  // XYZ → Lab
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(X / 0.95047), fy = f(Y / 1.00000), fz = f(Z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labToHex(L: number, a: number, b: number): string {
  // Lab → XYZ
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const f3 = (t: number) => t > 0.206897 ? t * t * t : (t - 16 / 116) / 7.787;
  const X = f3(fx) * 0.95047;
  const Y = f3(fy) * 1.00000;
  const Z = f3(fz) * 1.08883;
  // XYZ → sRGB
  const lr = fromLinear( 3.2406 * X - 1.5372 * Y - 0.4986 * Z);
  const lg = fromLinear(-0.9689 * X + 1.8758 * Y + 0.0415 * Z);
  const lb = fromLinear( 0.0557 * X - 0.2040 * Y + 1.0570 * Z);
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${h(lr)}${h(lg)}${h(lb)}`;
}

// ---------------------------------------------------------------------------
// Scale generation
// ---------------------------------------------------------------------------

const STEP_NAMES_9 = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
const STEP_NAMES_5 = ['100', '300', '500', '700', '900'];
const STEP_NAMES_7 = ['100', '200', '400', '500', '600', '800', '900'];

function getStepNames(count: 5 | 7 | 9): string[] {
  if (count === 5) return STEP_NAMES_5;
  if (count === 7) return STEP_NAMES_7;
  return STEP_NAMES_9;
}

interface ScaleStep {
  label: string;
  hex: string;
  L: number;
}

function generateScale(baseHex: string, count: 5 | 7 | 9): ScaleStep[] {
  const lab = hexToLab(baseHex);
  if (!lab) return [];
  const [, bA, bB] = lab;

  const names = getStepNames(count);
  // L* anchors: near-white (95) at step 0, near-black (8) at last step
  // Chroma peaks in the middle and tapers toward ends
  const steps: ScaleStep[] = names.map((label, i) => {
    const t = i / (count - 1); // 0 → 1
    // L* linearly from 95 to 8
    const L = 95 - t * (95 - 8);
    // Chroma: scale peaks at t=0.4 (near 500) and falls off at ends
    // Use a bell-shaped factor: 4t(1-t) peaks at t=0.5; shift peak slightly toward light
    const chromaFactor = Math.min(1, 4.5 * t * (1 - t) * 1.5);
    const a = bA * chromaFactor;
    const b = bB * chromaFactor;
    return { label, hex: labToHex(L, a, b), L };
  });

  return steps;
}

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

function Sparkline({ steps }: { steps: ScaleStep[] }) {
  if (steps.length < 2) return null;

  const W = 240, H = 40, PAD = 6;
  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;

  // L* values
  const Ls = steps.map(s => s.L);
  const minL = Math.min(...Ls), maxL = Math.max(...Ls);
  const range = maxL - minL || 1;

  const xOf = (i: number) => PAD + (i / (steps.length - 1)) * plotW;
  const yOf = (L: number) => PAD + (1 - (L - minL) / range) * plotH;

  const points = steps.map((s, i) => [xOf(i), yOf(s.L)] as [number, number]);

  // Detect disproportionate jumps
  const jumps = steps.slice(1).map((s, i) => Math.abs(s.L - steps[i].L));
  const sorted = [...jumps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = median * 2;

  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg width={W} height={H} className="w-full">
      <path d={d} fill="none" stroke="var(--color-figma-border)" strokeWidth="1.5" />
      {points.map(([x, y], i) => {
        const jump = i < jumps.length ? jumps[i] : (i > 0 ? jumps[i - 1] : 0);
        const isOutlier = jump > threshold && median > 0;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={3}
            fill={isOutlier ? '#f97316' : 'var(--color-figma-accent)'}
          >
            <title>{`${steps[i].label}: L*=${steps[i].L.toFixed(1)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ColorScaleGeneratorProps {
  serverUrl: string;
  activeSet: string;
  existingPaths: Set<string>;
  onClose: () => void;
  onConfirm: () => void;
}

export function ColorScaleGenerator({ serverUrl, activeSet, existingPaths, onClose, onConfirm }: ColorScaleGeneratorProps) {
  const [prefix, setPrefix] = useState('color');
  const [baseHex, setBaseHex] = useState('#3b82f6');
  const [steps, setSteps] = useState<5 | 7 | 9>(9);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const scale = useMemo(() => generateScale(baseHex, steps), [baseHex, steps]);

  const conflicts = useMemo(
    () => scale.filter(s => existingPaths.has(`${prefix}.${s.label}`)),
    [scale, prefix, existingPaths]
  );

  const handleCreate = async () => {
    if (!scale.length || creating) return;
    setCreating(true);
    setError('');
    try {
      await Promise.all(scale.map(step =>
        fetch(`${serverUrl}/api/tokens/${activeSet}/${prefix}.${step.label}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: 'color', $value: step.hex }),
        })
      ));
      onConfirm();
    } catch (err) {
      setError(String(err));
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
          <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Generate Color Scale</span>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Inputs */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Prefix (token namespace)</label>
              <input
                type="text"
                value={prefix}
                onChange={e => setPrefix(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))}
                placeholder="e.g. brand, primary, neutral"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
              />
            </div>

            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Base color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={baseHex.slice(0, 7)}
                  onChange={e => setBaseHex(e.target.value)}
                  className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent shrink-0"
                />
                <input
                  type="text"
                  value={baseHex}
                  onChange={e => setBaseHex(e.target.value)}
                  placeholder="#3b82f6"
                  className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
              <div className="flex gap-2">
                {([5, 7, 9] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setSteps(n)}
                    className={`flex-1 py-1 rounded text-[10px] font-medium border transition-colors ${steps === n ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview swatches */}
          {scale.length > 0 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5">Preview</label>
              <div className="flex gap-0.5 rounded overflow-hidden h-10">
                {scale.map(step => (
                  <div
                    key={step.label}
                    className="flex-1"
                    style={{ background: step.hex }}
                    title={`${prefix}.${step.label}: ${step.hex} (L*=${step.L.toFixed(0)})`}
                  />
                ))}
              </div>
              <div className="flex justify-between mt-0.5">
                <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{scale[0].label}</span>
                <span className="text-[8px] text-[var(--color-figma-text-secondary)]">{scale[scale.length - 1].label}</span>
              </div>
            </div>
          )}

          {/* Sparkline */}
          {scale.length > 1 && (
            <div>
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">
                Lightness curve (L*) — <span className="text-orange-500">●</span> uneven step
              </label>
              <div className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                <Sparkline steps={scale} />
                <div className="flex justify-between mt-0.5">
                  {scale.map(s => (
                    <span key={s.label} className="text-[7px] text-[var(--color-figma-text-secondary)]">{s.label}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1.5">
              ⚠ {conflicts.length} token{conflicts.length !== 1 ? 's' : ''} already exist and will be overwritten.
            </div>
          )}

          {error && (
            <div className="text-[10px] text-[var(--color-figma-error)]">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !prefix || scale.length === 0}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {creating ? 'Creating…' : `Create ${scale.length} tokens`}
          </button>
        </div>
      </div>
    </div>
  );
}
