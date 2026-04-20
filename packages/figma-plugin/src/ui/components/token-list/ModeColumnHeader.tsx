import { getModeColumnWidth } from "../tokenListTypes";

interface ModeColumnHeaderProps {
  modeName: string;
  modeCount: number;
}

export function ModeColumnHeader({ modeName, modeCount }: ModeColumnHeaderProps) {
  return (
    <div className={`${getModeColumnWidth(modeCount)} shrink-0 border-l border-[var(--color-figma-border)]`}>
      <span
        className="block w-full truncate px-1.5 py-1 text-body font-medium text-[var(--color-figma-text-secondary)]"
        title={modeName}
      >
        {modeName}
      </span>
    </div>
  );
}
