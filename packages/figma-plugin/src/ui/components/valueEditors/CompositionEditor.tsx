import { useState, memo } from 'react';
import { X } from 'lucide-react';
import {
  ALL_BINDABLE_PROPERTIES,
  getCompositionPropertyType,
  PROPERTY_LABELS,
  type TokenMapEntry,
} from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { Stack } from '../../primitives';
import { swatchBgColor } from '../../shared/colorUtils';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput } from './valueEditorShared';

type CompositionEditorValue = Record<string, unknown>;

function isRecord(value: unknown): value is CompositionEditorValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAliasValue(value: unknown): value is `{${string}` {
  return typeof value === 'string' && value.startsWith('{');
}

function getPropertyLabel(prop: string): string {
  return PROPERTY_LABELS[prop as keyof typeof PROPERTY_LABELS] ?? prop;
}

function readNumericValue(value: unknown, fallback: number): number {
  if (isAliasValue(value)) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (isRecord(value) && 'value' in value) {
    return readNumericValue(value.value, fallback);
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readStringValue(value: unknown, fallback: string): string {
  return isAliasValue(value) ? fallback : typeof value === 'string' ? value : fallback;
}

function CompositionPropertyEditor({
  prop,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: {
  prop: string;
  value: unknown;
  onChange: (v: unknown) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
}) {
  const propType = getCompositionPropertyType(prop);
  const isAlias = isAliasValue(value);

  if (propType === 'color') {
    return (
      <Stack direction="row" gap={2} align="center" wrap className="flex-1">
        {!isAlias && typeof value === 'string' && value && !value.startsWith('{') && (
          <ColorSwatchButton
            color={value}
            onChange={onChange}
            className="w-6 h-6"
          />
        )}
        <SubPropInput
          value={value || ''}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          filterType="color"
          inputType="string"
          placeholder="#000000 or {color.token}"
        />
      </Stack>
    );
  }

  if (propType === 'dimension') {
    return (
      <SubPropInput
        value={isAlias ? value : (isRecord(value) ? value.value : (value ?? ''))}
        onChange={v => {
          if (typeof v === 'string' && v.startsWith('{')) {
            onChange(v);
          } else {
            const n = parseFloat(String(v));
            onChange(isNaN(n) ? v : n);
          }
        }}
        allTokensFlat={allTokensFlat}
        pathToCollectionId={pathToCollectionId}
        filterType="dimension"
        placeholder="16 or {spacing.token}"
        className="flex-1"
      />
    );
  }

  if (propType === 'number') {
    return (
      <Stack direction="row" gap={2} align="center" wrap className="flex-1">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isAlias ? 1 : (typeof value === 'number' ? value : parseFloat(String(value)) || 1)}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-[var(--color-figma-accent)]"
          disabled={isAlias}
        />
        <SubPropInput
          value={isAlias ? value : String(value ?? 1)}
          onChange={v => {
            if (typeof v === 'string' && v.startsWith('{')) {
              onChange(v);
            } else {
              const n = parseFloat(String(v));
              onChange(isNaN(n) ? v : Math.max(0, Math.min(1, n)));
            }
          }}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          filterType="number"
          inputType="string"
          placeholder="0.5 or {opacity.token}"
          className="!w-20"
        />
      </Stack>
    );
  }

  if (propType === 'boolean') {
    if (isAlias) {
      return (
        <SubPropInput
          value={value}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          filterType="boolean"
          inputType="string"
          placeholder="{visibility.token}"
          className="flex-1"
        />
      );
    }
    return (
      <Stack direction="row" gap={2} align="center" wrap className="flex-1">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`px-2 py-1 rounded text-secondary font-medium border ${
            value
              ? 'bg-[var(--color-figma-accent)]/20 text-[color:var(--color-figma-accent)] border-[var(--color-figma-accent)]/40'
              : 'bg-[var(--color-figma-bg)] text-[color:var(--color-figma-text-secondary)] border-[var(--color-figma-border)]'
          }`}
        >
          {value ? 'true' : 'false'}
        </button>
        <button
          type="button"
          onClick={() => onChange('{')}
          className="text-secondary text-[color:var(--color-figma-text-tertiary)] hover:text-[color:var(--color-figma-accent)]"
          title="Use token reference"
        >{'{…}'}</button>
      </Stack>
    );
  }

  // typography, shadow — reference-only (these are complex sub-types best referenced)
  return (
    <SubPropInput
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      allTokensFlat={allTokensFlat}
      pathToCollectionId={pathToCollectionId}
      filterType={propType}
      inputType="string"
      placeholder={`{${propType}.token}`}
      className="flex-1"
    />
  );
}

/** Renders a live preview box showing the composed visual result. */
function CompositionPreview({ val }: { val: CompositionEditorValue }) {
  const hasVisualProps = ['fill', 'stroke', 'width', 'height', 'cornerRadius', 'opacity', 'strokeWeight',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'shadow', 'visible'].some(p => p in val);
  if (!hasVisualProps) return null;

  const fill = readStringValue(val.fill, '#e2e8f0');
  const stroke = readStringValue(val.stroke, 'transparent');
  const w = readNumericValue(val.width, 80);
  const h = readNumericValue(val.height, 48);
  const radius = readNumericValue(val.cornerRadius, 0);
  const opacity = 'opacity' in val ? readNumericValue(val.opacity, 1) : 1;
  const sw = readNumericValue(val.strokeWeight, stroke !== 'transparent' ? 1 : 0);
  const pt = readNumericValue(val.paddingTop, 0);
  const pr = readNumericValue(val.paddingRight, 0);
  const pb = readNumericValue(val.paddingBottom, 0);
  const pl = readNumericValue(val.paddingLeft, 0);
  const visible = 'visible' in val ? (isAliasValue(val.visible) ? true : Boolean(val.visible)) : true;

  if (!visible) return (
    <Stack gap={1}>
      <span className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">Preview</span>
      <p className="text-secondary text-[color:var(--color-figma-text-tertiary)] italic m-0">Hidden (visible = false)</p>
    </Stack>
  );

  const shadowStr = (() => {
    if (!('shadow' in val) || isAliasValue(val.shadow)) return 'none';
    if (isRecord(val.shadow)) {
      const s = val.shadow;
      const ox = readNumericValue(s.offsetX, 0);
      const oy = readNumericValue(s.offsetY, 0);
      const blur = readNumericValue(s.blur, 0);
      const spread = readNumericValue(s.spread, 0);
      const color = readStringValue(s.color, '#00000040');
      return `${ox}px ${oy}px ${blur}px ${spread}px ${color}`;
    }
    return 'none';
  })();

  const hasPadding = pt > 0 || pr > 0 || pb > 0 || pl > 0;

  const hasRefs = Object.keys(val).some(k => isAliasValue(val[k]));
  return (
    <Stack gap={1}>
      <span className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]">Preview</span>
      <div className="flex items-center justify-center p-2 rounded bg-[var(--color-figma-bg)] border border-dashed border-[var(--color-figma-border)]">
        <div
          style={{
            width: Math.min(w, 200),
            height: Math.min(h, 100),
            backgroundColor: swatchBgColor(fill),
            border: sw > 0 ? `${sw}px solid ${swatchBgColor(stroke)}` : undefined,
            borderRadius: radius,
            opacity,
            boxShadow: shadowStr,
            position: 'relative',
          }}
        >
          {hasPadding && (
            <div
              style={{
                position: 'absolute',
                top: Math.min(pt, 16),
                right: Math.min(pr, 16),
                bottom: Math.min(pb, 16),
                left: Math.min(pl, 16),
                border: '1px dashed rgba(0,0,0,0.2)',
                borderRadius: Math.max(0, radius - Math.max(pt, pr, pb, pl)),
              }}
            />
          )}
        </div>
      </div>
      {hasRefs ? (
        <p className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
          Token references shown with fallback values
        </p>
      ) : null}
    </Stack>
  );
}

export const CompositionEditor = memo(function CompositionEditor({ value, onChange, inheritedValue, allTokensFlat = {}, pathToCollectionId = {} }: { value: unknown; onChange: (v: CompositionEditorValue) => void; inheritedValue?: unknown; allTokensFlat?: Record<string, TokenMapEntry>; pathToCollectionId?: Record<string, string> }) {
  const [newProp, setNewProp] = useState<string>(ALL_BINDABLE_PROPERTIES[0]);
  const rawVal = isRecord(value) ? value : {};
  const inherited = isRecord(inheritedValue) ? inheritedValue : undefined;
  const val = inherited ? { ...inherited, ...rawVal } : rawVal;
  const isInherited = (key: string): boolean => Boolean(inherited && !(key in rawVal) && key in inherited);
  const usedProps = Object.keys(val);
  const unusedProps = ALL_BINDABLE_PROPERTIES.filter(p => !usedProps.includes(p));

  const update = (key: string, v: unknown) => {
    if (inherited) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
  const remove = (key: string) => {
    if (inherited) {
      const next = { ...rawVal };
      delete next[key];
      onChange(next);
    } else {
      const next = { ...val };
      delete next[key];
      onChange(next);
    }
  };
  const addProp = () => {
    const prop = newProp || unusedProps[0];
    if (!prop || prop in val) return;
    const defaults: Record<string, unknown> = {
      color: '#000000', dimension: 0, number: 1, boolean: true,
      typography: '', shadow: '',
    };
    const defaultVal = defaults[getCompositionPropertyType(prop)] ?? '';
    if (inherited) {
      onChange({ ...rawVal, [prop]: defaultVal });
    } else {
      onChange({ ...val, [prop]: defaultVal });
    }
    setNewProp(unusedProps.filter(p => p !== prop)[0] || '');
  };

  return (
    <Stack gap={3}>
      {usedProps.length === 0 && (
        <p className="text-secondary text-[color:var(--color-figma-text-secondary)]">No properties yet — add one below.</p>
      )}
      {usedProps.map(prop => (
        <div key={prop} className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className={`text-secondary shrink-0 font-medium ${isInherited(prop) ? 'text-[color:var(--color-figma-text-tertiary)] italic' : 'text-[color:var(--color-figma-text-secondary)]'}`} title={prop}>
              {getPropertyLabel(prop)}
              {isInherited(prop) && <span className="text-secondary ml-0.5">(inherited)</span>}
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => remove(prop)}
              title={isInherited(prop) ? `Override ${prop}` : `Remove ${prop}`}
              className="p-0.5 rounded text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
            >
              <X size={8} strokeWidth={2} aria-hidden />
            </button>
          </div>
          <div className={`flex items-center${isInherited(prop) ? ' opacity-60' : ''}`}>
            <CompositionPropertyEditor
              prop={prop}
              value={val[prop]}
              onChange={v => update(prop, v)}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
            />
          </div>
        </div>
      ))}
      {unusedProps.length > 0 && (
        <Stack direction="row" gap={2} align="center">
          <select
            value={newProp}
            onChange={e => setNewProp(e.target.value)}
            className={AUTHORING.input + ' flex-1'}
          >
            {unusedProps.map(p => <option key={p} value={p}>{getPropertyLabel(p)}</option>)}
          </select>
          <button
            type="button"
            onClick={addProp}
            className="px-2 py-1 rounded text-secondary font-medium bg-[var(--color-figma-accent)]/20 text-[color:var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/30 shrink-0"
          >+ Add</button>
        </Stack>
      )}
      <CompositionPreview val={val} />
    </Stack>
  );
});
