export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label ?? "Options"}
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded px-2 py-0.5 text-secondary transition-colors ${
            value === opt.value
              ? "bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] font-medium shadow-sm"
              : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
