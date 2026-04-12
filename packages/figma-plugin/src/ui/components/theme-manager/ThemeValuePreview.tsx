import React from "react";

interface ThemeValuePreviewProps {
  value: unknown;
}

export function ThemeValuePreview({ value }: ThemeValuePreviewProps) {
  if (typeof value === "string") {
    if (/^#[0-9a-fA-F]{6,8}$/.test(value)) {
      return (
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded border border-[var(--color-figma-border)]"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-[10px]">{value}</span>
        </span>
      );
    }

    if (/^\{[^}]+\}$/.test(value)) {
      return (
        <span className="font-mono text-[10px] text-[var(--color-figma-warning)]">
          {value}
        </span>
      );
    }
  }

  return (
    <span className="font-mono text-[10px]">
      {typeof value === "object" ? JSON.stringify(value) : String(value)}
    </span>
  );
}
