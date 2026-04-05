import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { STORAGE_KEYS, lsGetJson, lsSetJson } from '../shared/storage';
import { usePersistedStringState, usePersistedJsonState } from './usePersistedState';

export interface PlatformConfig {
  // Platform selection
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  // Output options
  cssSelector: string;
  setCssSelector: Dispatch<SetStateAction<string>>;
  zipFilename: string;
  setZipFilename: Dispatch<SetStateAction<string>>;
  nestByPlatform: boolean;
  setNestByPlatform: Dispatch<SetStateAction<boolean>>;
  // Filters
  selectedSets: Set<string> | null;
  setSelectedSets: Dispatch<SetStateAction<Set<string> | null>>;
  selectedTypes: Set<string> | null;
  setSelectedTypes: Dispatch<SetStateAction<Set<string> | null>>;
  pathPrefix: string;
  setPathPrefix: Dispatch<SetStateAction<string>>;
  // Filter section collapse state
  setsOpen: boolean;
  setSetsOpen: Dispatch<SetStateAction<boolean>>;
  typesOpen: boolean;
  setTypesOpen: Dispatch<SetStateAction<boolean>>;
  pathPrefixOpen: boolean;
  setPathPrefixOpen: Dispatch<SetStateAction<boolean>>;
  cssSelectorOpen: boolean;
  setCssSelectorOpen: Dispatch<SetStateAction<boolean>>;
}

export function usePlatformConfig(): PlatformConfig {
  // Platform selection — Set<string> serialized as string[] in localStorage
  const [selected, setSelected] = useState<Set<string>>(() => {
    const parsed = lsGetJson<string[]>(STORAGE_KEYS.EXPORT_PLATFORMS, []);
    return Array.isArray(parsed) && parsed.length > 0 ? new Set(parsed) : new Set(['css']);
  });
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_PLATFORMS, [...selected]);
  }, [selected]);

  const [cssSelector, setCssSelector] = usePersistedStringState(
    STORAGE_KEYS.EXPORT_CSS_SELECTOR,
    ':root',
  );
  const [zipFilename, setZipFilename] = usePersistedStringState(
    STORAGE_KEYS.EXPORT_ZIP_FILENAME,
    'tokens',
  );
  const [nestByPlatform, setNestByPlatform] = usePersistedJsonState<boolean>(
    STORAGE_KEYS.EXPORT_NEST_PLATFORM,
    false,
  );

  // Set filter — not persisted (resets on reload)
  const [selectedSets, setSelectedSets] = useState<Set<string> | null>(null);

  // Type filter — Set<string> | null serialized as string[] | null in localStorage
  const [selectedTypes, setSelectedTypes] = useState<Set<string> | null>(() => {
    const saved = lsGetJson<string[] | null>(STORAGE_KEYS.EXPORT_TYPES, null);
    return Array.isArray(saved) ? new Set(saved) : null;
  });
  useEffect(() => {
    lsSetJson(STORAGE_KEYS.EXPORT_TYPES, selectedTypes === null ? null : [...selectedTypes]);
  }, [selectedTypes]);

  const [pathPrefix, setPathPrefix] = usePersistedStringState(
    STORAGE_KEYS.EXPORT_PATH_PREFIX,
    '',
  );

  // Filter section collapse states — open if the filter is non-default so active filters are visible on load
  const [setsOpen, setSetsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(() => selectedTypes !== null);
  const [pathPrefixOpen, setPathPrefixOpen] = useState(() => pathPrefix !== '');
  const [cssSelectorOpen, setCssSelectorOpen] = useState(() => cssSelector !== ':root');

  return {
    selected,
    setSelected,
    cssSelector,
    setCssSelector,
    zipFilename,
    setZipFilename,
    nestByPlatform,
    setNestByPlatform,
    selectedSets,
    setSelectedSets,
    selectedTypes,
    setSelectedTypes,
    pathPrefix,
    setPathPrefix,
    setsOpen,
    setSetsOpen,
    typesOpen,
    setTypesOpen,
    pathPrefixOpen,
    setPathPrefixOpen,
    cssSelectorOpen,
    setCssSelectorOpen,
  };
}
