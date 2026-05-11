import { useMemo, useState } from "react";
import type { TokenMapEntry } from "../../shared/types";
import type { TokenCollection } from "@token-workshop/core";
import { hexToLuminance, wcagContrast } from "../shared/colorUtils";
import { normalizeHex, hexToLab } from "@token-workshop/core";
import { resolveTokensForModeProjection } from "../shared/collectionModeUtils";
import { isHexColorLiteral } from "../shared/colorAnalysis";
import { useTransientValue } from "../hooks/useTransientValue";

export interface ContrastMatrixPanelProps {
  /** Non-alias color tokens sorted by luminance */
  colorTokens: { path: string; collectionId: string; hex: string }[];
  collections: TokenCollection[];
  perCollectionFlat: Record<string, Record<string, TokenMapEntry>>;
  onNavigateToToken?: (path: string, collectionId: string) => void;
}

export function ContrastMatrixPanel({
  colorTokens,
  collections,
  perCollectionFlat,
  onNavigateToToken,
}: ContrastMatrixPanelProps) {
  const [showContrastMatrix, setShowContrastMatrix] = useState(false);
  const [contrastPage, setContrastPage] = useState(0);
  const [contrastFailuresOnly, setContrastFailuresOnly] = useState(false);
  const [contrastCopied, showContrastCopied] =
    useTransientValue(false, 2000);
  const [contrastGroupFilter, setContrastGroupFilter] = useState<string>("all");
  const [contrastSortMode, setContrastSortMode] = useState<
    "luminance" | "failures"
  >("luminance");
  const [contrastMultiMode, setContrastMultiMode] = useState(false);
  const [contrastModeFilter, setContrastModeFilter] =
    useState<Set<string> | null>(null);

  const allModeOptionKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const collection of collections) {
      for (const opt of collection.modes) {
        keys.add(`${collection.id}:${opt.name}`);
      }
    }
    return keys;
  }, [collections]);

  const activeContrastModeKeys = contrastModeFilter ?? allModeOptionKeys;

  const perModeResolved = useMemo(() => {
    if (!contrastMultiMode || collections.length === 0) return null;
    const result = new Map<string, Record<string, TokenMapEntry>>();
    for (const collection of collections) {
      const collectionFlat = perCollectionFlat[collection.id];
      if (!collectionFlat) continue;

      const scopedPathToCollectionId = Object.fromEntries(
        Object.keys(collectionFlat).map((path) => [path, collection.id]),
      );

      for (const opt of collection.modes) {
        const key = `${collection.id}:${opt.name}`;
        if (!activeContrastModeKeys.has(key)) continue;
        result.set(
          key,
          resolveTokensForModeProjection(
            collectionFlat,
            [collection],
            { [collection.id]: opt.name },
            scopedPathToCollectionId,
          ),
        );
      }
    }
    return result.size > 0 ? result : null;
  }, [
    contrastMultiMode,
    collections,
    activeContrastModeKeys,
    perCollectionFlat,
  ]);

  const multiModeColorTokens = useMemo(():
    | { path: string; collectionId: string; hexByMode: Map<string, string> }[]
    | null => {
    if (!perModeResolved) return null;
    const collectionsById = new Map(
      collections.map((collection) => [collection.id, collection]),
    );
    const hexByModePerToken = new Map(
      colorTokens.map((token) => [
        `${token.collectionId}::${token.path}`,
        {
          path: token.path,
          collectionId: token.collectionId,
          hexByMode: new Map<string, string>(),
        },
      ]),
    );

    for (const token of colorTokens) {
      const collection = collectionsById.get(token.collectionId);
      if (!collection) continue;

      const scopedToken = hexByModePerToken.get(
        `${token.collectionId}::${token.path}`,
      );
      if (!scopedToken) continue;

      for (const opt of collection.modes) {
        const modeKey = `${collection.id}:${opt.name}`;
        if (!activeContrastModeKeys.has(modeKey)) continue;

        const resolved = perModeResolved.get(modeKey);
        const entry = resolved?.[token.path];
        if (!entry || entry.$type !== "color") continue;

        const value = entry.$value;
        if (!isHexColorLiteral(value)) continue;

        scopedToken.hexByMode.set(modeKey, normalizeHex(value));
      }
    }

    const result = [...hexByModePerToken.values()].filter(
      (token) => token.hexByMode.size > 0,
    );
    result.sort((a, b) => {
      const avgLum = (t: typeof a) => {
        let sum = 0;
        let cnt = 0;
        for (const hex of t.hexByMode.values()) {
          const l = hexToLuminance(hex);
          if (l !== null) {
            sum += l;
            cnt++;
          }
        }
        return cnt > 0 ? sum / cnt : 0;
      };
      return avgLum(a) - avgLum(b);
    });
    return result;
  }, [activeContrastModeKeys, collections, colorTokens, perModeResolved]);

  const CONTRAST_PAGE_SIZE = 16;
  const hasMultiModeOptions = collections.some((collection) => collection.modes.length >= 2);
  const isMultiMode =
    contrastMultiMode &&
    multiModeColorTokens !== null &&
    multiModeColorTokens.length >= 2;

  const modeKeyLabel = (key: string): string => {
    const [collectionId, optName] = key.split(":");
    const collection = collections.find((item) => item.id === collectionId);
    return collections.length > 1 && collection
      ? `${collection.id}: ${optName}`
      : (optName ?? key);
  };

  type MatrixToken = {
    path: string;
    collectionId: string;
    hex: string;
    hexByMode?: Map<string, string>;
  };
  const sourceTokens: MatrixToken[] = isMultiMode
    ? multiModeColorTokens!.map((t) => {
        const firstHex =
          (t.hexByMode.values().next().value as string) ?? "#000000";
        return {
          path: t.path,
          collectionId: t.collectionId,
          hex: firstHex,
          hexByMode: t.hexByMode,
        };
      })
    : colorTokens;

  const tokenKey = (token: Pick<MatrixToken, "path" | "collectionId">) =>
    `${token.collectionId}::${token.path}`;
  const duplicatePaths = new Set(
    sourceTokens
      .map((token) => token.path)
      .filter(
        (path, index, paths) => paths.indexOf(path) !== index,
      ),
  );
  const getTokenLabel = (token: Pick<MatrixToken, "path" | "collectionId">) => {
    const leaf = token.path.split(".").pop() ?? token.path;
    return duplicatePaths.has(token.path)
      ? `${leaf} · ${token.collectionId}`
      : leaf;
  };
  const getTokenTitle = (token: Pick<MatrixToken, "path" | "collectionId">) =>
    `${token.path} (${token.collectionId})`;

  const availableGroups = Array.from(
    new Set(sourceTokens.map((t) => t.path.split(".")[0])),
  ).sort();
  const filteredTokens =
    contrastGroupFilter === "all"
      ? sourceTokens
      : sourceTokens.filter(
          (t) => t.path.split(".")[0] === contrastGroupFilter,
        );

  const getCellContrast = (
    fg: MatrixToken,
    bg: MatrixToken,
  ): {
    ratio: number | null;
    tooltip: string;
    failingModeCount: number;
    totalModeCount: number;
  } => {
    if (isMultiMode && fg.hexByMode && bg.hexByMode && perModeResolved) {
      const perMode: { label: string; ratio: number | null }[] = [];
      for (const modeKey of perModeResolved.keys()) {
        const fgHex = fg.hexByMode.get(modeKey);
        const bgHex = bg.hexByMode.get(modeKey);
        perMode.push({
          label: modeKeyLabel(modeKey),
          ratio: fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null,
        });
      }
      const valid = perMode.filter(
        (t): t is { label: string; ratio: number } => t.ratio !== null,
      );
      const minRatio =
        valid.length > 0 ? Math.min(...valid.map((t) => t.ratio)) : null;
      const failCount = valid.filter((t) => t.ratio < 4.5).length;
      const tooltip = perMode
        .map(
          (t) =>
            `${t.label}: ${t.ratio !== null ? t.ratio.toFixed(1) + ":1" : "N/A"}`,
        )
        .join(" | ");
      return {
        ratio: minRatio,
        tooltip,
        failingModeCount: failCount,
        totalModeCount: valid.length,
      };
    }
    const r = wcagContrast(fg.hex, bg.hex);
    return {
      ratio: r,
      tooltip: `${getTokenTitle(fg)} on ${getTokenTitle(bg)}: ${r?.toFixed(2)}:1`,
      failingModeCount: 0,
      totalModeCount: 0,
    };
  };

  const navigateToToken = (token: Pick<MatrixToken, "path" | "collectionId">) => {
    if (!onNavigateToToken) return;
    onNavigateToToken(token.path, token.collectionId);
  };

  const canNavigateToToken = (token: Pick<MatrixToken, "path" | "collectionId">) =>
    Boolean(onNavigateToToken && token.collectionId);

  type FailPair = {
    fg: MatrixToken;
    bg: MatrixToken;
    ratio: number;
    failingModeCount: number;
    totalModeCount: number;
    suggestedFix: { path: string; collectionId: string; hex: string } | null;
  };

  const computeExpensiveData = () => {
    let tokens: MatrixToken[];
    if (contrastSortMode === "failures") {
      const failureCounts = new Map<string, number>();
      for (const t of filteredTokens) {
        let cnt = 0;
        for (const other of filteredTokens) {
          if (tokenKey(other) === tokenKey(t)) continue;
          const { ratio } = getCellContrast(t, other);
          if (ratio !== null && ratio < 4.5) cnt++;
        }
        failureCounts.set(tokenKey(t), cnt);
      }
      tokens = [...filteredTokens].sort(
        (a, b) =>
          (failureCounts.get(tokenKey(b)) ?? 0) -
          (failureCounts.get(tokenKey(a)) ?? 0),
      );
    } else {
      tokens = filteredTokens;
    }

    const findNearestPassingFg = (
      fg: MatrixToken,
      bg: MatrixToken,
      candidates: MatrixToken[],
    ): { path: string; collectionId: string; hex: string } | null => {
      const fgLab = hexToLab(fg.hex);
      if (!fgLab) return null;
      let best:
        | { path: string; collectionId: string; hex: string; deltaE: number }
        | null = null;
      for (const candidate of candidates) {
        if (tokenKey(candidate) === tokenKey(fg)) continue;
        let passes = false;
        if (
          isMultiMode &&
          candidate.hexByMode &&
          bg.hexByMode &&
          perModeResolved
        ) {
          passes = true;
          for (const modeKey of perModeResolved.keys()) {
            const cHex = candidate.hexByMode.get(modeKey);
            const bgHex = bg.hexByMode.get(modeKey);
            if (!cHex || !bgHex) {
              passes = false;
              break;
            }
            const r = wcagContrast(cHex, bgHex);
            if (r === null || r < 4.5) {
              passes = false;
              break;
            }
          }
        } else {
          const r = wcagContrast(candidate.hex, bg.hex);
          passes = r !== null && r >= 4.5;
        }
        if (!passes) continue;
        const candLab = hexToLab(candidate.hex);
        if (!candLab) continue;
        const dL = candLab[0] - fgLab[0],
          da = candLab[1] - fgLab[1],
          db = candLab[2] - fgLab[2];
        const deltaE = Math.sqrt(dL * dL + da * da + db * db);
        if (best === null || deltaE < best.deltaE)
          best = {
            path: candidate.path,
            collectionId: candidate.collectionId,
            hex: candidate.hex,
            deltaE,
          };
      }
      return best
        ? {
            path: best.path,
            collectionId: best.collectionId,
            hex: best.hex,
          }
        : null;
    };

    const pairs: FailPair[] = [];
    for (let i = 0; i < tokens.length; i++) {
      for (let j = 0; j < tokens.length; j++) {
        if (i === j) continue;
        const { ratio, failingModeCount, totalModeCount } = getCellContrast(
          tokens[i],
          tokens[j],
        );
        if (ratio !== null && ratio < 4.5) {
          const suggestedFix = findNearestPassingFg(
            tokens[i],
            tokens[j],
            tokens,
          );
          pairs.push({
            fg: tokens[i],
            bg: tokens[j],
            ratio,
            failingModeCount,
            totalModeCount,
            suggestedFix,
          });
        }
      }
    }
    pairs.sort((a, b) => a.ratio - b.ratio);
    return { displayTokens: tokens, allFailingPairs: pairs };
  };

  const { displayTokens, allFailingPairs } = showContrastMatrix
    ? computeExpensiveData()
    : { displayTokens: filteredTokens, allFailingPairs: [] as FailPair[] };

  const totalPages = Math.ceil(displayTokens.length / CONTRAST_PAGE_SIZE);
  const pageStart = contrastPage * CONTRAST_PAGE_SIZE;
  const pagedTokens = displayTokens.slice(
    pageStart,
    pageStart + CONTRAST_PAGE_SIZE,
  );

  if (colorTokens.length < 2) return null;

  return (
    <div className="rounded border border-[var(--color-figma-border)] overflow-hidden mb-2">
      <button
        onClick={() => setShowContrastMatrix((v) => !v)}
        className="w-full px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between text-secondary text-[color:var(--color-figma-text-secondary)] font-medium"
      >
        <span className="text-[color:var(--color-figma-text)] text-left">
            Contrast Matrix ({contrastGroupFilter === "all"
              ? sourceTokens.length
              : displayTokens.length}{" "}
            tokens{isMultiMode
              ? ` · ${activeContrastModeKeys.size} mode${activeContrastModeKeys.size !== 1 ? "s" : ""}`
              : ""})
        </span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          className={`transition-transform ${showContrastMatrix ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
      </button>
      {showContrastMatrix && (
        <div className="overflow-auto max-h-96 p-2">
          {/* Cross-mode toggle */}
          {hasMultiModeOptions && (
            <div className="flex items-center gap-2 mb-2 px-1 pb-2 border-b border-[var(--color-figma-border)]">
              <button
                onClick={() => {
                  setContrastMultiMode((v) => !v);
                  setContrastPage(0);
                  setContrastModeFilter(null);
                }}
                className={`flex items-center gap-1.5 px-2 py-0.5 text-secondary rounded border transition-colors ${contrastMultiMode ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                title="Check contrast across multiple mode options simultaneously — shows worst-case ratio"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="12" r="7" />
                  <circle cx="15" cy="12" r="7" />
                </svg>
                Cross-mode
              </button>
              {contrastMultiMode && (
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                  {collections.map((collection) =>
                    collection.modes.length >= 2 ? (
                      <div
                        key={collection.id}
                        className="flex items-center gap-1 flex-wrap"
                      >
                        {collections.length > 1 && (
                          <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                            {collection.id}:
                          </span>
                        )}
                        {collection.modes.map(
                          (opt: TokenCollection["modes"][number]) => {
                            const key = `${collection.id}:${opt.name}`;
                            const isActive = activeContrastModeKeys.has(key);
                            return (
                              <button
                                key={key}
                                onClick={() => {
                                  setContrastPage(0);
                                  setContrastModeFilter((prev) => {
                                    const current = prev ?? allModeOptionKeys;
                                    const next = new Set(current);
                                    if (next.has(key)) {
                                      if (next.size > 1) next.delete(key);
                                    } else {
                                      next.add(key);
                                    }
                                    return next;
                                  });
                                }}
                                className={`px-1.5 py-0.5 text-[var(--font-size-xs)] rounded border transition-colors ${isActive ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                              >
                                {opt.name}
                              </button>
                            );
                          },
                        )}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          )}
          {contrastMultiMode && multiModeColorTokens === null && (
            <div className="text-secondary text-[color:var(--color-figma-text-secondary)] px-1 mb-2">
              Resolving collection modes…
            </div>
          )}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              onClick={() => {
                setContrastFailuresOnly((v) => !v);
                setContrastPage(0);
              }}
              className={`flex items-center gap-1 px-2 py-0.5 text-secondary rounded border transition-colors ${contrastFailuresOnly ? "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[color:var(--color-figma-text-error)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
            >
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
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              Failures only
              {contrastFailuresOnly && allFailingPairs.length > 0
                ? ` (${allFailingPairs.length})`
                : ""}
            </button>
            <button
              onClick={() => {
                const rows: string[] = isMultiMode
                  ? ["fg_token,bg_token,mode,contrast_ratio,level"]
                  : ["fg_token,bg_token,contrast_ratio,level"];
                for (const fg of displayTokens) {
                  for (const bg of displayTokens) {
                    if (tokenKey(fg) === tokenKey(bg)) continue;
                    if (
                      isMultiMode &&
                      fg.hexByMode &&
                      bg.hexByMode &&
                      perModeResolved
                    ) {
                      for (const modeKey of perModeResolved.keys()) {
                        const fgHex = fg.hexByMode.get(modeKey);
                        const bgHex = bg.hexByMode.get(modeKey);
                        const r =
                          fgHex && bgHex ? wcagContrast(fgHex, bgHex) : null;
                        const level =
                          r === null
                            ? "N/A"
                            : r >= 7
                              ? "AAA"
                              : r >= 4.5
                                ? "AA"
                                : "Fail";
                        rows.push(
                          `"${fg.path}","${bg.path}","${modeKeyLabel(modeKey)}",${r !== null ? r.toFixed(2) : ""},"${level}"`,
                        );
                      }
                    } else {
                      const r = wcagContrast(fg.hex, bg.hex);
                      const level =
                        r === null
                          ? "N/A"
                          : r >= 7
                            ? "AAA"
                            : r >= 4.5
                              ? "AA"
                              : "Fail";
                      rows.push(
                        `"${fg.path}","${bg.path}",${r !== null ? r.toFixed(2) : ""},"${level}"`,
                      );
                    }
                  }
                }
                navigator.clipboard.writeText(rows.join("\n")).then(() => {
                  showContrastCopied(true);
                });
              }}
              className="flex items-center gap-1 px-2 py-0.5 text-secondary rounded border border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
            >
              <svg
                width="8"
                height="8"
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
              {contrastCopied ? "Copied!" : "Copy as CSV"}
            </button>
          </div>
          {availableGroups.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                  Group:
                </span>
                <button
                  onClick={() => {
                    setContrastGroupFilter("all");
                    setContrastPage(0);
                  }}
                  className={`px-1.5 py-0.5 text-[var(--font-size-xs)] rounded border transition-colors ${contrastGroupFilter === "all" ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                >
                  All
                </button>
                {availableGroups.map((g) => (
                  <button
                    key={g}
                    onClick={() => {
                      setContrastGroupFilter(g);
                      setContrastPage(0);
                    }}
                    className={`px-1.5 py-0.5 text-[var(--font-size-xs)] rounded border transition-colors ${contrastGroupFilter === g ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                  Sort:
                </span>
                <button
                  onClick={() => {
                    setContrastSortMode("luminance");
                    setContrastPage(0);
                  }}
                  className={`px-1.5 py-0.5 text-[var(--font-size-xs)] rounded border transition-colors ${contrastSortMode === "luminance" ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                >
                  Luminance
                </button>
                <button
                  onClick={() => {
                    setContrastSortMode("failures");
                    setContrastPage(0);
                  }}
                  className={`px-1.5 py-0.5 text-[var(--font-size-xs)] rounded border transition-colors ${contrastSortMode === "failures" ? "border-[var(--color-figma-error)] bg-[var(--color-figma-error)]/10 text-[color:var(--color-figma-text-error)]" : "border-[var(--color-figma-border)] text-[color:var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                >
                  Most failures
                </button>
              </div>
            </div>
          )}
          {contrastFailuresOnly ? (
            allFailingPairs.length === 0 ? (
              <div className="text-secondary text-[color:var(--color-figma-text-secondary)] text-center py-4">
                All pairs pass AA (4.5:1+)
              </div>
            ) : (
              <table
                className="text-[var(--font-size-xs)] border-collapse w-full"
                aria-label="Failing color contrast pairs"
              >
                <thead>
                  <tr className="text-[color:var(--color-figma-text-secondary)]">
                    <th
                      scope="col"
                      className="px-1 py-0.5 text-left font-normal"
                    >
                      Foreground
                    </th>
                    <th
                      scope="col"
                      className="px-1 py-0.5 text-left font-normal"
                    >
                      Background
                    </th>
                    <th
                      scope="col"
                      className="px-1 py-0.5 text-right font-normal"
                    >
                      Worst ratio
                    </th>
                    {isMultiMode && (
                      <th
                        scope="col"
                        className="px-1 py-0.5 text-right font-normal"
                      >
                        Fails in
                      </th>
                    )}
                    <th
                      scope="col"
                      className="px-1 py-0.5 text-left font-normal"
                    >
                      Suggested fg
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allFailingPairs.map(
                    ({
                      fg,
                      bg,
                      ratio,
                      failingModeCount,
                      totalModeCount,
                      suggestedFix,
                    }) => {
                      const fixRatio = suggestedFix
                        ? wcagContrast(suggestedFix.hex, bg.hex)
                        : null;
                      return (
                        <tr
                          key={`${tokenKey(fg)}|${tokenKey(bg)}`}
                          className="border-t border-[var(--color-figma-border)]"
                        >
                          <td className="px-1 py-0.5">
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-1 min-w-0">
                                <div
                                  className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                  style={{ background: fg.hex }}
                                />
                                <span
                                  className="text-[color:var(--color-figma-text-secondary)] truncate max-w-[80px]"
                                  title={getTokenTitle(fg)}
                                >
                                  {getTokenLabel(fg)}
                                </span>
                              </div>
                              {canNavigateToToken(fg) && (
                                <button
                                  onClick={() => navigateToToken(fg)}
                                  className="text-[var(--font-size-xs)] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                                  title={`Go to ${getTokenTitle(fg)}`}
                                >
                                  Go
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-0.5">
                            <div className="flex items-center gap-1">
                              <div
                                className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                style={{ background: bg.hex }}
                              />
                              <span
                                className="text-[color:var(--color-figma-text-secondary)] truncate max-w-[80px]"
                                title={getTokenTitle(bg)}
                              >
                                {getTokenLabel(bg)}
                              </span>
                            </div>
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <span className="text-[color:var(--color-figma-text-error)]">
                              {ratio.toFixed(1)}:1
                            </span>
                          </td>
                          {isMultiMode && (
                            <td className="px-1 py-0.5 text-right text-[color:var(--color-figma-text-secondary)]">
                              {failingModeCount}/{totalModeCount}
                            </td>
                          )}
                          <td className="px-1 py-0.5">
                            {suggestedFix ? (
                              <div
                                className="flex items-center gap-1"
                                title={`${getTokenTitle(suggestedFix)} — ${fixRatio !== null ? fixRatio.toFixed(1) + ":1" : ""}`}
                              >
                                <div
                                  className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                  style={{ background: suggestedFix.hex }}
                                />
                                <span
                                  className="text-[color:var(--color-figma-text-secondary)] truncate max-w-[80px]"
                                  title={getTokenTitle(suggestedFix)}
                                >
                                  {getTokenLabel(suggestedFix)}
                                </span>
                                {fixRatio !== null && (
                                  <span className="text-[color:var(--color-figma-text-success)] shrink-0">
                                    {fixRatio.toFixed(1)}:1
                                  </span>
                                )}
                                {canNavigateToToken(suggestedFix) && (
                                  <button
                                    onClick={() => navigateToToken(suggestedFix)}
                                    className="text-[var(--font-size-xs)] px-1.5 py-0.5 rounded border border-[var(--color-figma-accent)] text-[color:var(--color-figma-text-accent)] hover:bg-[var(--color-figma-accent)]/10 transition-colors shrink-0"
                                    title={`Go to ${getTokenTitle(suggestedFix)}`}
                                  >
                                    Go
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-[color:var(--color-figma-text-secondary)] opacity-40">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            )
          ) : (
            <>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-secondary text-[color:var(--color-figma-text-secondary)]">
                    Tokens {pageStart + 1}–
                    {Math.min(
                      pageStart + CONTRAST_PAGE_SIZE,
                      displayTokens.length,
                    )}{" "}
                    of {displayTokens.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setContrastPage((p) => Math.max(0, p - 1))}
                      disabled={contrastPage === 0}
                      className="px-1.5 py-0.5 text-secondary rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)]"
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => setContrastPage(i)}
                        className={`px-1.5 py-0.5 text-secondary rounded border ${i === contrastPage ? "border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/10 text-[color:var(--color-figma-text-accent)]" : "border-[var(--color-figma-border)] hover:bg-[var(--color-figma-bg-hover)]"}`}
                        aria-label={`Page ${i + 1}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        setContrastPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={contrastPage === totalPages - 1}
                      className="px-1.5 py-0.5 text-secondary rounded border border-[var(--color-figma-border)] disabled:opacity-30 hover:bg-[var(--color-figma-bg-hover)]"
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
              <table
                className="text-[var(--font-size-xs)] border-collapse"
                aria-label="Color contrast matrix"
              >
                <thead>
                  <tr>
                    <th
                      scope="col"
                      className="px-1 py-0.5 text-left text-[color:var(--color-figma-text-secondary)] font-normal sticky left-0 bg-[var(--color-figma-bg)]"
                    >
                      FG \ BG
                    </th>
                    {pagedTokens.map((bg) => (
                      <th
                        key={tokenKey(bg)}
                        scope="col"
                        title={getTokenTitle(bg)}
                        className="px-1 py-0.5 text-center font-normal max-w-[40px]"
                      >
                        <div
                          className="w-4 h-4 rounded border border-[var(--color-figma-border)] mx-auto"
                          style={{ background: bg.hex }}
                          aria-hidden="true"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedTokens.map((fg) => (
                    <tr key={tokenKey(fg)}>
                      <th
                        scope="row"
                        className="px-1 py-0.5 sticky left-0 bg-[var(--color-figma-bg)] font-normal"
                      >
                        <div className="flex items-center gap-1">
                          <div
                            className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                            style={{ background: fg.hex }}
                            aria-hidden="true"
                          />
                          <span
                            className="text-[color:var(--color-figma-text-secondary)] truncate max-w-[60px]"
                            title={getTokenTitle(fg)}
                          >
                            {getTokenLabel(fg)}
                          </span>
                        </div>
                      </th>
                      {pagedTokens.map((bg) => {
                        if (tokenKey(fg) === tokenKey(bg))
                          return (
                            <td
                              key={tokenKey(bg)}
                              className="px-1 py-0.5 text-center bg-[var(--color-figma-bg-hover)]"
                              aria-label="same token"
                            >
                              —
                            </td>
                          );
                        const {
                          ratio: r,
                          tooltip,
                          failingModeCount,
                          totalModeCount,
                        } = getCellContrast(fg, bg);
                        const aa = r !== null && r >= 4.5;
                        const aaa = r !== null && r >= 7;
                        const partialFail =
                          isMultiMode && aa && failingModeCount > 0;
                        return (
                          <td
                            key={tokenKey(bg)}
                            title={tooltip}
                            className={`px-1 py-0.5 text-center ${aaa ? "bg-[var(--color-figma-success)]/20" : aa ? (partialFail ? "bg-[var(--color-figma-warning)]/20" : "bg-[var(--color-figma-warning)]/10") : "bg-[var(--color-figma-error)]/10"}`}
                          >
                            <span
                              className={
                                aaa
                                  ? "text-[color:var(--color-figma-text-success)]"
                                  : aa
                                    ? partialFail
                                      ? "text-[color:var(--color-figma-text-warning)]"
                                      : "text-[color:var(--color-figma-text-warning)]"
                                    : "text-[color:var(--color-figma-text-error)]"
                              }
                              aria-hidden="true"
                            >
                              {r !== null ? r.toFixed(1) : "—"}
                            </span>
                            {isMultiMode &&
                              !aaa &&
                              failingModeCount > 0 &&
                              totalModeCount > 0 && (
                                <span className="block text-[var(--font-size-xs)] leading-none mt-0.5 text-[color:var(--color-figma-text-secondary)]">
                                  {failingModeCount}/{totalModeCount}
                                </span>
                              )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-3 mt-2 px-1 text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-[var(--color-figma-success)]/20 border border-[var(--color-figma-success)]/40" />
                  AAA (≥7:1)
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-[var(--color-figma-warning)]/10 border border-[var(--color-figma-warning)]/40" />
                  AA (≥4.5:1)
                </span>
                {isMultiMode && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-[var(--color-figma-warning)]/20 border border-[var(--color-figma-warning)]/40" />
                    AA in some modes
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded bg-[var(--color-figma-error)]/10 border border-[var(--color-figma-error)]/30" />
                  Fail
                </span>
              </div>
              {isMultiMode && (
                <p className="mt-1 px-1 text-[var(--font-size-xs)] text-[color:var(--color-figma-text-secondary)]">
                  Ratio shown is the worst case across selected modes. Hover a
                  cell to see the per-mode breakdown.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
