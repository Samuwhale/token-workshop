import type { GraphIssueGroup, GraphIssueKind } from "../../hooks/useIssuesGroups";

interface GraphIssuesBannerProps {
  groups: GraphIssueGroup[];
  onOpen: () => void;
}

const PRIORITY: GraphIssueKind[] = [
  "cycle",
  "broken-alias",
  "ghost-reference",
  "ambiguous-generator-source",
];

const SINGULAR: Record<GraphIssueKind, string> = {
  cycle: "cycle",
  "broken-alias": "broken alias",
  "ghost-reference": "missing reference",
  "ambiguous-generator-source": "ambiguous generator source",
};

const PLURAL: Record<GraphIssueKind, string> = {
  cycle: "cycles",
  "broken-alias": "broken aliases",
  "ghost-reference": "missing references",
  "ambiguous-generator-source": "ambiguous generator sources",
};

export function GraphIssuesBanner({ groups, onOpen }: GraphIssuesBannerProps) {
  const counts = new Map<GraphIssueKind, number>();
  for (const group of groups) {
    for (const entry of group.entries) {
      counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    }
  }
  const summary = PRIORITY.filter((kind) => (counts.get(kind) ?? 0) > 0)
    .map((kind) => {
      const n = counts.get(kind)!;
      return `${n} ${n === 1 ? SINGULAR[kind] : PLURAL[kind]}`;
    })
    .join(", ");
  if (!summary) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute left-3 top-3 z-20 rounded bg-[var(--color-figma-bg)]/90 px-2 py-1 text-secondary text-[var(--color-figma-error)] backdrop-blur-sm hover:bg-[var(--color-figma-bg-hover)]"
    >
      {summary}
    </button>
  );
}
