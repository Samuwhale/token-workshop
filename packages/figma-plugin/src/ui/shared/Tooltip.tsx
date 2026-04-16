import React, { useId } from 'react';

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
 *
 * Usage:
 *   <Tooltip label="Canvas analysis" className="mr-0.5 my-1">
 *     <button ...>icon</button>
 *   </Tooltip>
 */
export function Tooltip({ label, shortcut, className = '', hidden = false, position = 'bottom', children }: TooltipProps) {
  const tooltipId = useId();
  const child = !hidden
    ? React.cloneElement(children, { 'aria-describedby': tooltipId })
    : children;

  const positionClasses = position === 'right'
    ? 'left-full top-1/2 -translate-y-1/2 ml-1.5'
    : 'top-full left-1/2 -translate-x-1/2 mt-1';

  return (
    <div className={`relative group/tooltip ${className}`}>
      {child}
      {!hidden && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute ${positionClasses} z-[60] pointer-events-none
            opacity-0 group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100
            transition-opacity duration-100
            bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)]
            text-[var(--color-figma-text)] text-[10px] whitespace-nowrap
            rounded px-1.5 py-0.5 shadow-md
            flex items-center gap-1.5`}
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="text-[var(--color-figma-text-secondary)] font-mono not-italic">{shortcut}</kbd>
          )}
        </div>
      )}
    </div>
  );
}
