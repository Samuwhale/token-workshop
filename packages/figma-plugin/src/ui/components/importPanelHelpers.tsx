// JSX helpers for ImportPanel sub-components.
import { swatchBgColor } from '../shared/colorUtils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { truncateValue } from './importPanelTypes';

export function DiffSwatch({ hex }: { hex: string }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-sm border border-white/20 ring-1 ring-[var(--color-figma-border)] shrink-0 align-middle"
      style={{ backgroundColor: swatchBgColor(hex) }}
      aria-hidden="true"
    />
  );
}

export function renderConflictValue(type: string, value: unknown): JSX.Element {
  if (value === undefined || value === null) return <span>—</span>;
  if (type === 'color' && typeof value === 'string') {
    return (
      <>
        <DiffSwatch hex={value} />
        {truncateValue(value, 36)}
      </>
    );
  }

  const effectiveType = type === 'fontSize' ? 'dimension' : type;
  return <span>{formatTokenValueForDisplay(effectiveType, value)}</span>;
}
