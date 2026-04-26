import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { Field, Stack } from '../../primitives';
import { ColorSwatchButton } from './ColorEditor';
import { SubPropInput, DimensionSubProp } from './valueEditorShared';

export const BorderEditor = memo(function BorderEditor({ value, onChange, allTokensFlat, pathToCollectionId, inheritedValue }: { value: any; onChange: (v: any) => void; allTokensFlat: Record<string, TokenMapEntry>; pathToCollectionId: Record<string, string>; inheritedValue?: any }) {
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
            value={val.color || '#000000'}
            onChange={v => update('color', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
            filterType="color"
            inputType="string"
            placeholder="#000000 or {token}"
          />
        </Stack>
      </Field>
      <Stack direction="row" gap={3}>
        <Field label="Width" className="flex-1">
          <DimensionSubProp
            value={val.width ?? { value: 1, unit: 'px' }}
            onChange={v => update('width', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        </Field>
        <Field label="Style" className="flex-1">
          <select
            value={val.style || 'solid'}
            onChange={e => update('style', e.target.value)}
            className={AUTHORING.input}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
            <option value="double">Double</option>
          </select>
        </Field>
      </Stack>
    </Stack>
  );
});
