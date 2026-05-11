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
  /** Controls resting visibility: identity (1st slot), status (2nd slot), detail (hover-only). */
  priority?: "identity" | "status" | "detail";
};

function getRowMetadataToneClass(
  tone: RowMetadataSegment["tone"] = "default",
): string {
  switch (tone) {
    case "accent":
      return "text-[color:var(--color-figma-text-accent)]";
    case "warning":
      return "text-[color:var(--color-figma-managed)]";
    case "danger":
      return "text-[color:var(--color-figma-text-error)]";
    default:
      return "text-[color:var(--color-figma-text-secondary)]";
  }
}

export function renderRowMetadataSegments(segments: RowMetadataSegment[]) {
  const hasPriorities = segments.some((s) => s.priority);

  let allOrdered: RowMetadataSegment[];
  let identitySegment: RowMetadataSegment | undefined;
  let statusSegment: RowMetadataSegment | undefined;
  const restingSet = new Set<RowMetadataSegment>();

  if (hasPriorities) {
    identitySegment = segments.find((s) => s.priority === "identity" && !s.hoverOnly);
    statusSegment = segments.find((s) => s.priority === "status" && !s.hoverOnly);
    const restingSegments: RowMetadataSegment[] = [];
    if (identitySegment) { restingSegments.push(identitySegment); restingSet.add(identitySegment); }
    if (statusSegment) { restingSegments.push(statusSegment); restingSet.add(statusSegment); }
    const hoverSegments = segments.filter((s) => !restingSet.has(s));
    allOrdered = [...restingSegments, ...hoverSegments];
  } else {
    allOrdered = segments;
  }

  return allOrdered.map((segment, index) => {
    const isResting = hasPriorities ? restingSet.has(segment) : !segment.hoverOnly;
    const isStatus = segment === statusSegment;
    const priority = segment.priority ?? (isResting ? "identity" : "detail");
    const hoverClass = isResting
      ? ""
      : "opacity-70 group-hover:opacity-100 group-focus-within:opacity-100";

    return (
      <span
        key={`${segment.label}-${index}`}
        data-priority={priority}
        data-resting={isResting ? "true" : "false"}
        className={`tm-token-tree-row__meta-segment inline-flex min-w-0 items-center gap-1 ${hoverClass}`}
      >
        {index > 0 && (
          <span
            aria-hidden="true"
            className="tm-token-tree-row__meta-separator text-[color:var(--color-figma-text-tertiary)]/60"
          >
            ·
          </span>
        )}
        <span
          className={`truncate ${
            isStatus
              ? `text-[color:var(--color-figma-text-tertiary)] ${segment.onClick ? "cursor-pointer hover:underline hover:text-[color:var(--color-figma-text-secondary)]" : ""}`
              : `${getRowMetadataToneClass(segment.tone)} ${segment.onClick ? "cursor-pointer hover:underline" : ""}`
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
