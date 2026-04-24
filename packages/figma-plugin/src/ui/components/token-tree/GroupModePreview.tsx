/**
 * GroupModePreview — compact aggregate preview shown in each mode column of a
 * collapsed group row. Lets designers see what's inside nested groups without
 * expanding, the same way Figma's variable picker shows swatches.
 */
import { memo } from "react";
import type { TokenNode } from "../../hooks/useTokens";
import type { MultiModeValue } from "../tokenListTypes";
import { ValuePreview, previewIsValueBearing } from "../ValuePreview";

const MAX_SAMPLES = 6;
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

/**
 * Build per-mode aggregates for every mode in one descendant walk. Calling
 * per-mode would allocate a fresh MultiModeValue[] for every descendant for
 * every mode — bad for "by type" synthetic groups with thousands of members.
 */
export function aggregateGroupByModes(
  node: TokenNode,
  optionNames: string[],
  getValuesForPath: (path: string) => MultiModeValue[],
): Map<string, GroupModeAggregate> {
  const perMode = new Map<
    string,
    {
      samples: GroupPreviewSample[];
      valuedCount: number;
      missingCount: number;
      types: Set<string>;
    }
  >();
  for (const name of optionNames) {
    perMode.set(name, {
      samples: [],
      valuedCount: 0,
      missingCount: 0,
      types: new Set(),
    });
  }

  const walk = (list: TokenNode[] | undefined) => {
    if (!list) return;
    for (const child of list) {
      if (child.isGroup) {
        walk(child.children);
        continue;
      }
      const entriesByMode = new Map(
        getValuesForPath(child.path).map((modeValue) => [
          modeValue.optionName,
          modeValue.resolved,
        ]),
      );
      for (const [optionName, bucket] of perMode) {
        const entry = entriesByMode.get(optionName);
        if (!entry || entry.$value === undefined || entry.$value === null) {
          bucket.missingCount++;
          continue;
        }
        bucket.valuedCount++;
        const type = entry.$type;
        if (!type) continue;
        bucket.types.add(type);
        if (bucket.samples.length < MAX_SAMPLES) {
          bucket.samples.push({
            path: child.path,
            name: child.name,
            type,
            value: entry.$value,
          });
        }
      }
    }
  };
  walk(node.children);

  const result = new Map<string, GroupModeAggregate>();
  for (const [name, bucket] of perMode) {
    const firstType = bucket.types.size === 1 ? [...bucket.types][0] : null;
    result.set(name, {
      samples: bucket.samples,
      valuedCount: bucket.valuedCount,
      missingCount: bucket.missingCount,
      uniformNonValueBearingType:
        firstType && !previewIsValueBearing(firstType) ? firstType : null,
    });
  }
  return result;
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
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return type;
}
