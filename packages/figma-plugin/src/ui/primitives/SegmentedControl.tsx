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
  return (
    <div
      className="inline-flex max-w-full items-stretch gap-[2px] overflow-x-auto rounded bg-[var(--color-figma-bg)] p-[2px] [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-[22px] min-w-0 shrink-0 items-center justify-center rounded-[3px] px-2 py-1 text-center text-secondary font-medium leading-tight transition-colors ${
              selected
                ? "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]"
                : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
