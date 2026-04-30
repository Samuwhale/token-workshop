import { memo } from 'react';
import type { ShadowValue } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../../shared/types';
import { AUTHORING } from '../../shared/editorClasses';
import { Field, Stack } from '../../primitives';
import { ColorSwatchButton } from './ColorEditor';
import {
  SubPropInput,
  getDimensionNumber,
  getStringProp,
  isReferenceDraft,
  mergeInheritedValue,
  toPxDimensionValue,
  type TokenValueRecord,
  type ValueChangeHandler,
} from './valueEditorShared';

type ShadowEditorProps = {
  value: unknown;
  onChange: ValueChangeHandler<TokenValueRecord>;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId: Record<string, string>;
  inheritedValue?: unknown;
};

type ShadowDimensionKey = keyof Pick<ShadowValue, 'offsetX' | 'offsetY' | 'blur' | 'spread'>;

const SHADOW_DIMENSION_FIELDS: Array<{ key: ShadowDimensionKey; label: string }> = [
  { key: 'offsetX', label: 'Offset X' },
  { key: 'offsetY', label: 'Offset Y' },
  { key: 'blur', label: 'Blur' },
  { key: 'spread', label: 'Spread' },
];

function isShadowType(value: unknown): value is NonNullable<ShadowValue['type']> {
  return value === 'dropShadow' || value === 'innerShadow';
}

export const ShadowEditor = memo(function ShadowEditor({
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
  inheritedValue,
}: ShadowEditorProps) {
  const { ownValue, effectiveValue, hasInheritedValue } = mergeInheritedValue(value, inheritedValue);
  const update = (key: keyof ShadowValue, nextValue: unknown) => {
    onChange({
      ...(hasInheritedValue ? ownValue : effectiveValue),
      [key]: nextValue,
    });
  };
  const setDimension = (key: ShadowDimensionKey, nextValue: unknown) => {
    update(key, toPxDimensionValue(nextValue));
  };
  const color = getStringProp(effectiveValue, 'color', '#00000040');
  const shadowType = isShadowType(effectiveValue.type) ? effectiveValue.type : 'dropShadow';
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
            placeholder="#00000040 or {token}"
          />
        </Stack>
      </Field>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        {SHADOW_DIMENSION_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <SubPropInput
              value={getDimensionNumber(effectiveValue[key])}
              onChange={v => setDimension(key, v)}
              allTokensFlat={allTokensFlat}
              pathToCollectionId={pathToCollectionId}
              placeholder="0"
            />
          </Field>
        ))}
      </div>
      <Field label="Type">
        <select
          value={shadowType}
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
