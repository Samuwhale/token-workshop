import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export function Field({ label, help, error, children, htmlFor, className = "" }: FieldProps) {
  const generatedId = useId();
  let controlId = htmlFor ?? generatedId;
  let control: ReactNode = children;
  if (isValidElement(children)) {
    const childProps = children.props as { id?: string; invalid?: boolean };
    const existingId = childProps.id;
    if (existingId && !htmlFor) {
      controlId = existingId;
    }
    const overrides: { id?: string; invalid?: boolean } = {};
    if (!htmlFor && !existingId) overrides.id = controlId;
    if (error && childProps.invalid === undefined) overrides.invalid = true;
    if (Object.keys(overrides).length > 0) {
      control = cloneElement(
        children as ReactElement<{ id?: string; invalid?: boolean }>,
        overrides,
      );
    }
  }
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label
        htmlFor={controlId}
        className="text-secondary font-medium text-[color:var(--color-figma-text-secondary)]"
      >
        {label}
      </label>
      {control}
      {error ? (
        <p className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-error)]">
          {error}
        </p>
      ) : help ? (
        <p className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]">
          {help}
        </p>
      ) : null}
    </div>
  );
}
