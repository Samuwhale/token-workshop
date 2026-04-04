// JSX helpers for ImportPanel sub-components.
import { swatchBgColor } from '../shared/colorUtils';
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
  if ((type === 'dimension' || type === 'duration' || type === 'fontSize') && typeof value === 'object' && value !== null && 'value' in value) {
    const v = value as { value: number; unit?: string };
    return <span>{v.value}{v.unit ?? 'px'}</span>;
  }
  if (type === 'typography' && typeof value === 'object' && value !== null) {
    const v = value as Record<string, any>;
    const parts: string[] = [];
    if (v.fontFamily) parts.push(Array.isArray(v.fontFamily) ? v.fontFamily[0] : v.fontFamily);
    if (v.fontSize) parts.push(typeof v.fontSize === 'object' ? `${v.fontSize.value}${v.fontSize.unit ?? 'px'}` : `${v.fontSize}px`);
    if (v.fontWeight) parts.push(String(v.fontWeight));
    return <span>{parts.join(' ') || '—'}</span>;
  }
  if (typeof value === 'string') return <span>{value}</span>;
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;
  return <span>{JSON.stringify(value)}</span>;
}
