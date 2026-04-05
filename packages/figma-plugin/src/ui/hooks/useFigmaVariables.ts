import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { apiFetch, ApiError } from '../shared/apiFetch';
import { dispatchToast } from '../shared/toastBus';
import { getErrorMessage } from '../shared/utils';

export interface ExportedModeValue {
  resolvedValue: any;
  reference?: string;
  isAlias: boolean;
}

export interface ExportedVariable {
  name: string;
  path: string;
  resolvedType: string;
  $type: string;
  description?: string;
  hiddenFromPublishing: boolean;
  scopes: string[];
  modeValues: Record<string, ExportedModeValue>;
}

export interface ExportedCollection {
  name: string;
  modes: string[];
  variables: ExportedVariable[];
}

export interface SavePreviewItem {
  collectionName: string;
  slug: string;
  action: 'create' | 'overwrite';
  varCount: number;
  modeName?: string;
  itemKey: string;
}

export type SavePhase = 'idle' | 'preview-loading' | 'preview';

interface UseFigmaVariablesOptions {
  connected: boolean;
  serverUrl: string;
  sets: string[];
  addSetToState: (name: string, count: number) => void;
  setError: Dispatch<SetStateAction<string | null>>;
}

export interface FigmaVariablesState {
  figmaLoading: boolean;
  figmaCollections: ExportedCollection[];
  expandedCollection: string | null;
  setExpandedCollection: Dispatch<SetStateAction<string | null>>;
  expandedVar: string | null;
  setExpandedVar: Dispatch<SetStateAction<string | null>>;
  copiedAll: boolean;
  selectedExportMode: string | null;
  setSelectedExportMode: Dispatch<SetStateAction<string | null>>;
  savePerMode: boolean;
  setSavePerMode: Dispatch<SetStateAction<boolean>>;
  savePhase: SavePhase;
  setSavePhase: Dispatch<SetStateAction<SavePhase>>;
  savePreviewItems: SavePreviewItem[];
  setSavePreviewItems: Dispatch<SetStateAction<SavePreviewItem[]>>;
  slugRenames: Record<string, string>;
  setSlugRenames: Dispatch<SetStateAction<Record<string, string>>>;
  handleExportFigmaVariables: () => void;
  buildDTCGJson: (modeOverride?: string | null) => string;
  handleCopyAll: () => Promise<void>;
  handlePreviewSave: () => Promise<void>;
  handleConfirmSave: () => Promise<void>;
  formatModeValue: (modeVal: ExportedModeValue) => string;
}

export function useFigmaVariables({
  connected,
  serverUrl,
  sets,
  addSetToState,
  setError,
}: UseFigmaVariablesOptions): FigmaVariablesState {
  const [figmaLoading, setFigmaLoading] = useState(false);
  const figmaLoadingRef = useRef(false);
  figmaLoadingRef.current = figmaLoading;
  const figmaLoadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [figmaCollections, setFigmaCollections] = useState<ExportedCollection[]>([]);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  const [expandedVar, setExpandedVar] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [selectedExportMode, setSelectedExportMode] = useState<string | null>(null);
  const [savePerMode, setSavePerMode] = useState(true);
  const [savePhase, setSavePhase] = useState<SavePhase>('idle');
  const [savePreviewItems, setSavePreviewItems] = useState<SavePreviewItem[]>([]);
  const [slugRenames, setSlugRenames] = useState<Record<string, string>>({});

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
  }, [setError]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (figmaLoadingTimeoutRef.current !== null) {
        clearTimeout(figmaLoadingTimeoutRef.current);
        figmaLoadingTimeoutRef.current = null;
      }
    };
  }, []);

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

  const buildDTCGJson = (modeOverride?: string | null): string => {
    const targetMode = modeOverride !== undefined ? modeOverride : selectedExportMode;
    const output: Record<string, any> = {};

    for (const collection of figmaCollections) {
      const collectionObj: Record<string, any> = {};

      for (const variable of collection.variables) {
        const parts = variable.path.split('.');
        let current = collectionObj;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }

        const lastKey = parts[parts.length - 1];

        if (targetMode !== null && collection.modes.includes(targetMode)) {
          const modeVal = variable.modeValues[targetMode];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else if (collection.modes.length === 1) {
          const modeVal = variable.modeValues[collection.modes[0]];
          const token: Record<string, any> = {
            $type: variable.$type,
            $value: modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue,
          };
          if (variable.description) token.$description = variable.description;
          current[lastKey] = token;
        } else {
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

  const handleCopyAll = async () => {
    const json = buildDTCGJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
      dispatchToast('Copied all variables as DTCG JSON', 'success');
    } catch (err) {
      console.warn('[useFigmaVariables] clipboard write failed:', err);
      dispatchToast('Clipboard access denied', 'error');
    }
  };

  const handlePreviewSave = async () => {
    if (!connected) return;
    setSavePhase('preview-loading');
    setError(null);
    setSlugRenames({});

    try {
      const existingSlugs = new Set(sets);
      const items: SavePreviewItem[] = [];

      for (const collection of figmaCollections) {
        const baseSlug = collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
        const isMultiMode = collection.modes.length > 1;
        if (savePerMode && isMultiMode) {
          for (const modeName of collection.modes) {
            const modeSlug = modeName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
            const slug = modeName === collection.modes[0] ? baseSlug : `${baseSlug}-${modeSlug}`;
            items.push({
              collectionName: collection.name,
              slug,
              action: existingSlugs.has(slug) ? 'overwrite' : 'create',
              varCount: collection.variables.length,
              modeName,
              itemKey: `${collection.name}::${modeName}`,
            });
          }
        } else {
          items.push({
            collectionName: collection.name,
            slug: baseSlug,
            action: existingSlugs.has(baseSlug) ? 'overwrite' : 'create',
            varCount: collection.variables.length,
            itemKey: collection.name,
          });
        }
      }

      setSavePreviewItems(items);
      setSavePhase('preview');
    } catch (err) {
      setError(getErrorMessage(err));
      setSavePhase('idle');
    }
  };

  const handleConfirmSave = async () => {
    if (!connected) return;

    let totalVarsSaved = 0;
    try {
      for (const collection of figmaCollections) {
        const baseSlug = collection.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
        const isMultiMode = collection.modes.length > 1;

        const savePairs: Array<{ modeName: string | null; setName: string }> = [];

        if (savePerMode && isMultiMode) {
          for (const modeName of collection.modes) {
            const modeSlug = modeName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
            const defaultSlug = modeName === collection.modes[0] ? baseSlug : `${baseSlug}-${modeSlug}`;
            const itemKey = `${collection.name}::${modeName}`;
            const previewItem = savePreviewItems.find(i => i.itemKey === itemKey);
            const setName = slugRenames[itemKey] ?? previewItem?.slug ?? defaultSlug;
            savePairs.push({ modeName, setName });
          }
        } else {
          const itemKey = collection.name;
          const previewItem = savePreviewItems.find(i => i.itemKey === itemKey);
          const setName = slugRenames[itemKey] ?? previewItem?.slug ?? baseSlug;
          savePairs.push({ modeName: null, setName });
        }

        for (const { modeName, setName } of savePairs) {
          let isNewSet = true;
          await apiFetch(`${serverUrl}/api/sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: setName }),
          }).catch((err) => {
            if (err instanceof ApiError && err.status === 409) { isNewSet = false; return; }
            throw new Error(`Failed to create set "${setName}": ${err instanceof Error ? err.message : String(err)}`);
          });

          const batchTokens = collection.variables.map(variable => {
            let $value: any;
            if (modeName !== null) {
              const modeVal = variable.modeValues[modeName];
              $value = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
            } else {
              const defaultVal = variable.modeValues[collection.modes[0]];
              $value = defaultVal.isAlias ? defaultVal.reference : defaultVal.resolvedValue;
            }

            const token: Record<string, any> = {
              path: variable.path,
              $type: variable.$type,
              $value,
            };
            if (variable.description) token.$description = variable.description;

            if (modeName === null && isMultiMode) {
              const modeExtensions: Record<string, any> = {};
              for (const mn of collection.modes) {
                const modeVal = variable.modeValues[mn];
                modeExtensions[mn] = modeVal.isAlias ? modeVal.reference : modeVal.resolvedValue;
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

          if (isNewSet) addSetToState(setName, batchTokens.length);
          totalVarsSaved += batchTokens.length;
        }
      }

      dispatchToast(`Saved ${totalVarsSaved} variable${totalVarsSaved !== 1 ? 's' : ''} to server`, 'success');
      setSavePhase('idle');
      setSavePreviewItems([]);
      setSlugRenames({});
    } catch (err) {
      throw err;
    }
  };

  const formatModeValue = (modeVal: ExportedModeValue): string => {
    if (modeVal.isAlias) return modeVal.reference || '';
    if (modeVal.resolvedValue === null || modeVal.resolvedValue === undefined) return 'null';
    return String(modeVal.resolvedValue);
  };

  return {
    figmaLoading,
    figmaCollections,
    expandedCollection,
    setExpandedCollection,
    expandedVar,
    setExpandedVar,
    copiedAll,
    selectedExportMode,
    setSelectedExportMode,
    savePerMode,
    setSavePerMode,
    savePhase,
    setSavePhase,
    savePreviewItems,
    setSavePreviewItems,
    slugRenames,
    setSlugRenames,
    handleExportFigmaVariables,
    buildDTCGJson,
    handleCopyAll,
    handlePreviewSave,
    handleConfirmSave,
    formatModeValue,
  };
}
