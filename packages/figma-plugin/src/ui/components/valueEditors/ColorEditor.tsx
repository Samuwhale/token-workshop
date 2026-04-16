import { useState, useRef, useEffect, useCallback, memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { ColorPicker } from '../ColorPicker';
import { Spinner } from '../Spinner';
import { formatHexAs, parseColorInput, swatchBgColor, isWideGamutColor, type ColorFormat } from '../../shared/colorUtils';
import { GamutIndicator } from '../GamutIndicator';
import { STORAGE_KEYS, lsGet, lsSet } from '../../shared/storage';
import { useSettingsListener } from '../SettingsPanel';
import { inputClass } from '../../shared/editorClasses';

export const ColorSwatchButton = memo(function ColorSwatchButton({ color, onChange, className = 'w-8 h-8' }: { color: string; onChange: (hex: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${className} rounded border border-[var(--color-figma-border)] cursor-pointer`}
        style={{ backgroundColor: swatchBgColor(color) }}
        title="Pick color"
        aria-label="Pick color"
      />
      {open && (
        <ColorPicker value={color} onChange={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
});

const FORMAT_CYCLE: ColorFormat[] = ['hex', 'rgb', 'hsl', 'oklch', 'p3'];

export const ColorEditor = memo(function ColorEditor({ value, onChange, autoFocus, allTokensFlat }: { value: any; onChange: (v: any) => void; autoFocus?: boolean; allTokensFlat?: Record<string, TokenMapEntry> }) {
  const colorStr = typeof value === 'string' ? value : '#000000';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>(() => {
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (saved === 'rgb' || saved === 'hsl' || saved === 'oklch' || saved === 'p3') return saved;
    return 'hex';
  });
  // Sync format when changed from Settings panel
  const formatRev = useSettingsListener(STORAGE_KEYS.COLOR_FORMAT);
  useEffect(() => {
    if (formatRev === 0) return;
    const saved = lsGet(STORAGE_KEYS.COLOR_FORMAT);
    if (saved === 'rgb' || saved === 'hsl' || saved === 'oklch' || saved === 'p3') setFormat(saved);
    else setFormat('hex');
  }, [formatRev]);
  const [editingText, setEditingText] = useState<string | null>(null);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [eyedropperState, setEyedropperState] = useState<'idle' | 'waiting' | 'success'>('idle');
  const eyedropperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wideGamut = isWideGamutColor(colorStr);

  // Listen for eyedropper result from plugin sandbox
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'eyedropper-result' && typeof msg.hex === 'string') {
        const parsed = parseColorInput(msg.hex);
        if (parsed) onChange(parsed);
        setEyedropperState('success');
        if (eyedropperTimerRef.current) clearTimeout(eyedropperTimerRef.current);
        eyedropperTimerRef.current = setTimeout(() => setEyedropperState('idle'), 1500);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onChange]);

  const displayValue = editingText ?? formatHexAs(colorStr, format);

  const selectFormat = useCallback((f: ColorFormat) => {
    setFormat(f);
    lsSet(STORAGE_KEYS.COLOR_FORMAT, f);
    setEditingText(null);
    setFormatMenuOpen(false);
  }, []);

  const commitText = (text: string) => {
    const parsed = parseColorInput(text);
    if (parsed) {
      onChange(parsed);
    }
    setEditingText(null);
  };

  return (
    <div className="relative flex gap-2 items-center">
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-10 h-10 rounded border border-[var(--color-figma-border)] cursor-pointer shrink-0 overflow-hidden hover:ring-2 hover:ring-[var(--color-figma-accent)]/50 transition-shadow"
          style={{ backgroundColor: swatchBgColor(colorStr) }}
          title="Pick color"
          aria-label="Pick color"
        />
        {wideGamut && <GamutIndicator color={colorStr} />}
      </div>
      <div className="flex-1 flex gap-1 items-center min-w-0">
        <input
          type="text"
          aria-label="Color hex value"
          value={displayValue}
          onChange={e => {
            setEditingText(e.target.value);
            // live-parse for hex format
            if (format === 'hex') {
              const parsed = parseColorInput(e.target.value);
              if (parsed) onChange(parsed);
            }
          }}
          onBlur={e => commitText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); }}
          placeholder={format === 'hex' ? '#000000' : format === 'rgb' ? 'rgb(0, 0, 0)' : format === 'oklch' ? 'oklch(0.7 0.15 180)' : format === 'p3' ? 'color(display-p3 1 0 0)' : 'hsl(0, 0%, 0%)'}
          autoFocus={autoFocus}
          className={inputClass}
        />
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFormatMenuOpen(v => !v)}
            title={`Format: ${format.toUpperCase()} — click to change`}
            className="px-1.5 py-1 rounded text-[10px] font-medium uppercase text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border border-[var(--color-figma-border)] transition-colors"
          >
            {format}
          </button>
          {formatMenuOpen && (
            <div
              className="absolute right-0 bottom-full mb-1 z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-0.5 min-w-[56px]"
              onMouseLeave={() => setFormatMenuOpen(false)}
            >
              {FORMAT_CYCLE.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => selectFormat(f)}
                  className={`w-full text-left px-2 py-1 text-[10px] font-medium uppercase transition-colors ${
                    f === format
                      ? 'text-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]'
                      : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            parent.postMessage({ pluginMessage: { type: 'eyedropper' } }, '*');
            setEyedropperState('waiting');
            if (eyedropperTimerRef.current) clearTimeout(eyedropperTimerRef.current);
          }}
          disabled={eyedropperState === 'waiting'}
          title={eyedropperState === 'waiting' ? 'Waiting for Figma selection…' : eyedropperState === 'success' ? 'Color sampled!' : 'Sample color from Figma selection'}
          className={[
            'shrink-0 flex items-center justify-center w-[26px] h-[26px] rounded border transition-colors',
            eyedropperState === 'success'
              ? 'text-[var(--color-figma-accent)] border-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]'
              : eyedropperState === 'waiting'
              ? 'text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] opacity-60 cursor-default'
              : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-[var(--color-figma-border)]',
          ].join(' ')}
          aria-label="Sample color from Figma selection"
        >
          {eyedropperState === 'success' ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          ) : eyedropperState === 'waiting' ? (
            <Spinner size="sm" />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {pickerOpen && (
        <ColorPicker
          value={colorStr}
          onChange={onChange}
          onClose={() => setPickerOpen(false)}
          allTokensFlat={allTokensFlat}
        />
      )}
    </div>
  );
});
