/**
 * Shared types and rendering helpers used by both TokenGroupNode and TokenLeafNode.
 */

export type RowMetadataSegment = {
  label: string;
  title?: string;
  tone?: "default" | "accent" | "warning" | "danger";
  onClick?: () => void;
  /** When true the segment is invisible at rest and fades in on row hover. */
  hoverOnly?: boolean;
};

function getRowMetadataToneClass(
  tone: RowMetadataSegment["tone"] = "default",
): string {
  switch (tone) {
    case "accent":
      return "text-[var(--color-figma-accent)]";
    case "warning":
      return "text-amber-600";
    case "danger":
      return "text-[var(--color-figma-error)]";
    default:
      return "text-[var(--color-figma-text-secondary)]";
  }
}

export function renderRowMetadataSegments(segments: RowMetadataSegment[]) {
  return segments.map((segment, index) => {
    const hoverClass = segment.hoverOnly
      ? "opacity-0 group-hover:opacity-100 transition-opacity"
      : "";
    return (
      <span
        key={`${segment.label}-${index}`}
        className={`inline-flex min-w-0 items-center gap-1 ${hoverClass}`}
      >
        {index > 0 && (
          <span
            aria-hidden="true"
            className="text-[var(--color-figma-text-tertiary)]/60"
          >
            ·
          </span>
        )}
        <span
          className={`truncate ${getRowMetadataToneClass(segment.tone)} ${
            segment.onClick ? "cursor-pointer hover:underline" : ""
          }`}
          title={segment.title ?? segment.label}
          onClick={
            segment.onClick
              ? (event) => {
                  event.stopPropagation();
                  segment.onClick?.();
                }
              : undefined
          }
        >
          {segment.label}
        </span>
      </span>
    );
  });
}
