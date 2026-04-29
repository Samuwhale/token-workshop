import type { ReactNode } from "react";

interface ActionRowProps {
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}

export function ActionRow({ onClick, disabled, tone = "default", children }: ActionRowProps) {
  const toneClass =
    tone === "danger"
      ? "text-[color:var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10"
      : "text-[color:var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded px-2 py-1 text-left text-body transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${toneClass}`}
    >
      {children}
    </button>
  );
}
