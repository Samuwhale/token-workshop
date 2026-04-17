import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { inputClass, labelClass } from '../../shared/editorClasses';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput } from './valueEditorShared';

export const ShadowEditor = memo(function ShadowEditor({ value, onChange, allTokensFlat, pathToCollectionId, baseValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToCollectionId: Record<string, string>; baseValue?: any }) {
  const rawVal = typeof value === 'object' ? value : {};
  const base = typeof baseValue === 'object' && baseValue !== null ? baseValue : undefined;
  const val = base ? { ...base, ...rawVal } : rawVal;
  const update = (key: string, v: any) => {
    if (base) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
  const getDim = (v: any) => (typeof v === 'string' && v.startsWith('{') ? v : (typeof v === 'object' ? v.value : (v ?? 0)));
  const setDim = (key: string, v: any) => update(key, typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' });
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className={labelClass}>Color</div>
        <div className="flex gap-2 items-center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={val.color || '#000000'}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={val.color || '#00000040'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            filterType="color"
            inputType="string"
            placeholder="#00000040 or {token}"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className={labelClass}>Offset X</div>
          <SubPropInput value={getDim(val.offsetX)} onChange={v => setDim('offsetX', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Offset Y</div>
          <SubPropInput value={getDim(val.offsetY)} onChange={v => setDim('offsetY', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Blur</div>
          <SubPropInput value={getDim(val.blur)} onChange={v => setDim('blur', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </div>
        <div>
          <div className={labelClass}>Spread</div>
          <SubPropInput value={getDim(val.spread)} onChange={v => setDim('spread', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
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
});
