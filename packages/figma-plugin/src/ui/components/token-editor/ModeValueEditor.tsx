import type { TokenMapEntry } from '../../../shared/types';
import {
  ColorEditor,
  DimensionEditor,
  NumberEditor,
  BooleanEditor,
  DurationEditor,
  StringEditor,
} from '../ValueEditors';

interface ModeValueEditorProps {
  tokenType: string;
  value: unknown;
  onChange: (v: unknown) => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
}

export function ModeValueEditor({
  tokenType,
  value,
  onChange,
  allTokensFlat,
  pathToCollectionId,
}: ModeValueEditorProps) {
  switch (tokenType) {
    case 'color':
      return (
        <ColorEditor
          value={value || '#000000'}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
        />
      );
    case 'dimension':
      return (
        <DimensionEditor
          value={value ?? { value: 0, unit: 'px' }}
          onChange={onChange}
          allTokensFlat={allTokensFlat}
          pathToCollectionId={pathToCollectionId}
        />
      );
    case 'number':
      return <NumberEditor value={value ?? 0} onChange={onChange} />;
    case 'boolean':
      return <BooleanEditor value={value ?? false} onChange={onChange} />;
    case 'duration':
      return <DurationEditor value={value ?? 0} onChange={onChange} />;
    default:
      return <StringEditor value={value ?? ''} onChange={onChange} />;
  }
}
