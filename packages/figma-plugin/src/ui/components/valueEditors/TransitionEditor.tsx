import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { Field, Stack } from '../../primitives';
import { DimensionSubProp } from './valueEditorShared';
import { CubicBezierEditor } from './CubicBezierEditor';

export const TransitionEditor = memo(function TransitionEditor({ value, onChange, allTokensFlat = {}, pathToCollectionId = {} }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToCollectionId?: Record<string, string> }) {
  const val = typeof value === 'object' && value !== null ? value : {};
  const duration = val.duration ?? { value: 200, unit: 'ms' };
  const delay = val.delay ?? { value: 0, unit: 'ms' };
  const timingFunction = Array.isArray(val.timingFunction) ? val.timingFunction : [0.25, 0.1, 0.25, 1];

  const update = (patch: Record<string, any>) => onChange({ duration, delay, timingFunction, ...val, ...patch });

  return (
    <Stack gap={3}>
      <Field label="Duration">
        <DimensionSubProp
          value={typeof duration === 'string' ? duration : duration}
          onChange={v => update({ duration: v })}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          units={['ms', 's']}
          placeholder="200"
        />
      </Field>
      <Field label="Delay">
        <DimensionSubProp
          value={typeof delay === 'string' ? delay : delay}
          onChange={v => update({ delay: v })}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
          units={['ms', 's']}
          placeholder="0"
        />
      </Field>
      <Field label="Timing Function">
        <CubicBezierEditor value={timingFunction} onChange={(tf: any) => update({ timingFunction: tf })} />
      </Field>
    </Stack>
  );
});
