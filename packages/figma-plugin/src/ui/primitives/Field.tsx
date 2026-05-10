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
  const helpId = help ? `${generatedId}-help` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  let controlId = htmlFor ?? generatedId;
  let control: ReactNode = children;
  if (isValidElement(children)) {
    const childProps = children.props as {
      id?: string;
      invalid?: boolean;
      "aria-describedby"?: string;
      "aria-invalid"?: boolean;
    };
    const existingId = childProps.id;
    if (existingId && !htmlFor) {
      controlId = existingId;
    }
    const describedBy = [childProps["aria-describedby"], helpId, errorId]
      .filter(Boolean)
      .join(" ") || undefined;
    const overrides: {
      id?: string;
      invalid?: boolean;
      "aria-describedby"?: string;
      "aria-invalid"?: true;
    } = {};
    if (!htmlFor && !existingId) overrides.id = controlId;
    if (error && childProps.invalid === undefined) overrides.invalid = true;
    if (describedBy) {
      overrides["aria-describedby"] = describedBy;
    }
    if (error && childProps["aria-invalid"] === undefined) {
      overrides["aria-invalid"] = true;
    }
    if (Object.keys(overrides).length > 0) {
      control = cloneElement(
        children as ReactElement<{
          id?: string;
          invalid?: boolean;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>,
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
      {help ? (
        <p
          id={helpId}
          className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-secondary)]"
        >
          {help}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="m-0 text-secondary leading-[var(--leading-body)] text-[color:var(--color-figma-text-error)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
