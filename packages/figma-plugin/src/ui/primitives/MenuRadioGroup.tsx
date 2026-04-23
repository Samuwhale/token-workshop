import type { SegmentedOption } from "./SegmentedControl";

interface MenuRadioGroupProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  onSelect?: () => void;
}

export function MenuRadioGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  onSelect,
}: MenuRadioGroupProps<T>) {
  return (
    <div className="px-2.5 py-1">
      <div className="mb-1 text-secondary font-medium text-[var(--color-figma-text-tertiary)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => {
                onChange(opt.value);
                onSelect?.();
              }}
              className={`inline-flex h-[22px] items-center rounded px-2 text-secondary transition-colors ${
                selected
                  ? "bg-[var(--color-figma-bg-selected)] text-[var(--color-figma-text)]"
                  : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
