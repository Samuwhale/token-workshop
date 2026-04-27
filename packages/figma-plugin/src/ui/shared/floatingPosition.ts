import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

export interface ClampedPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export interface ClampPopoverOptions {
  anchorRect: { top: number; bottom: number; left: number; right: number };
  preferredWidth: number;
  preferredHeight: number;
  margin?: number;
  minVerticalSpace?: number;
  /** Horizontal alignment relative to the anchor. 'start' aligns the popover's left edge to the anchor's left; 'end' aligns its right edge to the anchor's right. */
  align?: 'start' | 'end';
}

export function clampPopoverToViewport({
  anchorRect,
  preferredWidth,
  preferredHeight,
  margin = 8,
  minVerticalSpace = 160,
  align = 'start',
}: ClampPopoverOptions): ClampedPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const gap = 2;
  const width = Math.max(0, Math.min(preferredWidth, vw - margin * 2));

  const desiredLeft =
    align === 'end' ? anchorRect.right - width : anchorRect.left;
  const left = Math.max(margin, Math.min(desiredLeft, vw - width - margin));

  const spaceBelow = Math.max(0, vh - anchorRect.bottom - margin - gap);
  const spaceAbove = Math.max(0, anchorRect.top - margin - gap);
  const fitsBelow = spaceBelow >= Math.min(preferredHeight, minVerticalSpace);
  const fitsAbove = spaceAbove >= Math.min(preferredHeight, minVerticalSpace);
  // Place where there's more room when neither side fits the minimum.
  const placeBelow = fitsBelow || (!fitsAbove && spaceBelow >= spaceAbove);

  let top: number;
  let maxHeight: number;
  if (placeBelow) {
    top = anchorRect.bottom + gap;
    maxHeight = Math.min(preferredHeight, spaceBelow);
  } else {
    maxHeight = Math.min(preferredHeight, spaceAbove);
    top = anchorRect.top - maxHeight - gap;
  }
  top = Math.max(margin, top);
  maxHeight = Math.max(0, maxHeight);
  return { top, left, width, maxHeight };
}

export interface UseAnchoredFloatingStyleOptions {
  triggerRef: RefObject<HTMLElement | null>;
  open: boolean;
  preferredWidth: number;
  preferredHeight: number;
  margin?: number;
  minVerticalSpace?: number;
  align?: 'start' | 'end';
}

/**
 * Returns a `position: fixed` style for a floating menu anchored to a trigger.
 * Recomputes on window resize and capture-phase scroll so the menu stays
 * attached to the trigger when the user scrolls or resizes the plugin.
 */
export function useAnchoredFloatingStyle({
  triggerRef,
  open,
  preferredWidth,
  preferredHeight,
  margin,
  minVerticalSpace,
  align,
}: UseAnchoredFloatingStyleOptions): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null);
      return;
    }
    const compute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pos = clampPopoverToViewport({
        anchorRect: rect,
        preferredWidth,
        preferredHeight,
        margin,
        minVerticalSpace,
        align,
      });
      setStyle({
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.maxHeight,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, preferredWidth, preferredHeight, margin, minVerticalSpace, align, triggerRef]);

  return style;
}
