import React, { useEffect, useRef } from 'react';
import type { BindableProperty, NodeCapabilities } from '../../shared/types';
import { PROPERTY_LABELS } from '../../shared/types';

interface PropertyPickerProps {
  properties: BindableProperty[];
  capabilities: NodeCapabilities | null;
  onSelect: (property: BindableProperty) => void;
  onClose: () => void;
  anchorRect?: { top: number; left: number };
}

const CAPABILITY_FILTER: Partial<Record<BindableProperty, keyof NodeCapabilities>> = {
  fill: 'hasFills',
  stroke: 'hasStrokes',
  paddingTop: 'hasAutoLayout',
  paddingRight: 'hasAutoLayout',
  paddingBottom: 'hasAutoLayout',
  paddingLeft: 'hasAutoLayout',
  itemSpacing: 'hasAutoLayout',
  typography: 'isText',
  shadow: 'hasEffects',
};

export function PropertyPicker({ properties, capabilities, onSelect, onClose, anchorRect }: PropertyPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const filtered = properties.filter(prop => {
    if (!capabilities) return true;
    const cap = CAPABILITY_FILTER[prop];
    return !cap || capabilities[cap];
  });

  if (filtered.length === 0) {
    return (
      <div
        ref={ref}
        className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg p-2 text-[10px] text-[var(--color-figma-text-secondary)]"
        style={anchorRect ? { top: anchorRect.top, left: anchorRect.left } : undefined}
      >
        No applicable properties for this layer
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] rounded shadow-lg py-1 min-w-[140px]"
      style={anchorRect ? { top: anchorRect.top, left: anchorRect.left } : undefined}
    >
      <div className="px-2 py-1 text-[9px] text-[var(--color-figma-text-secondary)] uppercase font-medium">
        Apply to property
      </div>
      {filtered.map(prop => (
        <button
          key={prop}
          onClick={() => onSelect(prop)}
          className="w-full text-left px-2 py-1.5 text-[11px] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          {PROPERTY_LABELS[prop]}
        </button>
      ))}
    </div>
  );
}
