import { useState, memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { inputClass, labelClass } from '../../shared/editorClasses';
import { swatchBgColor } from '../../shared/colorUtils';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput } from './valueEditorShared';

const COMPOSITION_PROPERTIES = [
  'fill', 'stroke', 'width', 'height',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'itemSpacing', 'cornerRadius', 'strokeWeight', 'opacity',
  'typography', 'shadow', 'visible',
];

/** Maps each composition property to its expected DTCG type for type-aware editing. */
const COMP_PROP_TYPE: Record<string, 'color' | 'dimension' | 'number' | 'boolean' | 'typography' | 'shadow'> = {
  fill: 'color',
  stroke: 'color',
  width: 'dimension',
  height: 'dimension',
  paddingTop: 'dimension',
  paddingRight: 'dimension',
  paddingBottom: 'dimension',
  paddingLeft: 'dimension',
  itemSpacing: 'dimension',
  cornerRadius: 'dimension',
  strokeWeight: 'dimension',
  opacity: 'number',
  typography: 'typography',
  shadow: 'shadow',
  visible: 'boolean',
};

const COMP_PROP_LABELS: Record<string, string> = {
  fill: 'Fill',
  stroke: 'Stroke',
  width: 'Width',
  height: 'Height',
  paddingTop: 'Padding Top',
  paddingRight: 'Padding Right',
  paddingBottom: 'Padding Bottom',
  paddingLeft: 'Padding Left',
  itemSpacing: 'Item Spacing',
  cornerRadius: 'Corner Radius',
  strokeWeight: 'Stroke Weight',
  opacity: 'Opacity',
  typography: 'Typography',
  shadow: 'Shadow',
  visible: 'Visible',
};

function CompositionPropertyEditor({
  prop,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: {
  prop: string;
  value: any;
  onChange: (v: any) => void;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
}) {
  const propType = COMP_PROP_TYPE[prop] || 'string';
  const isAlias = typeof value === 'string' && value.startsWith('{');

  if (propType === 'color') {
    return (
      <div className="flex gap-1.5 items-center flex-1">
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
      </div>
    );
  }

  if (propType === 'dimension') {
    return (
      <SubPropInput
        value={isAlias ? value : (typeof value === 'object' && value !== null ? value.value : (value ?? ''))}
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
      <div className="flex gap-1.5 items-center flex-1">
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
      </div>
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
      <div className="flex gap-1.5 items-center flex-1">
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`px-2 py-1 rounded text-[10px] font-medium border ${
            value
              ? 'bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] border-[var(--color-figma-accent)]/40'
              : 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)]'
          }`}
        >
          {value ? 'true' : 'false'}
        </button>
        <button
          type="button"
          onClick={() => onChange('{')}
          className="text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-accent)]"
          title="Use token reference"
        >{'{…}'}</button>
      </div>
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
function CompositionPreview({ val }: { val: Record<string, any> }) {
  const hasVisualProps = ['fill', 'stroke', 'width', 'height', 'cornerRadius', 'opacity', 'strokeWeight',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'shadow', 'visible'].some(p => p in val);
  if (!hasVisualProps) return null;

  const isRef = (v: any) => typeof v === 'string' && v.startsWith('{');
  const numVal = (v: any, fallback: number) => {
    if (isRef(v)) return fallback;
    if (typeof v === 'number') return v;
    if (typeof v === 'object' && v !== null && 'value' in v) return v.value;
    const n = parseFloat(String(v));
    return isNaN(n) ? fallback : n;
  };
  const strVal = (v: any, fallback: string) => isRef(v) ? fallback : (typeof v === 'string' ? v : fallback);

  const fill = strVal(val.fill, '#e2e8f0');
  const stroke = strVal(val.stroke, 'transparent');
  const w = numVal(val.width, 80);
  const h = numVal(val.height, 48);
  const radius = numVal(val.cornerRadius, 0);
  const opacity = 'opacity' in val ? numVal(val.opacity, 1) : 1;
  const sw = numVal(val.strokeWeight, stroke !== 'transparent' ? 1 : 0);
  const pt = numVal(val.paddingTop, 0);
  const pr = numVal(val.paddingRight, 0);
  const pb = numVal(val.paddingBottom, 0);
  const pl = numVal(val.paddingLeft, 0);
  const visible = 'visible' in val ? (isRef(val.visible) ? true : !!val.visible) : true;

  if (!visible) return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className={labelClass + ' mb-1'}>Preview</div>
      <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">Hidden (visible = false)</p>
    </div>
  );

  const shadowStr = (() => {
    if (!('shadow' in val) || isRef(val.shadow)) return 'none';
    if (typeof val.shadow === 'object' && val.shadow !== null) {
      const s = val.shadow;
      const ox = numVal(s.offsetX, 0);
      const oy = numVal(s.offsetY, 0);
      const blur = numVal(s.blur, 0);
      const spread = numVal(s.spread, 0);
      const color = strVal(s.color, '#00000040');
      return `${ox}px ${oy}px ${blur}px ${spread}px ${color}`;
    }
    return 'none';
  })();

  const hasPadding = pt > 0 || pr > 0 || pb > 0 || pl > 0;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className={labelClass + ' mb-1'}>Preview</div>
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
      {Object.keys(val).some(k => isRef(val[k])) && (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] mt-1 italic">Token references shown with fallback values</p>
      )}
    </div>
  );
}

export const CompositionEditor = memo(function CompositionEditor({ value, onChange, baseValue, allTokensFlat = {}, pathToCollectionId = {} }: { value: any; onChange: (v: any) => void; baseValue?: any; allTokensFlat?: Record<string, TokenMapEntry>; pathToCollectionId?: Record<string, string> }) {
  const [newProp, setNewProp] = useState(COMPOSITION_PROPERTIES[0]);
  const rawVal = typeof value === 'object' && value !== null ? value : {};
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const isInherited = (key: string) => base && !(key in rawVal) && key in base;
  const usedProps = Object.keys(val);
  const unusedProps = COMPOSITION_PROPERTIES.filter(p => !usedProps.includes(p));

  const update = (key: string, v: any) => {
    if (base) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
  const remove = (key: string) => {
    if (base) {
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
    const defaults: Record<string, any> = {
      color: '#000000', dimension: 0, number: 1, boolean: true,
      typography: '', shadow: '',
    };
    const defaultVal = defaults[COMP_PROP_TYPE[prop] || 'string'] ?? '';
    if (base) {
      onChange({ ...rawVal, [prop]: defaultVal });
    } else {
      onChange({ ...val, [prop]: defaultVal });
    }
    setNewProp(unusedProps.filter(p => p !== prop)[0] || '');
  };

  return (
    <div className="flex flex-col gap-2">
      {usedProps.length === 0 && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">No properties yet — add one below.</p>
      )}
      {usedProps.map(prop => (
        <div key={prop} className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className={`text-[10px] shrink-0 ${isInherited(prop) ? 'text-[var(--color-figma-text-tertiary)] italic' : 'text-[var(--color-figma-text-secondary)]'}`} title={prop}>
              {COMP_PROP_LABELS[prop] || prop}
              {isInherited(prop) && <span className="text-[10px] ml-0.5">(inherited)</span>}
            </span>
            <span className="text-[8px] text-[var(--color-figma-text-tertiary)] opacity-60">{COMP_PROP_TYPE[prop] || 'string'}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => remove(prop)}
              title={isInherited(prop) ? `Override ${prop}` : `Remove ${prop}`}
              className="p-0.5 rounded text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 shrink-0"
            >
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
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
        <div className="flex items-center gap-1.5 pt-1 border-t border-[var(--color-figma-border)]">
          <select
            value={newProp}
            onChange={e => setNewProp(e.target.value)}
            className={inputClass + ' flex-1'}
          >
            {unusedProps.map(p => <option key={p} value={p}>{COMP_PROP_LABELS[p] || p}</option>)}
          </select>
          <button
            type="button"
            onClick={addProp}
            className="px-2 py-1 rounded text-[10px] font-medium bg-[var(--color-figma-accent)]/20 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/30 shrink-0"
          >+ Add</button>
        </div>
      )}
      <CompositionPreview val={val} />
    </div>
  );
});
