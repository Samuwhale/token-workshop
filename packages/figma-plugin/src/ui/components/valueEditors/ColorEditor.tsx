import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Check, Pipette } from 'lucide-react';
import type { TokenMapEntry } from '../../../shared/types';
import { ColorPicker } from '../ColorPicker';
import { Spinner } from '../Spinner';
import { formatHexAs, parseColorInput, swatchBgColor, isWideGamutColor, type ColorFormat } from '../../shared/colorUtils';
import { GamutIndicator } from '../GamutIndicator';
import { STORAGE_KEYS, lsGet, lsSet } from '../../shared/storage';
import { useSettingsListener } from '../SettingsPanel';
import { AUTHORING } from '../../shared/editorClasses';
import { dispatchToast } from '../../shared/toastBus';
import type { BasicValueEditorProps } from './valueEditorShared';

const EYEDROPPER_REQUEST_TIMEOUT_MS = 8000;

export const ColorSwatchButton = memo(function ColorSwatchButton({ color, onChange, className = 'w-8 h-8' }: { color: string; onChange: (hex: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const openPicker = useCallback(() => setOpen(true), []);
  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onPointerDown={(event) => {
          event.stopPropagation();
          openPicker();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          openPicker();
        }}
        onClick={openPicker}
        onFocus={openPicker}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openPicker();
        }}
        className={`${className} rounded border border-[var(--color-figma-border)] cursor-pointer`}
        style={{ backgroundColor: swatchBgColor(color) }}
        title="Pick color"
        aria-label="Pick color"
      />
      {open && (
        <ColorPicker
          value={color}
          onChange={onChange}
          onClose={() => setOpen(false)}
          anchorRef={buttonRef}
        />
      )}
    </div>
  );
});

const FORMAT_CYCLE: ColorFormat[] = ['hex', 'rgb', 'hsl', 'oklch', 'p3'];

interface ColorEditorProps extends BasicValueEditorProps<string> {
  allTokensFlat?: Record<string, TokenMapEntry>;
  presentation?: 'compact' | 'inspector';
}

export const ColorEditor = memo(function ColorEditor({
  value,
  onChange,
  autoFocus,
  allTokensFlat,
  presentation = 'compact',
}: ColorEditorProps) {
  const colorStr = typeof value === 'string' ? value : '#000000';
  const inspectorPresentation = presentation === 'inspector';
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
  const eyedropperFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eyedropperRequestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swatchButtonRef = useRef<HTMLButtonElement>(null);
  const wideGamut = isWideGamutColor(colorStr);
  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  // Listen for eyedropper result from plugin sandbox
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data?.pluginMessage;
      if (msg?.type === 'eyedropper-result' && typeof msg.hex === 'string') {
        const parsed = parseColorInput(msg.hex);
        if (parsed) onChange(parsed);
        setEyedropperState('success');
        if (eyedropperRequestTimerRef.current) clearTimeout(eyedropperRequestTimerRef.current);
        if (eyedropperFeedbackTimerRef.current) clearTimeout(eyedropperFeedbackTimerRef.current);
        eyedropperFeedbackTimerRef.current = setTimeout(() => setEyedropperState('idle'), 1500);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (eyedropperRequestTimerRef.current) clearTimeout(eyedropperRequestTimerRef.current);
      if (eyedropperFeedbackTimerRef.current) clearTimeout(eyedropperFeedbackTimerRef.current);
    };
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
    if (parsed && parsed !== colorStr) {
      onChange(parsed);
    }
    setEditingText(null);
  };

  const handleEyedropperClick = useCallback(() => {
    if (window.parent === window) {
      dispatchToast('Color sampling only works inside the Figma plugin.', 'error');
      return;
    }

    try {
      window.parent.postMessage({ pluginMessage: { type: 'eyedropper' } }, '*');
      setEyedropperState('waiting');
      if (eyedropperFeedbackTimerRef.current) clearTimeout(eyedropperFeedbackTimerRef.current);
      if (eyedropperRequestTimerRef.current) clearTimeout(eyedropperRequestTimerRef.current);
      eyedropperRequestTimerRef.current = setTimeout(() => {
        setEyedropperState('idle');
        dispatchToast('Figma did not return a sampled color.', 'error');
      }, EYEDROPPER_REQUEST_TIMEOUT_MS);
    } catch {
      setEyedropperState('idle');
      dispatchToast('Could not start the Figma color sampler.', 'error');
    }
  }, []);

  return (
    <div className={inspectorPresentation ? 'relative flex w-full flex-col gap-2' : 'relative flex items-start gap-2'}>
      <div className="flex items-start gap-2">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            ref={swatchButtonRef}
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              openPicker();
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
              openPicker();
            }}
            onClick={openPicker}
            onFocus={inspectorPresentation ? undefined : openPicker}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              openPicker();
            }}
            className="w-10 h-10 rounded border border-[var(--color-figma-border)] cursor-pointer shrink-0 overflow-hidden hover:ring-2 hover:ring-[var(--color-figma-accent)]/50 transition-shadow"
            style={{ backgroundColor: swatchBgColor(colorStr) }}
            title={inspectorPresentation ? 'Open floating color picker' : 'Pick color'}
            aria-label={inspectorPresentation ? 'Open floating color picker' : 'Pick color'}
          />
          {wideGamut && <GamutIndicator color={colorStr} />}
        </div>
        <div className="flex min-h-10 flex-1 items-center gap-1 min-w-0">
          <input
            type="text"
            aria-label="Color value"
            value={displayValue}
            onChange={e => {
              setEditingText(e.target.value);
              // live-parse for hex format
              if (format === 'hex') {
                const parsed = parseColorInput(e.target.value);
                if (parsed && parsed !== colorStr) onChange(parsed);
              }
            }}
            onBlur={e => commitText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitText((e.target as HTMLInputElement).value); }}
            placeholder={format === 'hex' ? '#000000' : format === 'rgb' ? 'rgb(0, 0, 0)' : format === 'oklch' ? 'oklch(0.7 0.15 180)' : format === 'p3' ? 'color(display-p3 1 0 0)' : 'hsl(0, 0%, 0%)'}
            autoFocus={autoFocus}
            className={AUTHORING.input}
          />
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setFormatMenuOpen(v => !v)}
              title={`Format: ${format.toUpperCase()} — click to change`}
              className="flex min-h-[28px] items-center rounded border border-[var(--color-figma-border)] px-1.5 py-1 text-secondary font-medium uppercase text-[color:var(--color-figma-text-secondary)] transition-colors hover:bg-[var(--color-figma-bg-hover)] hover:text-[color:var(--color-figma-text)]"
            >
              {format}
            </button>
            {formatMenuOpen && (
              <div
                className="absolute bottom-full right-0 z-50 mb-1 min-w-[56px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-0.5 shadow-[var(--shadow-popover)]"
                onMouseLeave={() => setFormatMenuOpen(false)}
              >
                {FORMAT_CYCLE.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => selectFormat(f)}
                    className={`w-full text-left px-2 py-1 text-secondary font-medium uppercase transition-colors ${
                      f === format
                        ? 'text-[color:var(--color-figma-text-accent)] bg-[var(--color-figma-bg-hover)]'
                        : 'text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]'
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
            onClick={handleEyedropperClick}
            disabled={eyedropperState === 'waiting'}
            title={eyedropperState === 'waiting' ? 'Waiting for Figma selection…' : eyedropperState === 'success' ? 'Color sampled!' : 'Sample color from Figma selection'}
            className={[
              'shrink-0 flex min-h-[28px] min-w-[28px] items-center justify-center rounded border transition-colors',
              eyedropperState === 'success'
                ? 'text-[color:var(--color-figma-text-accent)] border-[var(--color-figma-accent)] bg-[var(--color-figma-bg-hover)]'
                : eyedropperState === 'waiting'
                ? 'text-[color:var(--color-figma-text-secondary)] border-[var(--color-figma-border)] opacity-60 cursor-default'
                : 'text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-[var(--color-figma-border)]',
            ].join(' ')}
            aria-label="Sample color from Figma selection"
          >
            {eyedropperState === 'success' ? (
              <Check size={12} strokeWidth={2} aria-hidden />
            ) : eyedropperState === 'waiting' ? (
              <Spinner size="sm" />
            ) : (
              <Pipette size={12} strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
      </div>
      {inspectorPresentation && (
        <ColorPicker
          value={colorStr}
          onChange={onChange}
          onClose={closePicker}
          allTokensFlat={allTokensFlat}
          inline
        />
      )}
      {pickerOpen && (
        <ColorPicker
          value={colorStr}
          onChange={onChange}
          onClose={closePicker}
          anchorRef={swatchButtonRef}
          allTokensFlat={allTokensFlat}
        />
      )}
    </div>
  );
});
