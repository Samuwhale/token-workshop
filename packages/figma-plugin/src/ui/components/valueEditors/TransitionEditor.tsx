import { memo } from 'react';
import type { TokenMapEntry } from '../../../shared/types';
import { labelClass } from '../../shared/editorClasses';
import { DimensionSubProp } from './valueEditorShared';
import { CubicBezierEditor } from './CubicBezierEditor';

export const TransitionEditor = memo(function TransitionEditor({ value, onChange, allTokensFlat = {}, pathToSet = {} }: { value: any; onChange: (v: any) => void; allTokensFlat?: Record<string, TokenMapEntry>; pathToSet?: Record<string, string> }) {
  const val = typeof value === 'object' && value !== null ? value : {};
  const duration = val.duration ?? { value: 200, unit: 'ms' };
  const delay = val.delay ?? { value: 0, unit: 'ms' };
  const timingFunction = Array.isArray(val.timingFunction) ? val.timingFunction : [0.25, 0.1, 0.25, 1];

  const update = (patch: Record<string, any>) => onChange({ duration, delay, timingFunction, ...val, ...patch });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className={labelClass}>Duration</div>
        <DimensionSubProp
          value={typeof duration === 'string' ? duration : duration}
          onChange={v => update({ duration: v })}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          units={['ms', 's']}
          placeholder="200"
        />
      </div>
      <div>
        <div className={labelClass}>Delay</div>
        <DimensionSubProp
          value={typeof delay === 'string' ? delay : delay}
          onChange={v => update({ delay: v })}
          allTokensFlat={allTokensFlat}
          pathToSet={pathToSet}
          units={['ms', 's']}
          placeholder="0"
        />
      </div>
      <div>
        <div className={labelClass}>Timing Function</div>
        <CubicBezierEditor value={timingFunction} onChange={(tf: any) => update({ timingFunction: tf })} />
      </div>
    </div>
  );
});
