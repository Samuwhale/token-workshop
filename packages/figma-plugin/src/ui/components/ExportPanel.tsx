import { getErrorMessage } from '../shared/utils';
import { Spinner } from './Spinner';
import { STORAGE_KEYS, lsGetJson, lsSetJson, lsGet, lsSet } from '../shared/storage';
import { useState, useEffect, useRef } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { TOKEN_TYPE_BADGE_CLASS } from '../../shared/types';
import { PLATFORMS } from '../shared/platforms';
import type { Platform } from '../shared/platforms';

interface ExportPanelProps {
  serverUrl: string;
  connected: boolean;
}

interface ExportedModeValue {
  resolvedValue: any;
  reference?: string;
  isAlias: boolean;
}

interface ExportedVariable {
  name: string;
  path: string;
  resolvedType: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

interface SavePreviewItem {
  collectionName: string;
  slug: string;
  action: 'create' | 'overwrite';
  varCount: number;
}

type ExportMode = 'platforms' | 'figma-variables';
type SavePhase = 'idle' | 'preview-loading' | 'preview' | 'saving';

function buildZipBlob(files: { path: string; content: string }[]): Blob {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (data: Uint8Array): number => {
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };
  const enc = new TextEncoder();
  const w16 = (v: DataView, p: number, n: number) => v.setUint16(p, n, true);
  const w32 = (v: DataView, p: number, n: number) => v.setUint32(p, n, true);
  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = enc.encode(file.path);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const sz = data.length;

    const lh = new ArrayBuffer(30 + name.length);
    const lv = new DataView(lh);
    w32(lv, 0, 0x04034b50); w16(lv, 4, 20); w16(lv, 6, 0); w16(lv, 8, 0);
    w16(lv, 10, dosTime); w16(lv, 12, dosDate);
    w32(lv, 14, crc); w32(lv, 18, sz); w32(lv, 22, sz);
    w16(lv, 26, name.length); w16(lv, 28, 0);
    new Uint8Array(lh, 30).set(name);
    const lhBytes = new Uint8Array(lh);

    const cd = new ArrayBuffer(46 + name.length);
    const cv = new DataView(cd);
    w32(cv, 0, 0x02014b50); w16(cv, 4, 20); w16(cv, 6, 20); w16(cv, 8, 0); w16(cv, 10, 0);
    w16(cv, 12, dosTime); w16(cv, 14, dosDate);
    w32(cv, 16, crc); w32(cv, 20, sz); w32(cv, 24, sz);
    w16(cv, 28, name.length); w16(cv, 30, 0); w16(cv, 32, 0);
    w16(cv, 34, 0); w16(cv, 36, 0); w32(cv, 38, 0); w32(cv, 42, offset);
    new Uint8Array(cd, 46).set(name);

    parts.push(lhBytes, data);
    centralDir.push(new Uint8Array(cd));
    offset += lhBytes.length + sz;
  }

  const cdSize = centralDir.reduce((s, e) => s + e.length, 0);
  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  w32(ev, 0, 0x06054b50); w16(ev, 4, 0); w16(ev, 6, 0);
  w16(ev, 8, files.length); w16(ev, 10, files.length);
  w32(ev, 12, cdSize); w32(ev, 16, offset); w16(ev, 20, 0);

  return new Blob([...parts, ...centralDir, new Uint8Array(eocd)], { type: 'application/zip' });
}

export function ExportPanel({ serverUrl, connected }: ExportPanelProps) {
  const [mode, setMode] = useState<ExportMode>('platforms');
  const [selected, setSelected] = useState<Set<string>>(() => {
    const parsed = lsGetJson<string[]>(STORAGE_KEYS.EXPORT_PLATFORMS, []);
    return Array.isArray(parsed) && parsed.length > 0 ? new Set(parsed) : new Set(['css']);
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ platform: string; path: string; content: string }[]>([]);
  const [previewFileIndex, setPreviewFileIndex] = useState<number>(0);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // CSS selector option
  const [cssSelector, setCssSelector] = useState<string>(() => {
    return lsGet(STORAGE_KEYS.EXPORT_CSS_SELECTOR, ':root');
  });

  // ZIP download options
  const [zipFilename, setZipFilename] = useState<string>(() => {
    return lsGet(STORAGE_KEYS.EXPORT_ZIP_FILENAME, 'tokens');
  });
  const [nestByPlatform, setNestByPlatform] = useState<boolean>(() => {
    return lsGetJson<boolean>(STORAGE_KEYS.EXPORT_NEST_PLATFORM, false) === true;
  });

  // Set filter state
  const [availableSets, setAvailableSets] = useState<string[]>([]);
  const [selectedSets, setSelectedSets] = useState<Set<string> | null>(null); // null = all sets

  // Type filter state — null means all types
  const ALL_TOKEN_TYPES = Object.keys(TOKEN_TYPE_BADGE_CLASS);
  const [selectedTypes, setSelectedTypes] = useState<Set<string> | null>(() => {
    const saved = lsGetJson<string[] | null>(STORAGE_KEYS.EXPORT_TYPES, null);
    return Array.isArray(saved) ? new Set(saved) : null;
  });

  // Path prefix filter
  const [pathPrefix, setPathPrefix] = useState<string>(() => {
    return lsGet(STORAGE_KEYS.EXPORT_PATH_PREFIX, '');
  });

  // Figma variables export state
  const [figmaLoading, setFigmaLoading] = useState(false);
  const figmaLoadingRef = useRef(false);
  figmaLoadingRef.current = figmaLoading;
  const figmaLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [figmaCollections, setFigmaCollections] = useState<ExportedCollection[]>([]);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Save-to-server preview state
  const [savePhase, setSavePhase] = useState<SavePhase>('idle');
  const [savePreviewItems, setSavePreviewItems] = useState<SavePreviewItem[]>([]);
  const [slugRenames, setSlugRenames] = useState<Record<string, string>>({});

  // Persist selected platforms
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_PLATFORMS, [...selected]);
  }, [selected]);

  // Persist CSS selector
  useEffect(() => {
    lsSet(STORAGE_KEYS.EXPORT_CSS_SELECTOR, cssSelector);
  }, [cssSelector]);

  // Persist ZIP options
  useEffect(() => {
    lsSet(STORAGE_KEYS.EXPORT_ZIP_FILENAME, zipFilename);
  }, [zipFilename]);
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_NEST_PLATFORM, nestByPlatform);
  }, [nestByPlatform]);

  // Persist type filter
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_TYPES, selectedTypes === null ? null : [...selectedTypes]);
  }, [selectedTypes]);

  // Persist path prefix
  useEffect(() => {
    lsSet(STORAGE_KEYS.EXPORT_PATH_PREFIX, pathPrefix);
  }, [pathPrefix]);

  // Listen for messages from the plugin sandbox
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;

      if (msg.type === 'all-variables-exported') {
        if (figmaLoadingTimeoutRef.current !== null) {
          clearTimeout(figmaLoadingTimeoutRef.current);
          figmaLoadingTimeoutRef.current = null;
        }
        setFigmaCollections(msg.collections || []);
        setFigmaLoading(false);
        if (msg.collections?.length > 0) {
          setExpandedCollection(msg.collections[0].name);
        }
      }
      if (msg.type === 'error' && figmaLoadingRef.current) {
        if (figmaLoadingTimeoutRef.current !== null) {
          clearTimeout(figmaLoadingTimeoutRef.current);
          figmaLoadingTimeoutRef.current = null;
        }
        setError(msg.message);
        setFigmaLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  // Fetch available sets when connected
  useEffect(() => {
    if (!connected) return;
    apiFetch<{ sets?: string[] }>(`${serverUrl}/api/sets`)
      .then((data) => {
        setAvailableSets(data.sets || []);
      })
      .catch((err) => { console.warn('[ExportPanel] failed to fetch sets:', err); });
  }, [connected, serverUrl]);

  const toggleSet = (name: string) => {
    setSelectedSets(prev => {
      // If currently "all", transition to all-except-toggled
      const base = prev ?? new Set(availableSets);
      const next = new Set(base);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      // If all sets are selected again, reset to null (= all)
      return next.size === availableSets.length ? null : next;
    });
  };

  const togglePlatform = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.size === 0 || !connected) return;
    setExporting(true);
    setError(null);
    setResults([]);

    try {
      const body: { platforms: string[]; sets?: string[]; types?: string[]; pathPrefix?: string; cssSelector?: string } = { platforms: Array.from(selected) };
      if (selectedSets !== null) body.sets = Array.from(selectedSets);
      if (selectedTypes !== null) body.types = Array.from(selectedTypes);
      if (pathPrefix.trim()) body.pathPrefix = pathPrefix.trim();
      if (selected.has('css') && cssSelector && cssSelector !== ':root') body.cssSelector = cssSelector;
      const data = await apiFetch<{ results?: { platform: string; files: { path: string; content: string }[] }[] }>(
        `${serverUrl}/api/export`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const flatFiles: { platform: string; path: string; content: string }[] = [];
      for (const result of data.results || []) {
        for (const file of result.files || []) {
          flatFiles.push({ platform: result.platform, path: file.path, content: file.content });
        }
      }
      setResults(flatFiles);
      if (flatFiles.length > 0) setPreviewFileIndex(0);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Exported ${flatFiles.length} file(s)` } }, '*');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const handleExportFigmaVariables = () => {
    setFigmaLoading(true);
    setFigmaCollections([]);
    setError(null);
    if (figmaLoadingTimeoutRef.current !== null) {
      clearTimeout(figmaLoadingTimeoutRef.current);
    }
    figmaLoadingTimeoutRef.current = setTimeout(() => {
      figmaLoadingTimeoutRef.current = null;
      setFigmaLoading(false);
      setError('No response from Figma — make sure a Figma document is open and the plugin is running.');
    }, 10000);
    parent.postMessage({ pluginMessage: { type: 'export-all-variables' } }, '*');
  };

  const buildDTCGJson = (): string => {
    const output: Record<string, any> = {};

    for (const collection of figmaCollections) {
      const collectionObj: Record<string, any> = {};

      for (const variable of collection.variables) {
        const parts = variable.path.split('.');
        let current = collectionObj;

        // Create nested structure
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        const lastKey = parts[parts.length - 1];

        if (collection.modes.length === 1) {
          // Single mode — flat token
          const modeVal = variable.modeValues[collection.modes[0]];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else {
          // Multi-mode — include $extensions with mode values
          const defaultMode = collection.modes[0];
          const defaultVal = variable.modeValues[defaultMode];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;

          const modeExtensions: Record<string, any> = {};
          for (const modeName of collection.modes) {
            const modeVal = variable.modeValues[modeName];
            modeExtensions[modeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
          }
          token.$extensions = {
            'com.figma': {
              collection: collection.name,
              hiddenFromPublishing: variable.hiddenFromPublishing,
              scopes: variable.scopes,
              modes: modeExtensions,
            },
          };

          current[lastKey] = token;
        }
      }

      output[collection.name] = collectionObj;
    }

    return JSON.stringify(output, null, 2);
  };

  /** Map platform IDs to folder names used by Style Dictionary */
  const PLATFORM_FOLDERS: Record<string, string> = {
    css: 'css', dart: 'dart', 'ios-swift': 'ios', android: 'android',
    json: 'json', scss: 'scss', less: 'less', typescript: 'ts',
  };

  const handleDownloadZip = () => {
    const zipFiles = nestByPlatform
      ? results.map(f => ({
          path: `${PLATFORM_FOLDERS[f.platform] || f.platform}/${f.path}`,
          content: f.content,
        }))
      : results;
    const blob = buildZipBlob(zipFiles);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = zipFilename.trim().replace(/\.zip$/i, '') || 'tokens';
    a.download = `${safeName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    parent.postMessage({ pluginMessage: { type: 'notify', message: `Downloaded ${results.length} file(s) as ZIP` } }, '*');
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

  const handleCopyFile = async (file: { path: string; content: string }) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedFile(file.path);
      setTimeout(() => setCopiedFile(null), 1500);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied to clipboard' } }, '*');
    } catch (err) {
      console.warn('[ExportPanel] clipboard write failed for file copy:', err);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*');
    }
  };

  const handleCopyAll = async () => {
    const json = buildDTCGJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Copied all variables as DTCG JSON' } }, '*');
    } catch (err) {
      console.warn('[ExportPanel] clipboard write failed for copy all:', err);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*');
    }
  };

  const handleCopyAllPlatformResults = async () => {
    const allContent = results.map(f => `/* ${f.platform}: ${f.path} */\n${f.content}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(allContent);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Copied ${results.length} file(s) to clipboard` } }, '*');
    } catch (err) {
      console.warn('[ExportPanel] clipboard write failed for copy all platform results:', err);
      parent.postMessage({ pluginMessage: { type: 'notify', message: 'Clipboard access denied' } }, '*');
    }
  };

  const handlePreviewSave = async () => {
    if (!connected) return;
    setSavePhase('preview-loading');
    setError(null);
    setSlugRenames({});

    try {
      const data = await apiFetch<{ sets?: string[] }>(`${serverUrl}/api/sets`);
      const existingSlugs = new Set(data.sets || []);

      const items: SavePreviewItem[] = figmaCollections.map(collection => {
        const slug = collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
        return {
          collectionName: collection.name,
          slug,
          action: existingSlugs.has(slug) ? 'overwrite' : 'create',
          varCount: collection.variables.length,
        };
      });

      setSavePreviewItems(items);
      setSavePhase('preview');
    } catch (err) {
      setError(getErrorMessage(err));
      setSavePhase('idle');
    }
  };

  const handleConfirmSave = async () => {
    if (!connected) return;
    setSavePhase('saving');
    setError(null);

    try {
      for (const collection of figmaCollections) {
        const defaultSlug = collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
        const setName = slugRenames[collection.name] ?? defaultSlug;

        // Ensure set exists — 409 means it already exists, which is fine.
        // Any other error propagates and aborts the whole operation (fail-fast).
        await apiFetch(`${serverUrl}/api/sets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: setName }),
        }).catch((err) => {
          if (err instanceof ApiError && err.status === 409) return;
          throw new Error(`Failed to create set "${setName}": ${err instanceof Error ? err.message : String(err)}`);
        });

        // Build all tokens and upsert in a single batch request
        const batchTokens = collection.variables.map(variable => {
          const defaultMode = collection.modes[0];
          const defaultVal = variable.modeValues[defaultMode];
          const $value = defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue;

          const token: Record<string, any> = {
            path: variable.path,
            $type: variable.$type,
            $value,
          };
          if (variable.description) token.$description = variable.description;

          // Add mode extensions for multi-mode collections
          if (collection.modes.length > 1) {
            const modeExtensions: Record<string, any> = {};
            for (const modeName of collection.modes) {
              const modeVal = variable.modeValues[modeName];
              modeExtensions[modeName] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
            }
            token.$extensions = {
              'com.figma': {
                collection: collection.name,
                hiddenFromPublishing: variable.hiddenFromPublishing,
                scopes: variable.scopes,
                modes: modeExtensions,
              },
            };
          }

          return token;
        });

        await apiFetch(`${serverUrl}/api/tokens/${encodeURIComponent(setName)}/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: batchTokens, strategy: 'overwrite' }),
        }).catch((err) => {
          throw new Error(`Failed to save tokens for "${setName}": ${err instanceof Error ? err.message : String(err)}`);
        });
      }

      const totalVars = figmaCollections.reduce((sum, c) => sum + c.variables.length, 0);
      parent.postMessage({ pluginMessage: { type: 'notify', message: `Saved ${totalVars} variables to server` } }, '*');
      setSavePhase('idle');
      setSavePreviewItems([]);
      setSlugRenames({});
    } catch (err) {
      setError(getErrorMessage(err));
      setSavePhase('idle');
    }
  };

  const formatModeValue = (modeVal: ExportedModeValue): string => {
    if (modeVal.isAlias) return modeVal.reference || '';
    if (modeVal.resolvedValue === null || modeVal.resolvedValue === undefined) return 'null';
    return String(modeVal.resolvedValue);
  };

  // Track when we auto-switch mode due to disconnection
  const [modeAutoSwitched, setModeAutoSwitched] = useState(false);

  // When not connected, switch to figma-variables mode since it doesn't require a server
  useEffect(() => {
    if (!connected && mode === 'platforms') {
      setMode('figma-variables');
      setModeAutoSwitched(true);
    }
    // Clear the notice once reconnected
    if (connected && modeAutoSwitched) {
      setModeAutoSwitched(false);
    }
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
        {error && (
          <div role="alert" className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-error)]/10 text-[var(--color-figma-error)] text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
          </div>
        )}

        {/* Mode toggle — segmented control with icons */}
        <div className="flex rounded-md bg-[var(--color-figma-bg-secondary)] p-0.5 gap-0.5">
          <button
            onClick={() => setMode('platforms')}
            disabled={!connected}
            title={!connected ? 'Connect to server to use platform export' : undefined}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
              !connected
                ? 'opacity-40 cursor-not-allowed text-[var(--color-figma-text-tertiary)]'
                : mode === 'platforms'
                  ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                  : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 6L4 12l4 6M16 6l4 6-4 6M13 4l-2 16" />
            </svg>
            Platforms
          </button>
          <button
            onClick={() => setMode('figma-variables')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
              mode === 'figma-variables'
                ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] shadow-sm'
                : 'text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)]'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Import from Figma
          </button>
        </div>

        {/* Mode description */}
        <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed -mt-1">
          {mode === 'platforms'
            ? 'Generate platform-specific code files from the token server — CSS variables, Dart, Swift, Android, or W3C JSON.'
            : 'Read local variables from this Figma file, preview them, and copy as DTCG JSON or save to the token server.'}
        </div>

        {/* Auto-switch notice — shown when disconnection caused the mode to change */}
        {modeAutoSwitched && (
          <div role="status" className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-[var(--color-figma-warning)]/10 text-[var(--color-figma-text-secondary)] text-[10px]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px text-[var(--color-figma-warning)]" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span className="flex-1">
              Switched to <strong>Import from Figma</strong> — server disconnected. Platforms mode requires a server connection. Reconnect to switch back.
            </span>
            <button
              onClick={() => setModeAutoSwitched(false)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label="Dismiss"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Platform export mode */}
        {mode === 'platforms' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Target Platforms
                </div>
                <button
                  onClick={() => {
                    if (selected.size === PLATFORMS.length) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(PLATFORMS.map(p => p.id)));
                    }
                  }}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                >
                  {selected.size === PLATFORMS.length ? 'Deselect all' : `Select all (${PLATFORMS.length})`}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {PLATFORMS.map(platform => {
                  const isSelected = selected.has(platform.id);
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
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)]">{platform.description}</div>
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

            {selected.has('css') && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                    CSS Selector
                  </div>
                  {cssSelector !== ':root' && (
                    <button
                      onClick={() => setCssSelector(':root')}
                      className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                    >
                      Reset to :root
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    value={cssSelector}
                    onChange={e => setCssSelector(e.target.value)}
                    placeholder=":root"
                    spellCheck={false}
                    className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] font-mono text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] transition-colors placeholder:text-[var(--color-figma-text-tertiary)]"
                  />
                  <div className="text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
                    Wrap CSS variables with a custom selector — e.g. <span className="font-mono">.light</span>, <span className="font-mono">[data-theme="dark"]</span>, or <span className="font-mono">:root .brand</span>
                  </div>
                </div>
              </div>
            )}

            {availableSets.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                    Token Sets
                  </div>
                  <button
                    onClick={() => {
                      if (selectedSets === null) {
                        setSelectedSets(new Set());
                      } else {
                        setSelectedSets(null);
                      }
                    }}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    {selectedSets === null ? `Deselect all` : `Select all (${availableSets.length})`}
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  {availableSets.map(setName => {
                    const isSelected = selectedSets === null || selectedSets.has(setName);
                    return (
                      <label
                        key={setName}
                        className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-md border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[var(--color-figma-accent)] bg-[var(--color-figma-accent)]/5'
                            : 'border-[var(--color-figma-border)] hover:border-[var(--color-figma-text-tertiary)] hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                            : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
                        }`}>
                          {isSelected && (
                            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSet(setName)}
                          className="sr-only"
                        />
                        <span className="text-[11px] text-[var(--color-figma-text)] font-mono truncate">{setName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Token type filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Token Types
                </div>
                <button
                  onClick={() => setSelectedTypes(prev => prev === null ? new Set() : null)}
                  className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                >
                  {selectedTypes === null ? `Filter types` : `All types`}
                </button>
              </div>
              {selectedTypes !== null && (
                <div className="flex flex-wrap gap-1">
                  {ALL_TOKEN_TYPES.map(type => {
                    const isChecked = selectedTypes.has(type);
                    return (
                      <button
                        key={type}
                        onClick={() => setSelectedTypes(prev => {
                          const next = new Set(prev ?? ALL_TOKEN_TYPES);
                          if (next.has(type)) { next.delete(type); } else { next.add(type); }
                          return next.size === 0 ? new Set() : next;
                        })}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors border ${
                          isChecked
                            ? 'bg-[var(--color-figma-accent)]/10 border-[var(--color-figma-accent)] text-[var(--color-figma-accent)]'
                            : 'border-[var(--color-figma-border)] text-[var(--color-figma-text-tertiary)] hover:border-[var(--color-figma-text-tertiary)]'
                        }`}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedTypes === null && (
                <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                  All token types included. Click "Filter types" to restrict.
                </div>
              )}
            </div>

            {/* Path prefix filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                  Path Prefix
                </div>
                {pathPrefix && (
                  <button
                    onClick={() => setPathPrefix('')}
                    className="text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="text"
                value={pathPrefix}
                onChange={e => setPathPrefix(e.target.value)}
                placeholder="e.g. color or spacing.scale"
                spellCheck={false}
                className="w-full px-2.5 py-1.5 rounded-md border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] text-[11px] font-mono text-[var(--color-figma-text)] focus:outline-none focus:border-[var(--color-figma-accent)] transition-colors placeholder:text-[var(--color-figma-text-tertiary)]"
              />
              <div className="mt-1 text-[10px] text-[var(--color-figma-text-tertiary)] leading-relaxed">
                Export only tokens under this path — e.g. <span className="font-mono">color</span> or <span className="font-mono">spacing.scale</span>
              </div>
            </div>

            {results.length > 0 && (
              <div>
                <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide mb-2">
                  ZIP Options
                </div>
                <div className="flex flex-col gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0">Filename</label>
                    <div className="flex items-center flex-1 min-w-0 rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg)] overflow-hidden">
                      <input
                        type="text"
                        value={zipFilename}
                        onChange={(e) => setZipFilename(e.target.value)}
                        placeholder="tokens"
                        className="flex-1 min-w-0 px-2 py-1 bg-transparent text-[10px] text-[var(--color-figma-text)] font-mono outline-none"
                      />
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)] pr-2 shrink-0">.zip</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={nestByPlatform}
                      onChange={() => setNestByPlatform(!nestByPlatform)}
                      className="sr-only"
                    />
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      nestByPlatform
                        ? 'bg-[var(--color-figma-accent)] border-[var(--color-figma-accent)]'
                        : 'border-[var(--color-figma-border)] group-hover:border-[var(--color-figma-text-tertiary)]'
                    }`}>
                      {nestByPlatform && (
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--color-figma-text)]">Nest files by platform folder</span>
                    <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">e.g. css/variables.css</span>
                  </label>
                </div>
              </div>
            )}

            {results.length > 0 && (() => {
              const activeFile = results[previewFileIndex] ?? results[0];
              const lines = activeFile.content.split('\n');
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                      Preview
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExport}
                        disabled={selected.size === 0 || !connected || exporting}
                        title="Re-run export with current settings"
                        className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {exporting ? (
                          <Spinner size="sm" />
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        )}
                        Refresh
                      </button>
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                        {results.length} file{results.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* File tabs */}
                  <div className="flex gap-0.5 overflow-x-auto pb-1 mb-1 scrollbar-thin">
                    {results.map((file, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewFileIndex(i)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-t-md text-[10px] font-mono whitespace-nowrap shrink-0 transition-colors border border-b-0 ${
                          i === previewFileIndex
                            ? 'bg-[var(--color-figma-bg)] text-[var(--color-figma-text)] border-[var(--color-figma-border)]'
                            : 'bg-transparent text-[var(--color-figma-text-tertiary)] border-transparent hover:text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)]'
                        }`}
                      >
                        <span className="px-1 py-0.5 rounded bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)] text-[8px] font-medium uppercase font-sans">
                          {file.platform}
                        </span>
                        {file.path}
                      </button>
                    ))}
                  </div>

                  {/* Code preview */}
                  <div className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
                    <div className="overflow-auto max-h-64 bg-[var(--color-figma-bg)]">
                      <table className="w-full border-collapse">
                        <tbody>
                          {lines.map((line, lineIdx) => (
                            <tr key={lineIdx} className="hover:bg-[var(--color-figma-bg-hover)]/50">
                              <td className="px-2 py-0 text-[9px] font-mono text-[var(--color-figma-text-tertiary)] text-right select-none w-[1%] whitespace-nowrap border-r border-[var(--color-figma-border)] align-top">
                                {lineIdx + 1}
                              </td>
                              <td className="px-3 py-0 text-[10px] font-mono text-[var(--color-figma-text)] whitespace-pre break-all">
                                {line || '\u00A0'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Preview footer */}
                    <div className="px-3 py-1.5 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex items-center justify-between">
                      <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                        {lines.length} line{lines.length !== 1 ? 's' : ''}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadFile(activeFile)}
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
                          onClick={() => handleCopyFile(activeFile)}
                          className="flex items-center gap-1 text-[10px] text-[var(--color-figma-accent)] hover:text-[var(--color-figma-accent-hover)] transition-colors"
                          title="Copy to clipboard"
                        >
                          {copiedFile === activeFile.path ? (
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
                </div>
              );
            })()}
          </>
        )}

        {/* Extract Figma Variables mode */}
        {mode === 'figma-variables' && (
          <>
            {figmaLoading && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Spinner size="xl" className="text-[var(--color-figma-accent)]" />
                <div className="text-[11px] text-[var(--color-figma-text-secondary)]">
                  Reading Figma variables...
                </div>
              </div>
            )}

            {!figmaLoading && figmaCollections.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-figma-bg-secondary)] flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-secondary)]" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </div>
                <div className="text-center">
                  <div className="text-[11px] text-[var(--color-figma-text)] font-medium mb-1">
                    Read Variables from this File
                  </div>
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] leading-relaxed max-w-[200px]">
                    Reads all local variable collections and references. Then copy as DTCG JSON or save directly to your token server.
                  </div>
                </div>
              </div>
            )}

            {!figmaLoading && figmaCollections.length > 0 && (
              <>
                {/* Summary bar */}
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">
                    {figmaCollections.length} collection{figmaCollections.length !== 1 ? 's' : ''} &middot;{' '}
                    {figmaCollections.reduce((sum, c) => sum + c.variables.length, 0)} variables
                  </div>
                  <button
                    onClick={handleExportFigmaVariables}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[var(--color-figma-text-secondary)] hover:text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M23 4v6h-6M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                    Reload
                  </button>
                </div>

                {/* Save-to-server preview */}
                {savePhase === 'preview' && (() => {
                  const effectiveItems = savePreviewItems.map(item => ({
                    ...item,
                    effectiveSlug: slugRenames[item.collectionName] ?? item.slug,
                  }));
                  const slugCounts = new Map<string, number>();
                  for (const item of effectiveItems) {
                    slugCounts.set(item.effectiveSlug, (slugCounts.get(item.effectiveSlug) ?? 0) + 1);
                  }
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium uppercase tracking-wide">
                          Save Preview
                        </div>
                        <div className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                          {savePreviewItems.filter(i => i.action === 'create').length} new &middot;{' '}
                          {savePreviewItems.filter(i => i.action === 'overwrite').length} overwrite
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {effectiveItems.map(item => {
                          const isConflict = (slugCounts.get(item.effectiveSlug) ?? 0) > 1;
                          return (
                            <div
                              key={item.collectionName}
                              className={`flex items-center gap-2 px-2.5 py-2 rounded-md border ${isConflict ? 'border-[var(--color-figma-error)]/40 bg-[var(--color-figma-error)]/5' : 'border-[var(--color-figma-border)]'}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-[var(--color-figma-text)] truncate font-medium">
                                  {item.collectionName}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-text-tertiary)] shrink-0" aria-hidden="true">
                                    <path d="M5 12h14M12 5l7 7-7 7" />
                                  </svg>
                                  {isConflict ? (
                                    <input
                                      type="text"
                                      value={item.effectiveSlug}
                                      onChange={e => {
                                        const val = e.target.value.replace(/[^a-zA-Z0-9_/-]/g, '-').toLowerCase();
                                        setSlugRenames(prev => ({ ...prev, [item.collectionName]: val }));
                                      }}
                                      className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-[var(--color-figma-error)]/60 bg-[var(--color-figma-bg)] text-[10px] font-mono text-[var(--color-figma-text)] outline-none focus:border-[var(--color-figma-accent)] transition-colors"
                                      spellCheck={false}
                                      aria-label={`Set name for ${item.collectionName}`}
                                    />
                                  ) : (
                                    <span className="text-[10px] font-mono text-[var(--color-figma-text-secondary)] truncate">
                                      {item.effectiveSlug}
                                    </span>
                                  )}
                                </div>
                                {isConflict && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-figma-error)] shrink-0" aria-hidden="true">
                                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <span className="text-[9px] text-[var(--color-figma-error)]">Slug conflict — rename to continue</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[9px] text-[var(--color-figma-text-tertiary)]">
                                  {item.varCount} var{item.varCount !== 1 ? 's' : ''}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium uppercase ${
                                  item.action === 'overwrite'
                                    ? 'bg-[var(--color-figma-warning,#f59e0b)]/15 text-[var(--color-figma-warning,#b45309)]'
                                    : 'bg-[var(--color-figma-accent)]/10 text-[var(--color-figma-accent)]'
                                }`}>
                                  {item.action === 'overwrite' ? 'Overwrite' : 'Create'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Collection list */}
                {savePhase !== 'preview' && <div className="flex flex-col gap-1.5">
                  {figmaCollections.map(collection => (
                    <div key={collection.name} className="rounded-md border border-[var(--color-figma-border)] overflow-hidden">
                      <button
                        onClick={() => setExpandedCollection(
                          expandedCollection === collection.name ? null : collection.name
                        )}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg
                            width="8" height="8" viewBox="0 0 8 8"
                            className={`transition-transform shrink-0 ${expandedCollection === collection.name ? 'rotate-90' : ''}`}
                            fill="currentColor"
                          >
                            <path d="M2 1l4 3-4 3V1z" />
                          </svg>
                          <span className="text-[11px] font-medium text-[var(--color-figma-text)] truncate">
                            {collection.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="text-[10px] text-[var(--color-figma-text-tertiary)]">
                            {collection.variables.length} var{collection.variables.length !== 1 ? 's' : ''}
                          </span>
                          {collection.modes.length > 1 && (
                            <span className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                              {collection.modes.length} modes
                            </span>
                          )}
                        </div>
                      </button>

                      {expandedCollection === collection.name && (
                        <div className="border-t border-[var(--color-figma-border)] divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                          {/* Mode headers */}
                          {collection.modes.length > 1 && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-figma-bg-secondary)]">
                              <div className="text-[10px] text-[var(--color-figma-text-secondary)] font-medium">Modes:</div>
                              {collection.modes.map(m => (
                                <span key={m} className="px-1.5 py-0.5 rounded bg-[var(--color-figma-bg)] text-[8px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                                  {m}
                                </span>
                              ))}
                            </div>
                          )}

                          {collection.variables.map(variable => {
                            const varKey = `${collection.name}/${variable.path}`;
                            return (
                              <div key={variable.path}>
                                <button
                                  onClick={() => setExpandedVar(expandedVar === varKey ? null : varKey)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                                >
                                  {variable.$type === 'color' && (() => {
                                    const defaultVal = variable.modeValues[collection.modes[0]];
                                    if (!defaultVal.isAlias && typeof defaultVal.resolvedValue === 'string') {
                                      return (
                                        <div
                                          className="w-3 h-3 rounded border border-[var(--color-figma-border)] shrink-0"
                                          style={{ backgroundColor: defaultVal.resolvedValue }}
                                        />
                                      );
                                    }
                                    return null;
                                  })()}
                                  <div className="flex-1 min-w-0 text-left">
                                    <div className="text-[10px] text-[var(--color-figma-text)] truncate">
                                      {variable.path}
                                    </div>
                                  </div>
                                  {(() => {
                                    const defaultVal = variable.modeValues[collection.modes[0]];
                                    if (defaultVal.isAlias) {
                                      return (
                                        <span className="px-1 py-0.5 rounded text-[8px] font-medium bg-[#e67e22]/10 text-[#e67e22] shrink-0">
                                          REF
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-medium uppercase shrink-0 ${TOKEN_TYPE_BADGE_CLASS[variable.$type ?? ''] ?? 'token-type-string'}`}>
                                    {variable.$type}
                                  </span>
                                </button>

                                {expandedVar === varKey && (
                                  <div className="px-3 py-2 bg-[var(--color-figma-bg)] border-t border-[var(--color-figma-border)]">
                                    {variable.description && (
                                      <div className="text-[10px] text-[var(--color-figma-text-secondary)] mb-1.5 italic">
                                        {variable.description}
                                      </div>
                                    )}
                                    <div className="flex flex-col gap-1">
                                      {collection.modes.map(modeName => {
                                        const modeVal = variable.modeValues[modeName];
                                        return (
                                          <div key={modeName} className="flex items-center gap-2">
                                            {collection.modes.length > 1 && (
                                              <span className="text-[8px] text-[var(--color-figma-text-secondary)] font-medium w-12 shrink-0 truncate">
                                                {modeName}:
                                              </span>
                                            )}
                                            {modeVal.isAlias ? (
                                              <span className="text-[10px] font-mono text-[#e67e22]">
                                                {modeVal.reference}
                                              </span>
                                            ) : (
                                              <span className="text-[10px] font-mono text-[var(--color-figma-text)]">
                                                {formatModeValue(modeVal)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {variable.scopes.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {variable.scopes.map(scope => (
                                          <span key={scope} className="px-1 py-0.5 rounded bg-[var(--color-figma-bg-secondary)] text-[7px] text-[var(--color-figma-text-secondary)] border border-[var(--color-figma-border)]">
                                            {scope}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>}
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky action footer */}
      <div className="p-3 border-t border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] flex flex-col gap-1.5">
        {mode === 'platforms' && results.length > 0 && (
          <>
            <div className="flex gap-1.5">
              <button
                onClick={handleCopyAllPlatformResults}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy All
              </button>
              <button
                onClick={handleDownloadZip}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 transition-colors"
                title={`Download all ${results.length} file${results.length !== 1 ? 's' : ''} as a ZIP archive`}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download ZIP
              </button>
            </div>
            <button
              onClick={handleExport}
              disabled={selected.size === 0 || (selectedSets !== null && selectedSets.size === 0) || exporting}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              title="Re-fetch tokens from the server and regenerate all platform files"
            >
              {exporting ? (
                <>
                  <Spinner />
                  Exporting…
                </>
              ) : 'Re-export'}
            </button>
          </>
        )}
        {mode === 'platforms' && results.length === 0 && (
          <button
            onClick={handleExport}
            disabled={selected.size === 0 || (selectedSets !== null && selectedSets.size === 0) || exporting}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
          >
            {exporting ? (
              <>
                <Spinner />
                Exporting…
              </>
            ) : selected.size === 0 ? 'Select a platform to export' : selectedSets !== null && selectedSets.size === 0 ? 'Select at least one set' : selectedSets !== null ? `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''} · ${selectedSets.size} Set${selectedSets.size !== 1 ? 's' : ''}` : `Export ${selected.size} Platform${selected.size !== 1 ? 's' : ''}`}
          </button>
        )}
        {mode === 'figma-variables' && figmaCollections.length === 0 && (
          <button
            onClick={handleExportFigmaVariables}
            disabled={figmaLoading}
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-70 transition-colors flex items-center justify-center gap-1.5"
          >
            {figmaLoading ? (
              <>
                <Spinner />
                Reading Variables…
              </>
            ) : (
              'Read Variables from Figma'
            )}
          </button>
        )}
        {mode === 'figma-variables' && figmaCollections.length > 0 && savePhase !== 'preview' && savePhase !== 'saving' && (
          <>
            <button
              onClick={handleCopyAll}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[var(--color-figma-accent)] text-[var(--color-figma-accent)] text-[11px] font-medium hover:bg-[var(--color-figma-accent)]/5 transition-colors"
            >
              {copiedAll ? (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied DTCG JSON
                </>
              ) : (
                <>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Copy as DTCG JSON
                </>
              )}
            </button>
            <button
              onClick={handlePreviewSave}
              disabled={savePhase === 'preview-loading' || !connected}
              className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
              title={!connected ? 'Connect to server to save tokens' : 'Preview what will be created or overwritten, then confirm'}
            >
              {savePhase === 'preview-loading' ? (
                <>
                  <Spinner />
                  Checking…
                </>
              ) : !connected ? 'Save to Token Server (offline)' : 'Save to Token Server…'}
            </button>
          </>
        )}
        {mode === 'figma-variables' && figmaCollections.length > 0 && savePhase === 'preview' && (() => {
          const effectiveSlugs = savePreviewItems.map(item => slugRenames[item.collectionName] ?? item.slug);
          const slugCounts = new Map<string, number>();
          for (const s of effectiveSlugs) slugCounts.set(s, (slugCounts.get(s) ?? 0) + 1);
          const hasConflicts = [...slugCounts.values()].some(c => c > 1);
          return (
            <div className="flex gap-1.5">
              <button
                onClick={() => { setSavePhase('idle'); setSavePreviewItems([]); setSlugRenames({}); }}
                className="flex-1 px-3 py-2 rounded-md border border-[var(--color-figma-border)] text-[var(--color-figma-text-secondary)] text-[11px] font-medium hover:text-[var(--color-figma-text)] hover:border-[var(--color-figma-text-tertiary)] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={hasConflicts}
                className="flex-1 px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-figma-accent-hover)] disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                title={hasConflicts ? 'Resolve slug conflicts before saving' : 'Confirm and save all collections to the token server'}
              >
                {hasConflicts ? 'Resolve conflicts first' : 'Confirm & Save'}
              </button>
            </div>
          );
        })()}
        {mode === 'figma-variables' && savePhase === 'saving' && (
          <button
            disabled
            className="w-full px-3 py-2 rounded-md bg-[var(--color-figma-accent)] text-white text-[11px] font-medium opacity-70 flex items-center justify-center gap-1.5"
          >
            <Spinner />
            Saving…
          </button>
        )}
      </div>
    </div>
  );
}
