import { useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage } from '../shared/utils';
import { buildZipBlobAsync } from '../shared/zipUtils';
import type { PlatformConfig } from './usePlatformConfig';
import type { DiffState } from './useDiffState';

export interface ExportResultFile {
  platform: string;
  path: string;
  content: string;
}

interface UseExportResultsOptions {
  connected: boolean;
  serverUrl: string;
  platformConfig: PlatformConfig;
  diffState: Pick<DiffState,
    | 'changesOnly'
    | 'diffPaths'
    | 'setDiffPaths'
    | 'diffLoading'
    | 'setDiffLoading'
    | 'isGitRepo'
    | 'setIsGitRepo'
    | 'lastExportTimestamp'
    | 'setLastExportTimestamp'
  >;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface ExportResultsState {
  exporting: boolean;
  results: ExportResultFile[];
  previewFileIndex: number;
  setPreviewFileIndex: Dispatch<SetStateAction<number>>;
  copiedFile: string | null;
  showExportPreviewModal: boolean;
  setShowExportPreviewModal: Dispatch<SetStateAction<boolean>>;
  previewModalFileIndex: number;
  setPreviewModalFileIndex: Dispatch<SetStateAction<number>>;
  zipProgress: number | null;
  handleExport: (showModal?: boolean) => Promise<void>;
  handleDownloadZip: () => Promise<void>;
  handleDownloadFile: (file: ExportResultFile) => void;
  handleCopyFile: (file: ExportResultFile) => Promise<void>;
  handleCopyAllPlatformResults: () => Promise<void>;
}

const PLATFORM_FOLDERS: Record<string, string> = {
  css: 'css', dart: 'dart', 'ios-swift': 'ios', android: 'android',
  json: 'json', scss: 'scss', less: 'less', typescript: 'ts',
  tailwind: 'tailwind', 'css-in-js': 'css-in-js',
};

function getNoChangedTokensMessage(isGitRepo: boolean | undefined, lastExportTimestamp: number | null) {
  return isGitRepo === false && lastExportTimestamp !== null
    ? `No changed tokens found since ${new Date(lastExportTimestamp).toLocaleString()}.`
    : 'No changed tokens found. All tokens are up to date since the last commit.';
}

export function useExportResults({
  connected,
  serverUrl,
  platformConfig,
  diffState,
  setError,
}: UseExportResultsOptions): ExportResultsState {
  const [exporting, setExporting] = useState(false);
  const [results, setResults] = useState<ExportResultFile[]>([]);
  const [previewFileIndex, setPreviewFileIndex] = useState(0);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [showExportPreviewModal, setShowExportPreviewModal] = useState(false);
  const [previewModalFileIndex, setPreviewModalFileIndex] = useState(0);
  const [zipProgress, setZipProgress] = useState<number | null>(null);

  const {
    selected, selectedCollections, selectedTypes, pathPrefix, cssSelector,
    zipFilename, nestByPlatform,
  } = platformConfig;

  const {
    changesOnly, diffPaths, setDiffPaths,
    setDiffLoading, isGitRepo, setIsGitRepo,
    lastExportTimestamp, setLastExportTimestamp,
  } = diffState;

  const handleExport = async (showModal = false) => {
    if (selected.size === 0 || !connected) return;
    if (changesOnly && diffPaths !== null && diffPaths.length === 0) {
      setError(getNoChangedTokensMessage(isGitRepo, lastExportTimestamp));
      return;
    }

    setExporting(true);
    setError(null);

    try {
      let resolvedDiffPaths: string[] | undefined;
      if (changesOnly) {
        let paths = diffPaths;
        if (paths === null) {
          setDiffLoading(true);
          try {
            if (isGitRepo === false) {
              if (lastExportTimestamp === null) {
                setError('No baseline set. Click "Set baseline" to mark the current state before exporting changes only.');
                setDiffLoading(false);
                setExporting(false);
                return;
              }
              const data = await apiFetch<{ changes: { path: string; collectionId: string; status: string }[] }>(
                `${serverUrl}/api/sync/diff/tokens/since?timestamp=${lastExportTimestamp}`,
              );
              paths = data.changes
                .filter(c => c.status === 'added' || c.status === 'modified')
                .map(c => c.path);
              setDiffPaths(paths);
            } else {
              const data = await apiFetch<{ changes: { path: string; collectionId: string; status: string }[] }>(
                `${serverUrl}/api/sync/diff/tokens`,
              );
              paths = data.changes
                .filter(c => c.status === 'added' || c.status === 'modified')
                .map(c => c.path);
              setDiffPaths(paths);
              setIsGitRepo(true);
            }
          } catch (diffErr) {
            if (diffErr instanceof ApiError && diffErr.status === 400) {
              setIsGitRepo(false);
              setError('Changes only mode requires a git repository or a baseline timestamp. The token directory is not tracked by git.');
            } else {
              setError(`Failed to fetch changed tokens: ${getErrorMessage(diffErr)}`);
            }
            setDiffLoading(false);
            setExporting(false);
            return;
          } finally {
            setDiffLoading(false);
          }
        }
        if (paths.length === 0) {
          setError(getNoChangedTokensMessage(isGitRepo, lastExportTimestamp));
          setExporting(false);
          return;
        }
        resolvedDiffPaths = paths;
      }

      setResults([]);

      const body: {
        platforms: string[];
        collections?: string[];
        types?: string[];
        pathPrefix?: string;
        cssSelector?: string;
        changedPaths?: string[];
      } = { platforms: Array.from(selected) };
      if (selectedCollections !== null) {
        body.collections = Array.from(selectedCollections);
      }
      if (selectedTypes !== null) body.types = Array.from(selectedTypes);
      if (pathPrefix.trim()) body.pathPrefix = pathPrefix.trim();
      if (selected.has('css') && cssSelector && cssSelector !== ':root') body.cssSelector = cssSelector;
      if (resolvedDiffPaths) body.changedPaths = resolvedDiffPaths;

      const data = await apiFetch<{ results?: { platform: string; files: { path: string; content: string }[] }[] }>(
        `${serverUrl}/api/export`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      );
      const flatFiles: ExportResultFile[] = [];
      for (const result of data.results || []) {
        for (const file of result.files || []) {
          flatFiles.push({ platform: result.platform, path: file.path, content: file.content });
        }
      }
      setResults(flatFiles);
      if (flatFiles.length > 0) {
        setPreviewFileIndex(0);
        if (showModal) {
          setPreviewModalFileIndex(0);
          setShowExportPreviewModal(true);
        }
      }
      const changesLabel = changesOnly && resolvedDiffPaths
        ? ` (${resolvedDiffPaths.length} changed token${resolvedDiffPaths.length !== 1 ? 's' : ''})`
        : '';
      dispatchToast(`Exported ${flatFiles.length} file(s)${changesLabel}`, 'success', {
        destination: { kind: "workspace", topTab: "sync", subTab: "export" },
      });
      if (changesOnly && isGitRepo === false) {
        const now = Date.now();
        setLastExportTimestamp(now);
        setDiffPaths(null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadZip = async () => {
    if (zipProgress !== null) return;
    const zipFiles = nestByPlatform
      ? results.map(f => ({
          path: `${PLATFORM_FOLDERS[f.platform] || f.platform}/${f.path}`,
          content: f.content,
        }))
      : results;
    setZipProgress(0);
    try {
      const blob = await buildZipBlobAsync(zipFiles, pct => setZipProgress(pct));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = zipFilename.trim().replace(/\.zip$/i, '') || 'tokens';
      a.download = `${safeName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      dispatchToast(`Downloaded ${results.length} file(s) as ZIP`, 'success', {
        destination: { kind: "workspace", topTab: "sync", subTab: "export" },
      });
    } finally {
      setZipProgress(null);
    }
  };

  const handleDownloadFile = (file: ExportResultFile) => {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'tokens.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyFile = async (file: ExportResultFile) => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopiedFile(file.path);
      setTimeout(() => setCopiedFile(null), 1500);
      dispatchToast('Copied to clipboard', 'success');
    } catch (err) {
      console.warn('[useExportResults] clipboard write failed:', err);
      dispatchToast('Clipboard access denied', 'error');
    }
  };

  const handleCopyAllPlatformResults = async () => {
    const allContent = results.map(f => `/* ${f.platform}: ${f.path} */\n${f.content}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(allContent);
      dispatchToast(`Copied ${results.length} file(s) to clipboard`, 'success');
    } catch (err) {
      console.warn('[useExportResults] clipboard write failed for copy all:', err);
      dispatchToast('Clipboard access denied', 'error');
    }
  };

  return {
    exporting,
    results,
    previewFileIndex,
    setPreviewFileIndex,
    copiedFile,
    showExportPreviewModal,
    setShowExportPreviewModal,
    previewModalFileIndex,
    setPreviewModalFileIndex,
    zipProgress,
    handleExport,
    handleDownloadZip,
    handleDownloadFile,
    handleCopyFile,
    handleCopyAllPlatformResults,
  };
}
