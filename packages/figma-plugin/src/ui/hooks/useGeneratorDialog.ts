import { useState, useRef, useCallback, useMemo } from 'react';
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
import { useGeneratorPreview } from './useGeneratorPreview';
import { useGeneratorSave } from './useGeneratorSave';

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
  previewBrand: string | undefined;
  overwrittenEntries: OverwrittenEntry[];
  existingTokensError: string;
  saving: boolean;
  saveError: string;
  showSemanticMapping: boolean;
  savedTokens: GeneratedTokenResult[];
  savedTargetGroup: string;
  showConfirmation: boolean;
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
  handleConfirmSave: () => Promise<void>;
  handleCancelConfirmation: () => void;
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

  // --- Sub-hooks ---

  const {
    previewTokens,
    previewLoading,
    previewError,
    existingTokensError,
    overwrittenEntries,
    previewBrand,
  } = useGeneratorPreview({
    serverUrl,
    selectedType,
    sourceTokenPath,
    targetGroup,
    targetSet,
    config: currentConfig,
    pendingOverrides,
    isMultiBrand,
    inputTable,
  });

  const {
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    showConfirmation,
    handleSave,
    handleConfirmSave,
    handleCancelConfirmation,
    handleSemanticMappingClose,
  } = useGeneratorSave({
    serverUrl,
    isEditing,
    existingGenerator,
    selectedType,
    name,
    sourceTokenPath,
    targetSet,
    targetGroup,
    config: currentConfig,
    pendingOverrides,
    isMultiBrand,
    inputTable,
    targetSetTemplate,
    typeNeedsSource,
    hasSource,
    previewTokens,
    onSaved,
    onInterceptSemanticMapping,
  });

  // --- Config handlers ---

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
    previewBrand,
    overwrittenEntries,
    existingTokensError,
    saving,
    saveError,
    showSemanticMapping,
    savedTokens,
    savedTargetGroup,
    showConfirmation,
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
    handleConfirmSave,
    handleCancelConfirmation,
    handleSemanticMappingClose,
  };
}
