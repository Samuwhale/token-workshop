import { getErrorMessage } from '../shared/utils';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { apiFetch } from '../shared/apiFetch';
import { flattenTokenGroup } from '@tokenmanager/core';
import type {
  TokenGenerator,
  GeneratorType,
  GeneratorConfig,
  GeneratedTokenResult,
  GeneratorTemplate,
  InputTable,
} from './useGenerators';
import {
  detectGeneratorType,
  suggestTargetGroup,
  autoName,
  defaultConfigForType,
  ALL_TYPES,
  SOURCE_REQUIRED_TYPES,
  STANDALONE_TYPES,
  FLEXIBLE_TYPES,
} from '../components/generators/generatorUtils';

interface UseGeneratorDialogParams {
  serverUrl: string;
  sourceTokenPath?: string;
  sourceTokenName?: string;
  sourceTokenType?: string;
  sourceTokenValue?: any;
  activeSet: string;
  existingGenerator?: TokenGenerator;
  template?: GeneratorTemplate;
  onSaved: (info?: { targetGroup: string }) => void;
  /** When provided, fires with semantic mapping data instead of showing SemanticMappingDialog internally */
  onInterceptSemanticMapping?: (data: { tokens: GeneratedTokenResult[]; targetGroup: string; targetSet: string; generatorType: GeneratorType }) => void;
}

export interface OverwrittenEntry {
  path: string;
  type: string;
  oldValue: unknown;
  newValue: unknown;
}

interface UseGeneratorDialogReturn {
  // Derived
  isEditing: boolean;
  isMultiBrand: boolean;
  typeNeedsSource: boolean;
  hasSource: boolean;
  availableTypes: GeneratorType[];
  recommendedType: GeneratorType | undefined;
  currentConfig: GeneratorConfig;
  lockedCount: number;
  isDirtyRef: React.RefObject<boolean>;
  // State
  selectedType: GeneratorType;
  name: string;
  targetSet: string;
  targetGroup: string;
  inputTable: InputTable | undefined;
  targetSetTemplate: string;
  pendingOverrides: Record<string, { value: unknown; locked: boolean }>;
  previewTokens: GeneratedTokenResult[];
  previewLoading: boolean;
  previewError: string;
  overwrittenEntries: OverwrittenEntry[];
  saving: boolean;
  saveError: string;
  showSemanticMapping: boolean;
  savedTokens: GeneratedTokenResult[];
  savedTargetGroup: string;
  // Handlers
  handleTypeChange: (type: GeneratorType) => void;
  handleNameChange: (value: string) => void;
  setTargetSet: (value: string) => void;
  setTargetGroup: (value: string) => void;
  setTargetSetTemplate: (value: string) => void;
  handleConfigChange: (type: GeneratorType, cfg: GeneratorConfig) => void;
  handleToggleMultiBrand: () => void;
  setInputTable: (table: InputTable | undefined) => void;
  handleOverrideChange: (stepName: string, value: string, locked: boolean) => void;
  handleOverrideClear: (stepName: string) => void;
  clearAllOverrides: () => void;
  handleSave: () => Promise<void>;
  handleSemanticMappingClose: () => void;
}

export function useGeneratorDialog({
  serverUrl,
  sourceTokenPath,
  sourceTokenName,
  sourceTokenType = '',
  sourceTokenValue,
  activeSet,
  existingGenerator,
  template,
  onSaved,
  onInterceptSemanticMapping,
}: UseGeneratorDialogParams): UseGeneratorDialogReturn {
  const isEditing = Boolean(existingGenerator);

  const recommendedType = useMemo(() => {
    if (sourceTokenPath && sourceTokenType) {
      return detectGeneratorType(sourceTokenType, sourceTokenValue);
    }
    return undefined;
  }, [sourceTokenPath, sourceTokenType, sourceTokenValue]);

  const initialType: GeneratorType =
    existingGenerator?.type ??
    template?.generatorType ??
    recommendedType ??
    'customScale';

  const [selectedType, setSelectedType] = useState<GeneratorType>(initialType);
  const [name, setName] = useState(
    existingGenerator?.name ??
    (template ? template.label : autoName(sourceTokenPath, initialType))
  );
  const [targetSet, setTargetSet] = useState(existingGenerator?.targetSet ?? activeSet);
  const [targetGroup, setTargetGroup] = useState(
    existingGenerator?.targetGroup ??
    (template ? template.defaultPrefix : (sourceTokenPath ? suggestTargetGroup(sourceTokenPath, sourceTokenName) : ''))
  );

  const [configs, setConfigs] = useState<Partial<Record<GeneratorType, GeneratorConfig>>>(() => {
    const base: Partial<Record<GeneratorType, GeneratorConfig>> = {};
    for (const t of ALL_TYPES) {
      if (existingGenerator?.type === t) {
        base[t] = existingGenerator.config;
      } else if (template?.generatorType === t) {
        base[t] = template.config;
      } else {
        base[t] = defaultConfigForType(t);
      }
    }
    return base;
  });

  const [pendingOverrides, setPendingOverrides] = useState<Record<string, { value: unknown; locked: boolean }>>(
    existingGenerator?.overrides ?? {}
  );

  const [inputTable, setInputTable] = useState<InputTable | undefined>(
    existingGenerator?.inputTable ?? undefined
  );
  const [targetSetTemplate, setTargetSetTemplate] = useState<string>(
    existingGenerator?.targetSetTemplate ?? 'brands/{brand}'
  );

  const [previewTokens, setPreviewTokens] = useState<GeneratedTokenResult[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [existingSetTokens, setExistingSetTokens] = useState<Record<string, { $value: unknown; $type: string }>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [showSemanticMapping, setShowSemanticMapping] = useState(false);
  const [savedTokens, setSavedTokens] = useState<GeneratedTokenResult[]>([]);
  const [savedTargetGroup, setSavedTargetGroup] = useState('');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nameWasAutoRef = useRef(!existingGenerator && !template);
  const isDirtyRef = useRef(false);
  const markDirty = useCallback(() => { isDirtyRef.current = true; }, []);

  // Derived values
  const isMultiBrand = Boolean(inputTable);
  const typeNeedsSource = SOURCE_REQUIRED_TYPES.includes(selectedType);
  const hasSource = Boolean(sourceTokenPath);
  const availableTypes = hasSource ? ALL_TYPES : [...STANDALONE_TYPES, ...FLEXIBLE_TYPES];
  const currentConfig = configs[selectedType]!;
  const lockedCount = Object.values(pendingOverrides).filter(o => o.locked).length;

  const fetchPreview = useCallback(() => {
    if (isMultiBrand) {
      setPreviewTokens([]);
      setPreviewError('');
      return;
    }
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const body = {
          type: selectedType,
          sourceToken: sourceTokenPath || undefined,
          targetGroup,
          targetSet,
          config: configs[selectedType],
          overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        };
        const data = await apiFetch<{ count: number; tokens: GeneratedTokenResult[] }>(
          `${serverUrl}/api/generators/preview`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal },
        );
        setPreviewTokens(data.tokens ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setPreviewError(getErrorMessage(err, 'Preview failed'));
        setPreviewTokens([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
  }, [serverUrl, selectedType, sourceTokenPath, targetGroup, targetSet, configs, pendingOverrides, isMultiBrand]);

  useEffect(() => {
    fetchPreview();
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, [fetchPreview]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!targetSet) return;
    const controller = new AbortController();
    fetch(`${serverUrl}/api/tokens/${encodeURIComponent(targetSet)}`, { signal: controller.signal })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          const map = flattenTokenGroup(data.tokens || {});
          const obj: Record<string, { $value: unknown; $type: string }> = {};
          for (const [path, token] of map) {
            obj[path] = { $value: token.$value, $type: token.$type || 'unknown' };
          }
          setExistingSetTokens(obj);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [serverUrl, targetSet]);

  const overwrittenEntries = useMemo<OverwrittenEntry[]>(() => {
    if (isMultiBrand || previewTokens.length === 0) return [];
    return previewTokens
      .filter(pt => {
        const existing = existingSetTokens[pt.path];
        return existing !== undefined && JSON.stringify(existing.$value) !== JSON.stringify(pt.value);
      })
      .map(pt => ({
        path: pt.path,
        type: pt.type,
        oldValue: existingSetTokens[pt.path].$value,
        newValue: pt.value,
      }));
  }, [previewTokens, existingSetTokens, isMultiBrand]);

  const handleTypeChange = (type: GeneratorType) => {
    markDirty();
    setSelectedType(type);
    if (nameWasAutoRef.current) setName(autoName(sourceTokenPath, type));
  };

  const handleNameChange = (value: string) => {
    markDirty();
    nameWasAutoRef.current = false;
    setName(value);
  };

  const handleConfigChange = (type: GeneratorType, cfg: GeneratorConfig) => {
    markDirty();
    setConfigs(prev => ({ ...prev, [type]: cfg }));
  };

  const handleToggleMultiBrand = () => {
    markDirty();
    setInputTable(inputTable ? undefined : { inputKey: 'brandColor', rows: [] });
  };

  const handleOverrideChange = (stepName: string, value: string, locked: boolean) => {
    markDirty();
    setPendingOverrides(prev => ({ ...prev, [stepName]: { value, locked } }));
  };

  const handleOverrideClear = (stepName: string) => {
    setPendingOverrides(prev => {
      const next = { ...prev };
      delete next[stepName];
      return next;
    });
  };

  const clearAllOverrides = () => { markDirty(); setPendingOverrides({}); };

  const setTargetSetDirty = useCallback((v: string) => { markDirty(); setTargetSet(v); }, [markDirty]);
  const setTargetGroupDirty = useCallback((v: string) => { markDirty(); setTargetGroup(v); }, [markDirty]);
  const setTargetSetTemplateDirty = useCallback((v: string) => { markDirty(); setTargetSetTemplate(v); }, [markDirty]);
  const setInputTableDirty = useCallback((t: InputTable | undefined) => { markDirty(); setInputTable(t); }, [markDirty]);

  const handleSave = async () => {
    if (!targetGroup.trim()) { setSaveError('Target group is required.'); return; }
    if (!name.trim()) { setSaveError('Generator name is required.'); return; }
    if (!isMultiBrand && typeNeedsSource && !hasSource) { setSaveError('This generator type requires a source token.'); return; }
    if (isMultiBrand && inputTable) {
      if (!targetSetTemplate.trim()) { setSaveError('Target set template is required for multi-brand mode.'); return; }
      if (inputTable.rows.some(r => !r.brand.trim())) { setSaveError('All brand rows must have a non-empty brand name.'); return; }
      const brandNames = inputTable.rows.map(r => r.brand.trim().toLowerCase());
      const duplicate = brandNames.find((b, i) => brandNames.indexOf(b) !== i);
      if (duplicate) { setSaveError(`Duplicate brand name "${inputTable.rows.find(r => r.brand.trim().toLowerCase() === duplicate)!.brand.trim()}" — each brand name must be unique.`); return; }
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        type: selectedType,
        name: name.trim(),
        sourceToken: isMultiBrand ? undefined : (sourceTokenPath || undefined),
        targetSet,
        targetGroup: targetGroup.trim(),
        config: configs[selectedType],
        overrides: Object.keys(pendingOverrides).length > 0 ? pendingOverrides : undefined,
        ...(isMultiBrand && inputTable ? { inputTable, targetSetTemplate: targetSetTemplate.trim() } : {}),
      };
      // When updating an existing generator, check for manually-edited tokens
      if (isEditing && existingGenerator) {
        try {
          const checkRes = await fetch(`${serverUrl}/api/generators/${existingGenerator.id}/check-overwrites`, {
            method: 'POST',
          });
          if (checkRes.ok) {
            const { modified } = await checkRes.json() as { modified: { path: string }[] };
            if (modified.length > 0) {
              const paths = modified.map(m => m.path).join('\n  • ');
              const confirmed = window.confirm(
                `${modified.length} token(s) have been manually edited since the last run and will be overwritten:\n\n  • ${paths}\n\nProceed?`,
              );
              if (!confirmed) {
                setSaving(false);
                return;
              }
            }
          }
        } catch {
          // Best-effort — if the check fails, proceed without warning
        }
      }
      const saveUrl = isEditing && existingGenerator
        ? `${serverUrl}/api/generators/${existingGenerator.id}`
        : `${serverUrl}/api/generators`;
      const savedGen = await apiFetch<{ id: string }>(saveUrl, {
        method: isEditing && existingGenerator ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!isEditing) {
        let tokensForMapping = previewTokens;
        // In multi-brand mode, previewTokens is always [] because fetchPreview
        // skips the API call. Fetch the generated tokens from the saved generator
        // so the semantic mapping dialog can still be offered.
        if (tokensForMapping.length === 0 && isMultiBrand) {
          try {
            const tokensRes = await fetch(`${serverUrl}/api/generators/${savedGen.id}/tokens`);
            if (tokensRes.ok) {
              const tokensData = await tokensRes.json() as { tokens: GeneratedTokenResult[] };
              tokensForMapping = tokensData.tokens ?? [];
            }
          } catch {
            // Best-effort — if fetching fails, skip semantic mapping
          }
        }
        if (tokensForMapping.length > 0) {
          if (onInterceptSemanticMapping) {
            onInterceptSemanticMapping({ tokens: tokensForMapping, targetGroup: targetGroup.trim(), targetSet, generatorType: selectedType });
            setSaving(false);
            onSaved({ targetGroup: targetGroup.trim() });
            return;
          }
          setSavedTokens(tokensForMapping);
          setSavedTargetGroup(targetGroup.trim());
          setShowSemanticMapping(true);
          setSaving(false);
          return;
        }
      }
      setSaving(false);
      onSaved({ targetGroup: targetGroup.trim() });
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSaving(false);
    }
  };

  const handleSemanticMappingClose = () => {
    setShowSemanticMapping(false);
    onSaved({ targetGroup: savedTargetGroup });
  };

  return {
    // Derived
    isEditing,
    isMultiBrand,
    typeNeedsSource,
    hasSource,
    availableTypes,
    recommendedType,
    currentConfig,
    lockedCount,
    isDirtyRef,
    // State
    selectedType,
    name,
    targetSet,
    targetGroup,
    inputTable,
    targetSetTemplate,
    pendingOverrides,
    previewTokens,
    previewLoading,
    previewError,
    overwrittenEntries,
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    // Handlers
    handleTypeChange,
    handleNameChange,
    setTargetSet: setTargetSetDirty,
    setTargetGroup: setTargetGroupDirty,
    setTargetSetTemplate: setTargetSetTemplateDirty,
    handleConfigChange,
    handleToggleMultiBrand,
    setInputTable: setInputTableDirty,
    handleOverrideChange,
    handleOverrideClear,
    clearAllOverrides,
    handleSave,
    handleSemanticMappingClose,
  };
}
