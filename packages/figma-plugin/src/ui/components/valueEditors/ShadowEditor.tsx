import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { Field, Stack } from '../../primitives';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput } from './valueEditorShared';

export const ShadowEditor = memo(function ShadowEditor({ value, onChange, allTokensFlat, pathToCollectionId, inheritedValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToCollectionId: Record<string, string>; inheritedValue?: any }) {
  const rawVal = typeof value === 'object' ? value : {};
  const inherited = typeof inheritedValue === 'object' && inheritedValue !== null ? inheritedValue : undefined;
  const val = inherited ? { ...inherited, ...rawVal } : rawVal;
  const update = (key: string, v: any) => {
    if (inherited) {
      onChange({ ...rawVal, [key]: v });
    } else {
      onChange({ ...val, [key]: v });
    }
  };
  const getDim = (v: any) => (typeof v === 'string' && v.startsWith('{') ? v : (typeof v === 'object' ? v.value : (v ?? 0)));
  const setDim = (key: string, v: any) => update(key, typeof v === 'string' && v.startsWith('{') ? v : { value: typeof v === 'number' ? v : parseFloat(String(v)) || 0, unit: 'px' });
  const isColorAlias = typeof val.color === 'string' && val.color.startsWith('{');

  return (
    <Stack gap={3}>
      <Field label="Color">
        <Stack direction="row" gap={2} align="center">
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
        </Stack>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Offset X">
          <SubPropInput value={getDim(val.offsetX)} onChange={v => setDim('offsetX', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </Field>
        <Field label="Offset Y">
          <SubPropInput value={getDim(val.offsetY)} onChange={v => setDim('offsetY', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </Field>
        <Field label="Blur">
          <SubPropInput value={getDim(val.blur)} onChange={v => setDim('blur', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </Field>
        <Field label="Spread">
          <SubPropInput value={getDim(val.spread)} onChange={v => setDim('spread', v)} allTokensFlat={allTokensFlat} pathToCollectionId={pathToCollectionId} placeholder="0" />
        </Field>
      </div>
      <Field label="Type">
        <select
          value={val.type || 'dropShadow'}
          onChange={e => update('type', e.target.value)}
          className={AUTHORING.input}
        >
          <option value="dropShadow">Drop Shadow</option>
          <option value="innerShadow">Inner Shadow</option>
        </select>
      </Field>
    </Stack>
  );
});
