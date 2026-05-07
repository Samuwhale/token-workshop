import type { KeyboardEvent } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = options.findIndex((option) => option.value === value);
    if (currentIndex === -1) {
      return;
    }

    const move = (delta: number) => {
      const nextIndex =
        (currentIndex + delta + options.length) % options.length;
      onChange(options[nextIndex].value);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
      buttons[nextIndex]?.focus();
    };

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      onChange(options[0].value);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
      buttons[0]?.focus();
    }

    if (event.key === "End") {
      event.preventDefault();
      onChange(options[options.length - 1].value);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      );
      buttons[options.length - 1]?.focus();
    }
  };

  return (
    <div
      className="inline-flex max-w-full flex-wrap items-stretch gap-[2px] rounded bg-[var(--color-figma-bg)] p-[2px]"
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-7 min-w-[3rem] flex-1 basis-0 items-center justify-center rounded-[3px] px-2 py-1 text-center text-secondary font-medium leading-tight transition-colors ${
              selected
                ? "bg-[var(--color-figma-bg-hover)] text-[color:var(--color-figma-text)]"
                : "text-[color:var(--color-figma-text-secondary)] hover:text-[color:var(--color-figma-text)]"
            }`}
          >
            <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-normal [overflow-wrap:anywhere]">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
