import { getErrorMessage } from '../shared/utils';
import { swatchBgColor } from '../shared/colorUtils';
import { useState, useMemo, useEffect, useRef } from 'react';
import { hexToLab, labToHex } from '@tokenmanager/core';
import { ColorPicker } from './ColorPicker';
import { apiFetch } from '../shared/apiFetch';

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
    // L* with a slight power curve so mid-tones are more spread out
    const eased = Math.pow(t, 0.85);
    const L = 95 - eased * (95 - 8);
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
        const jumpBefore = i > 0 ? jumps[i - 1] : 0;
        const jumpAfter = i < jumps.length ? jumps[i] : 0;
        const jump = Math.max(jumpBefore, jumpAfter);
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
  onConfirm: (firstTokenPath?: string) => void;
}

export function ColorScaleGenerator({ serverUrl, activeSet, existingPaths, onClose, onConfirm }: ColorScaleGeneratorProps) {
  const [prefix, setPrefix] = useState('color');
  const [baseHex, setBaseHex] = useState('#3b82f6');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [steps, setSteps] = useState<5 | 7 | 9>(9);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const scale = useMemo(() => generateScale(baseHex, steps), [baseHex, steps]);

  const conflicts = useMemo(
    () => scale.filter(s => existingPaths.has(`${prefix}.${s.label}`)),
    [scale, prefix, existingPaths]
  );

  const handleCreate = async () => {
    if (!scale.length || creating) return;
    setCreating(true);
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const results = await Promise.allSettled(scale.map(step =>
        apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${prefix}.${step.label}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ $type: 'color', $value: step.hex }),
          signal: controller.signal,
        })
      ));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        const firstError = (failed[0] as PromiseRejectedResult).reason;
        setError(firstError?.message || `Failed to create ${failed.length} token(s)`);
        setCreating(false);
        return;
      }
      setCreating(false);
      onConfirm(`${prefix}.${scale[0].label}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(getErrorMessage(err));
      setCreating(false);
    }
  };

  const firstStep = scale[0]?.label ?? '100';
  const lastStep = scale[scale.length - 1]?.label ?? '900';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50">
      <div className="bg-[var(--color-figma-bg)] rounded-t border border-[var(--color-figma-border)] shadow-xl w-full max-w-sm flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-figma-border)]">
          <span className="text-[12px] font-semibold text-[var(--color-figma-text)]">Generate Color Scale</span>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Base color — the primary input */}
          <div>
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Base color</label>
            <div className="flex gap-2 items-center">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerOpen(!pickerOpen)}
                  className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer"
                  style={{ backgroundColor: swatchBgColor(baseHex) }}
                  title="Pick color"
                  aria-label="Pick color"
                />
                {pickerOpen && (
                  <ColorPicker
                    value={baseHex}
                    onChange={setBaseHex}
                    onClose={() => setPickerOpen(false)}
                  />
                )}
              </div>
              <input
                type="text"
                value={baseHex}
                onChange={e => setBaseHex(e.target.value)}
                placeholder="#3b82f6"
                aria-label="Base color hex value"
                className="flex-1 px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)] font-mono"
              />
            </div>
          </div>

          {/* Invalid hex feedback */}
          {scale.length === 0 && baseHex !== '' && (
            <div className="text-[10px] text-[var(--color-figma-error)]">Invalid color — enter a valid hex value (e.g. #3b82f6)</div>
          )}

          {/* Preview swatches — dominant element, shown immediately after color input */}
          {scale.length > 0 && (
            <div>
              <div className="flex gap-0.5 rounded overflow-hidden">
                {scale.map(step => (
                  <div key={step.label} className="flex-1 flex flex-col min-w-0">
                    <div
                      className="h-16"
                      style={{ background: step.hex }}
                      title={`${prefix}.${step.label}: ${step.hex}`}
                    />
                    <div className="py-1 text-center bg-[var(--color-figma-bg-secondary)]">
                      <div className="text-[8px] font-medium text-[var(--color-figma-text)] leading-tight">{step.label}</div>
                      <div className="text-[7px] text-[var(--color-figma-text-secondary)] font-mono leading-tight truncate px-0.5">{step.hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* L* sparkline — collapsed by default (advanced detail) */}
          {scale.length > 1 && (
            <details className="group">
              <summary className="text-[10px] text-[var(--color-figma-text-secondary)] cursor-pointer select-none list-none flex items-center gap-1 hover:text-[var(--color-figma-text)]">
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="transition-transform group-open:rotate-90 shrink-0">
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                Lightness curve (L*)
              </summary>
              <div className="mt-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-2">
                <div className="text-[8px] text-[var(--color-figma-text-secondary)] mb-1">
                  <span className="text-orange-500">●</span> marks uneven steps
                </div>
                <Sparkline steps={scale} />
                <div className="flex justify-between mt-0.5">
                  {scale.map(s => (
                    <span key={s.label} className="text-[7px] text-[var(--color-figma-text-secondary)]">{s.label}</span>
                  ))}
                </div>
              </div>
            </details>
          )}

          {/* Steps & prefix — secondary controls below the preview */}
          <div className="flex gap-3">
            {/* Steps */}
            <div className="shrink-0">
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Steps</label>
              <div className="flex gap-1">
                {([5, 7, 9] as const).map(n => (
                  <button
                    key={n}
                    onClick={() => setSteps(n)}
                    className={`w-8 py-1 rounded text-[10px] font-medium border transition-colors ${steps === n ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Prefix */}
            <div className="flex-1 min-w-0">
              <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Token prefix</label>
              <input
                type="text"
                value={prefix}
                onChange={e => setPrefix(e.target.value.replace(/[^a-zA-Z0-9_.-]/g, ''))}
                placeholder="e.g. brand, primary, neutral"
                aria-label="Token prefix"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] focus-visible:border-[var(--color-figma-accent)]"
              />
              {prefix && scale.length > 0 && (
                <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)] font-mono">
                  {prefix}.{firstStep} → {prefix}.{lastStep}
                </p>
              )}
            </div>
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/5 border border-[var(--color-figma-error)]/20 rounded px-2 py-1.5">
              {conflicts.length} token{conflicts.length !== 1 ? 's' : ''} already exist{conflicts.length === 1 ? 's' : ''} — rename the prefix or choose a different number of steps.
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
            disabled={creating || !prefix || scale.length === 0 || conflicts.length > 0}
            title={!prefix ? 'Enter a prefix first' : conflicts.length > 0 ? 'Resolve naming conflicts first' : scale.length === 0 ? 'Add scale steps first' : undefined}
            className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
          >
            {creating ? 'Creating…' : `Create ${scale.length} tokens`}
          </button>
        </div>
      </div>
    </div>
  );
}
