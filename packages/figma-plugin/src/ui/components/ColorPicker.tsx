import { useState, useEffect, useRef, useCallback } from 'react';
import {
  hexToRgb,
  rgbToHex,
  hslToRgb,
  hexToHsl,
  hslToHex,
  hexToLch,
  lchToHex,
  srgbToP3,
  p3ToSrgb,
  isP3InSrgbGamut,
} from '../shared/colorUtils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColorSpace = 'hex' | 'hsl' | 'lch' | 'p3';

interface ColorPickerProps {
  value: string;          // #RRGGBB or #RRGGBBAA
  onChange: (hex: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function parseAlpha(hex: string): number {
  const clean = hex.replace('#', '');
  return clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
}

function applyAlpha(hex6: string, alpha: number): string {
  if (alpha >= 1) return hex6.slice(0, 7);
  const a = Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0');
  return hex6.slice(0, 7) + a;
}

const inputClass = 'w-full px-1.5 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)] text-center tabular-nums';

// ---------------------------------------------------------------------------
// Canvas drawing helpers
// ---------------------------------------------------------------------------

function drawColorArea(canvas: HTMLCanvasElement, hue: number) {
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const l = 100 - (y / (h - 1)) * 100; // top=100 (white), bottom=0 (black)
    for (let x = 0; x < w; x++) {
      const s = (x / (w - 1)) * 100;
      const { r, g, b } = hslToRgb(hue, s, l);
      const i = (y * w + x) * 4;
      img.data[i] = Math.round(clamp(r, 0, 1) * 255);
      img.data[i + 1] = Math.round(clamp(g, 0, 1) * 255);
      img.data[i + 2] = Math.round(clamp(b, 0, 1) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawHueStrip(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  for (let i = 0; i <= 6; i++) {
    const color = hslToHex(i * 60, 100, 50);
    grad.addColorStop(i / 6, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, canvas.height);
}

function drawAlphaStrip(canvas: HTMLCanvasElement, hex6: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  // Checkerboard
  const size = 4;
  for (let y = 0; y < h; y += size) {
    for (let x = 0; x < w; x += size) {
      ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#ccc' : '#fff';
      ctx.fillRect(x, y, size, size);
    }
  }
  // Gradient overlay
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, hex6.slice(0, 7) + '00');
  grad.addColorStop(1, hex6.slice(0, 7) + 'ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Pointer drag hook
// ---------------------------------------------------------------------------

function usePointerDrag(
  ref: React.RefObject<HTMLCanvasElement | null>,
  onDrag: (x: number, y: number) => void,
) {
  const dragging = useRef(false);

  const getPos = useCallback((e: PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((e.clientY - rect.top) / rect.height, 0, 1);
    return { x, y };
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      el.setPointerCapture(e.pointerId);
      const { x, y } = getPos(e);
      onDrag(x, y);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const { x, y } = getPos(e);
      onDrag(x, y);
    };
    const up = () => { dragging.current = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [ref, onDrag, getPos]);
}

// ---------------------------------------------------------------------------
// Channel input
// ---------------------------------------------------------------------------

function ChannelInput({
  label,
  value,
  min,
  max,
  step = 1,
  decimals = 0,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  const display = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();
  return (
    <div className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
      <label className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase">{label}</label>
      <input
        type="text"
        value={display}
        onChange={e => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(clamp(n, min, max));
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + step, min, max)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - step, min, max)); }
        }}
        className={inputClass}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  // Parse initial color
  const initHsl = hexToHsl(value) ?? { h: 0, s: 0, l: 0 };
  const [hue, setHue] = useState(initHsl.h);
  const [sat, setSat] = useState(initHsl.s);
  const [lit, setLit] = useState(initHsl.l);
  const [alpha, setAlpha] = useState(parseAlpha(value));
  const [space, setSpace] = useState<ColorSpace>('hex');
  const [hexInput, setHexInput] = useState(value);

  const areaRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  const alphaRef = useRef<HTMLCanvasElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Current hex (no alpha)
  const hex6 = hslToHex(hue, sat, lit);
  const hexFull = applyAlpha(hex6, alpha);

  // Sync from prop changes
  const prevValue = useRef(value);
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      const hsl = hexToHsl(value);
      if (hsl) {
        // Preserve hue for achromatic colors
        if (hsl.s > 0.5) setHue(hsl.h);
        setSat(hsl.s);
        setLit(hsl.l);
      }
      setAlpha(parseAlpha(value));
      setHexInput(value);
    }
  }, [value]);

  // Emit changes
  const emitRef = useRef(onChange);
  emitRef.current = onChange;
  useEffect(() => {
    const out = applyAlpha(hslToHex(hue, sat, lit), alpha);
    if (out !== prevValue.current) {
      prevValue.current = out;
      setHexInput(out);
      emitRef.current(out);
    }
  }, [hue, sat, lit, alpha]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Draw color area
  useEffect(() => {
    if (areaRef.current) drawColorArea(areaRef.current, hue);
  }, [hue]);

  // Draw hue strip (once)
  useEffect(() => {
    if (hueRef.current) drawHueStrip(hueRef.current);
  }, []);

  // Draw alpha strip
  useEffect(() => {
    if (alphaRef.current) drawAlphaStrip(alphaRef.current, hex6);
  }, [hex6]);

  // Pointer interactions
  usePointerDrag(areaRef, useCallback((x, y) => {
    setSat(x * 100);
    setLit(100 - y * 100);
  }, []));

  usePointerDrag(hueRef, useCallback((x) => {
    setHue(x * 360);
  }, []));

  usePointerDrag(alphaRef, useCallback((x) => {
    setAlpha(x);
  }, []));

  // Eyedropper: sample from Figma selection
  const sampleSelection = () => {
    parent.postMessage({ pluginMessage: { type: 'eyedropper' } }, '*');
  };

  // Listen for eyedropper result
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'eyedropper-result' && typeof msg.hex === 'string') {
        const hsl = hexToHsl(msg.hex);
        if (hsl) {
          setHue(hsl.h);
          setSat(hsl.s);
          setLit(hsl.l);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Handle hex text input
  const onHexInputChange = (text: string) => {
    const trimmed = text.trim();
    setHexInput(trimmed);
    const clean = trimmed.startsWith('#') ? trimmed : '#' + trimmed;
    if (/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(clean)) {
      const hsl = hexToHsl(clean);
      if (hsl) {
        if (hsl.s > 0.5) setHue(hsl.h);
        setSat(hsl.s);
        setLit(hsl.l);
      }
      if (clean.length === 9) setAlpha(parseInt(clean.slice(7), 16) / 255);
      else setAlpha(1);
    }
  };

  // Color space channel editors
  const renderChannels = () => {
    switch (space) {
      case 'hsl':
        return (
          <div className="flex gap-1">
            <ChannelInput label="H" value={hue} min={0} max={360} step={1} onChange={setHue} />
            <ChannelInput label="S" value={sat} min={0} max={100} step={1} onChange={setSat} />
            <ChannelInput label="L" value={lit} min={0} max={100} step={1} onChange={setLit} />
          </div>
        );
      case 'lch': {
        const lch = hexToLch(hex6) ?? { L: 0, C: 0, H: 0 };
        return (
          <div className="flex gap-1">
            <ChannelInput label="L" value={lch.L} min={0} max={100} step={1} onChange={L => {
              const newHex = lchToHex(L, lch.C, lch.H);
              const hsl = hexToHsl(newHex);
              if (hsl) { setHue(hsl.h); setSat(hsl.s); setLit(hsl.l); }
            }} />
            <ChannelInput label="C" value={lch.C} min={0} max={150} step={1} decimals={1} onChange={C => {
              const newHex = lchToHex(lch.L, C, lch.H);
              const hsl = hexToHsl(newHex);
              if (hsl) { setHue(hsl.h); setSat(hsl.s); setLit(hsl.l); }
            }} />
            <ChannelInput label="H" value={lch.H} min={0} max={360} step={1} onChange={H => {
              const newHex = lchToHex(lch.L, lch.C, H);
              const hsl = hexToHsl(newHex);
              if (hsl) { setHue(hsl.h); setSat(hsl.s); setLit(hsl.l); }
            }} />
          </div>
        );
      }
      case 'p3': {
        const rgb = hexToRgb(hex6);
        const p3 = rgb ? srgbToP3(rgb.r, rgb.g, rgb.b) : { r: 0, g: 0, b: 0 };
        const inGamut = isP3InSrgbGamut(p3.r, p3.g, p3.b);
        const updateFromP3 = (pr: number, pg: number, pb: number) => {
          const srgb = p3ToSrgb(pr, pg, pb);
          const newHex = rgbToHex(clamp(srgb.r, 0, 1), clamp(srgb.g, 0, 1), clamp(srgb.b, 0, 1));
          const hsl = hexToHsl(newHex);
          if (hsl) { setHue(hsl.h); setSat(hsl.s); setLit(hsl.l); }
        };
        return (
          <div className="flex flex-col gap-1">
            <div className="flex gap-1">
              <ChannelInput label="R" value={p3.r} min={0} max={1} step={0.01} decimals={3} onChange={v => updateFromP3(v, p3.g, p3.b)} />
              <ChannelInput label="G" value={p3.g} min={0} max={1} step={0.01} decimals={3} onChange={v => updateFromP3(p3.r, v, p3.b)} />
              <ChannelInput label="B" value={p3.b} min={0} max={1} step={0.01} decimals={3} onChange={v => updateFromP3(p3.r, p3.g, v)} />
            </div>
            {!inGamut && (
              <div className="text-[9px] text-[var(--color-figma-warning)] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-warning)] inline-block" />
                Outside sRGB gamut (clamped)
              </div>
            )}
          </div>
        );
      }
      default: // hex
        return null;
    }
  };

  // Indicator positions
  const areaX = sat / 100;
  const areaY = 1 - lit / 100;
  const hueX = hue / 360;
  const alphaX = alpha;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50 mt-1 p-2 rounded-lg shadow-lg border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-2"
      style={{ width: 240, left: 0 }}
    >
      {/* Color area */}
      <div className="relative" style={{ height: 150 }}>
        <canvas
          ref={areaRef}
          width={240}
          height={150}
          className="w-full h-full rounded cursor-crosshair"
          style={{ imageRendering: 'pixelated' }}
        />
        <div
          className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${areaX * 100}%`, top: `${areaY * 100}%` }}
        />
      </div>

      {/* Hue strip */}
      <div className="relative" style={{ height: 12 }}>
        <canvas
          ref={hueRef}
          width={240}
          height={12}
          className="w-full h-full rounded cursor-pointer"
        />
        <div
          className="absolute top-0 bottom-0 w-2 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2"
          style={{ left: `${hueX * 100}%` }}
        />
      </div>

      {/* Alpha strip */}
      <div className="relative" style={{ height: 12 }}>
        <canvas
          ref={alphaRef}
          width={240}
          height={12}
          className="w-full h-full rounded cursor-pointer"
        />
        <div
          className="absolute top-0 bottom-0 w-2 rounded border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)] pointer-events-none -translate-x-1/2"
          style={{ left: `${alphaX * 100}%` }}
        />
      </div>

      {/* Color space tabs */}
      <div className="flex gap-0.5 text-[9px]">
        {(['hex', 'hsl', 'lch', 'p3'] as ColorSpace[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSpace(s)}
            className={`flex-1 py-0.5 rounded text-center uppercase font-medium transition-colors ${
              space === s
                ? 'bg-[var(--color-figma-accent)] text-white'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Channel inputs or hex input */}
      {space === 'hex' ? (
        <div className="flex gap-1.5 items-center">
          <div
            className="w-6 h-6 rounded border border-[var(--color-figma-border)] shrink-0"
            style={{ backgroundColor: hex6 }}
          />
          <input
            type="text"
            value={hexInput}
            onChange={e => onHexInputChange(e.target.value)}
            className={inputClass + ' text-left'}
          />
        </div>
      ) : (
        renderChannels()
      )}

      {/* Alpha numeric + eyedropper row */}
      <div className="flex gap-1.5 items-end">
        <div className="flex flex-col items-center gap-0.5 w-14">
          <label className="text-[9px] text-[var(--color-figma-text-secondary)] uppercase">Alpha</label>
          <input
            type="text"
            value={Math.round(alpha * 100) + '%'}
            onChange={e => {
              const n = parseInt(e.target.value);
              if (!isNaN(n)) setAlpha(clamp(n / 100, 0, 1));
            }}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={sampleSelection}
          title="Sample color from Figma selection"
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Sample
        </button>
      </div>
    </div>
  );
}
