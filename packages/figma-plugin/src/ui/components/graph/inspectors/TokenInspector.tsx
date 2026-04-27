import { useMemo } from "react";
import {
  AlertTriangle,
  Diff,
  ExternalLink,
  GitBranch,
  RotateCw,
} from "lucide-react";
import {
  type GraphModel,
  type GraphNodeId,
  type TokenCollection,
  type TokenGraphNode,
} from "@tokenmanager/core";
import { Button, Section, Stack } from "../../../primitives";
import type { TokenMapEntry } from "../../../../shared/types";
import {
  buildTokenModeRows,
  ModeDependencyRows,
} from "../modeRows";
import {
  collectIncidentTokens,
  RelatedList,
  tokenTypeGlyph,
} from "./shared";

interface TokenInspectorProps {
  graph: GraphModel;
  token: TokenGraphNode;
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  pathToCollectionId: Record<string, string>;
  collectionIdsByPath: Record<string, string[]>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onCompareTokens?: (
    a: { path: string; collectionId: string },
    b: { path: string; collectionId: string },
  ) => void;
  onCreateFromToken?: (
    nodeId: GraphNodeId,
    screenX: number,
    screenY: number,
  ) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
  onSelectEdge: (edgeId: string | null) => void;
}

export function TokenInspector({
  graph,
  token,
  collections,
  perCollectionFlat,
  pathToCollectionId,
  collectionIdsByPath,
  onNavigateToToken,
  onCompareTokens,
  onCreateFromToken,
  onSelectNode,
  onSelectEdge,
}: TokenInspectorProps) {
  const collection = collections.find((c) => c.id === token.collectionId);
  const entry = perCollectionFlat[token.collectionId]?.[token.path];
  const modeRows = useMemo(() => {
    if (!collection || !entry) return [];
    return buildTokenModeRows({
      graph,
      token,
      collection,
      entry,
      collections,
      perCollectionFlat,
      pathToCollectionId,
      collectionIdsByPath,
    });
  }, [
    collection,
    collectionIdsByPath,
    collections,
    entry,
    graph,
    pathToCollectionId,
    perCollectionFlat,
    token,
  ]);

  const upstream = useMemo(
    () => collectIncidentTokens(graph, token.id, "incoming"),
    [graph, token.id],
  );
  const downstream = useMemo(
    () => collectIncidentTokens(graph, token.id, "outgoing"),
    [graph, token.id],
  );

  return (
    <Stack gap={5}>
      <div className="flex items-start gap-3">
        {token.swatchColor ? (
          <span
            className="mt-0.5 h-10 w-10 shrink-0 rounded-md border border-[var(--color-figma-border)]"
            style={{ background: token.swatchColor }}
            aria-hidden
          />
        ) : (
          <span
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-figma-border)] bg-[var(--surface-muted)] font-mono text-[12px] text-[var(--color-figma-text-secondary)]"
            aria-hidden
          >
            {tokenTypeGlyph(token.$type)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-[var(--color-figma-text)]">
            {token.displayName}
          </div>
          <div
            className="truncate font-mono text-secondary text-[var(--color-figma-text-tertiary)]"
            title={token.path}
          >
            {token.path}
          </div>
        </div>
      </div>

      <HealthCallout token={token} />

      {collection && entry ? (
        <Section title="Modes" emphasis="secondary">
          <ModeDependencyRows rows={modeRows} onSelectEdge={onSelectEdge} />
        </Section>
      ) : null}

      {upstream.length > 0 ? (
        <Section title={`Depends on · ${upstream.length}`} emphasis="secondary">
          <RelatedList
            items={upstream}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}

      {downstream.length > 0 ? (
        <Section title={`Used by · ${downstream.length}`} emphasis="secondary">
          <RelatedList
            items={downstream}
            onClick={(t) => onSelectNode(t.id)}
            onDoubleClick={(t) => onNavigateToToken(t.path, t.collectionId)}
          />
        </Section>
      ) : null}

      <Stack gap={2}>
        <Button
          variant="primary"
          onClick={() => onNavigateToToken(token.path, token.collectionId)}
        >
          <ExternalLink size={11} strokeWidth={2} aria-hidden />
          Open token
        </Button>
        {onCreateFromToken ? (
          <Button
            variant="secondary"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onCreateFromToken(token.id, rect.left, rect.bottom + 4);
            }}
          >
            <GitBranch size={11} strokeWidth={2} aria-hidden />
            Create from this
          </Button>
        ) : null}
        {onCompareTokens && upstream[0] ? (
          <Button
            variant="secondary"
            onClick={() =>
              onCompareTokens(
                { path: token.path, collectionId: token.collectionId },
                {
                  path: upstream[0].path,
                  collectionId: upstream[0].collectionId,
                },
              )
            }
          >
            <Diff size={11} strokeWidth={2} aria-hidden />
            Compare with {upstream[0].displayName}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

function HealthCallout({ token }: { token: TokenGraphNode }) {
  if (token.health === "broken") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-error)_10%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-error)]">
        <AlertTriangle
          size={11}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>Alias target is missing or invalid.</span>
      </div>
    );
  }
  if (token.health === "cycle") {
    return (
      <div className="flex items-start gap-2 rounded-md bg-[color-mix(in_srgb,var(--color-figma-warning)_12%,transparent)] px-2.5 py-2 text-secondary text-[var(--color-figma-warning)]">
        <RotateCw
          size={11}
          strokeWidth={2}
          aria-hidden
          className="mt-0.5 shrink-0"
        />
        <span>This token is part of a circular reference and cannot resolve.</span>
      </div>
    );
  }
  return null;
}
