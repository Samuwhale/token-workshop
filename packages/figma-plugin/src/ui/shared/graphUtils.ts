/**
 * Shared utilities for graph / flow visualizations.
 */

/**
 * Build an SVG cubic-bezier path string for a horizontal left→right edge.
 *
 * Control points are offset along the X axis so the curve bows smoothly
 * between start (x1,y1) and end (x2,y2).  A minimum offset of 40 px
 * prevents the curve from collapsing when nodes are close together.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.abs(x2 - x1);
  const cpx = Math.max(40, dx * 0.5);
  return `M${x1},${y1} C${x1 + cpx},${y1} ${x2 - cpx},${y2} ${x2},${y2}`;
}
