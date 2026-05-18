import type { IconStatus, ManagedIcon } from "@token-workshop/core";
import {
  formatIconDimension,
  iconFrameDimensionMatches,
} from "./iconUiUtils";

export type IconHealthFilter =
  | "all"
  | "publish"
  | "blocked"
  | "quality"
  | "frame"
  | "color";

export interface IconHealthSummary {
  needsPublish: number;
  blocked: number;
  qualityReview: number;
  frameIssues: number;
  colorReview: number;
}

export function colorBehaviorLabel(icon: ManagedIcon): string {
  switch (icon.svg.color.behavior) {
    case "inheritable":
      return "Inherits color";
    case "hardcoded-monotone":
      return "Monotone";
    case "multicolor":
      return "Multicolor";
    case "unknown":
      return "Unknown";
  }
}

export function colorBehaviorNote(icon: ManagedIcon): string | null {
  if (icon.svg.color.behavior === "hardcoded-monotone") {
    return "Publishing normalizes this icon to a single editable paint.";
  }
  if (icon.svg.color.behavior === "multicolor") {
    return "Multicolor artwork keeps its source paints when published.";
  }
  if (icon.svg.color.behavior === "unknown") {
    return "Re-import the source SVG before relying on color audits.";
  }
  return null;
}

export function colorDetails(icon: ManagedIcon): string {
  const details: string[] = [];
  if (icon.svg.color.values.length > 0) {
    details.push(icon.svg.color.values.join(", "));
  }
  if (icon.svg.color.usesCurrentColor) {
    details.push("currentColor");
  }
  if (icon.svg.color.hasInlineStyles) {
    details.push("inline styles");
  }
  if (icon.svg.color.hasPaintServers) {
    details.push("paint servers");
  }
  if (icon.svg.color.hasOpacity) {
    details.push("opacity");
  }
  return details.length > 0 ? details.join(" / ") : "No explicit paint";
}

export function qualityStateLabel(icon: ManagedIcon): string {
  switch (icon.quality.state) {
    case "ready":
      return "Ready";
    case "review":
      return "Needs review";
    case "blocked":
      return "Blocked";
  }
}

export function iconFrameLabel(icon: ManagedIcon): string {
  const width = formatIconDimension(icon.svg.viewBoxWidth);
  const height = formatIconDimension(icon.svg.viewBoxHeight);
  return `${width}x${height}`;
}

export function iconGeometryLabel(icon: ManagedIcon): string {
  const geometry = icon.svg.geometry;
  if (!geometry) {
    return "Unknown";
  }
  const bounds = geometry.bounds;
  if (!bounds) {
    return geometry.precision === "unknown"
      ? "Unknown"
      : `Unknown (${geometry.precision})`;
  }
  return [
    `${formatIconDimension(bounds.minX)}, ${formatIconDimension(bounds.minY)}`,
    `${formatIconDimension(bounds.maxX)}, ${formatIconDimension(bounds.maxY)}`,
    geometry.precision,
  ].join(" / ");
}

export function iconFrameMismatchNote(
  icon: ManagedIcon,
  defaultIconSize: number,
): string | null {
  if (
    iconFrameDimensionMatches(icon.svg.viewBoxWidth, defaultIconSize) &&
    iconFrameDimensionMatches(icon.svg.viewBoxHeight, defaultIconSize)
  ) {
    return null;
  }
  const libraryFrame = formatIconDimension(defaultIconSize);
  return [
    `The SVG viewBox is ${iconFrameLabel(icon)}; this library publishes icons`,
    `into a ${libraryFrame}x${libraryFrame} component frame.`,
    "Re-import a matching source if this is unintentional.",
  ].join(" ");
}

export function iconHasFrameIssue(
  icon: ManagedIcon,
  defaultIconSize: number,
): boolean {
  return (
    !iconFrameDimensionMatches(icon.svg.viewBoxMinX, 0) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxMinY, 0) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxWidth, defaultIconSize) ||
    !iconFrameDimensionMatches(icon.svg.viewBoxHeight, defaultIconSize) ||
    icon.quality.issues.some((issue) =>
      issue.kind === "geometry-bounds" ||
      issue.kind === "keyline-overflow" ||
      issue.kind === "off-center",
    )
  );
}

export function iconNeedsPublish(icon: ManagedIcon): boolean {
  return (
    icon.status !== "deprecated" &&
    icon.status !== "blocked" &&
    icon.quality.state !== "blocked" &&
    (!icon.figma.componentId || icon.figma.lastSyncedHash !== icon.svg.hash)
  );
}

export function iconNeedsColorReview(icon: ManagedIcon): boolean {
  return icon.quality.issues.some((issue) =>
    issue.kind === "unknown-color" ||
    issue.kind === "multicolor" ||
    issue.kind === "inline-style" ||
    issue.kind === "style-block" ||
    issue.kind === "paint-server" ||
    issue.kind === "opacity",
  );
}

export function iconNeedsQualityReview(icon: ManagedIcon): boolean {
  return icon.quality.state === "review";
}

export function iconIsBlocked(icon: ManagedIcon): boolean {
  return icon.status === "blocked" || icon.quality.state === "blocked";
}

export function iconCanUseOnCanvas(icon: ManagedIcon): boolean {
  return (
    !iconIsBlocked(icon) &&
    Boolean(icon.figma.componentId || icon.figma.componentKey)
  );
}

export function iconCanUseAsSlotPreference(icon: ManagedIcon): boolean {
  return iconCanUseOnCanvas(icon) && icon.status !== "deprecated";
}

export function iconCanExport(icon: ManagedIcon): boolean {
  return (
    icon.status !== "deprecated" &&
    icon.status !== "blocked" &&
    icon.quality.state !== "blocked"
  );
}

export function restoredIconStatus(icon: ManagedIcon): IconStatus {
  return icon.figma.lastSyncedHash === icon.svg.hash &&
    Boolean(icon.figma.componentId || icon.figma.componentKey)
    ? "published"
    : "draft";
}

export function iconStatusVerb(status: IconStatus): string {
  switch (status) {
    case "draft":
      return "restored to draft";
    case "published":
      return "restored to published";
    case "deprecated":
      return "marked deprecated";
    case "blocked":
      return "blocked";
  }
}

export function getIconHealthSummary(
  icons: ManagedIcon[],
  defaultIconSize: number,
): IconHealthSummary {
  return icons.reduce<IconHealthSummary>(
    (summary, icon) => ({
      needsPublish: summary.needsPublish + (iconNeedsPublish(icon) ? 1 : 0),
      blocked: summary.blocked + (iconIsBlocked(icon) ? 1 : 0),
      qualityReview:
        summary.qualityReview + (iconNeedsQualityReview(icon) ? 1 : 0),
      frameIssues:
        summary.frameIssues + (iconHasFrameIssue(icon, defaultIconSize) ? 1 : 0),
      colorReview: summary.colorReview + (iconNeedsColorReview(icon) ? 1 : 0),
    }),
    { needsPublish: 0, blocked: 0, qualityReview: 0, frameIssues: 0, colorReview: 0 },
  );
}

export function formatHealthCount(count: number, label: string): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

export function iconMatchesHealthFilter(
  icon: ManagedIcon,
  filter: IconHealthFilter,
  defaultIconSize: number,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "publish":
      return iconNeedsPublish(icon);
    case "blocked":
      return iconIsBlocked(icon);
    case "quality":
      return iconNeedsQualityReview(icon);
    case "frame":
      return iconHasFrameIssue(icon, defaultIconSize);
    case "color":
      return iconNeedsColorReview(icon);
  }
}

export function iconPrimaryHealthFilter(
  icon: ManagedIcon,
  defaultIconSize: number,
): IconHealthFilter | null {
  if (iconIsBlocked(icon)) {
    return "blocked";
  }
  if (iconNeedsQualityReview(icon)) {
    return "quality";
  }
  if (iconHasFrameIssue(icon, defaultIconSize)) {
    return "frame";
  }
  if (iconNeedsColorReview(icon)) {
    return "color";
  }
  if (iconNeedsPublish(icon)) {
    return "publish";
  }
  return null;
}
