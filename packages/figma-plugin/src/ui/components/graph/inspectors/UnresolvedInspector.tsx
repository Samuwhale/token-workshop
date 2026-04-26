import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type {
  GhostGraphNode,
  GraphModel,
  GraphNodeId,
} from "@tokenmanager/core";
import { Section, Stack } from "../../../primitives";
import { collectIncidentTokens, RelatedList } from "./shared";

interface UnresolvedInspectorProps {
  ghost: GhostGraphNode;
  graph: GraphModel;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}

export function UnresolvedInspector({
  ghost,
  graph,
  onSelectNode,
}: UnresolvedInspectorProps) {
  const referrers = useMemo(
    () => collectIncidentTokens(graph, ghost.id, "outgoing"),
    [graph, ghost.id],
  );
  const reasonText =
    ghost.reason === "ambiguous"
      ? "This reference matches more than one collection. Disambiguate the path or remove the alias."
      : "This reference doesn't point to any token. The target may have been renamed or removed.";
  return (
    <Stack gap={5}>
      <div className="flex flex-col gap-1">
        <div
          className="truncate font-mono font-medium text-[var(--color-figma-error)]"
          title={ghost.path}
        >
          {ghost.path}
        </div>
        <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
          {ghost.reason === "ambiguous"
            ? "Multiple matches"
            : "Missing token"}
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-error)]">
        <AlertTriangle
          size={11}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span className="min-w-0">{reasonText}</span>
      </div>
      {referrers.length > 0 ? (
        <Section
          title={`Referenced by · ${referrers.length}`}
          emphasis="secondary"
        >
          <RelatedList items={referrers} onClick={(t) => onSelectNode(t.id)} />
        </Section>
      ) : null}
    </Stack>
  );
}
