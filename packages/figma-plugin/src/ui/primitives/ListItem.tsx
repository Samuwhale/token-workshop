import type { MouseEventHandler, ReactNode } from "react";

interface ListItemProps {
  leading?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>;
  selected?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
  allowWrap?: boolean;
}

export function ListItem({
  leading,
  children,
  trailing,
  onClick,
  onDoubleClick,
  selected,
  disabled,
  title,
  className = "",
  allowWrap = false,
}: ListItemProps) {
  const isButton = onClick !== undefined;
  const stateClass = selected
    ? "bg-[var(--surface-selected)] text-[var(--color-figma-text)]"
    : "text-[var(--color-figma-text)]";
  const hoverClass =
    isButton && !selected ? "hover:bg-[var(--surface-hover)]" : "";
  const baseClass = `flex min-w-0 gap-2 rounded-[var(--radius-lg)] px-1.5 py-1 text-left text-body transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${allowWrap ? "items-start" : "items-center"} ${stateClass} ${hoverClass} ${className}`;
  const content = (
    <>
      {leading ? (
        <span className="flex shrink-0 items-center">{leading}</span>
      ) : null}
      <span
        className={`min-w-0 flex-1 ${
          allowWrap
            ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug"
            : "truncate"
        }`}
      >
        {children}
      </span>
      {trailing ? (
        <span
          className={`ml-auto flex shrink-0 items-center text-[var(--color-figma-text-tertiary)] ${
            allowWrap ? "pt-0.5" : ""
          }`}
        >
          {trailing}
        </span>
      ) : null}
    </>
  );
  if (isButton) {
    return (
      <button
        type="button"
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        disabled={disabled}
        title={title}
        className={baseClass}
      >
        {content}
      </button>
    );
  }
  return (
    <div title={title} className={baseClass}>
      {content}
    </div>
  );
}
