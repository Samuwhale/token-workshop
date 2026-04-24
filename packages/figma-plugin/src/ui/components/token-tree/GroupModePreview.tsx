/**
 * GroupModePreview — compact aggregate preview shown in each mode column of a
 * collapsed group row. Lets designers see what's inside nested groups without
 * expanding, the same way Figma's variable picker shows swatches.
 */
import { memo } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type { MultiModeValue } from "../tokenListTypes";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";

const MAX_SAMPLES = 8;
const VALUE_BEARING_SAMPLE_SIZE = 12;

export interface GroupPreviewSample {
  path: string;
  name: string;
  type: string;
  value: unknown;
}

export interface GroupModeAggregate {
  samples: GroupPreviewSample[];
  /** Total descendant leaves that have a value in this mode. */
  valuedCount: number;
  /** Descendant leaves with no value for this mode. */
  missingCount: number;
  /** When all sampled tokens share a non-value-bearing $type, render a single glyph. */
  uniformNonValueBearingType: string | null;
}

export function aggregateGroupForMode(
  node: TokenNode,
  optionName: string,
  getValuesForPath: (path: string) => MultiModeValue[],
): GroupModeAggregate {
  const samples: GroupPreviewSample[] = [];
  let valuedCount = 0;
  let missingCount = 0;
  const types = new Set<string>();

  const walk = (list: TokenNode[] | undefined) => {
    if (!list) return;
    for (const child of list) {
      if (child.isGroup) {
        walk(child.children);
        continue;
      }
      const modes = getValuesForPath(child.path);
      const match = modes.find((m) => m.optionName === optionName);
      const entry = match?.resolved;
      if (!entry || entry.$value === undefined || entry.$value === null) {
        missingCount++;
        continue;
      }
      valuedCount++;
      const type = entry.$type;
      if (!type) continue;
      types.add(type);
      if (samples.length < MAX_SAMPLES) {
        samples.push({
          path: child.path,
          name: child.name,
          type,
          value: entry.$value,
        });
      }
    }
  };
  walk(node.children);

  const uniformNonValueBearingType =
    types.size === 1 && !previewIsValueBearing([...types][0])
      ? [...types][0]
      : null;

  return { samples, valuedCount, missingCount, uniformNonValueBearingType };
}

interface GroupModePreviewProps {
  aggregate: GroupModeAggregate;
}

export const GroupModePreview = memo(function GroupModePreview({
  aggregate,
}: GroupModePreviewProps) {
  const { samples, valuedCount, missingCount, uniformNonValueBearingType } =
    aggregate;

  if (valuedCount === 0 && missingCount === 0) return null;

  if (valuedCount === 0) {
    return (
      <span className="text-[10px] leading-none text-[var(--color-figma-text-tertiary)]">
        —
      </span>
    );
  }

  if (uniformNonValueBearingType) {
    return (
      <div
        className="flex min-w-0 items-center gap-1 text-[10px] leading-none text-[var(--color-figma-text-tertiary)]"
        title={`${valuedCount} ${uniformNonValueBearingType} token${valuedCount === 1 ? "" : "s"}`}
      >
        <span className="shrink-0">
          <ValuePreview
            type={uniformNonValueBearingType}
            value={samples[0]?.value}
            size={VALUE_BEARING_SAMPLE_SIZE}
          />
        </span>
        <span className="truncate">×{valuedCount}</span>
      </div>
    );
  }

  const overflow = valuedCount - samples.length;

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
        {samples.map((s) => (
          <span
            key={s.path}
            className="shrink-0"
            title={`${s.name} — ${formatSampleTitle(s.type, s.value)}`}
          >
            <ValuePreview
              type={s.type}
              value={s.value}
              size={VALUE_BEARING_SAMPLE_SIZE}
            />
          </span>
        ))}
      </div>
      {overflow > 0 && (
        <span
          className="shrink-0 text-[10px] leading-none text-[var(--color-figma-text-tertiary)]"
          title={`${overflow} more token${overflow === 1 ? "" : "s"}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
});

function formatSampleTitle(type: string, value: unknown): string {
  if (value == null) return type;
  if (typeof value === "string" || typeof value === "number") return `${value}`;
  return type;
}
