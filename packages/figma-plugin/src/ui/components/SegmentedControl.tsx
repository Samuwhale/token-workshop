import { shellControlClass } from "../shared/shellControlStyles";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={shellControlClass({
            active: value === opt.value,
            size: "sm",
            shape: "rounded",
          })}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
