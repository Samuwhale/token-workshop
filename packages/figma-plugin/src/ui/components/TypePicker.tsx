import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import { TOKEN_TYPE_CATEGORIES } from '../shared/tokenTypeCategories';

interface TypePickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  title?: string;
  placeholder?: string;
  /** Wraps the select + chevron in a relative span. Enable for the inline header variant. */
  withChevron?: boolean;
  chevronClassName?: string;
}

export function TypePicker({
  value,
  onChange,
  disabled,
  className,
  style,
  ariaLabel,
  title,
  placeholder,
  withChevron = false,
  chevronClassName,
}: TypePickerProps) {
  const select = (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={className}
      style={style}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {TOKEN_TYPE_CATEGORIES.map((category) => (
        <optgroup key={category.group} label={category.group}>
          {category.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  if (!withChevron) return select;

  return (
    <span className="relative inline-flex items-center">
      {select}
      <ChevronDown
        size={8}
        strokeWidth={2}
        className={chevronClassName ?? 'pointer-events-none absolute right-1 opacity-60'}
        aria-hidden
      />
    </span>
  );
}
