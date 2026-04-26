import { useMemo } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import type {
  GeneratorGraphNode,
  GraphModel,
  GraphNodeId,
} from "@tokenmanager/core";
import { Button, Section, Stack } from "../../../primitives";
import { collectIncidentTokens, MetaRow, RelatedList } from "./shared";

interface GeneratorInspectorProps {
  generator: GeneratorGraphNode;
  graph: GraphModel;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onEditGenerator: (generatorId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}

export function GeneratorInspector({
  generator,
  graph,
  onNavigateToToken,
  onEditGenerator,
  onSelectNode,
}: GeneratorInspectorProps) {
  const outputs = useMemo(
    () => collectIncidentTokens(graph, generator.id, "outgoing"),
    [graph, generator.id],
  );
  const sources = useMemo(
    () => collectIncidentTokens(graph, generator.id, "incoming"),
    [graph, generator.id],
  );

  return (
    <Stack gap={5}>
      <div className="flex flex-col gap-0.5">
        <div className="font-medium text-[var(--color-figma-text)]">
          {generator.name}
        </div>
        <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
          {generator.generatorType}
          {!generator.enabled ? " · disabled" : ""}
        </div>
      </div>

      {generator.health === "generator-error" || generator.errorMessage ? (
        <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-error)]">
          <AlertTriangle
            size={11}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span className="min-w-0 break-words">
            {generator.errorMessage ?? "Generator failed to run."}
          </span>
        </div>
      ) : generator.health === "broken" ? (
        <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-warning)]">
          <AlertTriangle
            size={11}
            strokeWidth={2}
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <span>
            {generator.sourceIssue === "ambiguous"
              ? "Source token has multiple matches."
              : "Source token is missing."}
          </span>
        </div>
      ) : null}

      <Stack gap={1}>
        <MetaRow label="Target" value={generator.targetCollection} />
        <MetaRow label="Group" value={generator.targetGroup} />
        <MetaRow label="Outputs" value={String(generator.outputCount)} />
      </Stack>

      {sources.length > 0 ? (
        <Section title="Source" emphasis="secondary">
          <RelatedList
            items={sources}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}
      {outputs.length > 0 ? (
        <Section title={`Produces · ${outputs.length}`} emphasis="secondary">
          <RelatedList
            items={outputs}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}
      <Button
        variant="primary"
        onClick={() => onEditGenerator(generator.generatorId)}
      >
        <ExternalLink size={11} strokeWidth={2} aria-hidden />
        Edit generator
      </Button>
    </Stack>
  );
}
