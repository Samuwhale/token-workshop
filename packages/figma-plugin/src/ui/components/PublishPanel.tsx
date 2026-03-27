import { useState, useEffect, useCallback, useRef } from 'react';

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function describeError(err: unknown, operation: string): string {
  const detail = err instanceof Error ? err.message : String(err);
  return `${operation} failed: ${detail}`;
}

/* ── Interfaces ──────────────────────────────────────────────────────────── */

interface PublishPanelProps {
  serverUrl: string;
  connected: boolean;
  activeSet: string;
  collectionMap?: Record<string, string>;
  modeMap?: Record<string, string>;
}

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  remote: string | null;
  status: {
    modified: string[];
    created: string[];
    deleted: string[];
    not_added: string[];
    staged: string[];
    isClean: boolean;
  } | null;
}

interface VarDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;
  figmaValue?: string;
  localType?: string;
  figmaType?: string;
}

interface StyleDiffRow {
  path: string;
  cat: 'local-only' | 'figma-only' | 'conflict';
  localValue?: string;   // display string
  figmaValue?: string;   // display string
  localRaw?: any;        // raw value for API/plugin
  figmaRaw?: any;        // raw value for API/plugin
  localType?: string;
  figmaType?: string;
}

interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  count?: number;
  detail?: string;
  fixLabel?: string;
  onFix?: () => void;
}

interface Platform {
  id: string;
  label: string;
  description: string;
  example: string;
}

/* ── Constants & helpers ─────────────────────────────────────────────────── */

const PLATFORMS: Platform[] = [
  { id: 'css', label: 'CSS', description: 'CSS custom properties', example: '--color-brand: #0066ff;' },
  { id: 'dart', label: 'Dart', description: 'Flutter theme classes', example: 'static const colorBrand = Color(0xFF0066FF);' },
  { id: 'ios-swift', label: 'iOS Swift', description: 'UIKit / SwiftUI extensions', example: 'static let colorBrand = UIColor(...)' },
  { id: 'android', label: 'Android', description: 'XML resources / Compose', example: '<color name="color_brand">#0066FF</color>' },
  { id: 'json', label: 'JSON', description: 'W3C DTCG format', example: '"color-brand": { "$type": "color", "$value": "#0066ff" }' },
];

function flattenForVarDiff(
  group: Record<string, any>,
  prefix = ''
): { path: string; value: string; type: string }[] {
  const result: { path: string; value: string; type: string }[] = [];
  for (const [key, val] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && '$value' in val) {
      result.push({ path, value: String(val.$value), type: String(val.$type ?? 'string') });
    } else if (val && typeof val === 'object') {
      result.push(...flattenForVarDiff(val, path));
    }
  }
  return result;
}

function truncateValue(v: string, max = 24): string {
  return v.length > max ? v.slice(0, max) + '\u2026' : v;
}

const STYLE_TYPES = ['color', 'typography', 'shadow'] as const;

function flattenForStyleDiff(
  group: Record<string, any>,
  prefix = ''
): { path: string; value: any; type: string }[] {
  const result: { path: string; value: any; type: string }[] = [];
  for (const [key, val] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === 'object' && '$value' in val) {
      const type = String(val.$type ?? 'string');
      if ((STYLE_TYPES as readonly string[]).includes(type)) {
        result.push({ path, value: val.$value, type });
      }
    } else if (val && typeof val === 'object') {
      result.push(...flattenForStyleDiff(val, path));
    }
  }
  return result;
}

function summarizeStyleValue(value: any, type: string): string {
  if (type === 'color') return String(value);
  if (type === 'typography' && value && typeof value === 'object') {
    const family = Array.isArray(value.fontFamily) ? value.fontFamily[0] : value.fontFamily;
    const size = typeof value.fontSize === 'object'
      ? `${value.fontSize.value}${value.fontSize.unit}`
      : String(value.fontSize ?? '');
    return `${family ?? ''}${size ? ' ' + size : ''}`.trim() || JSON.stringify(value).slice(0, 28);
  }
  if (type === 'shadow') {
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((s: any) => s?.color ?? '').join(', ').slice(0, 28);
  }
  return JSON.stringify(value).slice(0, 28);
}

function formatRelativeTime(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return date.toLocaleDateString();
}

/* ── Collapsible section wrapper ─────────────────────────────────────────── */

function Section({ title, open, onToggle, badge, children }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-[var(--color-figma-border)] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}>
          <path d="M2 1l4 3-4 3V1z" />
        </svg>
        <span className="text-[11px] font-semibold text-[var(--color-figma-text)]">{title}</span>
        {badge}
      </button>
      {open && <div className="border-t border-[var(--color-figma-border)]">{children}</div>}
    </section>
  );
}

/* ── PublishPanel ─────────────────────────────────────────────────────────── */

export function PublishPanel({ serverUrl, connected, activeSet, collectionMap = {}, modeMap = {} }: PublishPanelProps) {
  // ── Section collapse ──
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(['figma-variables', 'git', 'file-export']));
  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Git state ──
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitLoading, setGitLoading] = useState(true);
  const [gitError, setGitError] = useState<string | null>(null);
  const [commitMsg, setCommitMsg] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [diffView, setDiffView] = useState<{ localOnly: string[]; remoteOnly: string[]; conflicts: string[] } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffChoices, setDiffChoices] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [, setTick] = useState(0);

  // ── Variable sync state ──
  const [varRows, setVarRows] = useState<VarDiffRow[]>([]);
  const [varDirs, setVarDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [varLoading, setVarLoading] = useState(false);
  const [varSyncing, setVarSyncing] = useState(false);
  const [varError, setVarError] = useState<string | null>(null);
  const [varChecked, setVarChecked] = useState(false);
  const varReadResolveRef = useRef<((tokens: any[]) => void) | null>(null);
  const varCorrelationIdRef = useRef<string | null>(null);

  // ── Style sync state ──
  const [styleRows, setStyleRows] = useState<StyleDiffRow[]>([]);
  const [styleDirs, setStyleDirs] = useState<Record<string, 'push' | 'pull' | 'skip'>>({});
  const [styleLoading, setStyleLoading] = useState(false);
  const [styleSyncing, setStyleSyncing] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  const [styleChecked, setStyleChecked] = useState(false);
  const styleReadResolveRef = useRef<((tokens: any[]) => void) | null>(null);

  // ── Readiness state ──
  const [readinessChecks, setReadinessChecks] = useState<ReadinessCheck[]>([]);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [orphansDeleting, setOrphansDeleting] = useState(false);
  const orphansResolveRef = useRef<((count: number) => void) | null>(null);

  // ── Export state ──
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set(['css']));
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResults, setExportResults] = useState<{ platform: string; path: string; content: string }[]>([]);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const fetchAbortRef = useRef<AbortController | null>(null);

  /* ── Git callbacks ─────────────────────────────────────────────────────── */

  const fetchStatus = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const { signal } = controller;
    if (!connected) { setGitLoading(false); return; }
    try {
      const res = await fetch(`${serverUrl}/api/sync/status`, { signal });
      if (res.ok) {
        const data = await res.json();
        setGitStatus(data);
        if (data.remote) setRemoteUrl(data.remote);
      } else {
        setGitStatus({ isRepo: false, branch: null, remote: null, status: null });
      }
      const branchRes = await fetch(`${serverUrl}/api/sync/branches`, { signal });
      if (branchRes.ok) {
        const branchData = await branchRes.json();
        setBranches(branchData.branches || []);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setGitError(describeError(err, 'Fetch git status'));
    } finally {
      if (!signal.aborted) setGitLoading(false);
    }
  }, [serverUrl, connected]);

  useEffect(() => {
    fetchStatus();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchStatus]);

  useEffect(() => {
    if (!lastSynced) return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [lastSynced]);

  const doAction = async (action: string, body?: any) => {
    setActionLoading(action);
    setGitError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `${action} failed`);
      }
      if (action === 'push' || action === 'pull') setLastSynced(new Date());
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Git ${action} completed` } }, '*');
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, `Git ${action}`));
    } finally {
      setActionLoading(null);
    }
  };

  const computeDiff = useCallback(async () => {
    setDiffLoading(true);
    setGitError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/diff`);
      if (!res.ok) throw new Error('Could not compute diff');
      const data = await res.json() as { localOnly: string[]; remoteOnly: string[]; conflicts: string[] };
      setDiffView(data);
      const choices: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const f of data.localOnly) choices[f] = 'push';
      for (const f of data.remoteOnly) choices[f] = 'pull';
      for (const f of data.conflicts) choices[f] = 'skip';
      setDiffChoices(choices);
    } catch (err) {
      setGitError(describeError(err, 'Compute diff'));
    } finally {
      setDiffLoading(false);
    }
  }, [serverUrl]);

  const applyDiff = useCallback(async () => {
    setApplyingDiff(true);
    setGitError(null);
    try {
      const res = await fetch(`${serverUrl}/api/sync/apply-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choices: diffChoices }),
      });
      if (!res.ok) throw new Error('Failed to apply diff');
      setDiffView(null);
      fetchStatus();
    } catch (err) {
      setGitError(describeError(err, 'Apply diff'));
    } finally {
      setApplyingDiff(false);
    }
  }, [serverUrl, diffChoices, fetchStatus]);

  /* ── Variable sync callbacks ───────────────────────────────────────────── */

  const computeVarDiff = useCallback(async () => {
    if (!activeSet) return;
    setVarLoading(true);
    setVarError(null);
    setVarChecked(false);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `publish-${Date.now()}-${Math.random()}`;
        varCorrelationIdRef.current = cid;
        const timeout = setTimeout(() => {
          varReadResolveRef.current = null;
          varCorrelationIdRef.current = null;
          reject(new Error('Figma read timed out \u2014 is the plugin running?'));
        }, 10000);
        varReadResolveRef.current = (tokens) => {
          clearTimeout(timeout);
          resolve(tokens);
        };
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = flattenForVarDiff(data.tokens || {});

      const figmaMap = new Map<string, { value: string; type: string }>(
        figmaTokens.map(t => [t.path, { value: String(t.$value ?? ''), type: String(t.$type ?? 'string') }])
      );
      const localMap = new Map<string, { value: string; type: string }>(
        localFlat.map(t => [t.path, { value: t.value, type: t.type }])
      );

      const rows: VarDiffRow[] = [];
      for (const [path, local] of localMap) {
        const figma = figmaMap.get(path);
        if (!figma) {
          rows.push({ path, cat: 'local-only', localValue: local.value, localType: local.type });
        } else if (figma.value !== local.value) {
          rows.push({ path, cat: 'conflict', localValue: local.value, figmaValue: figma.value, localType: local.type, figmaType: figma.type });
        }
      }
      for (const [path, figma] of figmaMap) {
        if (!localMap.has(path)) {
          rows.push({ path, cat: 'figma-only', figmaValue: figma.value, figmaType: figma.type });
        }
      }

      setVarRows(rows);
      setVarChecked(true);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setVarDirs(dirs);
    } catch (err) {
      setVarError(describeError(err, 'Compare variables'));
    } finally {
      setVarLoading(false);
    }
  }, [serverUrl, activeSet]);

  useEffect(() => {
    if (connected && activeSet) computeVarDiff();
  }, [connected, activeSet, computeVarDiff]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'variables-read' && varReadResolveRef.current && msg.correlationId === varCorrelationIdRef.current) {
        varCorrelationIdRef.current = null;
        varReadResolveRef.current(msg.tokens ?? []);
        varReadResolveRef.current = null;
      }
      if (msg?.type === 'styles-read' && styleReadResolveRef.current) {
        styleReadResolveRef.current(msg.tokens ?? []);
        styleReadResolveRef.current = null;
      }
      if (msg?.type === 'orphans-deleted' && orphansResolveRef.current) {
        orphansResolveRef.current(msg.count ?? 0);
        orphansResolveRef.current = null;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const applyVarDiff = useCallback(async () => {
    const dirsSnapshot = varDirs;
    const rowsSnapshot = varRows;
    setVarSyncing(true);
    setVarError(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localValue ?? '',
          setName: activeSet,
        }));
        parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
      }

      if (pullRows.length > 0) {
        await Promise.all(pullRows.map(r =>
          fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${r.path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaValue ?? '' }),
          })
        ));
      }

      setVarRows([]);
      setVarDirs({});
      setVarChecked(true);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Variable sync applied' } }, '*');
    } catch (err) {
      setVarError(describeError(err, 'Apply variable sync'));
    } finally {
      setVarSyncing(false);
    }
  }, [serverUrl, activeSet, varRows, varDirs]);

  /* ── Style sync callbacks ──────────────────────────────────────────────── */

  const computeStyleDiff = useCallback(async () => {
    if (!activeSet) return;
    setStyleLoading(true);
    setStyleError(null);
    setStyleChecked(false);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          styleReadResolveRef.current = null;
          reject(new Error('Figma read timed out \u2014 is the plugin running?'));
        }, 10000);
        styleReadResolveRef.current = (tokens) => {
          clearTimeout(timeout);
          resolve(tokens);
        };
        parent.postMessage({ pluginMessage: { type: 'read-styles' } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = flattenForStyleDiff(data.tokens || {});

      const figmaMap = new Map<string, { raw: any; type: string }>(
        figmaTokens.map(t => [t.path, { raw: t.$value, type: String(t.$type ?? 'string') }])
      );
      const localMap = new Map<string, { raw: any; type: string }>(
        localFlat.map(t => [t.path, { raw: t.value, type: t.type }])
      );

      const rows: StyleDiffRow[] = [];
      for (const [path, local] of localMap) {
        const figmaEntry = figmaMap.get(path);
        if (!figmaEntry) {
          rows.push({ path, cat: 'local-only', localRaw: local.raw, localValue: summarizeStyleValue(local.raw, local.type), localType: local.type });
        } else if (JSON.stringify(figmaEntry.raw) !== JSON.stringify(local.raw)) {
          rows.push({ path, cat: 'conflict', localRaw: local.raw, figmaRaw: figmaEntry.raw, localValue: summarizeStyleValue(local.raw, local.type), figmaValue: summarizeStyleValue(figmaEntry.raw, figmaEntry.type), localType: local.type, figmaType: figmaEntry.type });
        }
      }
      for (const [path, figmaEntry] of figmaMap) {
        if (!localMap.has(path)) {
          rows.push({ path, cat: 'figma-only', figmaRaw: figmaEntry.raw, figmaValue: summarizeStyleValue(figmaEntry.raw, figmaEntry.type), figmaType: figmaEntry.type });
        }
      }

      setStyleRows(rows);
      setStyleChecked(true);
      const dirs: Record<string, 'push' | 'pull' | 'skip'> = {};
      for (const r of rows) {
        dirs[r.path] = r.cat === 'figma-only' ? 'pull' : 'push';
      }
      setStyleDirs(dirs);
    } catch (err) {
      setStyleError(describeError(err, 'Compare styles'));
    } finally {
      setStyleLoading(false);
    }
  }, [serverUrl, activeSet]);

  const applyStyleDiff = useCallback(async () => {
    const dirsSnapshot = styleDirs;
    const rowsSnapshot = styleRows;
    setStyleSyncing(true);
    setStyleError(null);
    try {
      const pushRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'push');
      const pullRows = rowsSnapshot.filter(r => dirsSnapshot[r.path] === 'pull');

      if (pushRows.length > 0) {
        const tokens = pushRows.map(r => ({
          path: r.path,
          $type: r.localType ?? 'string',
          $value: r.localRaw,
        }));
        parent.postMessage({ pluginMessage: { type: 'apply-styles', tokens } }, '*');
      }

      if (pullRows.length > 0) {
        await Promise.all(pullRows.map(r =>
          fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}/${r.path}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ $type: r.figmaType ?? 'string', $value: r.figmaRaw }),
          })
        ));
      }

      setStyleRows([]);
      setStyleDirs({});
      setStyleChecked(true);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Style sync applied' } }, '*');
    } catch (err) {
      setStyleError(describeError(err, 'Apply style sync'));
    } finally {
      setStyleSyncing(false);
    }
  }, [serverUrl, activeSet, styleRows, styleDirs]);

  /* ── Readiness callbacks ───────────────────────────────────────────────── */

  const runReadinessChecks = useCallback(async () => {
    if (!activeSet) return;
    setReadinessLoading(true);
    setReadinessError(null);
    try {
      const figmaTokens: any[] = await new Promise((resolve, reject) => {
        const cid = `publish-${Date.now()}-${Math.random()}`;
        varCorrelationIdRef.current = cid;
        const timeout = setTimeout(() => {
          varReadResolveRef.current = null;
          varCorrelationIdRef.current = null;
          reject(new Error('Figma read timed out'));
        }, 10000);
        varReadResolveRef.current = (tokens) => { clearTimeout(timeout); resolve(tokens); };
        parent.postMessage({ pluginMessage: { type: 'read-variables', correlationId: cid } }, '*');
      });

      const res = await fetch(`${serverUrl}/api/tokens/${encodeURIComponent(activeSet)}`);
      if (!res.ok) throw new Error('Could not fetch local tokens');
      const data = await res.json();
      const localFlat = flattenForVarDiff(data.tokens || {});

      const figmaMap = new Map<string, any>(figmaTokens.map(t => [t.path, t]));
      const localPaths = new Set(localFlat.map(t => t.path));

      const missingInFigma = localFlat.filter(t => !figmaMap.has(t.path));
      const missingScopes = figmaTokens.filter(t =>
        !t.$scopes || t.$scopes.length === 0 || (t.$scopes.length === 1 && t.$scopes[0] === 'ALL_SCOPES')
      );
      const missingDescriptions = figmaTokens.filter(t => !t.$description);
      const orphans = figmaTokens.filter(t => !localPaths.has(t.path));

      const checks: ReadinessCheck[] = [
        {
          id: 'all-vars',
          label: 'All tokens have Figma variables',
          status: missingInFigma.length === 0 ? 'pass' : 'fail',
          count: missingInFigma.length || undefined,
          fixLabel: missingInFigma.length > 0 ? `Push ${missingInFigma.length} missing` : undefined,
          onFix: missingInFigma.length > 0 ? () => {
            const tokens = missingInFigma.map(t => ({ path: t.path, $type: t.type, $value: t.value, setName: activeSet }));
            parent.postMessage({ pluginMessage: { type: 'apply-variables', tokens, collectionMap, modeMap } }, '*');
          } : undefined,
        },
        {
          id: 'scopes',
          label: 'Scopes set for every variable',
          status: missingScopes.length === 0 ? 'pass' : 'fail',
          count: missingScopes.length || undefined,
          detail: missingScopes.length > 0 ? 'Open Figma Variables panel \u2192 select each variable \u2192 set scopes to limit where it can be applied.' : undefined,
        },
        {
          id: 'descriptions',
          label: 'Descriptions populated',
          status: missingDescriptions.length === 0 ? 'pass' : 'fail',
          count: missingDescriptions.length || undefined,
          detail: missingDescriptions.length > 0 ? 'Add $description fields to tokens in the token editor, then re-sync to Figma.' : undefined,
        },
        {
          id: 'orphans',
          label: 'No orphan Figma variables',
          status: orphans.length === 0 ? 'pass' : 'fail',
          count: orphans.length || undefined,
          fixLabel: orphans.length > 0 ? `Delete ${orphans.length} orphan${orphans.length !== 1 ? 's' : ''}` : undefined,
          onFix: orphans.length > 0 ? async () => {
            setOrphansDeleting(true);
            try {
              await new Promise<number>((resolve, reject) => {
                const timeout = setTimeout(() => { orphansResolveRef.current = null; reject(new Error('Timeout')); }, 10000);
                orphansResolveRef.current = (count) => { clearTimeout(timeout); resolve(count); };
                parent.postMessage({ pluginMessage: { type: 'delete-orphan-variables', knownPaths: [...localPaths] } }, '*');
              });
              runReadinessChecks();
            } catch (e) {
              setReadinessError(String(e));
            } finally {
              setOrphansDeleting(false);
            }
          } : undefined,
        },
      ];
      setReadinessChecks(checks);
    } catch (err) {
      setReadinessError(describeError(err, 'Readiness checks'));
    } finally {
      setReadinessLoading(false);
    }
  }, [serverUrl, activeSet]);

  /* ── Export callbacks ───────────────────────────────────────────────────── */

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (selectedPlatforms.size === 0 || !connected) return;
    setExporting(true);
    setExportError(null);
    setExportResults([]);
    try {
      const res = await fetch(`${serverUrl}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: Array.from(selectedPlatforms) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Export failed');
      }
      const data = await res.json();
      const flatFiles: { platform: string; path: string; content: string }[] = [];
      for (const result of data.results || []) {
        for (const file of result.files || []) {
          flatFiles.push({ platform: result.platform, path: file.path, content: file.content });
        }
      }
      setExportResults(flatFiles);
      if (flatFiles.length > 0) setExpandedFile(flatFiles[0].path);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Exported ${flatFiles.length} file(s)` } }, '*');
    } catch (err) {
      setExportError(describeError(err, 'Export'));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadFile = (file: { path: string; content: string }) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'tokens.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyFile = (file: { path: string; content: string }) => {
    navigator.clipboard.writeText(file.content);
    setCopiedFile(file.path);
    setTimeout(() => setCopiedFile(null), 1500);
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied to clipboard' } }, '*');
  };

  const handleCopyAllPlatformResults = () => {
    const allContent = exportResults.map(f => `/* ${f.platform}: ${f.path} */\n${f.content}`).join('\n\n');
    navigator.clipboard.writeText(allContent);
    parent.postMessage({ pluginMessage: { type: 'notify', message: `Copied ${exportResults.length} file(s) to clipboard` } }, '*');
  };

  /* ── Computed values ───────────────────────────────────────────────────── */

  const varSyncCount = Object.values(varDirs).filter(d => d !== 'skip').length;
  const varPushCount = Object.values(varDirs).filter(d => d === 'push').length;
  const varPullCount = Object.values(varDirs).filter(d => d === 'pull').length;
  const styleSyncCount = Object.values(styleDirs).filter(d => d !== 'skip').length;
  const stylePushCount = Object.values(styleDirs).filter(d => d === 'push').length;
  const stylePullCount = Object.values(styleDirs).filter(d => d === 'pull').length;
  const readinessFails = readinessChecks.filter(c => c.status === 'fail').length;
  const readinessPasses = readinessChecks.filter(c => c.status === 'pass').length;

  const allChanges = gitStatus?.status
    ? [
        ...gitStatus.status.modified.map(f => ({ file: f, status: 'M' })),
        ...gitStatus.status.created.map(f => ({ file: f, status: 'A' })),
        ...gitStatus.status.deleted.map(f => ({ file: f, status: 'D' })),
        ...gitStatus.status.not_added.map(f => ({ file: f, status: '?' })),
      ]
    : [];

  /* ── Not connected ─────────────────────────────────────────────────────── */

  if (!connected) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--color-figma-text-secondary)] text-[11px]">
        Connect to server to publish tokens
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="flex flex-col h-full">
      {/* ── Pre-publish readiness gate ──────────────────────────────────── */}
      <div className="px-3 py-2 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              readinessLoading ? 'bg-[var(--color-figma-text-secondary)] animate-pulse' :
              readinessFails === 0 && readinessPasses > 0 ? 'bg-[var(--color-figma-success)]' :
              readinessFails > 0 ? 'bg-[var(--color-figma-error)]' :
              'bg-[var(--color-figma-border)]'
            }`} />
            <span className="text-[10px] font-medium text-[var(--color-figma-text)]">Publish Readiness</span>
            {readinessFails > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] font-medium">{readinessFails} issue{readinessFails !== 1 ? 's' : ''}</span>
            )}
            {readinessFails === 0 && readinessPasses > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Ready</span>
            )}
          </div>
          <button
            onClick={runReadinessChecks}
            disabled={readinessLoading || !activeSet}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
          >
            {readinessLoading ? 'Checking\u2026' : readinessChecks.length > 0 ? 'Re-check' : 'Run checks'}
          </button>
        </div>

        {readinessError && (
          <div className="mt-1.5 text-[10px] text-[var(--color-figma-error)]">{readinessError}</div>
        )}

        {readinessChecks.length > 0 && (
          <div className="mt-2 divide-y divide-[var(--color-figma-border)] rounded border border-[var(--color-figma-border)] overflow-hidden">
            {readinessChecks.map(check => (
              <div key={check.id} className="flex items-center gap-2 px-3 py-2 bg-[var(--color-figma-bg)]">
                <span className={`shrink-0 ${check.status === 'pass' ? 'text-[var(--color-figma-success)]' : 'text-[var(--color-figma-error)]'}`}>
                  {check.status === 'pass' ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[var(--color-figma-text)]">{check.label}</div>
                  {check.count !== undefined && check.status === 'fail' && (
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{check.count} affected</div>
                  )}
                  {check.detail && check.status === 'fail' && (
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] mt-0.5 leading-relaxed">{check.detail}</div>
                  )}
                </div>
                {check.fixLabel && check.onFix && (
                  <button
                    onClick={check.onFix}
                    disabled={orphansDeleting}
                    className="text-[9px] px-2 py-0.5 rounded border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] hover:bg-[var(--color-figma-accent)]/10 shrink-0 disabled:opacity-40"
                  >
                    {orphansDeleting && check.id === 'orphans' ? 'Deleting\u2026' : check.fixLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readinessLoading && readinessChecks.length === 0 && !readinessError && (
          <div className="mt-1 text-[9px] text-[var(--color-figma-text-secondary)]">
            Click <strong className="font-medium text-[var(--color-figma-text)]">Run checks</strong> to validate before publishing.
          </div>
        )}
      </div>

      {/* ── Scrollable sections ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">

        {/* ── Section: Figma Variables ──────────────────────────────────── */}
        <Section
          title="Figma Variables"
          open={openSections.has('figma-variables')}
          onToggle={() => toggleSection('figma-variables')}
          badge={
            varChecked && varRows.length === 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
              : varRows.length > 0
                ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{varRows.length} differ</span>
                : null
          }
        >
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2">
            Keep local tokens and Figma variables in sync. Push local changes to Figma, or pull Figma changes back.
          </div>

          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Token differences</span>
            <button
              onClick={computeVarDiff}
              disabled={varLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {varLoading ? 'Checking\u2026' : varChecked ? 'Re-check' : 'Compare'}
            </button>
          </div>

          {varError && (
            <div className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{varError}</div>
          )}

          {varRows.length > 0 && (() => {
            const localOnly = varRows.filter(r => r.cat === 'local-only');
            const figmaOnly = varRows.filter(r => r.cat === 'figma-only');
            const conflicts = varRows.filter(r => r.cat === 'conflict');

            return (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
                  {(['push', 'pull', 'skip'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => setVarDirs(Object.fromEntries(varRows.map(r => [r.path, action])))}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                    >
                      {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-[var(--color-figma-border)] max-h-52 overflow-y-auto">
                  {localOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                    </div>
                  )}
                  {localOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'push'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {figmaOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                    </div>
                  )}
                  {figmaOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'pull'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {conflicts.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                    </div>
                  )}
                  {conflicts.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={varDirs[row.path] ?? 'push'} onChange={d => setVarDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                </div>

                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                    {varSyncCount === 0
                      ? 'Nothing to apply \u2014 all skipped'
                      : [
                          varPushCount > 0 ? `\u2191 ${varPushCount} to Figma` : null,
                          varPullCount > 0 ? `\u2193 ${varPullCount} to local` : null,
                        ].filter(Boolean).join(' \u00b7 ')
                    }
                  </span>
                  <button
                    onClick={applyVarDiff}
                    disabled={varSyncing || varSyncCount === 0}
                    className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                  >
                    {varSyncing ? 'Syncing\u2026' : `Apply ${varSyncCount > 0 ? varSyncCount + ' change' + (varSyncCount !== 1 ? 's' : '') : ''}`}
                  </button>
                </div>
              </>
            );
          })()}

          {!varLoading && !varError && (
            varChecked && varRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Local tokens match Figma variables.
              </div>
            ) : !varChecked && varRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which tokens differ between local files and Figma.
              </div>
            ) : null
          )}
        </Section>

        {/* ── Section: Figma Styles ────────────────────────────────────── */}
        <Section
          title="Figma Styles"
          open={openSections.has('figma-styles')}
          onToggle={() => toggleSection('figma-styles')}
          badge={
            styleChecked && styleRows.length === 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
              : styleRows.length > 0
                ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{styleRows.length} differ</span>
                : null
          }
        >
          <div className="text-[10px] text-[var(--color-figma-text-secondary)] px-3 py-2">
            Sync color, text, and effect styles between local tokens and Figma styles.
          </div>

          <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between border-t border-[var(--color-figma-border)]">
            <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Style differences</span>
            <button
              onClick={computeStyleDiff}
              disabled={styleLoading || !activeSet}
              className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
            >
              {styleLoading ? 'Checking\u2026' : styleChecked ? 'Re-check' : 'Compare'}
            </button>
          </div>

          {styleError && (
            <div className="px-3 py-2 text-[10px] text-[var(--color-figma-error)]">{styleError}</div>
          )}

          {styleRows.length > 0 && (() => {
            const localOnly = styleRows.filter(r => r.cat === 'local-only');
            const figmaOnly = styleRows.filter(r => r.cat === 'figma-only');
            const conflicts = styleRows.filter(r => r.cat === 'conflict');

            return (
              <>
                <div className="flex items-center gap-1.5 px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg)]">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)] mr-0.5">Select all:</span>
                  {(['push', 'pull', 'skip'] as const).map(action => (
                    <button
                      key={action}
                      onClick={() => setStyleDirs(Object.fromEntries(styleRows.map(r => [r.path, action])))}
                      className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] capitalize"
                    >
                      {action === 'push' ? '\u2191 Push all' : action === 'pull' ? '\u2193 Pull all' : 'Skip all'}
                    </button>
                  ))}
                </div>

                <div className="divide-y divide-[var(--color-figma-border)] max-h-52 overflow-y-auto">
                  {localOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Local only \u2014 not yet in Figma ({localOnly.length})</span>
                    </div>
                  )}
                  {localOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleDirs[row.path] ?? 'push'} onChange={d => setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {figmaOnly.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Figma only \u2014 not in local files ({figmaOnly.length})</span>
                    </div>
                  )}
                  {figmaOnly.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleDirs[row.path] ?? 'pull'} onChange={d => setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                  {conflicts.length > 0 && (
                    <div className="px-3 py-1 bg-[var(--color-figma-bg-secondary)]">
                      <span className="text-[9px] font-medium text-[var(--color-figma-text-secondary)]">Values differ \u2014 choose which to keep ({conflicts.length})</span>
                    </div>
                  )}
                  {conflicts.map(row => (
                    <VarDiffRowItem key={row.path} row={row} dir={styleDirs[row.path] ?? 'push'} onChange={d => setStyleDirs(prev => ({ ...prev, [row.path]: d }))} />
                  ))}
                </div>

                <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                  <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                    {styleSyncCount === 0
                      ? 'Nothing to apply \u2014 all skipped'
                      : [
                          stylePushCount > 0 ? `\u2191 ${stylePushCount} to Figma` : null,
                          stylePullCount > 0 ? `\u2193 ${stylePullCount} to local` : null,
                        ].filter(Boolean).join(' \u00b7 ')
                    }
                  </span>
                  <button
                    onClick={applyStyleDiff}
                    disabled={styleSyncing || styleSyncCount === 0}
                    className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                  >
                    {styleSyncing ? 'Syncing\u2026' : `Apply ${styleSyncCount > 0 ? styleSyncCount + ' change' + (styleSyncCount !== 1 ? 's' : '') : ''}`}
                  </button>
                </div>
              </>
            );
          })()}

          {!styleLoading && !styleError && (
            styleChecked && styleRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                Local tokens match Figma styles.
              </div>
            ) : !styleChecked && styleRows.length === 0 ? (
              <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which color, text, and effect styles differ.
              </div>
            ) : null
          )}
        </Section>

        {/* ── Section: Git ─────────────────────────────────────────────── */}
        <Section
          title="Git"
          open={openSections.has('git')}
          onToggle={() => toggleSection('git')}
          badge={
            gitLoading ? null :
            !gitStatus?.isRepo ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-bg)] text-[var(--color-figma-text-secondary)] font-medium border border-[var(--color-figma-border)]">No repo</span> :
            allChanges.length > 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-warning)]/15 text-yellow-600 font-medium">{allChanges.length} uncommitted</span>
              : <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">Clean</span>
          }
        >
          {gitError && (
            <div className="mx-3 mt-2 px-2 py-1.5 rounded bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
              {gitError}
            </div>
          )}

          {gitLoading && (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--color-figma-text-secondary)] text-[11px]">
              <div className="w-4 h-4 rounded-full border-2 border-[var(--color-figma-border)] border-t-[var(--color-figma-accent)] animate-spin" aria-hidden="true" />
              Loading Git status...
            </div>
          )}

          {!gitLoading && !gitStatus?.isRepo && (
            <div className="flex flex-col items-center justify-center py-6 gap-4 px-6">
              <p className="text-[12px] text-[var(--color-figma-text-secondary)]">No Git repository initialized</p>
              <div className="w-full flex flex-col gap-2">
                <label className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote URL (optional)</label>
                <input
                  type="text"
                  value={remoteUrl}
                  onChange={e => setRemoteUrl(e.target.value)}
                  placeholder="https://github.com/org/repo.git"
                  className="w-full px-2 py-1.5 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] text-[var(--color-figma-text)] placeholder:text-[var(--color-figma-text-secondary)] focus:outline-none focus:border-[var(--color-figma-accent)]"
                />
              </div>
              <button
                onClick={() => doAction('init', remoteUrl ? { remoteUrl } : undefined)}
                disabled={actionLoading !== null}
                className="w-full px-4 py-2 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-50"
              >
                {actionLoading === 'init' ? 'Initializing\u2026' : 'Initialize Repository'}
              </button>
            </div>
          )}

          {!gitLoading && gitStatus?.isRepo && (
            <div className="p-3 flex flex-col gap-2">
              {/* Branch */}
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-figma-accent)" strokeWidth="2">
                      <line x1="6" y1="3" x2="6" y2="15" />
                      <circle cx="18" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <path d="M18 9a9 9 0 01-9 9" />
                    </svg>
                    <span className="text-[11px] font-medium truncate max-w-[140px]" title={gitStatus.branch || 'main'}>{gitStatus.branch || 'main'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-medium ${allChanges.length > 0 ? 'text-yellow-600' : 'text-[var(--color-figma-success)]'}`}>
                      {allChanges.length > 0 ? `${allChanges.length} change${allChanges.length !== 1 ? 's' : ''}` : 'Clean'}
                    </span>
                    <button
                      onClick={() => { setGitLoading(true); fetchStatus(); }}
                      disabled={gitLoading}
                      title="Refresh git status"
                      className="flex items-center justify-center w-5 h-5 rounded text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] hover:text-[var(--color-figma-text)] transition-colors disabled:opacity-40"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={gitLoading ? 'animate-spin' : ''}>
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {branches.length > 1 && (
                  <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)]">
                    <select
                      value={gitStatus.branch || ''}
                      onChange={e => doAction('checkout', { branch: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none"
                    >
                      {branches.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Changed files */}
              {allChanges.length > 0 && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                    Uncommitted changes
                  </div>
                  <div className="max-h-28 overflow-y-auto divide-y divide-[var(--color-figma-border)]">
                    {allChanges.map((change, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1">
                        <span className={`text-[9px] font-mono font-bold w-3 ${
                          change.status === 'M' ? 'text-[var(--color-figma-warning)]' :
                          change.status === 'A' ? 'text-[var(--color-figma-success)]' :
                          change.status === 'D' ? 'text-[var(--color-figma-error)]' :
                          'text-[var(--color-figma-text-secondary)]'
                        }`}>
                          {change.status}
                        </span>
                        <span className="text-[10px] text-[var(--color-figma-text)] truncate">{change.file}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Commit */}
              {!gitStatus.status?.isClean && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                    Commit message
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <input
                      type="text"
                      value={commitMsg}
                      onChange={e => setCommitMsg(e.target.value)}
                      placeholder="Describe your changes\u2026"
                      className="w-full px-2 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] outline-none focus:border-[var(--color-figma-accent)]"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && commitMsg.trim()) doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''));
                      }}
                    />
                    <button
                      onClick={() => doAction('commit', { message: commitMsg }).then(() => setCommitMsg(''))}
                      disabled={!commitMsg.trim() || actionLoading !== null}
                      className="w-full px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {actionLoading === 'commit' ? 'Committing\u2026' : 'Commit changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* Remote URL */}
              <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                  Remote URL
                </div>
                <div className="px-3 py-2 flex gap-2">
                  <input
                    type="text"
                    value={remoteUrl}
                    onChange={e => setRemoteUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    className="flex-1 px-2 py-1 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[10px] outline-none focus:border-[var(--color-figma-accent)]"
                  />
                  <button
                    onClick={() => doAction('remote', { url: remoteUrl })}
                    disabled={!remoteUrl || actionLoading !== null}
                    className="px-2 py-1 rounded bg-[var(--color-figma-bg-hover)] text-[var(--color-figma-text)] text-[10px] hover:bg-[var(--color-figma-border)] disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Remote diff */}
              {gitStatus?.remote && (
                <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
                  <div className="px-3 py-2 bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Remote differences</span>
                      {diffView && diffView.localOnly.length + diffView.remoteOnly.length + diffView.conflicts.length === 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-success)]/15 text-[var(--color-figma-success)] font-medium">In sync</span>
                      )}
                    </div>
                    <button
                      onClick={computeDiff}
                      disabled={diffLoading}
                      className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40 transition-colors"
                    >
                      {diffLoading ? 'Computing\u2026' : diffView ? 'Re-check' : 'Compare'}
                    </button>
                  </div>
                  {diffView && (() => {
                    const allFiles = [
                      ...diffView.localOnly.map(f => ({ file: f, cat: 'local' as const })),
                      ...diffView.remoteOnly.map(f => ({ file: f, cat: 'remote' as const })),
                      ...diffView.conflicts.map(f => ({ file: f, cat: 'conflict' as const })),
                    ];
                    if (allFiles.length === 0) {
                      return (
                        <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)] flex items-center gap-1.5">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-success)] shrink-0" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Local and remote are in sync.
                        </div>
                      );
                    }
                    const pendingCount = Object.values(diffChoices).filter(c => c !== 'skip').length;
                    return (
                      <>
                        <div className="divide-y divide-[var(--color-figma-border)] max-h-48 overflow-y-auto">
                          {allFiles.map(({ file, cat }) => {
                            const choice = diffChoices[file] ?? 'skip';
                            const catLabel = cat === 'local' ? 'Local only' : cat === 'remote' ? 'Remote only' : 'Values differ';
                            const catColor = cat === 'local' ? 'text-[var(--color-figma-success)]' : cat === 'remote' ? 'text-[var(--color-figma-accent)]' : 'text-yellow-600';
                            return (
                              <div key={file} className="flex items-center gap-2 px-3 py-1.5">
                                <span className={`text-[9px] font-medium shrink-0 w-20 ${catColor}`}>{catLabel}</span>
                                <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={file}>{file}</span>
                                <select
                                  value={choice}
                                  onChange={e => setDiffChoices(prev => ({ ...prev, [file]: e.target.value as 'push' | 'pull' | 'skip' }))}
                                  className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5"
                                >
                                  <option value="push">{'\u2191'} Push</option>
                                  <option value="pull">{'\u2193'} Pull</option>
                                  <option value="skip">Skip</option>
                                </select>
                              </div>
                            );
                          })}
                        </div>
                        <div className="px-3 py-2 border-t border-[var(--color-figma-border)] flex items-center justify-between bg-[var(--color-figma-bg-secondary)]">
                          <span className="text-[9px] text-[var(--color-figma-text-secondary)]">
                            {pendingCount > 0 ? `${pendingCount} file${pendingCount !== 1 ? 's' : ''} will be updated` : 'All skipped'}
                          </span>
                          <button
                            onClick={applyDiff}
                            disabled={applyingDiff || pendingCount === 0}
                            className="text-[10px] px-3 py-1 rounded bg-[var(--color-figma-accent)] text-white font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                          >
                            {applyingDiff ? 'Applying\u2026' : `Apply ${pendingCount > 0 ? pendingCount + ' change' + (pendingCount !== 1 ? 's' : '') : ''}`}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                  {!diffLoading && !diffView && (
                    <div className="px-3 py-3 text-[10px] text-[var(--color-figma-text-secondary)]">
                      Click <strong className="font-medium text-[var(--color-figma-text)]">Compare</strong> to see which files differ between local and remote.
                    </div>
                  )}
                </div>
              )}

              {/* Push / Pull */}
              {gitStatus?.remote && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <button
                      onClick={() => doAction('pull')}
                      disabled={actionLoading !== null}
                      className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-bg)] border border-[var(--color-figma-border)] text-[var(--color-figma-text)] text-[11px] hover:bg-[var(--color-figma-bg-hover)] disabled:opacity-40"
                    >
                      {actionLoading === 'pull' ? 'Pulling\u2026' : '\u2193 Pull'}
                    </button>
                    <button
                      onClick={() => doAction('push')}
                      disabled={actionLoading !== null}
                      className="flex-1 px-3 py-1.5 rounded bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40"
                    >
                      {actionLoading === 'push' ? 'Pushing\u2026' : '\u2191 Push'}
                    </button>
                  </div>
                  {lastSynced && (
                    <p className="text-[10px] text-[var(--color-figma-text-secondary)] text-right">
                      Last synced: {formatRelativeTime(lastSynced)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        {/* ── Section: File Export ──────────────────────────────────────── */}
        <Section
          title="File Export"
          open={openSections.has('file-export')}
          onToggle={() => toggleSection('file-export')}
          badge={
            exportResults.length > 0
              ? <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--color-figma-accent)]/15 text-[var(--color-figma-accent)] font-medium">{exportResults.length} file{exportResults.length !== 1 ? 's' : ''}</span>
              : null
          }
        >
          <div className="p-3 flex flex-col gap-3">
            <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed">
              Generate platform-specific code files from the token server \u2014 CSS variables, Dart, Swift, Android, or W3C JSON.
            </div>

            {exportError && (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {exportError}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Target Platforms
                </div>
                <button
                  onClick={() => {
                    if (selectedPlatforms.size === PLATFORMS.length) {
                      setSelectedPlatforms(new Set());
                    } else {
                      setSelectedPlatforms(new Set(PLATFORMS.map(p => p.id)));
                    }
                  }}
                  className="text-[9px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                >
                  {selectedPlatforms.size === PLATFORMS.length ? 'Deselect all' : `Select all (${PLATFORMS.length})`}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {PLATFORMS.map(platform => {
                  const isSelected = selectedPlatforms.has(platform.id);
                  return (
                    <label
                      key={platform.id}
                      className={`group flex items-start gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                          : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                        isSelected
                          ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                          : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
                      }`}>
                        {isSelected && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePlatform(platform.id)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[var(--color-figma-text)]">{platform.label}</div>
                        <div className="text-[9px] text-[var(--color-figma-text-secondary)]">{platform.description}</div>
                        {isSelected && (
                          <div className="mt-1 text-[8px] font-mono text-[var(--color-figma-text-tertiary)] truncate">
                            {platform.example}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {exportResults.length === 0 && (
              <button
                onClick={handleExport}
                disabled={selectedPlatforms.size === 0 || exporting}
                className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
              >
                {exporting ? 'Exporting\u2026' : selectedPlatforms.size === 0 ? 'Select a platform to export' : `Export ${selectedPlatforms.size} Platform${selectedPlatforms.size !== 1 ? 's' : ''}`}
              </button>
            )}

            {exportResults.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                    Generated Files
                  </div>
                  <div className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                    {exportResults.length} file{exportResults.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  {exportResults.map((file, i) => (
                    <div key={i} className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
                      <button
                        onClick={() => setExpandedFile(expandedFile === file.path ? null : file.path)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium uppercase shrink-0">
                            {file.platform}
                          </span>
                          <span className="text-[10px] text-[var(--color-figma-text)] font-mono truncate">{file.path}</span>
                        </div>
                        <svg
                          width="8" height="8" viewBox="0 0 8 8"
                          className={`transition-transform shrink-0 ml-2 ${expandedFile === file.path ? 'rotate-90' : ''}`}
                          fill="currentColor"
                        >
                          <path d="M2 1l4 3-4 3V1z" />
                        </svg>
                      </button>
                      {expandedFile === file.path && (
                        <div className="border-t border-[var(--color-figma-border)]">
                          <pre className="p-3 text-[10px] font-mono text-[var(--color-figma-text)] bg-[var(--color-figma-bg)] overflow-auto max-h-48 whitespace-pre-wrap break-all">
                            {file.content}
                          </pre>
                          <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                            <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                              {file.content.split('\n').length} lines
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleDownloadFile(file)}
                                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] transition-colors"
                                title="Download file"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download
                              </button>
                              <button
                                onClick={() => handleCopyFile(file)}
                                className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                                title="Copy to clipboard"
                              >
                                {copiedFile === file.path ? (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    Copied
                                  </>
                                ) : (
                                  <>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <rect x="9" y="9" width="13" height="13" rx="2" />
                                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                    Copy
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleCopyAllPlatformResults}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy All
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={selectedPlatforms.size === 0 || exporting}
                    className="flex-1 px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors"
                  >
                    {exporting ? 'Exporting\u2026' : 'Re-export'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ── VarDiffRowItem ──────────────────────────────────────────────────────── */

function VarDiffRowItem({ row, dir, onChange }: {
  row: VarDiffRow;
  dir: 'push' | 'pull' | 'skip';
  onChange: (dir: 'push' | 'pull' | 'skip') => void;
}) {
  return (
    <div className="px-3 py-1.5 flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[var(--color-figma-text)] flex-1 truncate font-mono" title={row.path}>{row.path}</span>
        <select
          value={dir}
          onChange={e => onChange(e.target.value as 'push' | 'pull' | 'skip')}
          className="text-[9px] border border-[var(--color-figma-border)] rounded bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] outline-none px-1 py-0.5 shrink-0"
        >
          <option value="push">{'\u2191'} Push to Figma</option>
          <option value="pull">{'\u2193'} Pull to local</option>
          <option value="skip">Skip</option>
        </select>
      </div>
      {row.cat === 'conflict' && (
        <div className="flex items-center gap-2 pl-0.5">
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Local:</span>
          <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate" title={row.localValue}>{truncateValue(row.localValue ?? '')}</span>
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0 mx-0.5">vs</span>
          <span className="text-[9px] text-[var(--color-figma-text-secondary)] shrink-0">Figma:</span>
          <span className="text-[9px] font-mono text-[var(--color-figma-text)] truncate" title={row.figmaValue}>{truncateValue(row.figmaValue ?? '')}</span>
        </div>
      )}
      {row.cat === 'local-only' && row.localValue !== undefined && (
        <div className="pl-0.5">
          <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.localValue)}</span>
        </div>
      )}
      {row.cat === 'figma-only' && row.figmaValue !== undefined && (
        <div className="pl-0.5">
          <span className="text-[9px] font-mono text-[var(--color-figma-text-secondary)]">{truncateValue(row.figmaValue)}</span>
        </div>
      )}
    </div>
  );
}
