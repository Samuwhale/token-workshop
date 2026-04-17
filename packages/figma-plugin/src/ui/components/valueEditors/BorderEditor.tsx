import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { inputClass, labelClass } from '../../shared/editorClasses';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput, DimensionSubProp } from './valueEditorShared';

export const BorderEditor = memo(function BorderEditor({ value, onChange, allTokensFlat, pathToCollectionId, baseValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToCollectionId: Record<string, string>; baseValue?: any }) {
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
            value={val.color || '#000000'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            filterType="color"
            inputType="string"
            placeholder="#000000 or {token}"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <div className={labelClass}>Width</div>
          <DimensionSubProp
            value={val.width ?? { value: 1, unit: 'px' }}
            onChange={v => update('width', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
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
});
