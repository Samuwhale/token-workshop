import { memo } from 'react';
import type { BorderValue } from '@token-workshop/core';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { Field, Stack } from '../../primitives';
import { ColorSwatchButton } from './ColorEditor';
import {
  DimensionSubProp,
  SubPropInput,
  getStringProp,
  isReferenceDraft,
  mergeInheritedValue,
  type ValueChangeHandler,
} from './valueEditorShared';

type BorderEditorProps = {
  value: unknown;
  onChange: ValueChangeHandler<Partial<BorderValue>>;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  inheritedValue?: unknown;
};

export const BorderEditor = memo(function BorderEditor({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  inheritedValue,
}: BorderEditorProps) {
  const { ownValue, effectiveValue, hasInheritedValue } = mergeInheritedValue(value, inheritedValue);
  const update = (key: keyof BorderValue, nextValue: unknown) => {
    onChange({
      ...(hasInheritedValue ? ownValue : effectiveValue),
      [key]: nextValue,
    } as Partial<BorderValue>);
  };
  const color = getStringProp(effectiveValue, 'color', '#000000');
  const style = getStringProp(effectiveValue, 'style', 'solid');
  const isColorAlias = isReferenceDraft(color);

  return (
    <Stack gap={3}>
      <Field label="Color">
        <Stack direction="row" gap={2} align="center">
          {!isColorAlias && (
            <ColorSwatchButton
              color={color}
              onChange={v => update('color', v)}
            />
          )}
          <SubPropInput
            value={color}
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
            value={effectiveValue.width ?? { value: 1, unit: 'px' }}
            onChange={v => update('width', v)}
            allTokensFlat={allTokensFlat}
            pathToCollectionId={pathToCollectionId}
          />
        </Field>
        <Field label="Style" className="flex-1">
          <select
            value={style}
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
