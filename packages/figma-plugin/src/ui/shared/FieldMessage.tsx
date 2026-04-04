/** Shared field-level feedback component.
 *
 * Renders an error, warning, or info message directly below a form field.
 * Only the first non-empty prop is rendered (priority: error > warning > info).
 * Returns null when all props are empty/undefined.
 */
export function FieldMessage({
  error,
  warning,
  info,
}: {
  error?: string;
  warning?: string;
  info?: string;
}) {
  if (error) {
    return (
      <p role="alert" className="mt-0.5 text-[10px] text-[var(--color-figma-error)] leading-tight">
        {error}
      </p>
    );
  }
  if (warning) {
    return (
      <p className="mt-0.5 text-[10px] text-amber-500 leading-tight">
        {warning}
      </p>
    );
  }
  if (info) {
    return (
      <p className="mt-0.5 text-[10px] text-[var(--color-figma-text-tertiary)] leading-tight">
        {info}
      </p>
    );
  }
  return null;
}
