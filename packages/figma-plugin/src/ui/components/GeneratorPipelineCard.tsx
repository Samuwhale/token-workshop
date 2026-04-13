import React, { useEffect, useRef, useState } from "react";
import type {
  TokenGenerator,
  ColorRampConfig,
  SpacingScaleConfig,
  TypeScaleConfig,
  ShadowScaleConfig,
  DarkModeInversionConfig,
  AccessibleColorPairConfig,
  GeneratorType,
  GeneratorConfig,
  BorderRadiusScaleConfig,
  CustomScaleConfig,
  ContrastCheckConfig,
  GeneratedTokenResult,
} from "../hooks/useGenerators";
import { getGeneratorDashboardStatus } from "../hooks/useGenerators";
import type { TokenMapEntry } from "../../shared/types";
import { apiFetch } from "../shared/apiFetch";
import { TokenGeneratorDialog } from "./TokenGeneratorDialog";
import { SemanticMappingDialog } from "./SemanticMappingDialog";
import type { GeneratorSaveSuccessInfo } from "../hooks/useGeneratorSave";
import { VALUE_REQUIRED_TYPES } from "./generators/generatorUtils";
import { OverrideRow, formatValue } from "./generators/generatorShared";
import { AUTHORING_SURFACE_CLASSES } from "./EditorShell";
import { GENERATOR_AUTHORING_CLASSES } from "./generatorAuthoringSurface";
import { swatchBgColor } from "../shared/colorUtils";
import { dispatchToast } from "../shared/toastBus";
import type { ToastAction } from "../shared/toastBus";
import { ConfirmModal } from "./ConfirmModal";
import {
  useGeneratorPreview,
  type GeneratorPreviewDiff,
} from "../hooks/useGeneratorPreview";
import { getMenuItems, handleMenuArrowKeys } from "../hooks/useMenuKeyboard";
import { LONG_TEXT_CLASSES } from "../shared/longTextStyles";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function getGeneratorTypeLabel(type: GeneratorType): string {
  switch (type) {
    case "colorRamp":
      return "Color ramp";
    case "spacingScale":
      return "Spacing scale";
    case "typeScale":
      return "Type scale";
    case "opacityScale":
      return "Opacity scale";
    case "borderRadiusScale":
      return "Border radius";
    case "zIndexScale":
      return "Z-index scale";
    case "shadowScale":
      return "Shadow scale";
    case "customScale":
      return "Custom scale";
    case "contrastCheck":
      return "Contrast check";
    case "accessibleColorPair":
      return "Accessible color pair";
    case "darkModeInversion":
      return "Dark mode inversion";
    default:
      return type;
  }
}

export function getGeneratorStepCount(generator: TokenGenerator): number {
  const cfg = generator.config as unknown as Record<string, unknown>;
  const steps = cfg.steps;
  if (Array.isArray(steps)) return steps.length;
  return 0;
}

function formatRelativeTimestamp(value?: string): string | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  const diffMs = Date.now() - time;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function DependencyChips({
  label,
  dependencies,
  tone = "neutral",
}: {
  label: string;
  dependencies: NonNullable<TokenGenerator["upstreamGenerators"]>;
  tone?: "neutral" | "warning" | "danger";
}) {
  if (dependencies.length === 0) return null;

  const toneClass =
    tone === "danger"
      ? "border-[var(--color-figma-error)]/20 bg-[var(--color-figma-error)]/8 text-[var(--color-figma-error)]"
      : tone === "warning"
        ? "border-yellow-400/40 bg-yellow-400/10 text-yellow-700 dark:text-yellow-300"
        : "border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[9px] font-medium text-[var(--color-figma-text-tertiary)]">
        {label}
      </span>
      {dependencies.slice(0, 3).map((dependency) => (
        <span
          key={dependency.id}
          className={`text-[9px] px-1.5 py-px rounded-full border ${toneClass}`}
        >
          {dependency.name}
        </span>
      ))}
      {dependencies.length > 3 && (
        <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
          +{dependencies.length - 3} more
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dry-run preview
// ---------------------------------------------------------------------------

interface DryRunDiff {
  created: Array<{ path: string; value: unknown; type: string }>;
  updated: Array<{
    path: string;
    currentValue: unknown;
    newValue: unknown;
    type: string;
  }>;
  unchanged: Array<{ path: string; value: unknown; type: string }>;
  deleted: Array<{ path: string; currentValue: unknown }>;
}

function formatTokenValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function DryRunPreview({
  diff,
  onConfirmRun,
  onClose,
  running,
}: {
  diff: DryRunDiff;
  onConfirmRun: () => void;
  onClose: () => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState<
    "created" | "updated" | "deleted" | null
  >(null);
  const totalChanges =
    diff.created.length + diff.updated.length + diff.deleted.length;

  return (
    <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
          Preview output
        </span>
        <button
          onClick={onClose}
          className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors"
          aria-label="Close preview"
        >
          ×
        </button>
      </div>

      {totalChanges === 0 && diff.unchanged.length === 0 ? (
        <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">
          No tokens would be generated.
        </p>
      ) : totalChanges === 0 ? (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
          All {diff.unchanged.length} tokens are already up-to-date. Nothing
          would change.
        </p>
      ) : (
        <div className="space-y-1">
          {/* Summary pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {diff.created.length > 0 && (
              <button
                onClick={() =>
                  setExpanded(expanded === "created" ? null : "created")
                }
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "created" ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"}`}
              >
                +{diff.created.length} new
              </button>
            )}
            {diff.updated.length > 0 && (
              <button
                onClick={() =>
                  setExpanded(expanded === "updated" ? null : "updated")
                }
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "updated" ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100"}`}
              >
                ~{diff.updated.length} changed
              </button>
            )}
            {diff.deleted.length > 0 && (
              <button
                onClick={() =>
                  setExpanded(expanded === "deleted" ? null : "deleted")
                }
                className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "deleted" ? "bg-red-100 text-red-700 border border-red-300" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"}`}
              >
                -{diff.deleted.length} removed
              </button>
            )}
            {diff.unchanged.length > 0 && (
              <span className="text-[10px] px-1.5 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">
                ={diff.unchanged.length} unchanged
              </span>
            )}
          </div>

          {/* Detail list for expanded section */}
          {expanded === "created" && diff.created.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.created.map((t) => (
                <div
                  key={t.path}
                  className="flex flex-col gap-0.5 text-[10px]"
                >
                  <span className="text-emerald-600 font-medium shrink-0">
                    +
                  </span>
                  <span className={LONG_TEXT_CLASSES.monoSecondary}>
                    {t.path}
                  </span>
                  <span className={LONG_TEXT_CLASSES.monoTertiary}>
                    {formatTokenValue(t.value)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {expanded === "updated" && diff.updated.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.updated.map((t) => (
                <div
                  key={t.path}
                  className="flex flex-col gap-px text-[10px] py-0.5 border-b border-[var(--color-figma-border)] last:border-b-0"
                >
                  <span className={LONG_TEXT_CLASSES.monoSecondary}>
                    {t.path}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[var(--color-figma-text-tertiary)] shrink-0">
                      was
                    </span>
                    <span className={joinClasses(LONG_TEXT_CLASSES.mono, "text-red-500")}>
                      {formatTokenValue(t.currentValue)}
                    </span>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 8 8"
                      fill="currentColor"
                      className="text-[var(--color-figma-text-tertiary)] shrink-0"
                    >
                      <path d="M2 1l4 3-4 3V1z" />
                    </svg>
                    <span className={joinClasses(LONG_TEXT_CLASSES.mono, "text-emerald-600")}>
                      {formatTokenValue(t.newValue)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {expanded === "deleted" && diff.deleted.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-px mt-1">
              {diff.deleted.map((t) => (
                <div
                  key={t.path}
                  className="flex flex-col gap-0.5 text-[10px]"
                >
                  <span className="text-red-500 font-medium shrink-0">−</span>
                  <span className={LONG_TEXT_CLASSES.monoSecondary}>
                    {t.path}
                  </span>
                  <span className={LONG_TEXT_CLASSES.monoTertiary}>
                    {formatTokenValue(t.currentValue)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onConfirmRun}
        disabled={running}
        className="mt-2 w-full py-1.5 px-2 rounded bg-[var(--color-figma-accent)] text-white text-[10px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {running
          ? "Running…"
          : totalChanges === 0
            ? "Run (no changes)"
            : `Run (apply ${totalChanges} change${totalChanges !== 1 ? "s" : ""})`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live diff preview (used by Quick edit panel — auto-updates as config changes)
// ---------------------------------------------------------------------------

function LiveDiffPreview({
  diff,
  loading,
}: {
  diff: GeneratorPreviewDiff | null;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<
    "created" | "updated" | "deleted" | null
  >(null);

  if (loading && !diff) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-[10px] text-[var(--color-figma-text-tertiary)] italic">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-spin"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
        Loading preview…
      </div>
    );
  }

  if (!diff) return null;

  const totalChanges =
    diff.created.length + diff.updated.length + diff.deleted.length;
  const totalTokens = totalChanges + diff.unchanged.length;

  if (totalTokens === 0) {
    return (
      <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic py-1">
        No tokens would be generated.
      </p>
    );
  }

  return (
    <div
      className={`space-y-1 transition-opacity duration-150 ${loading ? "opacity-40" : "opacity-100"}`}
    >
      <div className="flex items-center gap-1 flex-wrap">
        {diff.created.length > 0 && (
          <button
            onClick={() =>
              setExpanded(expanded === "created" ? null : "created")
            }
            className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "created" ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"}`}
          >
            +{diff.created.length} new
          </button>
        )}
        {diff.updated.length > 0 && (
          <button
            onClick={() =>
              setExpanded(expanded === "updated" ? null : "updated")
            }
            className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "updated" ? "bg-amber-100 text-amber-700 border border-amber-300" : "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100"}`}
          >
            ~{diff.updated.length} changed
          </button>
        )}
        {diff.deleted.length > 0 && (
          <button
            onClick={() =>
              setExpanded(expanded === "deleted" ? null : "deleted")
            }
            className={`text-[10px] px-1.5 py-px rounded font-medium transition-colors ${expanded === "deleted" ? "bg-red-100 text-red-700 border border-red-300" : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"}`}
          >
            -{diff.deleted.length} removed
          </button>
        )}
        {diff.unchanged.length > 0 && (
          <span className="text-[10px] px-1.5 py-px rounded bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-tertiary)] border border-[var(--color-figma-border)]">
            ={diff.unchanged.length} unchanged
          </span>
        )}
        {totalChanges === 0 && diff.unchanged.length > 0 && (
          <span className="text-[10px] text-[var(--color-figma-text-tertiary)] italic ml-1">
            — nothing would change
          </span>
        )}
      </div>

      {expanded === "created" && diff.created.length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-px mt-0.5">
          {diff.created.map((t) => (
            <div key={t.path} className="flex flex-col gap-0.5 text-[10px]">
              <span className="text-emerald-600 font-medium shrink-0">+</span>
              <span className={LONG_TEXT_CLASSES.monoSecondary}>
                {t.path}
              </span>
              <span className={LONG_TEXT_CLASSES.monoTertiary}>
                {formatTokenValue(t.value)}
              </span>
            </div>
          ))}
        </div>
      )}
      {expanded === "updated" && diff.updated.length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-px mt-0.5">
          {diff.updated.map((t) => (
            <div
              key={t.path}
              className="flex flex-col gap-px text-[10px] py-0.5 border-b border-[var(--color-figma-border)] last:border-b-0"
            >
              <span className={LONG_TEXT_CLASSES.monoSecondary}>
                {t.path}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[var(--color-figma-text-tertiary)] shrink-0">
                  was
                </span>
                <span className={joinClasses(LONG_TEXT_CLASSES.mono, "text-red-500")}>
                  {formatTokenValue(t.currentValue)}
                </span>
                <svg
                  width="8"
                  height="8"
                  viewBox="0 0 8 8"
                  fill="currentColor"
                  className="text-[var(--color-figma-text-tertiary)] shrink-0"
                >
                  <path d="M2 1l4 3-4 3V1z" />
                </svg>
                <span className={joinClasses(LONG_TEXT_CLASSES.mono, "text-emerald-600")}>
                  {formatTokenValue(t.newValue)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {expanded === "deleted" && diff.deleted.length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-px mt-0.5">
          {diff.deleted.map((t) => (
            <div key={t.path} className="flex flex-col gap-0.5 text-[10px]">
              <span className="text-red-500 font-medium shrink-0">−</span>
              <span className={LONG_TEXT_CLASSES.monoSecondary}>
                {t.path}
              </span>
              <span className={LONG_TEXT_CLASSES.monoTertiary}>
                {formatTokenValue(t.currentValue)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick edit panel
// ---------------------------------------------------------------------------

const QE_INPUT = GENERATOR_AUTHORING_CLASSES.control;
const QE_MONO_INPUT = GENERATOR_AUTHORING_CLASSES.controlMono;
const QE_LABEL = GENERATOR_AUTHORING_CLASSES.summaryLabel;

const RATIO_PRESETS = [
  { label: "Minor Third (1.2)", value: 1.2 },
  { label: "Major Third (1.25)", value: 1.25 },
  { label: "Perfect Fourth (1.333)", value: 1.333 },
  { label: "Augmented Fourth (1.414)", value: 1.414 },
  { label: "Perfect Fifth (1.5)", value: 1.5 },
  { label: "Golden Ratio (1.618)", value: 1.618 },
];

const COLOR_STEP_PRESETS = [
  {
    label: "Tailwind (11)",
    steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  },
  {
    label: "Material (10)",
    steps: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900],
  },
  { label: "Compact (5)", steps: [100, 300, 500, 700, 900] },
];

function QuickEditTypeFields({
  type,
  config,
  onChange,
}: {
  type: GeneratorType;
  config: GeneratorConfig;
  onChange: (c: GeneratorConfig) => void;
}) {
  switch (type) {
    case "colorRamp": {
      const c = config as ColorRampConfig;
      return (
        <>
          <div>
            <label className={QE_LABEL}>Step preset</label>
            <div className="flex gap-1">
              {COLOR_STEP_PRESETS.map((preset) => {
                const active =
                  JSON.stringify(c.steps) === JSON.stringify(preset.steps);
                return (
                  <button
                    key={preset.label}
                    onClick={() => onChange({ ...c, steps: preset.steps })}
                    title={preset.label}
                    className={`flex-1 text-[9px] py-0.5 px-1 rounded border transition-colors ${active ? "bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]" : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]"}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className={QE_LABEL}>Light end (L*)</label>
              <input
                type="number"
                value={c.lightEnd}
                min={1}
                max={100}
                onChange={(e) =>
                  onChange({ ...c, lightEnd: Number(e.target.value) })
                }
                className={QE_INPUT}
              />
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Dark end (L*)</label>
              <input
                type="number"
                value={c.darkEnd}
                min={1}
                max={100}
                onChange={(e) =>
                  onChange({ ...c, darkEnd: Number(e.target.value) })
                }
                className={QE_INPUT}
              />
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Chroma boost</label>
              <input
                type="number"
                value={c.chromaBoost}
                min={0.1}
                max={3.0}
                step={0.1}
                onChange={(e) =>
                  onChange({ ...c, chromaBoost: Number(e.target.value) })
                }
                className={QE_INPUT}
              />
            </div>
          </div>
        </>
      );
    }
    case "typeScale": {
      const c = config as TypeScaleConfig;
      const knownRatio = RATIO_PRESETS.some(
        (p) => Math.abs(p.value - c.ratio) < 0.0001,
      );
      return (
        <>
          <div>
            <label className={QE_LABEL}>Scale ratio</label>
            <select
              value={knownRatio ? String(c.ratio) : "custom"}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v)) onChange({ ...c, ratio: v });
              }}
              className={QE_INPUT}
            >
              {RATIO_PRESETS.map((p) => (
                <option key={p.value} value={String(p.value)}>
                  {p.label}
                </option>
              ))}
              {!knownRatio && (
                <option value="custom">{c.ratio} (custom)</option>
              )}
            </select>
          </div>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label className={QE_LABEL}>Unit</label>
              <select
                value={c.unit}
                onChange={(e) =>
                  onChange({ ...c, unit: e.target.value as "px" | "rem" })
                }
                className={QE_INPUT}
              >
                <option value="rem">rem</option>
                <option value="px">px</option>
              </select>
            </div>
            <div className="flex-1">
              <label className={QE_LABEL}>Round to</label>
              <input
                type="number"
                value={c.roundTo}
                min={0}
                max={5}
                onChange={(e) =>
                  onChange({ ...c, roundTo: Number(e.target.value) })
                }
                className={QE_INPUT}
              />
            </div>
          </div>
        </>
      );
    }
    case "spacingScale": {
      const c = config as SpacingScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Unit</label>
          <select
            value={c.unit}
            onChange={(e) =>
              onChange({ ...c, unit: e.target.value as "px" | "rem" })
            }
            className={QE_INPUT}
          >
            <option value="px">px</option>
            <option value="rem">rem</option>
          </select>
        </div>
      );
    }
    case "borderRadiusScale": {
      const c = config as BorderRadiusScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Unit</label>
          <select
            value={c.unit}
            onChange={(e) =>
              onChange({ ...c, unit: e.target.value as "px" | "rem" })
            }
            className={QE_INPUT}
          >
            <option value="px">px</option>
            <option value="rem">rem</option>
          </select>
        </div>
      );
    }
    case "shadowScale": {
      const c = config as ShadowScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Shadow color</label>
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
              style={{ background: c.color }}
            />
            <input
              type="text"
              value={c.color}
              onChange={(e) => onChange({ ...c, color: e.target.value })}
              placeholder="#000000"
              className={QE_MONO_INPUT}
              maxLength={9}
            />
          </div>
        </div>
      );
    }
    case "customScale": {
      const c = config as CustomScaleConfig;
      return (
        <div>
          <label className={QE_LABEL}>Formula</label>
          <input
            type="text"
            value={c.formula}
            onChange={(e) => onChange({ ...c, formula: e.target.value })}
            placeholder="base * ratio^index"
            className={QE_MONO_INPUT}
          />
        </div>
      );
    }
    case "accessibleColorPair": {
      const c = config as AccessibleColorPairConfig;
      return (
        <div>
          <label className={QE_LABEL}>Contrast level</label>
          <div className="flex gap-1">
            {(["AA", "AAA"] as const).map((level) => (
              <button
                key={level}
                onClick={() => onChange({ ...c, contrastLevel: level })}
                className={`flex-1 text-[10px] py-0.5 px-2 rounded border transition-colors ${c.contrastLevel === level ? "bg-[var(--color-figma-accent)] text-white border-[var(--color-figma-accent)]" : "bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] border-[var(--color-figma-border)] hover:border-[var(--color-figma-accent)]"}`}
              >
                {level} ({level === "AA" ? "4.5:1" : "7:1"})
              </button>
            ))}
          </div>
        </div>
      );
    }
    case "darkModeInversion": {
      const c = config as DarkModeInversionConfig;
      return (
        <div>
          <label className={QE_LABEL}>Chroma boost</label>
          <input
            type="number"
            value={c.chromaBoost}
            min={0}
            max={2.0}
            step={0.05}
            onChange={(e) =>
              onChange({ ...c, chromaBoost: Number(e.target.value) })
            }
            className={QE_INPUT}
          />
        </div>
      );
    }
    case "contrastCheck": {
      const c = config as ContrastCheckConfig;
      return (
        <div>
          <label className={QE_LABEL}>Background color</label>
          <div className="flex items-center gap-1.5">
            <div
              className="w-5 h-5 rounded border border-[var(--color-figma-border)] shrink-0"
              style={{ background: c.backgroundHex }}
            />
            <input
              type="text"
              value={c.backgroundHex}
              onChange={(e) =>
                onChange({ ...c, backgroundHex: e.target.value })
              }
              placeholder="#ffffff"
              className={QE_MONO_INPUT}
              maxLength={9}
            />
          </div>
        </div>
      );
    }
    case "opacityScale":
    case "zIndexScale":
    default:
      return null;
  }
}

function QuickEditPanel({
  generator,
  serverUrl,
  allSets,
  onSaved,
  onOpenFullDialog,
  getViewTokensToastAction,
}: {
  generator: TokenGenerator;
  serverUrl: string;
  allSets: string[];
  onSaved: () => void;
  onOpenFullDialog: () => void;
  getViewTokensToastAction?: (
    info: GeneratorSaveSuccessInfo,
  ) => ToastAction | undefined;
}) {
  const [config, setConfig] = useState<GeneratorConfig>(() =>
    JSON.parse(JSON.stringify(generator.config)),
  );
  const [sourceToken, setSourceToken] = useState(generator.sourceToken ?? "");
  const [name, setName] = useState(generator.name);
  const [targetGroup, setTargetGroup] = useState(generator.targetGroup ?? "");
  const [targetSet, setTargetSet] = useState(generator.targetSet ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsSource = VALUE_REQUIRED_TYPES.includes(generator.type);
  const isMultiBrand = !!generator.inputTable?.rows?.length;

  const { previewDiff, previewLoading, previewError } = useGeneratorPreview({
    serverUrl,
    selectedType: generator.type,
    sourceTokenPath:
      needsSource && sourceToken.trim() ? sourceToken.trim() : undefined,
    inlineValue: !needsSource ? generator.inlineValue : undefined,
    targetGroup,
    targetSet,
    config,
    pendingOverrides: generator.overrides ?? {},
    isMultiBrand,
    inputTable: generator.inputTable,
  });

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name,
        targetGroup,
        targetSet,
        config,
      };
      if (needsSource && sourceToken.trim())
        body.sourceToken = sourceToken.trim();
      await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      dispatchToast(
        `Generator "${name.trim()}" updated`,
        "success",
        getViewTokensToastAction?.({
          targetGroup,
          targetSet,
        }),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`mt-2 border-t border-[var(--color-figma-border)] pt-2 ${GENERATOR_AUTHORING_CLASSES.root}`}>
      <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
        <div className={GENERATOR_AUTHORING_CLASSES.title}>Quick edit</div>
        <p className={GENERATOR_AUTHORING_CLASSES.description}>
          Adjust the core generator inputs inline, then save and re-run with the updated preview.
        </p>
      </div>

      {needsSource && (
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
            <label className={QE_LABEL}>Source token</label>
            <input
              type="text"
              value={sourceToken}
              onChange={(e) => setSourceToken(e.target.value)}
              placeholder="e.g. colors.brand.primary"
              className={QE_MONO_INPUT}
            />
          </div>
        </div>
      )}

      <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={QE_LABEL}>Generator settings</label>
          <QuickEditTypeFields
            type={generator.type}
            config={config}
            onChange={setConfig}
          />
        </div>
      </div>

      <div className={`${GENERATOR_AUTHORING_CLASSES.sectionCard} ${GENERATOR_AUTHORING_CLASSES.fieldGrid}`}>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={QE_LABEL}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={QE_INPUT}
          />
        </div>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={QE_LABEL}>Target group</label>
          <input
            type="text"
            value={targetGroup}
            onChange={(e) => setTargetGroup(e.target.value)}
            className={QE_MONO_INPUT}
          />
        </div>
        <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
          <label className={QE_LABEL}>Target set</label>
          <select
            value={targetSet}
            onChange={(e) => setTargetSet(e.target.value)}
            className={QE_INPUT}
          >
            {allSets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Live preview diff */}
      {!isMultiBrand && (
        <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
          <div className="flex items-center justify-between mb-1">
            <span className={QE_LABEL}>Preview changes</span>
            {previewLoading && previewDiff && (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-spin text-[var(--color-figma-text-tertiary)]"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            )}
          </div>
          {previewError ? (
            <p className="text-[10px] text-[var(--color-figma-error)]">
              {previewError}
            </p>
          ) : (
            <LiveDiffPreview diff={previewDiff} loading={previewLoading} />
          )}
        </div>
      )}

      {error && (
        <div className="text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words">
          {error}
        </div>
      )}

      <div className={AUTHORING_SURFACE_CLASSES.footer}>
        <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
          <button
            onClick={onOpenFullDialog}
            className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-text)]`}
          >
            Full settings
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`${AUTHORING_SURFACE_CLASSES.footerPrimary} rounded bg-[var(--color-figma-accent)] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50`}
          >
            {saving ? "Saving…" : "Save & re-run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generator pipeline card
// ---------------------------------------------------------------------------

export interface GeneratorPipelineCardProps {
  generator: TokenGenerator;
  isFocused?: boolean;
  focusRef?: React.RefObject<HTMLDivElement | null>;
  serverUrl: string;
  allSets: string[];
  activeSet: string;
  onRefresh: () => void;
  allTokensFlat?: Record<string, TokenMapEntry>;
  onPushUndo?: (slot: import("../hooks/useUndo").UndoSlot) => void;
  onViewTokens?: (targetGroup: string, targetSet: string) => void;
}

export function GeneratorPipelineCard({
  generator,
  isFocused,
  focusRef,
  serverUrl,
  allSets,
  activeSet,
  onRefresh,
  allTokensFlat,
  onPushUndo,
  onViewTokens,
}: GeneratorPipelineCardProps) {
  const [running, setRunning] = useState(false);
  const [, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showClonePanel, setShowClonePanel] = useState(false);
  const [cloneName, setCloneName] = useState("");
  const [cloneTargetGroup, setCloneTargetGroup] = useState("");
  const [cloneSourceToken, setCloneSourceToken] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTokensOnDelete, setDeleteTokensOnDelete] = useState(false);
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showSemanticDialog, setShowSemanticDialog] = useState(false);
  const [semanticDialogTokens, setSemanticDialogTokens] = useState<
    GeneratedTokenResult[]
  >([]);
  const [semanticDialogLoading, setSemanticDialogLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewDiff, setPreviewDiff] = useState<DryRunDiff | null>(null);
  const [showStepOverrides, setShowStepOverrides] = useState(false);
  const [stepResults, setStepResults] = useState<GeneratedTokenResult[] | null>(
    null,
  );
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepOverrideError, setStepOverrideError] = useState<string | null>(
    null,
  );
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuContainerRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuButtonRef = useRef<HTMLButtonElement>(null);
  const stepCount = getGeneratorStepCount(generator);
  const semanticAliasCount = generator.semanticLayer?.mappings.length ?? 0;
  const typeLabel = getGeneratorTypeLabel(generator.type);
  const status = getGeneratorDashboardStatus(generator);
  const isEnabled = generator.enabled !== false;
  const hasError = status === "failed" || status === "blocked";
  const isStale = status === "stale";
  const isBlocked = status === "blocked";
  const overrideCount = Object.keys(generator.overrides ?? {}).length;
  const upstreamGenerators = generator.upstreamGenerators ?? [];
  const downstreamGenerators = generator.downstreamGenerators ?? [];
  const blockedByGenerators = generator.blockedByGenerators ?? [];
  const lastRunContext =
    generator.lastRunSummary?.message ??
    generator.staleReason ??
    (status === "neverRun"
      ? "Run this generator to create its managed outputs."
      : undefined);
  const lastRunTimeLabel = formatRelativeTimestamp(generator.lastRunSummary?.at);
  const showDependencyAttention =
    (isStale || hasError) &&
    (blockedByGenerators.length > 0 || downstreamGenerators.length > 0);
  const hasSecondaryActionOpen =
    !!previewDiff || showStepOverrides || showQuickEdit || showClonePanel;
  const getViewTokensToastAction = React.useCallback(
    (info: GeneratorSaveSuccessInfo) =>
      onViewTokens
        ? {
            label: "View tokens",
            onClick: () => onViewTokens(info.targetGroup, info.targetSet),
          }
        : undefined,
    [onViewTokens],
  );
  const handleViewTokens = () => {
    onViewTokens?.(generator.targetGroup, generator.targetSet);
  };

  useEffect(() => {
    if (!actionsMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (actionsMenuContainerRef.current?.contains(event.target as Node))
        return;
      setActionsMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActionsMenuOpen(false);
        actionsMenuButtonRef.current?.focus();
        return;
      }

      if (actionsMenuRef.current) {
        handleMenuArrowKeys(event, actionsMenuRef.current);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      if (actionsMenuRef.current) {
        getMenuItems(actionsMenuRef.current)[0]?.focus();
      }
    });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsMenuOpen]);

  const handleToggleEnabled = async () => {
    setTogglingEnabled(true);
    setActionError(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !isEnabled }),
      });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleRerun = async () => {
    setRunning(true);
    setActionError(null);
    setPreviewDiff(null);
    try {
      await apiFetch(`${serverUrl}/api/generators/${generator.id}/run`, {
        method: "POST",
      });
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Re-run failed");
    } finally {
      setRunning(false);
    }
  };

  const handlePreviewOutput = async () => {
    setPreviewLoading(true);
    setActionError(null);
    try {
      const diff = await apiFetch<DryRunDiff>(
        `${serverUrl}/api/generators/${generator.id}/dry-run`,
        { method: "POST" },
      );
      setPreviewDiff(diff);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDuplicate = async (overrides?: {
    name?: string;
    targetGroup?: string;
    sourceToken?: string;
  }) => {
    setDuplicating(true);
    setActionError(null);
    try {
      const newName = overrides?.name ?? `${generator.name} (copy)`;
      const newTargetGroup =
        overrides?.targetGroup ??
        (generator.targetGroup
          ? `${generator.targetGroup}_copy`
          : `${generator.name}_copy`);
      const newSourceToken =
        overrides?.sourceToken !== undefined
          ? overrides.sourceToken.trim() || undefined
          : generator.sourceToken;
      const body = {
        type: generator.type,
        name: newName,
        sourceToken: newSourceToken,
        inlineValue: generator.inlineValue,
        targetSet: generator.targetSet,
        targetGroup: newTargetGroup,
        config: generator.config,
        semanticLayer: generator.semanticLayer ?? null,
        overrides: generator.overrides,
      };
      await apiFetch(`${serverUrl}/api/generators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowClonePanel(false);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setDuplicating(false);
    }
  };

  const handleDelete = async (deleteTokens: boolean) => {
    setDeleting(true);
    setActionError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}?deleteTokens=${deleteTokens}`,
        { method: "DELETE" },
      );
      setShowDeleteConfirm(false);
      onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const fetchStepResults = async (): Promise<GeneratedTokenResult[]> => {
    setStepsLoading(true);
    setStepOverrideError(null);
    try {
      const data = await apiFetch<{
        count: number;
        results: GeneratedTokenResult[];
      }>(`${serverUrl}/api/generators/${generator.id}/steps`);
      setStepResults(data.results);
      return data.results;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load steps";
      setStepOverrideError(message);
      throw new Error(message);
    } finally {
      setStepsLoading(false);
    }
  };

  const handleToggleSteps = () => {
    const next = !showStepOverrides;
    setShowStepOverrides(next);
    if (next && !stepResults) {
      void fetchStepResults();
    }
  };

  const handleOpenSemanticDialog = async () => {
    setSemanticDialogLoading(true);
    setActionError(null);
    try {
      const results =
        stepResults && stepResults.length > 0
          ? stepResults
          : await fetchStepResults();
      setSemanticDialogTokens(results);
      setShowSemanticDialog(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to load generator steps",
      );
    } finally {
      setSemanticDialogLoading(false);
    }
  };

  const handleSaveSemanticLayer = async (
    semanticLayer: TokenGenerator["semanticLayer"] | null,
  ) => {
    setActionError(null);
    await apiFetch(`${serverUrl}/api/generators/${generator.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ semanticLayer }),
    });
    onRefresh();
  };

  const handleStepPinChange = async (
    stepName: string,
    value: string,
    locked: boolean,
  ) => {
    setStepOverrideError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}/steps/${encodeURIComponent(stepName)}/override`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value, locked }),
        },
      );
      onRefresh();
      await fetchStepResults();
    } catch (err) {
      setStepOverrideError(
        err instanceof Error ? err.message : "Override failed",
      );
    }
  };

  const handleStepPinClear = async (stepName: string) => {
    setStepOverrideError(null);
    try {
      await apiFetch(
        `${serverUrl}/api/generators/${generator.id}/steps/${encodeURIComponent(stepName)}/override`,
        { method: "DELETE" },
      );
      onRefresh();
      await fetchStepResults();
    } catch (err) {
      setStepOverrideError(
        err instanceof Error ? err.message : "Clear override failed",
      );
    }
  };

  const handleToggleClonePanel = () => {
    if (showClonePanel) {
      setShowClonePanel(false);
      return;
    }

    setCloneName(`${generator.name} (copy)`);
    setCloneTargetGroup(generator.targetGroup ?? "");
    setCloneSourceToken(generator.sourceToken ?? "");
    setShowQuickEdit(false);
    setShowClonePanel(true);
  };

  const handleToggleQuickEdit = () => {
    setShowQuickEdit((current) => !current);
  };

  const handleOpenEditDialog = () => {
    setShowQuickEdit(false);
    setShowEditDialog(true);
  };

  const toggleActionsMenu = () => {
    setActionsMenuOpen((current) => !current);
  };

  const runMenuAction = (action: () => void) => {
    setActionsMenuOpen(false);
    action();
  };
  const sourceSummary = generator.sourceToken
    ? generator.sourceToken
    : generator.inlineValue !== undefined
      ? typeof generator.inlineValue === "string"
        ? generator.inlineValue
        : typeof generator.inlineValue === "object" &&
            generator.inlineValue !== null &&
            "value" in (generator.inlineValue as Record<string, unknown>)
          ? `${(generator.inlineValue as { value: number; unit?: string }).value}${(generator.inlineValue as { unit?: string }).unit || ""}`
          : String(generator.inlineValue)
      : "standalone";

  return (
    <div
      ref={
        isFocused ? (focusRef as React.LegacyRef<HTMLDivElement>) : undefined
      }
      className={`p-3 rounded border bg-[var(--color-figma-bg)] transition-all duration-500 ${!isEnabled ? "opacity-60 border-[var(--color-figma-border)] border-dashed" : isBlocked ? "border-amber-400/70" : hasError ? "border-[var(--color-figma-error)]" : isStale ? "border-yellow-400/70" : isFocused ? "border-[var(--color-figma-accent)] ring-1 ring-[var(--color-figma-accent)]/40" : "border-[var(--color-figma-border)]"}`}
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] font-medium border border-[var(--color-figma-accent)]/20">
              {typeLabel}
            </span>
            <span className="min-w-0 flex-1 text-[11px] font-medium text-[var(--color-figma-text)] break-words">
              {generator.name}
            </span>
            {!isEnabled && (
              <span className="shrink-0 text-[10px] font-medium text-[var(--color-figma-text-secondary)] bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] rounded px-1.5 py-px leading-none">
                Paused
              </span>
            )}
            {isEnabled && isStale && (
              <span
                title={`Source token "${generator.sourceToken}" has changed since this generator last ran. Re-run to update generated tokens.`}
                className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-yellow-600 bg-yellow-50 border border-yellow-300 rounded px-1.5 py-px leading-none"
                aria-label="Generator output may be stale"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Needs re-run
              </span>
            )}
            {isEnabled && isBlocked && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded px-1.5 py-px leading-none">
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 8a6 6 0 0 0-12 0v3a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2Z" />
                </svg>
                Blocked
              </span>
            )}
            {hasError && (
              <span
                title={generator.lastRunError?.message ?? generator.lastRunSummary?.label}
                className={`shrink-0 ${isBlocked ? "text-amber-700" : "text-[var(--color-figma-error)]"}`}
                aria-label={isBlocked ? "Generator blocked by upstream failure" : "Generator auto-run error"}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </span>
            )}
          </div>
          <div className="mt-2">
            <div className={GENERATOR_AUTHORING_CLASSES.summaryCard}>
              <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Source</span>
                <span className={generator.sourceToken ? GENERATOR_AUTHORING_CLASSES.summaryMono : GENERATOR_AUTHORING_CLASSES.summaryValue}>
                  {sourceSummary}
                </span>
              </div>
              <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Output</span>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryMono}>{generator.targetGroup}.*</span>
              </div>
              <div className={GENERATOR_AUTHORING_CLASSES.summaryRow}>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryLabel}>Set</span>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>{generator.targetSet}</span>
                <span className="text-[var(--color-figma-text-tertiary)]">·</span>
                <span className={GENERATOR_AUTHORING_CLASSES.summaryValue}>{stepCount} token{stepCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={handleToggleEnabled}
          disabled={togglingEnabled}
          title={
            isEnabled
              ? "Pause auto-run (disable generator)"
              : "Resume auto-run (enable generator)"
          }
          aria-label={isEnabled ? "Disable generator" : "Enable generator"}
          aria-pressed={isEnabled}
          className="mt-0.5 shrink-0 flex items-center justify-center w-7 h-7 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors disabled:opacity-50"
        >
          {isEnabled ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>
      </div>
      {hasError && (
        <div
          className={`mb-2 text-[10px] rounded px-2 py-1 border break-words ${isBlocked ? "text-amber-700 bg-amber-50 border-amber-200" : "text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 border-[var(--color-figma-error)]/20"}`}
        >
          {isBlocked ? "Blocked by upstream failure" : "Auto-run failed"}
          {generator.lastRunError?.message ? `: ${generator.lastRunError.message}` : ""}
        </div>
      )}
      {actionError && (
        <div className="mb-2 text-[10px] text-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 rounded px-2 py-1 border border-[var(--color-figma-error)]/20 break-words flex items-start gap-1.5">
          <span className="shrink-0 mt-px">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </span>
          <span className="flex-1">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 hover:opacity-70 transition-opacity"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        {upstreamGenerators.length > 0 && (
          <span className="px-1.5 py-px rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
            {upstreamGenerators.length} upstream
          </span>
        )}
        {downstreamGenerators.length > 0 && (
          <span className="px-1.5 py-px rounded-full border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text-secondary)]">
            {downstreamGenerators.length} dependent
            {downstreamGenerators.length === 1 ? "" : "s"}
          </span>
        )}
        {generator.lastRunSummary && (
          <span className="text-[var(--color-figma-text-tertiary)]">
            {generator.lastRunSummary.label}
            {lastRunTimeLabel ? ` · ${lastRunTimeLabel}` : ""}
          </span>
        )}
      </div>
      {(upstreamGenerators.length > 0 || downstreamGenerators.length > 0) && (
        <div className="mt-2 flex flex-col gap-1">
          <DependencyChips label="Upstream" dependencies={upstreamGenerators} />
          <DependencyChips
            label="Dependents"
            dependencies={downstreamGenerators}
          />
        </div>
      )}
      {showDependencyAttention && (
        <div className="mt-2 rounded border border-yellow-400/30 bg-yellow-400/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-text-secondary)]">
          {blockedByGenerators.length > 0 && (
            <DependencyChips
              label="Blocked by"
              dependencies={blockedByGenerators}
              tone={isBlocked ? "warning" : "neutral"}
            />
          )}
          {lastRunContext && (
            <p className={blockedByGenerators.length > 0 ? "mt-1" : ""}>
              {lastRunContext}
            </p>
          )}
          {downstreamGenerators.length > 0 && (
            <p className="mt-1">
              A retry here affects {downstreamGenerators.length} downstream
              generator{downstreamGenerators.length === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
      {semanticAliasCount > 0 && (
        <div className="mt-2 flex items-start justify-between gap-3 border-t border-[var(--color-figma-border)]/60 pt-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">
                Semantic layer
              </span>
              <span className="text-[9px] px-1 py-px rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/20">
                {semanticAliasCount} alias
                {semanticAliasCount === 1 ? "" : "es"}
              </span>
            </div>
            <div className="min-w-0">
              <p className="mt-1 text-[10px] text-[var(--color-figma-text-secondary)]">
                {generator.semanticLayer?.prefix}.* maps semantic roles onto{" "}
                {generator.targetGroup}.*
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {generator.semanticLayer?.mappings.slice(0, 3).map((mapping) => (
                  <span
                    key={mapping.semantic}
                    className="text-[9px] px-1.5 py-px rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] font-mono"
                  >
                    {generator.semanticLayer?.prefix}.{mapping.semantic}
                  </span>
                ))}
                {semanticAliasCount > 3 && (
                  <span className="text-[9px] px-1.5 py-px rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[var(--color-figma-text-tertiary)]">
                    +{semanticAliasCount - 3} more
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleOpenSemanticDialog}
            disabled={semanticDialogLoading}
            className="shrink-0 text-[10px] font-medium text-[var(--color-figma-accent)] hover:underline disabled:opacity-50"
          >
            {semanticDialogLoading ? "Loading…" : "Edit layer"}
          </button>
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRerun}
            disabled={running || previewLoading}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              isBlocked
                ? "border-amber-400/60 bg-amber-400/10 text-amber-700 hover:bg-amber-400/15"
                : isStale
                ? "border-yellow-400/60 bg-yellow-400/10 text-yellow-700 hover:bg-yellow-400/15"
                : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:border-[var(--color-figma-accent)]/30 hover:text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/6"
            }`}
            title={isBlocked ? "Retry this blocked generator" : "Run generator now"}
          >
            {running ? (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-spin"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" />
              </svg>
            ) : (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1015.5-6.36L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            )}
            {running ? "Running…" : isBlocked ? "Retry" : "Re-run"}
          </button>
          <button
            onClick={handleViewTokens}
            disabled={!onViewTokens}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-figma-border)] px-2 py-1 text-[10px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)]/30 hover:bg-[var(--color-figma-accent)]/6 hover:text-[var(--color-figma-accent)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Open the generated token group in Tokens"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
              <path d="M3 12.5 12 17l9-4.5" />
              <path d="M3 17.5 12 22l9-4.5" />
            </svg>
            View tokens
          </button>
        </div>
        <div className="relative shrink-0" ref={actionsMenuContainerRef}>
          <button
            ref={actionsMenuButtonRef}
            onClick={toggleActionsMenu}
            className={`relative flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
              actionsMenuOpen || hasSecondaryActionOpen
                ? "border-[var(--color-figma-accent)]/30 bg-[var(--color-figma-accent)]/8 text-[var(--color-figma-accent)]"
                : "border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-secondary)] hover:text-[var(--color-figma-text)]"
            }`}
            title="More generator actions"
            aria-label="More generator actions"
            aria-haspopup="menu"
            aria-expanded={actionsMenuOpen}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
            {hasSecondaryActionOpen && !actionsMenuOpen && (
              <span
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--color-figma-accent)] pointer-events-none"
                aria-hidden="true"
              />
            )}
          </button>
          {actionsMenuOpen && (
            <div
              ref={actionsMenuRef}
              className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] py-1 shadow-lg"
              role="menu"
            >
              <button
                role="menuitem"
                onClick={() =>
                  runMenuAction(
                    previewDiff
                      ? () => setPreviewDiff(null)
                      : handlePreviewOutput,
                  )
                }
                disabled={running || previewLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                title="Preview what tokens would be created, updated, or deleted without running"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {previewLoading
                  ? "Loading preview…"
                  : previewDiff
                    ? "Hide preview"
                    : "Preview output"}
              </button>
              <button
                role="menuitem"
                onClick={() => runMenuAction(handleToggleSteps)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                title="View and pin individual step values"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M8 6h13" />
                  <path d="M8 12h13" />
                  <path d="M8 18h13" />
                  <path d="M3 6h.01" />
                  <path d="M3 12h.01" />
                  <path d="M3 18h.01" />
                </svg>
                {showStepOverrides
                  ? "Hide steps"
                  : overrideCount > 0
                    ? `Show steps (${overrideCount} pinned)`
                    : "Show steps"}
              </button>
              <button
                role="menuitem"
                onClick={() => runMenuAction(handleToggleQuickEdit)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                title={
                  showQuickEdit
                    ? "Close quick edit"
                    : "Quick-edit key parameters inline"
                }
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                {showQuickEdit ? "Close quick edit" : "Quick edit"}
              </button>
              <button
                role="menuitem"
                onClick={() => runMenuAction(handleOpenEditDialog)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                title="Open full config editor, starting at step 2 (Configure) — skips target selection"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                Edit config
              </button>
              <button
                role="menuitem"
                onClick={() => runMenuAction(handleOpenSemanticDialog)}
                disabled={semanticDialogLoading}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)] disabled:opacity-40 disabled:cursor-not-allowed"
                title={
                  semanticAliasCount > 0
                    ? "Edit semantic aliases for this generator"
                    : "Add a semantic layer for this generator"
                }
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v18" />
                  <path d="M3 12h18" />
                </svg>
                {semanticDialogLoading
                  ? "Loading semantic layer…"
                  : semanticAliasCount > 0
                    ? "Edit semantic layer"
                    : "Add semantic layer"}
              </button>
              <button
                role="menuitem"
                onClick={() => runMenuAction(handleToggleClonePanel)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-text)] transition-colors hover:bg-[var(--color-figma-bg-secondary)]"
                title="Clone this generator with a new name, target group, or source token"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                {showClonePanel ? "Close clone panel" : "Clone generator"}
              </button>
              <div
                className="my-1 border-t border-[var(--color-figma-border)]"
                role="separator"
              />
              <button
                role="menuitem"
                onClick={() =>
                  runMenuAction(() => {
                    setDeleteTokensOnDelete(false);
                    setShowDeleteConfirm(true);
                  })
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-[var(--color-figma-error)] transition-colors hover:bg-[var(--color-figma-error)]/8"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 6h18" />
                  <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
                Delete generator
              </button>
            </div>
          )}
        </div>
      </div>

      {previewDiff && (
        <DryRunPreview
          diff={previewDiff}
          onConfirmRun={handleRerun}
          onClose={() => setPreviewDiff(null)}
          running={running}
        />
      )}

      {showStepOverrides && (
        <div className="mt-2 pt-2 border-t border-[var(--color-figma-border)]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">
              Step values
            </span>
            {overrideCount > 0 && (
              <span className="text-[9px] px-1 py-px rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] border border-[var(--color-figma-accent)]/20">
                {overrideCount} pinned
              </span>
            )}
            <button
              onClick={fetchStepResults}
              disabled={stepsLoading}
              className="ml-auto text-[10px] text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-50"
              title="Refresh step values"
              aria-label="Refresh step values"
            >
              {stepsLoading ? "…" : "↻"}
            </button>
          </div>
          {stepOverrideError && (
            <p className="text-[10px] text-[var(--color-figma-error)] mb-1">
              {stepOverrideError}
            </p>
          )}
          {stepsLoading && !stepResults && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">
              Loading…
            </p>
          )}
          {stepResults && stepResults.length === 0 && (
            <p className="text-[10px] text-[var(--color-figma-text-tertiary)] italic">
              No steps generated yet. Run the generator first.
            </p>
          )}
          {stepResults && stepResults.length > 0 && (
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {stepResults.map((token) => (
                <OverrideRow
                  key={token.stepName}
                  token={token}
                  override={generator.overrides?.[token.stepName]}
                  onOverrideChange={handleStepPinChange}
                  onOverrideClear={handleStepPinClear}
                >
                  {token.type === "color" &&
                    typeof token.value === "string" && (
                      <span
                        className="shrink-0 w-4 h-3 rounded-sm border border-[var(--color-figma-border)]"
                        style={{ backgroundColor: swatchBgColor(token.value) }}
                        aria-hidden="true"
                      />
                    )}
                  <span className={joinClasses(LONG_TEXT_CLASSES.monoSecondary, "flex-1")}>
                    {formatValue(token.value)}
                  </span>
                </OverrideRow>
              ))}
            </div>
          )}
        </div>
      )}

      {showQuickEdit && (
        <QuickEditPanel
          generator={generator}
          serverUrl={serverUrl}
          allSets={allSets}
          onSaved={() => {
            setShowQuickEdit(false);
            onRefresh();
          }}
          onOpenFullDialog={handleOpenEditDialog}
          getViewTokensToastAction={getViewTokensToastAction}
        />
      )}

      {showClonePanel && (
        <div className={`mt-2 border-t border-[var(--color-figma-border)] pt-2 ${GENERATOR_AUTHORING_CLASSES.root}`}>
          <div className={GENERATOR_AUTHORING_CLASSES.titleBlock}>
            <span className={GENERATOR_AUTHORING_CLASSES.title}>Clone generator</span>
            <p className={GENERATOR_AUTHORING_CLASSES.description}>
              Start from the current generator and adjust the destination details for the clone.
            </p>
          </div>
          <div className={`${GENERATOR_AUTHORING_CLASSES.sectionCard} ${GENERATOR_AUTHORING_CLASSES.fieldGrid}`}>
            <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
              <label className={QE_LABEL}>Name</label>
              <input
                type="text"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className={QE_INPUT}
                autoFocus
              />
            </div>
            <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
              <label className={QE_LABEL}>Target group</label>
              <input
                type="text"
                value={cloneTargetGroup}
                onChange={(e) => setCloneTargetGroup(e.target.value)}
                className={QE_MONO_INPUT}
                placeholder="e.g. brand-dark"
              />
            </div>
          </div>
          {generator.sourceToken !== undefined && (
            <div className={GENERATOR_AUTHORING_CLASSES.sectionCard}>
              <div className={GENERATOR_AUTHORING_CLASSES.fieldStack}>
                <label className={QE_LABEL}>Source token</label>
                <input
                  type="text"
                  value={cloneSourceToken}
                  onChange={(e) => setCloneSourceToken(e.target.value)}
                  className={QE_MONO_INPUT}
                  placeholder="e.g. colors.brand.primary"
                />
              </div>
            </div>
          )}
          <div className={AUTHORING_SURFACE_CLASSES.footer}>
            <div className={AUTHORING_SURFACE_CLASSES.footerActions}>
              <button
                onClick={() => setShowClonePanel(false)}
                className={`${AUTHORING_SURFACE_CLASSES.footerSecondary} rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] px-3 py-2 text-[11px] font-medium text-[var(--color-figma-text-secondary)] transition-colors hover:border-[var(--color-figma-accent)] hover:text-[var(--color-figma-text)]`}
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleDuplicate({
                    name: cloneName.trim(),
                    targetGroup: cloneTargetGroup.trim(),
                    sourceToken:
                      generator.sourceToken !== undefined
                        ? cloneSourceToken
                        : undefined,
                  })
                }
                disabled={duplicating || !cloneName.trim()}
                className={`${AUTHORING_SURFACE_CLASSES.footerPrimary} rounded bg-[var(--color-figma-accent)] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50`}
              >
                {duplicating ? "Cloning…" : "Clone generator"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={allSets}
          activeSet={activeSet}
          allTokensFlat={allTokensFlat}
          existingGenerator={generator}
          onClose={() => setShowEditDialog(false)}
          onSaved={() => {
            setShowEditDialog(false);
            onRefresh();
          }}
          getSuccessToastAction={getViewTokensToastAction}
          onPushUndo={onPushUndo}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete Generator"
          description={`Delete "${generator.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDelete(deleteTokensOnDelete)}
          onCancel={() => setShowDeleteConfirm(false)}
        >
          <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deleteTokensOnDelete}
              onChange={(e) => setDeleteTokensOnDelete(e.target.checked)}
              className="rounded"
            />
            <span className="text-[11px] text-[var(--color-figma-text-secondary)]">
              {semanticAliasCount > 0
                ? `Also delete generated scale tokens and ${semanticAliasCount} semantic alias${semanticAliasCount === 1 ? "" : "es"}`
                : "Also delete generated tokens"}
            </span>
          </label>
        </ConfirmModal>
      )}
      {showSemanticDialog && (
        <SemanticMappingDialog
          serverUrl={serverUrl}
          generatedTokens={semanticDialogTokens}
          generatorType={generator.type}
          targetGroup={generator.targetGroup}
          targetSet={generator.targetSet}
          initialPrefix={generator.semanticLayer?.prefix}
          initialMappings={generator.semanticLayer?.mappings}
          initialPatternId={generator.semanticLayer?.patternId ?? null}
          onSaveLayer={handleSaveSemanticLayer}
          onClose={() => setShowSemanticDialog(false)}
        />
      )}
    </div>
  );
}
