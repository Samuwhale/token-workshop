import { NoticeFieldMessage } from './noticeSystem';

/** Shared field-level feedback component.
 *
 * Renders an error, warning, or info message directly below a form field.
 * Only the first non-empty prop is rendered (priority: error > warning > info).
 * Returns null when all props are empty/undefined.
 *
 * This is a convenience wrapper around `NoticeFieldMessage` that accepts
 * separate props for common severities. Use `NoticeFieldMessage` directly
 * when you already have a severity value.
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
  if (error) return <NoticeFieldMessage severity="error">{error}</NoticeFieldMessage>;
  if (warning) return <NoticeFieldMessage severity="warning">{warning}</NoticeFieldMessage>;
  if (info) return <NoticeFieldMessage severity="info">{info}</NoticeFieldMessage>;
  return null;
}
