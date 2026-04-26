import {
  readTokenModeValuesForCollection,
  type GraphNodeId,
  type TokenCollection,
  type TokenGraphNode,
} from "@tokenmanager/core";
import { ListItem, Stack } from "../../../primitives";
import type { TokenMapEntry } from "../../../../shared/types";
import { isAlias } from "../../../../shared/resolveAlias";
import { formatTokenValueForDisplay } from "../../../shared/tokenFormatting";
import { tokenTypeGlyph } from "./shared";

interface CompareTokensInspectorProps {
  tokens: TokenGraphNode[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken: (path: string, collectionId: string) => void;
  onSelectNode: (nodeId: GraphNodeId | null) => void;
}

export function CompareTokensInspector({
  tokens,
  collections,
  perCollectionFlat,
  onNavigateToToken,
  onSelectNode,
}: CompareTokensInspectorProps) {
  // Take up to 3 tokens — beyond that the matrix becomes unreadable in the
  // 260px panel. The user can always pare down their selection.
  const visible = tokens.slice(0, 3);

  const columns = visible.map((token) => {
    const collection = collections.find((c) => c.id === token.collectionId);
    const entry = perCollectionFlat[token.collectionId]?.[token.path];
    const modeValues =
      collection && entry
        ? readTokenModeValuesForCollection(entry, collection)
        : null;
    const modeNames = collection?.modes.map((m) => m.name) ?? [];
    return { token, collection, modeValues, modeNames };
  });

  // Union of mode names across selected tokens, in first-seen order. Asymmetry
  // is meaningful: a missing mode renders as "—".
  const modeUnion: string[] = [];
  const seen = new Set<string>();
  for (const col of columns) {
    for (const m of col.modeNames) {
      if (!seen.has(m)) {
        seen.add(m);
        modeUnion.push(m);
      }
    }
  }

  return (
    <Stack gap={5}>
      <Stack gap={1}>
        {visible.map((token) => (
          <ListItem
            key={token.id}
            onClick={() => onSelectNode(token.id)}
            onDoubleClick={() =>
              onNavigateToToken(token.path, token.collectionId)
            }
            leading={
              token.swatchColor ? (
                <span
                  className="h-3 w-3 rounded border border-[var(--color-figma-border)]"
                  style={{ background: token.swatchColor }}
                  aria-hidden
                />
              ) : (
                <span className="font-mono text-secondary text-[var(--color-figma-text-tertiary)]">
                  {tokenTypeGlyph(token.$type)}
                </span>
              )
            }
            trailing={
              <span className="max-w-[40%] truncate font-mono text-secondary text-[var(--color-figma-text-tertiary)]">
                {token.collectionId}
              </span>
            }
          >
            {token.displayName}
          </ListItem>
        ))}
      </Stack>

      <Stack gap={3}>
        {modeUnion.map((mode) => (
          <Stack key={mode} gap={1}>
            <div className="text-secondary text-[var(--color-figma-text-tertiary)]">
              {mode}
            </div>
            {columns.map(({ token, modeValues, modeNames }) => {
              const present = modeNames.includes(mode);
              const value = modeValues?.[mode];
              const aliasRef = isAlias(value as never) ? String(value) : null;
              return (
                <div
                  key={token.id}
                  className="flex items-baseline"
                  // Rows always follow the token-list order at the top of the
                  // panel, so a designer can read "row 1 = first token, row 2
                  // = second" without per-row labels. The path tooltip is the
                  // tie-breaker if order ever feels ambiguous.
                  title={token.path}
                >
                  {!present ? (
                    <span className="font-mono text-secondary text-[var(--color-figma-text-tertiary)]">
                      —
                    </span>
                  ) : aliasRef ? (
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-accent)]"
                      title={aliasRef}
                    >
                      {aliasRef}
                    </span>
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-secondary text-[var(--color-figma-text)]"
                      title={String(value ?? "")}
                    >
                      {formatTokenValueForDisplay(token.$type, value, {
                        emptyPlaceholder: "—",
                      })}
                    </span>
                  )}
                </div>
              );
            })}
          </Stack>
        ))}
      </Stack>

      {tokens.length > visible.length ? (
        <div className="px-1 text-secondary text-[var(--color-figma-text-tertiary)]">
          {tokens.length - visible.length} more selected — narrow your selection
          to compare them.
        </div>
      ) : null}
    </Stack>
  );
}
