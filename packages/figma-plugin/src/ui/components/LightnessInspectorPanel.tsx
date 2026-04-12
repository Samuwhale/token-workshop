import { useState } from "react";
import { hexToLstar } from "../shared/colorUtils";

export interface ColorScaleStep {
  path: string;
  label: string;
  hex: string;
}

export interface ColorScale {
  parent: string;
  steps: ColorScaleStep[];
}

export interface LightnessInspectorPanelProps {
  colorScales: ColorScale[];
  onNavigateToToken?: (path: string) => void;
}

export function LightnessInspectorPanel({
  colorScales,
  onNavigateToToken,
}: LightnessInspectorPanelProps) {
  const [showScaleInspector, setShowScaleInspector] = useState(false);

  if (colorScales.length === 0) return null;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowScaleInspector((v) => !v)}
        className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] font-medium"
      >
        <span className="text-left">
          <span className="text-[var(--color-figma-text)]">
            Color Scale Lightness ({colorScales.length} scale
            {colorScales.length !== 1 ? "s" : ""})
          </span>
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          className={`transition-transform ${showScaleInspector ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      {showScaleInspector && (
        <div className="divide-y divide-[var(--color-figma-border)] p-3 flex flex-col gap-4">
          {colorScales.map(({ parent, steps }) => {
            const lValues = steps.map((s) => ({
              label: s.label,
              hex: s.hex,
              l: hexToLstar(s.hex) ?? 0,
            }));
            const lMin = Math.min(...lValues.map((v) => v.l));
            const lMax = Math.max(...lValues.map((v) => v.l));
            const range = lMax - lMin || 1;
            const gaps = lValues
              .slice(1)
              .map((v, i) => Math.abs(v.l - lValues[i].l));
            const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const anomalyPairs = steps.slice(1).flatMap((step, index) => {
              const previousStep = steps[index];
              const currentValue = lValues[index + 1];
              const previousValue = lValues[index];
              if (Math.abs(currentValue.l - previousValue.l) <= avgGap * 2)
                return [];
              return [{ fromPath: previousStep.path, toPath: step.path }];
            });
            const W = 200,
              H = 40;
            const pts = lValues.map((v, i) => {
              const isAnom =
                i > 0 && Math.abs(v.l - lValues[i - 1].l) > avgGap * 2;
              const x = (i / (lValues.length - 1)) * W;
              const y = H - ((v.l - lMin) / range) * H;
              return {
                x,
                y,
                l: v.l,
                label: v.label,
                hex: v.hex,
                path: steps[i]?.path ?? "",
                isAnom,
              };
            });
            const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
            return (
              <div key={parent}>
                <div className="text-[10px] font-medium text-[var(--color-figma-text)] mb-2">
                  {parent}
                </div>
                <div
                  className="relative inline-block"
                  style={{ width: W, height: H + 16 }}
                >
                  <svg width={W} height={H + 16} className="overflow-visible">
                    <polyline
                      points={polyline}
                      fill="none"
                      stroke="var(--color-figma-accent)"
                      strokeWidth="1.5"
                    />
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={p.isAnom ? 4 : 3}
                          fill={p.isAnom ? "#ef4444" : p.hex}
                          stroke={
                            p.isAnom ? "#ef4444" : "var(--color-figma-border)"
                          }
                          strokeWidth="1"
                        />
                        <text
                          x={p.x}
                          y={H + 12}
                          textAnchor="middle"
                          fontSize="7"
                          fill="var(--color-figma-text-secondary)"
                        >
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                  {onNavigateToToken &&
                    pts
                      .filter((p) => p.isAnom)
                      .map((p) => (
                        <button
                          key={`${parent}:${p.path}`}
                          type="button"
                          onClick={() => onNavigateToToken(p.path)}
                          title={`Go to ${p.path}`}
                          aria-label={`Go to ${p.path}`}
                          className="absolute h-4 -translate-x-1/2 -translate-y-1/2 rounded border border-[var(--color-figma-accent)] bg-[var(--color-figma-bg)] px-1 text-[8px] font-medium leading-none text-[var(--color-figma-accent)] transition-colors hover:bg-[var(--color-figma-accent)]/10"
                          style={{
                            left: Math.min(Math.max(p.x + 14, 16), W - 16),
                            top: Math.max(p.y - 8, 8),
                          }}
                        >
                          Go
                        </button>
                      ))}
                </div>
                {pts.some((p) => p.isAnom) && (
                  <div className="text-[10px] text-[var(--color-figma-warning)] mt-1 flex items-start gap-1">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                    >
                      <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <div className="flex flex-col gap-1">
                      <span>Uneven lightness jumps between these tokens:</span>
                      <div className="flex flex-wrap gap-1">
                        {anomalyPairs.map(({ fromPath, toPath }) => (
                          <span
                            key={`${fromPath}->${toPath}`}
                            className="rounded border border-[var(--color-figma-warning)]/35 bg-[var(--color-figma-warning)]/10 px-1.5 py-0.5 font-mono text-[9px] leading-none"
                          >
                            {fromPath} → {toPath}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
