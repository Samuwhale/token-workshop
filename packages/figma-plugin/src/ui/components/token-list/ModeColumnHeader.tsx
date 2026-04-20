import { MODE_COLUMN_WIDTH } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
}

export function ModeColumnHeader({ modeName }: ModeColumnHeaderProps) {
  return (
    <div className={`${MODE_COLUMN_WIDTH} shrink-0 border-l border-[var(--color-figma-border)]`}>
      <span
        className="block w-full truncate px-1.5 py-1 text-body font-medium text-[var(--color-figma-text-secondary)]"
        title={modeName}
      >
        {modeName}
      </span>
    </div>
  );
}
