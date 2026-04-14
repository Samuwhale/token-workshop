import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import { createGeneratorOwnershipKey, type ThemeDimension } from "@tokenmanager/core";
import type { TokenGenerator } from "../hooks/useGenerators";
import type { LintViolation } from "../hooks/useLint";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import { ValuePreview } from "./ValuePreview";
import {
  resolveTokenValue,
  isAlias,
  buildResolutionChain,
  buildSetThemeMap,
} from "../../shared/resolveAlias";
import { formatDisplayPath, formatValue } from "./tokenListUtils";
import { TokenHistorySection } from "./TokenHistorySection";
import { stableStringify } from "../shared/utils";
import { buildTokenDependencySnapshot } from "./TokenFlowPanel";

interface TokenDetailPreviewProps {
  tokenPath: string;
  tokenName?: string;
  setName: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToSet?: Record<string, string>;
  dimensions?: ThemeDimension[];
  activeThemes?: Record<string, string>;
  tokenUsageCounts?: Record<string, number>;
  generators?: TokenGenerator[];
  generatorsBySource?: Map<string, TokenGenerator[]>;
  derivedTokenPaths?: Map<string, TokenGenerator>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  /** Server URL for fetching token value history. When omitted, history section is hidden. */
  serverUrl?: string;
  onEdit: () => void;
  onClose: () => void;
  onNavigateToAlias?: (path: string) => void;
  onNavigateToGenerator?: (generatorId: string) => void;
}

function GeneratorReferenceChip({
  generator,
  onNavigateToGenerator,
}: {
  generator: TokenGenerator;
  onNavigateToGenerator?: (generatorId: string) => void;
}) {
  const className =
    "inline-flex items-center gap-1 rounded bg-[var(--color-figma-bg-hover)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-text)]";

  if (!onNavigateToGenerator) {
    return (
      <span className={className} title={generator.name}>
        <svg
          className="shrink-0"
          width="7"
          height="7"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <circle cx="5" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
        </svg>
        <span className="truncate">{generator.name}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onNavigateToGenerator(generator.id)}
      className={`${className} text-[var(--color-figma-accent)] hover:underline`}
      title={generator.name}
    >
      <svg
        className="shrink-0"
        width="7"
        height="7"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <circle cx="5" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="M5 3.5V6M5 6L2 6.5M5 6L8 6.5" />
      </svg>
      <span className="truncate">{generator.name}</span>
    </button>
  );
}

export function TokenDetailPreview({
  tokenPath,
  tokenName,
  setName,
  allTokensFlat,
  pathToSet,
  dimensions,
  activeThemes,
  tokenUsageCounts,
  generators,
  generatorsBySource,
  derivedTokenPaths,
  lintViolations = [],
  syncSnapshot,
  serverUrl,
  onEdit,
  onClose,
  onNavigateToAlias,
  onNavigateToGenerator,
}: TokenDetailPreviewProps) {
  const entry = allTokensFlat[tokenPath];
  const name = tokenName ?? tokenPath.split(".").pop() ?? tokenPath;
  const type = entry?.$type ?? "unknown";
  const rawValue = entry?.$value;

  const setThemeMap = useMemo(
    () =>
      dimensions?.length && activeThemes
        ? buildSetThemeMap(dimensions, activeThemes)
        : undefined,
    [dimensions, activeThemes],
  );
  const resolutionSteps = useMemo(() => {
    if (!rawValue || !isAlias(rawValue)) return null;
    return buildResolutionChain(
      tokenPath,
      rawValue,
      type,
      allTokensFlat,
      pathToSet,
      setThemeMap,
    );
  }, [tokenPath, rawValue, type, allTokensFlat, pathToSet, setThemeMap]);

  const resolved = useMemo(() => {
    if (!rawValue) return null;
    if (!isAlias(rawValue)) return null;
    const r = resolveTokenValue(String(rawValue), type, allTokensFlat);
    return r.error ? null : r;
  }, [rawValue, type, allTokensFlat]);

  const resolvedValue = resolved?.value ?? rawValue;

  const displayPath = useMemo(
    () => formatDisplayPath(tokenPath, name),
    [tokenPath, name],
  );

  const valueStr = useMemo(() => {
    if (rawValue == null) return "—";
    if (typeof rawValue === "object") return JSON.stringify(rawValue, null, 2);
    return String(rawValue);
  }, [rawValue]);

  const tokenSet = pathToSet?.[tokenPath] ?? setName;
  const entryMeta = entry as TokenMapEntry & {
    $description?: string;
    $extensions?: { tokenmanager?: Record<string, unknown> };
  };
  const dependencySnapshot = useMemo(
    () =>
      buildTokenDependencySnapshot(tokenPath, allTokensFlat, pathToSet ?? {}),
    [tokenPath, allTokensFlat, pathToSet],
  );
  const dependentNodes = dependencySnapshot?.dependentNodes ?? [];
  const tokenManagerExt = entryMeta.$extensions?.tokenmanager;
  const directAliasPath =
    typeof rawValue === "string" && isAlias(rawValue)
      ? rawValue.slice(1, -1)
      : null;
  const lifecycle =
    typeof tokenManagerExt?.lifecycle === "string"
      ? tokenManagerExt.lifecycle
      : null;
  const provenance =
    typeof tokenManagerExt?.source === "string" ? tokenManagerExt.source : null;
  const extendsPath =
    typeof tokenManagerExt?.extends === "string"
      ? tokenManagerExt.extends
      : null;
  const sourceGenerators = useMemo(() => {
    if (generatorsBySource) return generatorsBySource.get(tokenPath) ?? [];
    return (generators ?? []).filter(
      (generator) => generator.sourceToken === tokenPath,
    );
  }, [generatorsBySource, generators, tokenPath]);
  const derivedGenerator =
    derivedTokenPaths?.get(createGeneratorOwnershipKey(tokenSet, tokenPath));
  const usageCount = tokenUsageCounts?.[tokenPath] ?? 0;
  const syncChanged = useMemo(() => {
    if (!syncSnapshot || !(tokenPath in syncSnapshot)) return false;
    return syncSnapshot[tokenPath] !== stableStringify(rawValue);
  }, [syncSnapshot, tokenPath, rawValue]);
  const lintTone = useMemo(() => {
    if (lintViolations.some((violation) => violation.severity === "error"))
      return "error";
    if (lintViolations.some((violation) => violation.severity === "warning"))
      return "warning";
    if (lintViolations.length > 0) return "info";
    return null;
  }, [lintViolations]);
  const provenanceLabel = provenance
    ? ((
        {
          "figma-variables": "Figma variables",
          "figma-styles": "Figma styles",
          json: "JSON import",
          css: "CSS import",
          tailwind: "Tailwind import",
        } as Record<string, string>
      )[provenance] ?? provenance)
    : null;

  if (!entry) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)]">
          <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate">
            Token not found
          </span>
          <button
            onClick={onClose}
            className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]"
            title="Close"
            aria-label="Close"
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
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-[10px] text-[var(--color-figma-text-tertiary)]">
          Token not found
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-figma-border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate mr-2">
          {name}
        </span>
        <button
          onClick={onClose}
          className="text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] shrink-0"
          title="Close"
          aria-label="Close"
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
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Token path + type */}
        <div className="px-3 pt-2 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <ValuePreview type={type} value={resolvedValue} />
            <div
              className="text-[10px] text-[var(--color-figma-text-tertiary)] font-mono truncate flex-1 min-w-0"
              title={tokenPath}
            >
              {displayPath}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[type] ?? "token-type-string"}`}
            >
              {type}
            </span>
            <span className="text-[8px] text-[var(--color-figma-text-tertiary)]">
              {tokenSet}
            </span>
          </div>
          {(lintViolations.length > 0 || syncChanged) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {lintViolations.length > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    lintTone === "error"
                      ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
                      : lintTone === "warning"
                        ? "bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]"
                        : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
                  }`}
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
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                  </svg>
                  {lintViolations.length === 1
                    ? "1 issue"
                    : `${lintViolations.length} issues`}
                </span>
              )}
              {syncChanged && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-figma-warning)]/10 px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-figma-warning)]">
                  <span
                    className="h-2 w-2 rounded-full bg-current"
                    aria-hidden="true"
                  />
                  Unsynced
                </span>
              )}
            </div>
          )}
        </div>

        {lintViolations.length > 0 && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            <div className="flex flex-col gap-1.5">
              {lintViolations.map((violation, index) => (
                <div
                  key={`${violation.path}-${violation.message}-${index}`}
                  className={`rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 border-l-2 ${
                    violation.severity === "error"
                      ? "border-l-[var(--color-figma-error)]"
                      : violation.severity === "warning"
                        ? "border-l-[var(--color-figma-warning)]"
                        : "border-l-[var(--color-figma-text-tertiary)]"
                  }`}
                >
                  <div className="text-[10px] text-[var(--color-figma-text)]">
                    {violation.message}
                  </div>
                  {violation.suggestion && (
                    <div className="mt-0.5 text-[10px] text-[var(--color-figma-text-secondary)]">
                      {violation.suggestion}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(entryMeta.$description ||
          directAliasPath ||
          lifecycle ||
          provenanceLabel ||
          extendsPath ||
          sourceGenerators.length > 0 ||
          derivedGenerator ||
          usageCount > 0) && (
          <div className="px-3 pt-3 pb-2">
            <div className="flex flex-col gap-2">
              {entryMeta.$description && (
                <div className="text-[10px] text-[var(--color-figma-text)] whitespace-pre-wrap break-words">
                  {entryMeta.$description}
                </div>
              )}
              {directAliasPath && (
                <div>
                  <button
                    onClick={() => onNavigateToAlias?.(directAliasPath)}
                    className="text-[10px] font-mono text-left text-[var(--color-figma-accent)] hover:underline break-all"
                    title={directAliasPath}
                  >
                    {formatDisplayPath(
                      directAliasPath,
                      directAliasPath.split(".").pop() ?? directAliasPath,
                    )}
                  </button>
                </div>
              )}
              {sourceGenerators.length > 0 && (
                <div>
                  <div className="flex flex-wrap gap-1">
                    {sourceGenerators.map((generator) => (
                      <GeneratorReferenceChip
                        key={generator.id}
                        generator={generator}
                        onNavigateToGenerator={onNavigateToGenerator}
                      />
                    ))}
                  </div>
                </div>
              )}
              {derivedGenerator && (
                <div>
                  <GeneratorReferenceChip
                    generator={derivedGenerator}
                    onNavigateToGenerator={onNavigateToGenerator}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {lifecycle && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]">
                    Lifecycle: {lifecycle}
                  </span>
                )}
                {provenanceLabel && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)]">
                    Source: {provenanceLabel}
                  </span>
                )}
                {extendsPath && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] break-all">
                    Extends: {extendsPath}
                  </span>
                )}
                {usageCount > 0 && (
                  <button
                    onClick={() => {
                      parent.postMessage(
                        {
                          pluginMessage: {
                            type: "highlight-layer-by-token",
                            tokenPath,
                          },
                        },
                        "*",
                      );
                    }}
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/15"
                    title={`Highlight ${usageCount} bound layer${usageCount === 1 ? "" : "s"} on the canvas`}
                  >
                    Usage: {usageCount}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Value section */}
        <div className="px-3 pt-2 pb-2">
          <div className="text-[10px] font-mono text-[var(--color-figma-text)] break-all whitespace-pre-wrap bg-[var(--color-figma-bg-secondary)] rounded px-2 py-1.5 max-h-24 overflow-y-auto">
            {valueStr}
          </div>
        </div>

        {/* Inline dependency trace */}
        {((resolutionSteps && resolutionSteps.length >= 2) ||
          dependentNodes.length > 0 ||
          dependencySnapshot?.hasCycles) && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            {dependencySnapshot?.hasCycles && (
              <div className="mb-2 rounded border border-[var(--color-figma-error)]/30 bg-[var(--color-figma-error)]/10 px-2 py-1.5 text-[10px] text-[var(--color-figma-error)]">
                Circular alias detected. Open the full graph to debug.
              </div>
            )}

            {resolutionSteps && resolutionSteps.length >= 2 && (
              <div className="mb-2">
                <div className="text-[9px] font-semibold text-[var(--color-figma-text-tertiary)] mb-1">
                  Resolves to
                </div>
                {(() => {
                  const first = resolutionSteps[0];
                  const last = resolutionSteps[resolutionSteps.length - 1];
                  const middleCount = resolutionSteps.length - 2;
                  const isConcrete = !last.isError && last.value != null && !isAlias(last.value);
                  return (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-figma-accent)] shrink-0" />
                        <span className="text-[10px] font-mono text-[var(--color-figma-accent)] truncate">
                          {first.path}
                        </span>
                      </div>
                      {middleCount > 0 && (
                        <div className="flex items-center gap-1.5 pl-0.5">
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden="true">
                            <path d="M4 0v4M1 4l3 4 3-4" />
                          </svg>
                          <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                            via {middleCount} alias{middleCount !== 1 ? "es" : ""}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 pl-0.5">
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--color-figma-text-tertiary)] shrink-0 mt-0.5" aria-hidden="true">
                          <path d="M4 0v4M1 4l3 4 3-4" />
                        </svg>
                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <button
                            className={`text-[10px] font-mono truncate text-left ${last.isError ? "text-[var(--color-figma-error)]" : "text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)] hover:underline"}`}
                            onClick={() => !last.isError && onNavigateToAlias?.(last.path)}
                            title={last.isError ? last.errorMsg : last.path}
                          >
                            {last.path}
                          </button>
                          <div className="flex items-center gap-1 flex-wrap">
                            {isConcrete && (
                              <span className="flex items-center gap-1">
                                <ValuePreview type={last.$type} value={last.value} />
                                <span className="text-[10px] font-mono text-[var(--color-figma-text)] font-medium">
                                  {formatValue(last.$type, last.value)}
                                </span>
                              </span>
                            )}
                            {last.isError && (
                              <span className="text-[8px] text-[var(--color-figma-error)] italic">
                                {last.errorMsg}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {dependentNodes.length > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-[9px] font-semibold text-[var(--color-figma-text-tertiary)] mb-0.5">
                  Used by {dependentNodes.length}
                </div>
                <div className="flex flex-col gap-1">
                  {dependentNodes.slice(0, 6).map((node) => (
                    <button
                      key={node.path}
                      onClick={() => onNavigateToAlias?.(node.path)}
                      className="flex items-center gap-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 text-left hover:border-[var(--color-figma-accent)] hover:bg-[var(--color-figma-bg-hover)]"
                      style={{
                        marginLeft: `${Math.max(0, node.depth - 1) * 10}px`,
                      }}
                      title={node.path}
                    >
                      <span className="rounded bg-[var(--color-figma-bg-hover)] px-1 py-px text-[8px] font-medium text-[var(--color-figma-text-tertiary)]">
                        {node.depth === 1 ? "Direct" : `+${node.depth - 1}`}
                      </span>
                      <span className="min-w-0 flex-1 font-mono text-[10px] text-[var(--color-figma-text)] truncate">
                        {formatDisplayPath(
                          node.path,
                          node.path.split(".").pop() ?? node.path,
                        )}
                      </span>
                      {node.setName && node.setName !== setName && (
                        <span className="shrink-0 rounded bg-[var(--color-figma-bg-hover)] px-1 py-px text-[8px] text-[var(--color-figma-text-secondary)]">
                          {node.setName}
                        </span>
                      )}
                    </button>
                  ))}
                  {dependentNodes.length > 6 && (
                    <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                      + {dependentNodes.length - 6} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Large visual preview for color tokens */}
        {type === "color" && typeof resolvedValue === "string" && (
          <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
            <div
              className="w-full h-16 rounded border border-[var(--color-figma-border)]"
              style={{ backgroundColor: resolvedValue }}
            />
          </div>
        )}

        {/* Typography preview */}
        {type === "typography" &&
          typeof resolvedValue === "object" &&
          resolvedValue !== null &&
          (() => {
            const tv = resolvedValue as Record<string, unknown>;
            const fontSize = tv.fontSize as
              | { value: number; unit: string }
              | string
              | undefined;
            const lineHeight = tv.lineHeight as
              | { value: number; unit: string }
              | string
              | undefined;
            return (
              <div className="px-3 py-2 border-t border-[var(--color-figma-border)]">
                <div
                  className="p-2 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden"
                  style={{
                    fontFamily: (tv.fontFamily as string) || "inherit",
                    fontWeight: (tv.fontWeight as number) || 400,
                    fontSize:
                      typeof fontSize === "object" && fontSize
                        ? `${fontSize.value}${fontSize.unit}`
                        : fontSize
                          ? `${fontSize}px`
                          : "14px",
                    lineHeight: lineHeight
                      ? typeof lineHeight === "object"
                        ? `${lineHeight.value}${lineHeight.unit}`
                        : String(lineHeight)
                      : undefined,
                  }}
                >
                  The quick brown fox
                </div>
              </div>
            );
          })()}
        {/* Value history */}
        {serverUrl && (
          <TokenHistorySection
            tokenPath={tokenPath}
            serverUrl={serverUrl}
            tokenType={type}
          />
        )}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-[var(--color-figma-border)] shrink-0 flex gap-1.5">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          Edit
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(tokenPath);
          }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Copy path
        </button>
        <button
          onClick={() => {
            navigator.clipboard.writeText(valueStr);
          }}
          className="px-2 py-1.5 rounded text-[10px] font-medium bg-[var(--color-figma-bg-secondary)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
        >
          Copy value
        </button>
      </div>
    </div>
  );
}
