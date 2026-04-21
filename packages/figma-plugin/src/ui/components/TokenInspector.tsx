import { useMemo, useState } from 'react';
import type { TokenCollection } from '@tokenmanager/core';
import { readTokenCollectionModeValues } from '@tokenmanager/core';
import type { TokenMapEntry } from '../../shared/types';
import type { LintViolation } from '../hooks/useLint';
import type { ValidationIssue } from '../hooks/useValidationCache';
import { isAlias, extractAliasPath } from '../../shared/resolveAlias';
import { formatDisplayPath } from './tokenListUtils';
import { formatTokenValueForDisplay } from '../shared/tokenFormatting';
import { stableStringify } from '../shared/utils';
import { getRuleLabel, hasFix, fixLabel, suppressKey } from '../shared/ruleLabels';
import { ValuePreview } from './ValuePreview';
import { Spinner } from './Spinner';
import { useDropdownMenu } from '../hooks/useDropdownMenu';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Link as LinkIcon,
  Pencil,
  Plus,
} from 'lucide-react';

interface TokenInspectorProps {
  tokenPath: string;
  tokenName?: string;
  storageCollectionId: string;
  allTokensFlat: Record<string, TokenMapEntry>;
  pathToCollectionId?: Record<string, string>;
  collections?: TokenCollection[];
  lintViolations?: LintViolation[];
  syncSnapshot?: Record<string, string>;
  fixingKeys?: Set<string>;
  suppressedKeys?: Set<string>;
  onEdit: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
  onNavigateToToken?: (path: string) => void;
  onFixIssue?: (issue: ValidationIssue) => void;
  onHideIssue?: (issue: ValidationIssue) => void;
  onOpenInHealth?: () => void;
}

interface ResolvedModeCell {
  modeName: string;
  /** Raw authored value (alias string or literal). */
  rawValue: unknown;
  /** Resolved concrete value (null if unresolvable). */
  resolvedValue: unknown;
  /** Resolved $type when the chain walks across types (e.g. alias points at a color). */
  resolvedType: string;
  /** First alias hop, or null when the raw value is a literal. */
  aliasTargetPath: string | null;
  chainError: string | null;
}

export function TokenInspector({
  tokenPath,
  tokenName,
  storageCollectionId,
  allTokensFlat,
  pathToCollectionId,
  collections,
  lintViolations = [],
  syncSnapshot,
  fixingKeys,
  suppressedKeys,
  onEdit,
  onDuplicate,
  onClose,
  onNavigateToToken,
  onFixIssue,
  onHideIssue,
  onOpenInHealth,
}: TokenInspectorProps) {
  const entry = allTokensFlat[tokenPath];
  const name = tokenName ?? tokenPath.split('.').pop() ?? tokenPath;
  const displayPath = useMemo(() => formatDisplayPath(tokenPath, name), [tokenPath, name]);

  const collectionId = pathToCollectionId?.[tokenPath] ?? storageCollectionId;
  const collection = useMemo(
    () => collections?.find((c) => c.id === collectionId) ?? null,
    [collections, collectionId],
  );

  const modeCells = useMemo<ResolvedModeCell[]>(() => {
    if (!entry || !collection) return [];
    const extensionsModes = readTokenCollectionModeValues(entry);
    const perCollection = extensionsModes[collection.id] ?? {};

    return collection.modes.map((mode, idx) => {
      // First mode uses the token's primary $value; secondary modes come from extensions.
      const rawValue = idx === 0
        ? (entry.reference ?? entry.$value)
        : perCollection[mode.name];

      return resolveModeCell(mode.name, rawValue, entry.$type ?? '', allTokensFlat);
    });
  }, [entry, collection, allTokensFlat]);

  const aliasChain = useMemo(() => {
    if (!entry) return [] as ChainStep[];
    const startRaw = entry.reference ?? entry.$value;
    return buildAliasChain(tokenPath, startRaw, entry.$type ?? '', allTokensFlat, pathToCollectionId);
  }, [entry, tokenPath, allTokensFlat, pathToCollectionId]);

  const visibleIssues = useMemo<ValidationIssue[]>(
    () => lintViolations.filter((v) => !suppressedKeys?.has(suppressKey(v))),
    [lintViolations, suppressedKeys],
  );

  const referencedBy = useMemo(() => {
    const result: string[] = [];
    for (const [path, e] of Object.entries(allTokensFlat)) {
      if (path === tokenPath) continue;
      if (hasReferenceTo(e, tokenPath)) result.push(path);
    }
    return result.sort();
  }, [allTokensFlat, tokenPath]);

  const syncChanged = useMemo(() => {
    if (!syncSnapshot || !(tokenPath in syncSnapshot)) return false;
    return syncSnapshot[tokenPath] !== stableStringify(entry?.$value);
  }, [syncSnapshot, tokenPath, entry]);

  if (!entry) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-secondary text-[var(--color-figma-text-tertiary)]">
        Token not found
      </div>
    );
  }

  const hasMultipleModes = (collection?.modes.length ?? 0) >= 2;
  const wasAlias = aliasChain.length > 1;
  const heroValue = entry.$value;
  const heroType = entry.$type ?? 'unknown';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--color-figma-border)] shrink-0">
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)]"
          title="Back to overview"
          aria-label="Back to overview"
        >
          <ArrowLeft size={12} strokeWidth={2} aria-hidden />
        </button>
        <ValuePreview type={heroType} value={heroValue} size={16} />
        <span
          className="text-secondary font-mono text-[var(--color-figma-text)] truncate flex-1 min-w-0"
          title={tokenPath}
        >
          {displayPath}
        </span>
        {syncChanged && (
          <span
            className="shrink-0 h-2 w-2 rounded-full bg-[var(--color-figma-warning)]"
            title="Unpublished changes"
            aria-label="Unpublished changes"
          />
        )}
        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)]"
              title="Duplicate"
              aria-label="Duplicate token"
            >
              <Plus size={12} strokeWidth={2} aria-hidden />
            </button>
          )}
          <button
            onClick={onEdit}
            className="p-1 rounded hover:bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-accent)]"
            title="Edit"
            aria-label="Edit token"
          >
            <Pencil size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <HeroBlock type={heroType} value={heroValue} />

        {visibleIssues.length > 0 && (
          <IssuesSection
            issues={visibleIssues}
            fixingKeys={fixingKeys}
            onFixIssue={onFixIssue}
            onHideIssue={onHideIssue}
            onOpenInHealth={onOpenInHealth}
          />
        )}

        {hasMultipleModes && (
          <Section label={`Modes in ${collection!.id}`}>
            <ModesGrid cells={modeCells} onNavigateToToken={onNavigateToToken} />
          </Section>
        )}

        {wasAlias && (
          <Section label="Alias chain">
            <AliasChainView
              chain={aliasChain}
              onNavigateToToken={onNavigateToToken}
            />
          </Section>
        )}

        {referencedBy.length > 0 && (
          <Section label={`Referenced by ${referencedBy.length}`}>
            <ReferencedByList
              paths={referencedBy}
              allTokensFlat={allTokensFlat}
              onNavigateToToken={onNavigateToToken}
            />
          </Section>
        )}

        {entry.$description && (
          <Section label="Description">
            <p className="text-body text-[var(--color-figma-text)] whitespace-pre-wrap break-words">
              {entry.$description}
            </p>
          </Section>
        )}

        <DevDrawer
          tokenPath={tokenPath}
          rawValue={entry.$value}
          rawReference={entry.reference}
        />
      </div>
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function HeroBlock({ type, value }: { type: string; value: unknown }) {
  const display = formatTokenValueForDisplay(type, value, { emptyPlaceholder: '—' });

  return (
    <div className="px-3 py-3 flex items-center gap-3 border-b border-[var(--color-figma-border)]">
      <HeroVisual type={type} value={value} />
      <div className="min-w-0 flex-1 text-body font-mono text-[var(--color-figma-text)] break-all">
        {display}
      </div>
    </div>
  );
}

function HeroVisual({ type, value }: { type: string; value: unknown }) {
  // Color gets a generous block; everything else reuses ValuePreview at size 40.
  if (type === 'color' && typeof value === 'string' && !value.startsWith('{')) {
    return (
      <div
        className="shrink-0 rounded-md border border-[var(--color-figma-border)] shadow-sm"
        style={{ width: 56, height: 56, backgroundColor: value }}
        aria-hidden
      />
    );
  }
  return (
    <div className="shrink-0 flex items-center justify-center" style={{ minWidth: 56, minHeight: 56 }}>
      <ValuePreview type={type} value={value} size={40} />
    </div>
  );
}

// ─── Modes ───────────────────────────────────────────────────────────────────

function ModesGrid({
  cells,
  onNavigateToToken,
}: {
  cells: ResolvedModeCell[];
  onNavigateToToken?: (path: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {cells.map((cell) => (
        <ModeRow key={cell.modeName} cell={cell} onNavigateToToken={onNavigateToToken} />
      ))}
    </div>
  );
}

function ModeRow({
  cell,
  onNavigateToToken,
}: {
  cell: ResolvedModeCell;
  onNavigateToToken?: (path: string) => void;
}) {
  const { modeName, rawValue, resolvedValue, resolvedType, aliasTargetPath, chainError } = cell;

  const isEmpty = rawValue == null || rawValue === '';
  const isAliased = aliasTargetPath !== null;
  const isUnresolved = chainError !== null;

  const displayValue = isEmpty
    ? ''
    : formatTokenValueForDisplay(resolvedType, resolvedValue, { emptyPlaceholder: '' });

  return (
    <div className="flex items-center gap-2 rounded px-1 py-1 hover:bg-[var(--color-figma-bg-hover)]">
      <div className="shrink-0 w-20 min-w-0 truncate text-secondary text-[var(--color-figma-text-secondary)]" title={modeName}>
        {modeName}
      </div>
      <div className="shrink-0">
        {isEmpty ? (
          <div
            className="rounded border border-dashed border-[var(--color-figma-border)]"
            style={{ width: 24, height: 24 }}
            aria-hidden
          />
        ) : (
          <ValuePreview type={resolvedType} value={resolvedValue} size={24} />
        )}
      </div>
      <div className="min-w-0 flex-1 flex items-center gap-1.5 min-h-[24px]">
        {isEmpty ? (
          <span className="text-secondary italic text-[var(--color-figma-text-tertiary)]">not set</span>
        ) : isAliased ? (
          <button
            type="button"
            onClick={() => aliasTargetPath && onNavigateToToken?.(aliasTargetPath)}
            className="inline-flex items-center gap-1 min-w-0 text-[var(--color-figma-accent)] hover:underline font-mono text-secondary truncate"
            title={`Follow alias → ${aliasTargetPath}`}
          >
            <LinkIcon size={10} strokeWidth={2} aria-hidden className="shrink-0" />
            <span className="truncate">{aliasTargetPath}</span>
          </button>
        ) : (
          <span className="text-body font-mono text-[var(--color-figma-text)] truncate" title={displayValue}>
            {displayValue}
          </span>
        )}
        {isUnresolved && (
          <span
            className="shrink-0 text-secondary text-[var(--color-figma-error)]"
            title={chainError ?? undefined}
          >
            unresolved
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Alias chain ─────────────────────────────────────────────────────────────

interface ChainStep {
  path: string;
  /** Raw authored value at this step (alias or literal) — undefined when target not found. */
  rawValue: unknown;
  $type: string;
  collectionId?: string;
  errorMsg?: string;
}

function AliasChainView({
  chain,
  onNavigateToToken,
}: {
  chain: ChainStep[];
  onNavigateToToken?: (path: string) => void;
}) {
  return (
    <ol className="flex flex-col gap-1">
      {chain.map((step, idx) => {
        const isLast = idx === chain.length - 1;
        const isFirst = idx === 0;
        const leafName = step.path.split('.').pop() ?? step.path;
        const isAliased = typeof step.rawValue === 'string' && isAlias(step.rawValue);
        const literalDisplay = !isAliased && !step.errorMsg
          ? formatTokenValueForDisplay(step.$type, step.rawValue, { emptyPlaceholder: '—' })
          : null;
        return (
          <li key={`${step.path}-${idx}`} className="flex items-center gap-1.5">
            <span className="shrink-0 w-4 text-secondary text-[var(--color-figma-text-tertiary)]">
              {isFirst ? '•' : <ArrowRight size={10} strokeWidth={2} aria-hidden />}
            </span>
            <button
              type="button"
              onClick={() => onNavigateToToken?.(step.path)}
              className="min-w-0 flex-1 text-left inline-flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--color-figma-bg-hover)]"
              title={`Inspect ${step.path}`}
              disabled={!!step.errorMsg}
            >
              {!step.errorMsg && <ValuePreview type={step.$type} value={step.rawValue} size={16} />}
              <span className="font-mono text-secondary text-[var(--color-figma-text)] truncate">
                {leafName}
              </span>
              {step.errorMsg && (
                <span className="text-secondary text-[var(--color-figma-error)]" title={step.errorMsg}>
                  {step.errorMsg}
                </span>
              )}
              {literalDisplay && isLast && (
                <span className="text-secondary font-mono text-[var(--color-figma-text-tertiary)] truncate" title={literalDisplay}>
                  {literalDisplay}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Referenced by ───────────────────────────────────────────────────────────

function ReferencedByList({
  paths,
  allTokensFlat,
  onNavigateToToken,
}: {
  paths: string[];
  allTokensFlat: Record<string, TokenMapEntry>;
  onNavigateToToken?: (path: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {paths.map((path) => {
        const entry = allTokensFlat[path];
        const leafName = path.split('.').pop() ?? path;
        return (
          <li key={path}>
            <button
              type="button"
              onClick={() => onNavigateToToken?.(path)}
              className="w-full flex items-center gap-1.5 text-left rounded px-1 py-0.5 hover:bg-[var(--color-figma-bg-hover)]"
              title={`Inspect ${path}`}
            >
              {entry && <ValuePreview type={entry.$type} value={entry.$value} size={16} />}
              <span className="font-mono text-secondary text-[var(--color-figma-text)] truncate min-w-0 flex-1">
                {leafName}
              </span>
              <span className="shrink-0 font-mono text-secondary text-[var(--color-figma-text-tertiary)] truncate">
                {path}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Developer drawer ────────────────────────────────────────────────────────

function DevDrawer({
  tokenPath,
  rawValue,
  rawReference,
}: {
  tokenPath: string;
  rawValue: unknown;
  rawReference?: string;
}) {
  const [open, setOpen] = useState(false);
  const cssVar = `--${tokenPath.replace(/\./g, '-')}`;
  const authored = rawReference ?? rawValue;
  const rawJson = typeof authored === 'object' && authored !== null
    ? JSON.stringify(authored, null, 2)
    : String(authored ?? '');

  return (
    <div className="border-t border-[var(--color-figma-border)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-secondary text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} strokeWidth={2} aria-hidden /> : <ChevronRight size={12} strokeWidth={2} aria-hidden />}
        <span>For developers</span>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          <DevRow label="CSS variable">
            <CopyableCode text={cssVar} />
          </DevRow>
          <DevRow label="Raw value">
            <pre className="text-secondary font-mono text-[var(--color-figma-text)] bg-[var(--color-figma-bg-secondary)] rounded px-2 py-1 max-h-32 overflow-auto whitespace-pre-wrap break-all">
              {rawJson || '—'}
            </pre>
          </DevRow>
        </div>
      )}
    </div>
  );
}

function DevRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-secondary text-[var(--color-figma-text-tertiary)]">{label}</div>
      {children}
    </div>
  );
}

function CopyableCode({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded bg-[var(--color-figma-bg-secondary)] border border-[var(--color-figma-border)] px-2 py-1 font-mono text-secondary text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] max-w-full"
      title="Copy"
    >
      <span className="truncate">{text}</span>
      <Copy size={10} strokeWidth={2} aria-hidden className="shrink-0 text-[var(--color-figma-text-tertiary)]" />
      {copied && (
        <span className="shrink-0 text-secondary text-[var(--color-figma-text-tertiary)]">copied</span>
      )}
    </button>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="px-3 py-2 border-b border-[var(--color-figma-border)]">
      <div className="text-secondary font-medium mb-1.5 text-[var(--color-figma-text-secondary)]">
        {label}
      </div>
      {children}
    </section>
  );
}

// ─── Issues section ──────────────────────────────────────────────────────────

function IssuesSection({
  issues,
  fixingKeys,
  onFixIssue,
  onHideIssue,
  onOpenInHealth,
}: {
  issues: ValidationIssue[];
  fixingKeys?: Set<string>;
  onFixIssue?: (issue: ValidationIssue) => void;
  onHideIssue?: (issue: ValidationIssue) => void;
  onOpenInHealth?: () => void;
}) {
  return (
    <section className="border-b border-[var(--color-figma-border)]">
      <div className="flex flex-col">
        {issues.map((issue, idx) => (
          <IssueRow
            key={`${issue.rule}:${issue.path}:${idx}`}
            issue={issue}
            fixing={fixingKeys?.has(suppressKey(issue)) ?? false}
            onFix={onFixIssue ? () => onFixIssue(issue) : undefined}
            onHide={onHideIssue ? () => onHideIssue(issue) : undefined}
          />
        ))}
      </div>
      {onOpenInHealth && (
        <button
          type="button"
          onClick={onOpenInHealth}
          className="w-full px-3 py-1.5 text-left text-secondary text-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text-secondary)]"
        >
          See all in Health →
        </button>
      )}
    </section>
  );
}

function IssueRow({
  issue,
  fixing,
  onFix,
  onHide,
}: {
  issue: ValidationIssue;
  fixing: boolean;
  onFix?: () => void;
  onHide?: () => void;
}) {
  const overflowMenu = useDropdownMenu();
  const meta = getRuleLabel(issue.rule);
  const canFix = hasFix(issue);
  const toneClass =
    issue.severity === 'error'
      ? 'text-[var(--color-figma-error)]'
      : issue.severity === 'warning'
        ? 'text-[var(--color-figma-warning)]'
        : 'text-[var(--color-figma-text-secondary)]';
  const isDestructive = issue.suggestedFix === 'delete-token';

  return (
    <div className="group px-3 py-2 flex items-start gap-2 border-b border-[var(--color-figma-border)] last:border-b-0">
      <span
        className={`mt-1 shrink-0 h-1.5 w-1.5 rounded-full ${issue.severity === 'error' ? 'bg-[var(--color-figma-error)]' : issue.severity === 'warning' ? 'bg-[var(--color-figma-warning)]' : 'bg-[var(--color-figma-text-tertiary)]'}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className={`text-secondary font-medium ${toneClass}`}>{meta.label}</div>
        <div className="text-secondary text-[var(--color-figma-text-secondary)] break-words">
          {issue.message}
        </div>
      </div>
      {canFix && onFix && (
        <button
          type="button"
          onClick={onFix}
          disabled={fixing}
          className={`shrink-0 text-secondary disabled:opacity-40 disabled:cursor-wait hover:underline ${
            isDestructive
              ? 'text-[var(--color-figma-error)]'
              : 'text-[var(--color-figma-accent)]'
          }`}
        >
          {fixing ? <Spinner size="xs" /> : fixLabel(issue.suggestedFix)}
        </button>
      )}
      {onHide && (
        <div className="relative shrink-0">
          <button
            ref={overflowMenu.triggerRef}
            type="button"
            onClick={overflowMenu.toggle}
            className="text-secondary px-1 py-0.5 rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] opacity-0 group-hover:opacity-100"
            aria-haspopup="true"
            aria-expanded={overflowMenu.open}
            aria-label="More actions"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {overflowMenu.open && (
            <div
              ref={overflowMenu.menuRef}
              className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] shadow-lg py-0.5"
              role="menu"
            >
              <button
                role="menuitem"
                type="button"
                onClick={() => { onHide(); overflowMenu.close(); }}
                className="w-full text-left px-3 py-1.5 text-secondary text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)]"
              >
                Hide this issue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Chain + mode resolution ─────────────────────────────────────────────────

function resolveModeCell(
  modeName: string,
  rawValue: unknown,
  startType: string,
  tokenMap: Record<string, TokenMapEntry>,
): ResolvedModeCell {
  if (rawValue == null || rawValue === '') {
    return { modeName, rawValue, resolvedValue: null, resolvedType: startType, aliasTargetPath: null, chainError: null };
  }
  if (typeof rawValue !== 'string' || !isAlias(rawValue)) {
    return { modeName, rawValue, resolvedValue: rawValue, resolvedType: startType, aliasTargetPath: null, chainError: null };
  }

  const firstHop = extractAliasPath(rawValue);
  const visited = new Set<string>();
  let current: unknown = rawValue;
  let currentType = startType;

  for (let depth = 0; depth < 10; depth++) {
    if (typeof current !== 'string' || !isAlias(current)) break;
    const nextPath = extractAliasPath(current);
    if (!nextPath) break;
    if (visited.has(nextPath)) {
      return { modeName, rawValue, resolvedValue: null, resolvedType: currentType, aliasTargetPath: firstHop, chainError: `Circular alias at ${nextPath}` };
    }
    visited.add(nextPath);
    const entry = tokenMap[nextPath];
    if (!entry) {
      return { modeName, rawValue, resolvedValue: null, resolvedType: currentType, aliasTargetPath: firstHop, chainError: `Alias target not found: ${nextPath}` };
    }
    // `$value` in allTokensFlat is already resolved; follow original ref when present.
    current = entry.reference ?? entry.$value;
    if (entry.$type && entry.$type !== 'unknown') currentType = entry.$type;
  }

  return { modeName, rawValue, resolvedValue: current, resolvedType: currentType, aliasTargetPath: firstHop, chainError: null };
}

function buildAliasChain(
  startPath: string,
  startRaw: unknown,
  startType: string,
  tokenMap: Record<string, TokenMapEntry>,
  pathToCollectionId?: Record<string, string>,
): ChainStep[] {
  const steps: ChainStep[] = [];
  const push = (path: string, raw: unknown, type: string, error?: string) => {
    steps.push({
      path,
      rawValue: raw,
      $type: type,
      collectionId: pathToCollectionId?.[path],
      errorMsg: error,
    });
  };

  push(startPath, startRaw, startType);
  if (typeof startRaw !== 'string' || !isAlias(startRaw)) return steps;

  const visited = new Set<string>([startPath]);
  let current: unknown = startRaw;
  let currentType = startType;
  const maxDepth = 10;

  for (let depth = 0; depth < maxDepth; depth++) {
    if (typeof current !== 'string' || !isAlias(current)) break;
    const nextPath = extractAliasPath(current);
    if (!nextPath) break;

    if (visited.has(nextPath)) {
      push(nextPath, undefined, currentType, 'Circular alias');
      break;
    }
    visited.add(nextPath);

    const entry = tokenMap[nextPath];
    if (!entry) {
      push(nextPath, undefined, currentType, 'Target not found');
      break;
    }
    if (entry.$type && entry.$type !== 'unknown') currentType = entry.$type;
    const rawAtStep = entry.reference ?? entry.$value;
    push(nextPath, rawAtStep, currentType);
    current = rawAtStep;
  }

  return steps;
}

// allTokensFlat has already been passed through `resolveAllAliases`, so the raw
// authored alias for the token's first mode is captured on `entry.reference`,
// not `entry.$value`.
function hasReferenceTo(entry: TokenMapEntry, targetPath: string): boolean {
  return typeof entry.reference === 'string' && extractAliasPath(entry.reference) === targetPath;
}

