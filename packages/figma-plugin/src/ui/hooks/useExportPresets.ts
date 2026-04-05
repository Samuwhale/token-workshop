import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';

export interface ExportPreset {
  id: string;
  name: string;
  platforms: string[];
  cssSelector: string;
  selectedSets: string[] | null; // null = all sets
  selectedTypes: string[] | null; // null = all types
  pathPrefix: string;
  nestByPlatform: boolean;
  zipFilename: string;
  changesOnly?: boolean;
}

export interface ExportPresetsState {
  presets: ExportPreset[];
  setPresets: Dispatch<SetStateAction<ExportPreset[]>>;
  showSavePreset: boolean;
  setShowSavePreset: Dispatch<SetStateAction<boolean>>;
  presetName: string;
  setPresetName: Dispatch<SetStateAction<string>>;
  pendingDeletePresetId: string | null;
  setPendingDeletePresetId: Dispatch<SetStateAction<string | null>>;
}

export function useExportPresets(): ExportPresetsState {
  const [presets, setPresets] = useState<ExportPreset[]>(() =>
    lsGetJson<ExportPreset[]>(STORAGE_KEYS.EXPORT_PRESETS, [])
  );
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [pendingDeletePresetId, setPendingDeletePresetId] = useState<string | null>(null);

  // Persist presets and notify App.tsx command palette
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_PRESETS, presets);
    window.dispatchEvent(new CustomEvent('exportPresetsChanged'));
  }, [presets]);

  return {
    presets,
    setPresets,
    showSavePreset,
    setShowSavePreset,
    presetName,
    setPresetName,
    pendingDeletePresetId,
    setPendingDeletePresetId,
  };
}
