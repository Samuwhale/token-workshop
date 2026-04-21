import { useMemo } from "react";
import type { TokenMapEntry } from "../../shared/types";
import type { LintViolation } from "../hooks/useLint";
import { TOKEN_TYPE_BADGE_CLASS } from "../../shared/types";
import { ValuePreview } from "./ValuePreview";
import { resolveTokenValue, isAlias } from "../../shared/resolveAlias";
import { formatDisplayPath } from "./tokenListUtils";
import { stableStringify } from "../shared/utils";
import { Pencil, X } from "lucide-react";

interface TokenCompactPreviewProps {
  tokenPath: string;
  tokenName?: string;
  storageCollectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  onEdit: () => void;
  onClose: () => void;
  onNavigateToAlias?: (path: string) => void;
}

export function TokenCompactPreview({
  tokenPath,
  tokenName,
  storageCollectionId,
  allTokensFlat,
  pathToCollectionId,
  lintViolations = [],
  syncSnapshot,
  onEdit,
  onClose,
  onNavigateToAlias,
}: TokenCompactPreviewProps) {
  const entry = allTokensFlat[tokenPath];
  const name = tokenName ?? tokenPath.split(".").pop() ?? tokenPath;
  const type = entry?.$type ?? "unknown";
  const rawValue = entry?.$value;
  const aliasReference = entry?.reference;

  const displayPath = useMemo(
    () => formatDisplayPath(tokenPath, name),
    [tokenPath, name],
  );

  const resolvedValue = useMemo(() => {
    if (!rawValue || !isAlias(rawValue)) return rawValue;
    const r = resolveTokenValue(String(rawValue), type, allTokensFlat);
    return r.error ? rawValue : r.value;
  }, [rawValue, type, allTokensFlat]);

  const syncChanged = useMemo(() => {
    if (!syncSnapshot || !(tokenPath in syncSnapshot)) return false;
    return syncSnapshot[tokenPath] !== stableStringify(rawValue);
  }, [syncSnapshot, tokenPath, rawValue]);

  const lintTone = useMemo(() => {
    if (lintViolations.some((v) => v.severity === "error")) return "error";
    if (lintViolations.some((v) => v.severity === "warning")) return "warning";
    if (lintViolations.length > 0) return "info";
    return null;
  }, [lintViolations]);

  const tokenCollectionId =
    pathToCollectionId?.[tokenPath] ?? storageCollectionId;

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-secondary text-[var(--color-figma-text-tertiary)]">
        Token not found
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ValuePreview type={type} value={resolvedValue} size={16} />
          <span
            className="text-secondary font-mono text-[var(--color-figma-text)] truncate"
            title={tokenPath}
          >
            {displayPath}
          </span>
          <span
            className={`shrink-0 px-1 py-0.5 rounded text-[8px] font-medium ${TOKEN_TYPE_BADGE_CLASS[type] ?? "token-type-string"}`}
          >
            {type}
          </span>
          {lintTone && (
            <span
              className={`shrink-0 inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 text-[8px] font-medium ${
                lintTone === "error"
                  ? "bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)]"
                  : lintTone === "warning"
                    ? "bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-warning)]"
                    : "bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
              }`}
            >
              {lintViolations.length}
            </span>
          )}
          {syncChanged && (
            <span className="shrink-0 h-2 w-2 rounded-full bg-[var(--color-figma-warning)]" title="Unpublished" aria-label="Unpublished" />
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-1.5">
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)]"
            title="Edit token"
            aria-label="Edit token"
          >
            <Pencil size={10} strokeWidth={2} aria-hidden />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
            title="Close"
            aria-label="Close"
          >
            <X size={10} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1.5">
        <div className="text-secondary text-[var(--color-figma-text-tertiary)] mb-1">
          {tokenCollectionId}
        </div>

        {type === "color" && typeof resolvedValue === "string" && (
          <div
            className="w-full h-8 rounded border border-[var(--color-figma-border)] mb-1.5"
            style={{ backgroundColor: resolvedValue }}
          />
        )}

        {typeof aliasReference === "string" && isAlias(aliasReference) && (
          <div className="flex items-center gap-1 mb-1">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 opacity-40">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <button
              onClick={() => onNavigateToAlias?.(aliasReference.slice(1, -1))}
              className="text-secondary font-mono text-[var(--color-figma-accent)] hover:underline truncate"
              title={aliasReference}
            >
              {aliasReference}
            </button>
          </div>
        )}

        <div className="text-secondary font-mono text-[var(--color-figma-text)] break-all whitespace-pre-wrap bg-[var(--color-figma-bg-secondary)] rounded px-2 py-1 max-h-16 overflow-y-auto">
          {rawValue == null
            ? "—"
            : typeof rawValue === "object"
              ? JSON.stringify(rawValue, null, 2)
              : String(rawValue)}
        </div>

        {entry.$description && (
          <div className="mt-1.5 text-secondary text-[var(--color-figma-text-secondary)] whitespace-pre-wrap break-words line-clamp-2">
            {entry.$description}
          </div>
        )}
      </div>
    </div>
  );
}
