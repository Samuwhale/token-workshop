import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { Field, Stack } from '../../primitives';
import {
  DimensionSubProp,
  isReferenceDraft,
  normalizeCubicBezierValue,
  toValueRecord,
  type TokenValueRecord,
  type ValueChangeHandler,
} from './valueEditorShared';
import { CubicBezierEditor } from './CubicBezierEditor';
import {
  DEFAULT_DURATION_TOKEN_VALUE,
  normalizeDurationTokenValue,
} from '../../shared/tokenValueParsing';

type TransitionEditorProps = {
  value: unknown;
  onChange: ValueChangeHandler<TokenValueRecord>;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
};

export const TransitionEditor = memo(function TransitionEditor({
  value,
  onChange,
  allTokensFlat = {},
  pathToCollectionId = {},
}: TransitionEditorProps) {
  const val = toValueRecord(value);
  const duration =
    isReferenceDraft(val.duration)
      ? val.duration
      : normalizeDurationTokenValue(val.duration, DEFAULT_DURATION_TOKEN_VALUE);
  const delay =
    isReferenceDraft(val.delay)
      ? val.delay
      : normalizeDurationTokenValue(val.delay, { value: 0, unit: 'ms' });
  const timingFunction = normalizeCubicBezierValue(val.timingFunction, [0.25, 0.1, 0.25, 1]);

  const update = (patch: TokenValueRecord) => {
    onChange({ duration, delay, timingFunction, ...val, ...patch });
  };

  return (
    <Stack gap={3}>
      <Field label="Duration">
        <DimensionSubProp
          value={duration}
          onChange={v => update({ duration: v })}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          units={['ms', 's']}
          placeholder="200"
        />
      </Field>
      <Field label="Delay">
        <DimensionSubProp
          value={delay}
          onChange={v => update({ delay: v })}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          units={['ms', 's']}
          placeholder="0"
        />
      </Field>
      <Field label="Timing Function">
        <CubicBezierEditor value={timingFunction} onChange={tf => update({ timingFunction: tf })} />
      </Field>
    </Stack>
  );
});
