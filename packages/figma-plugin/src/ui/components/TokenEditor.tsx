import React, { useState, useEffect, useRef } from 'react';
import { AliasAutocomplete } from './AliasAutocomplete';
import type { TokenMapEntry } from '../../shared/types';

interface TokenEditorProps {
  tokenPath: string;
  setName: string;
  serverUrl: string;
  onBack: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
}

export function TokenEditor({ tokenPath, setName, serverUrl, onBack, allTokensFlat = {}, pathToSet = {} }: TokenEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenType, setTokenType] = useState('color');
  const [value, setValue] = useState<any>('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [aliasMode, setAliasMode] = useState(false);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/tokens/${setName}/${tokenPath}`);
        if (!res.ok) throw new Error('Token not found');
        const data = await res.json();
        const token = data.token;
        setTokenType(token?.$type || 'string');
        setValue(token?.$value ?? '');
        setDescription(token?.$description || '');
        if (typeof token?.$value === 'string' && token.$value.startsWith('{') && token.$value.endsWith('}')) {
          setReference(token.$value);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchToken();
  }, [serverUrl, setName, tokenPath]);

  // Sync alias mode with loaded reference
  useEffect(() => {
    if (reference) setAliasMode(true);
  }, [reference]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = {
        $type: tokenType,
        $value: reference || value,
      };
      if (description) body.$description = description;

      const res = await fetch(`${serverUrl}/api/tokens/${setName}/${tokenPath}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save token');
      onBack();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Loading token...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onBack}
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">{tokenPath}</div>
          <div className="text-[9px] text-[var(--color-figma-text-secondary)]">in {setName}</div>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase token-type-${tokenType}`}>
          {tokenType}
        </span>
      </div>

      {/* Editor body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {error && (
          <div className="px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            {error}
          </div>
        )}

        {/* Alias mode toggle + reference input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[var(--color-figma-text-secondary)]">
              Reference
            </label>
            <button
              onClick={() => {
                const next = !aliasMode;
                setAliasMode(next);
                if (next) {
                  if (!reference) setReference('{');
                  setTimeout(() => { refInputRef.current?.focus(); }, 0);
                } else {
                  setReference('');
                  setShowAutocomplete(false);
                }
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
              </svg>
              Alias mode
            </button>
          </div>
          {aliasMode && (
            <div className="relative">
              <input
                ref={refInputRef}
                type="text"
                value={reference}
                onChange={e => {
                  const v = e.target.value;
                  setReference(v);
                  const hasOpen = v.includes('{') && !v.endsWith('}');
                  setShowAutocomplete(hasOpen);
                }}
                onFocus={() => {
                  if (reference.includes('{') && !reference.endsWith('}')) {
                    setShowAutocomplete(true);
                  }
                }}
                onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                onKeyDown={e => {
                  if (e.key === '{') setShowAutocomplete(true);
                }}
                placeholder="{color.primary.500}"
                className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-accent)] text-[var(--color-figma-text)] text-[11px] outline-none placeholder:text-[var(--color-figma-text-secondary)]/50"
              />
              {showAutocomplete && (
                <AliasAutocomplete
                  query={reference.includes('{') ? reference.slice(reference.lastIndexOf('{') + 1).replace(/\}.*$/, '') : ''}
                  allTokensFlat={allTokensFlat}
                  pathToSet={pathToSet}
                  filterType={tokenType}
                  onSelect={path => {
                    setReference(`{${path}}`);
                    setShowAutocomplete(false);
                  }}
                  onClose={() => setShowAutocomplete(false)}
                />
              )}
            </div>
          )}
          {!aliasMode && reference && (
            <p className="mt-1 text-[9px] text-[var(--color-figma-text-secondary)]">
              Has reference: {reference}
            </p>
          )}
        </div>

        {/* Type-specific editor */}
        {!reference && (
          <div className="flex flex-col gap-2">
            <label className="block text-[10px] text-[var(--color-figma-text-secondary)]">Value</label>
            {tokenType === 'color' && <ColorEditor value={value} onChange={setValue} />}
            {tokenType === 'dimension' && <DimensionEditor value={value} onChange={setValue} />}
            {tokenType === 'typography' && <TypographyEditor value={value} onChange={setValue} />}
            {tokenType === 'shadow' && <ShadowEditor value={value} onChange={setValue} />}
            {tokenType === 'border' && <BorderEditor value={value} onChange={setValue} />}
            {tokenType === 'gradient' && <GradientEditor value={value} onChange={setValue} allTokensFlat={allTokensFlat} pathToSet={pathToSet} />}
            {tokenType === 'number' && <NumberEditor value={value} onChange={setValue} />}
            {tokenType === 'string' && <StringEditor value={value} onChange={setValue} />}
            {tokenType === 'boolean' && <BooleanEditor value={value} onChange={setValue} />}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-[10px] text-[var(--color-figma-text-secondary)] mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={2}
            className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)] resize-none placeholder:text-[var(--color-figma-text-secondary)]/50"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex gap-2 p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <button
          onClick={onBack}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] text-[11px] hover:bg-[var(--color-figma-bg-hover)]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// --- Sub-editors ---

const inputClass = 'w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]';
const labelClass = 'text-[9px] text-[var(--color-figma-text-secondary)] mb-0.5';

function ColorEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const hex = typeof value === 'string' ? value : '#000000';
  return (
    <div className="flex gap-2 items-center">
      <input
        type="color"
        value={hex.slice(0, 7)}
        onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
      />
      <input
        type="text"
        value={hex}
        onChange={e => onChange(e.target.value)}
        placeholder="#000000"
        className={inputClass}
      />
    </div>
  );
}

function StepperInput({
  value,
  onChange,
  className = '',
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const step = (delta: number) => onChange(Math.round((value + delta) * 1000) / 1000);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey ? 10 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); step(e.shiftKey ? -10 : -1); }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    e.preventDefault();
    step(e.deltaY < 0 ? 1 : -1);
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        className={inputClass + ' w-full pr-5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'}
      />
      <div className="absolute right-0 top-0 bottom-0 flex flex-col border-l border-[var(--color-figma-border)]">
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] leading-none"
          style={{ fontSize: 6 }}
        >▲</button>
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); step(-1); }}
          className="flex-1 px-0.5 flex items-center justify-center text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)] leading-none"
          style={{ fontSize: 6 }}
        >▼</button>
      </div>
    </div>
  );
}

const UNIT_CONVERSIONS: Record<string, Record<string, (v: number) => number>> = {
  px: { rem: v => Math.round((v / 16) * 1000) / 1000, em: v => Math.round((v / 16) * 1000) / 1000, '%': v => v },
  rem: { px: v => Math.round(v * 16 * 1000) / 1000, em: v => v, '%': v => v },
  em: { px: v => Math.round(v * 16 * 1000) / 1000, rem: v => v, '%': v => v },
  '%': { px: v => v, rem: v => v, em: v => v },
};

function DimensionEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : { value: value ?? 0, unit: 'px' };
  const numVal = parseFloat(val.value) || 0;

  const handleUnitChange = (newUnit: string) => {
    const convert = UNIT_CONVERSIONS[val.unit]?.[newUnit];
    const newValue = convert ? convert(numVal) : numVal;
    onChange({ value: newValue, unit: newUnit });
  };

  return (
    <div className="flex gap-2">
      <StepperInput
        value={numVal}
        onChange={v => onChange({ ...val, value: v })}
        className="flex-1"
      />
      <select
        value={val.unit}
        onChange={e => handleUnitChange(e.target.value)}
        className={inputClass + ' w-16'}
      >
        <option value="px">px</option>
        <option value="rem">rem</option>
        <option value="em">em</option>
        <option value="%">%</option>
      </select>
    </div>
  );
}

function TypographyEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const fontSize = typeof val.fontSize === 'object' ? val.fontSize : { value: val.fontSize ?? 16, unit: 'px' };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Font Family</div>
        <input
          type="text"
          value={Array.isArray(val.fontFamily) ? val.fontFamily[0] : (val.fontFamily || '')}
          onChange={e => update('fontFamily', e.target.value)}
          placeholder="Inter"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Font Size</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={fontSize.value}
              onChange={e => update('fontSize', { ...fontSize, value: parseFloat(e.target.value) || 0 })}
              className={inputClass + ' flex-1'}
            />
            <select
              value={fontSize.unit}
              onChange={e => update('fontSize', { ...fontSize, unit: e.target.value })}
              className={inputClass + ' w-14'}
            >
              <option value="px">px</option>
              <option value="rem">rem</option>
            </select>
          </div>
        </div>
        <div className="w-20">
          <div className={labelClass}>Weight</div>
          <select
            value={val.fontWeight ?? 400}
            onChange={e => update('fontWeight', parseInt(e.target.value))}
            className={inputClass}
          >
            <option value={100}>100 Thin</option>
            <option value={200}>200 ExtraLight</option>
            <option value={300}>300 Light</option>
            <option value={400}>400 Regular</option>
            <option value={500}>500 Medium</option>
            <option value={600}>600 SemiBold</option>
            <option value={700}>700 Bold</option>
            <option value={800}>800 ExtraBold</option>
            <option value={900}>900 Black</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Line Height</div>
          <input
            type="number"
            step="0.1"
            value={typeof val.lineHeight === 'object' ? val.lineHeight.value : (val.lineHeight ?? 1.5)}
            onChange={e => update('lineHeight', parseFloat(e.target.value) || 1.5)}
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <div className={labelClass}>Letter Spacing</div>
          <input
            type="number"
            step="0.1"
            value={typeof val.letterSpacing === 'object' ? val.letterSpacing.value : (val.letterSpacing ?? 0)}
            onChange={e => update('letterSpacing', { value: parseFloat(e.target.value) || 0, unit: 'px' })}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

function ShadowEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const getDim = (v: any) => (typeof v === 'object' ? v.value : (v ?? 0));
  const setDim = (key: string, n: number) => update(key, { value: n, unit: 'px' });

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={(val.color || '#000000').slice(0, 7)}
            onChange={e => update('color', e.target.value)}
            className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={val.color || '#00000040'}
            onChange={e => update('color', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelClass}>Offset X</div>
          <input type="number" value={getDim(val.offsetX)} onChange={e => setDim('offsetX', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Offset Y</div>
          <input type="number" value={getDim(val.offsetY)} onChange={e => setDim('offsetY', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Blur</div>
          <input type="number" value={getDim(val.blur)} onChange={e => setDim('blur', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
        <div>
          <div className={labelClass}>Spread</div>
          <input type="number" value={getDim(val.spread)} onChange={e => setDim('spread', parseFloat(e.target.value) || 0)} className={inputClass} />
        </div>
      </div>
      <div>
        <div className={labelClass}>Type</div>
        <select
          value={val.type || 'dropShadow'}
          onChange={e => update('type', e.target.value)}
          className={inputClass}
        >
          <option value="dropShadow">Drop Shadow</option>
          <option value="innerShadow">Inner Shadow</option>
        </select>
      </div>
    </div>
  );
}

function BorderEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const val = typeof value === 'object' ? value : {};
  const update = (key: string, v: any) => onChange({ ...val, [key]: v });
  const width = typeof val.width === 'object' ? val.width : { value: val.width ?? 1, unit: 'px' };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          <input
            type="color"
            value={(val.color || '#000000').slice(0, 7)}
            onChange={e => update('color', e.target.value)}
            className="w-8 h-8 rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent"
          />
          <input
            type="text"
            value={val.color || '#000000'}
            onChange={e => update('color', e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Width</div>
          <div className="flex gap-1">
            <input
              type="number"
              value={width.value}
              onChange={e => update('width', { ...width, value: parseFloat(e.target.value) || 0 })}
              className={inputClass + ' flex-1'}
            />
            <select
              value={width.unit}
              onChange={e => update('width', { ...width, unit: e.target.value })}
              className={inputClass + ' w-14'}
            >
              <option value="px">px</option>
              <option value="rem">rem</option>
            </select>
          </div>
        </div>
        <div className="flex-1">
          <div className={labelClass}>Style</div>
          <select
            value={val.style || 'solid'}
            onChange={e => update('style', e.target.value)}
            className={inputClass}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function NumberEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <StepperInput
      value={parseFloat(value) || 0}
      onChange={onChange}
    />
  );
}

function StringEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <input
      type="text"
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder="Enter value"
      className={inputClass}
    />
  );
}

function BooleanEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-[var(--color-figma-accent)]' : 'bg-[var(--color-figma-border)]'}`}
      >
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${value ? 'left-4' : 'left-0.5'}`} />
      </button>
      <span className="text-[11px] text-[var(--color-figma-text)]">{value ? 'true' : 'false'}</span>
    </div>
  );
}

interface GradientStop {
  color: string;
  position: number;
}

interface GradientEditorProps {
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
}

function GradientEditor({ value, onChange, allTokensFlat, pathToSet }: GradientEditorProps) {
  const stops: GradientStop[] = Array.isArray(value?.stops) && value.stops.length >= 2
    ? value.stops
    : [{ color: '#000000', position: 0 }, { color: '#ffffff', position: 1 }];
  const gradientType: string = value?.type || 'linear';

  const updateStop = (idx: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => i === idx ? { ...s, ...patch } : s);
    onChange({ ...value, stops: next });
  };

  const addStop = () => {
    onChange({ ...value, stops: [...stops, { color: '#808080', position: 0.5 }] });
  };

  const removeStop = (idx: number) => {
    if (stops.length <= 2) return;
    onChange({ ...value, stops: stops.filter((_, i) => i !== idx) });
  };

  const previewParts = stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(s => {
      const color = typeof s.color === 'string' && !s.color.startsWith('{') ? s.color : '#aaaaaa';
      return `${color} ${Math.round(s.position * 100)}%`;
    })
    .join(', ');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 items-center">
        <div className={labelClass}>Type</div>
        <select
          value={gradientType}
          onChange={e => onChange({ ...value, type: e.target.value })}
          className={inputClass + ' flex-1'}
        >
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
      </div>
      <div
        className="w-full h-6 rounded border border-[var(--color-figma-border)]"
        style={{ background: `${gradientType}-gradient(to right, ${previewParts})` }}
      />
      <div className={labelClass}>Stops</div>
      {stops.map((stop, idx) => (
        <GradientStopRow
          key={idx}
          stop={stop}
          canRemove={stops.length > 2}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          onChange={patch => updateStop(idx, patch)}
          onRemove={() => removeStop(idx)}
        />
      ))}
      <button
        type="button"
        onClick={addStop}
        className="text-[10px] text-[var(--color-figma-accent)] hover:underline text-left"
      >
        + Add stop
      </button>
    </div>
  );
}

function GradientStopRow({ stop, canRemove, allTokensFlat, pathToSet, onChange, onRemove }: {
  stop: GradientStop;
  canRemove: boolean;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet: Record<string, string>;
  onChange: (patch: Partial<GradientStop>) => void;
  onRemove: () => void;
}) {
  const colorIsAlias = typeof stop.color === 'string' && stop.color.startsWith('{');
  const [aliasMode, setAliasMode] = useState(colorIsAlias);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const aliasInputRef = useRef<HTMLInputElement>(null);

  const toggleAliasMode = () => {
    const next = !aliasMode;
    setAliasMode(next);
    if (next) {
      onChange({ color: colorIsAlias ? stop.color : '{' });
      setTimeout(() => aliasInputRef.current?.focus(), 0);
    } else {
      onChange({ color: '#000000' });
      setShowAutocomplete(false);
    }
  };

  const aliasQuery = (() => {
    const c = stop.color || '';
    const openIdx = c.lastIndexOf('{');
    if (openIdx === -1) return '';
    return c.slice(openIdx + 1).replace(/\}.*$/, '');
  })();

  return (
    <div className="flex items-start gap-1.5">
      <div className="w-16 shrink-0">
        <StepperInput
          value={Math.round(stop.position * 100)}
          onChange={v => onChange({ position: Math.max(0, Math.min(100, v)) / 100 })}
          className="w-full"
        />
      </div>
      <div className="flex-1 relative min-w-0">
        {aliasMode ? (
          <>
            <input
              ref={aliasInputRef}
              type="text"
              value={stop.color || '{'}
              onChange={e => {
                const v = e.target.value;
                onChange({ color: v });
                setShowAutocomplete(v.includes('{') && !v.endsWith('}'));
              }}
              onFocus={() => {
                if ((stop.color || '').includes('{') && !(stop.color || '').endsWith('}')) {
                  setShowAutocomplete(true);
                }
              }}
              onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
              placeholder="{color.primary}"
              className={inputClass}
            />
            {showAutocomplete && (
              <AliasAutocomplete
                query={aliasQuery}
                allTokensFlat={allTokensFlat}
                pathToSet={pathToSet}
                filterType="color"
                onSelect={path => {
                  onChange({ color: `{${path}}` });
                  setShowAutocomplete(false);
                }}
                onClose={() => setShowAutocomplete(false)}
              />
            )}
          </>
        ) : (
          <div className="flex gap-1.5 items-center">
            <input
              type="color"
              value={(stop.color || '#000000').slice(0, 7)}
              onChange={e => onChange({ color: e.target.value })}
              className="w-8 h-[26px] rounded border border-[var(--color-figma-border)] cursor-pointer bg-transparent shrink-0"
            />
            <input
              type="text"
              value={stop.color || '#000000'}
              onChange={e => onChange({ color: e.target.value })}
              placeholder="#000000"
              className={inputClass + ' flex-1'}
            />
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={toggleAliasMode}
        title={aliasMode ? 'Switch to raw color' : 'Switch to alias mode'}
        className={`p-1.5 rounded border transition-colors shrink-0 ${aliasMode ? 'border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10' : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'}`}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M1 4h2.5M4.5 4H7M5.5 2L7 4L5.5 6M2.5 2L1 4L2.5 6"/>
        </svg>
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-bg-hover)] shrink-0"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      )}
    </div>
  );
}

