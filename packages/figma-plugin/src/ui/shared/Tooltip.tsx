import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

interface TooltipProps {
  label: string;
  shortcut?: string;
  /** Extra classes for the outer wrapper div (use for spacing like ml-auto, mr-*, my-*) */
  className?: string;
  /** Suppress the tooltip (e.g. when the button's panel is already open) */
  hidden?: boolean;
  /** Position of the tooltip relative to the trigger */
  position?: "bottom" | "right";
  children: React.ReactElement;
}

/**
 * Wraps an icon button with a CSS-based tooltip that appears on hover AND keyboard focus.
 * Unlike the native `title` attribute, this works for keyboard-only users.
 */
export function Tooltip({ label, shortcut, className = '', hidden = false, position = 'bottom', children }: TooltipProps) {
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const child = !hidden
    ? React.cloneElement(children, { 'aria-describedby': tooltipId })
    : children;

  const baseTransform = position === 'right'
    ? `translateY(calc(-50% + ${shift.y}px)) translateX(${shift.x}px)`
    : `translateX(calc(-50% + ${shift.x}px)) translateY(${shift.y}px)`;

  const positionClasses = position === 'right'
    ? 'left-full top-1/2 ml-1.5'
    : 'top-full left-1/2 mt-1';

  // When the tooltip would overflow the viewport, nudge it back. The measurement
  // includes the currently applied shift, so we normalise against it to compute
  // the absolute correction — otherwise updating shift would re-trigger this
  // effect with a new measured rect and feedback-loop.
  useLayoutEffect(() => {
    if (hidden || !hovered) {
      if (shift.x !== 0 || shift.y !== 0) setShift({ x: 0, y: 0 });
      return;
    }
    const el = tooltipRef.current;
    if (!el) return;
    const padding = 4;
    const rect = el.getBoundingClientRect();
    const unshiftedRight = rect.right - shift.x;
    const unshiftedLeft = rect.left - shift.x;
    const unshiftedBottom = rect.bottom - shift.y;
    const unshiftedTop = rect.top - shift.y;
    let dx = 0;
    let dy = 0;
    if (unshiftedRight > window.innerWidth - padding) {
      dx = window.innerWidth - padding - unshiftedRight;
    } else if (unshiftedLeft < padding) {
      dx = padding - unshiftedLeft;
    }
    if (unshiftedBottom > window.innerHeight - padding) {
      dy = window.innerHeight - padding - unshiftedBottom;
    } else if (unshiftedTop < padding) {
      dy = padding - unshiftedTop;
    }
    if (dx !== shift.x || dy !== shift.y) setShift({ x: dx, y: dy });
  }, [hidden, hovered, label, shift.x, shift.y]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    el.addEventListener('focusin', onEnter);
    el.addEventListener('focusout', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onEnter);
      el.removeEventListener('focusout', onLeave);
    };
  }, []);

  return (
    <div ref={wrapperRef} className={`relative group/tooltip ${className}`}>
      {child}
      {!hidden && (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          style={{ transform: baseTransform }}
          className={`absolute ${positionClasses} z-[60] pointer-events-none max-w-[min(240px,calc(100vw-16px))]
            opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
            transition-opacity duration-100
            bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]
            text-[var(--color-figma-text)] text-secondary
            rounded px-1.5 py-0.5 shadow-md
            flex items-center gap-1.5`}
        >
          <span className="break-words">{label}</span>
          {shortcut && (
            <kbd className="text-[var(--color-figma-text-secondary)] font-mono not-italic shrink-0">{shortcut}</kbd>
          )}
        </div>
      )}
    </div>
  );
}
