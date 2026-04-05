import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { lsGet, lsSet, lsGetJson, lsSetJson } from '../shared/storage';

/**
 * Like useState, but automatically persists the value to localStorage as a string.
 * Reads the initial value from localStorage on mount.
 */
export function usePersistedStringState(
  key: string,
  defaultValue: string,
): [string, Dispatch<SetStateAction<string>>] {
  const [value, setValue] = useState<string>(() => lsGet(key, defaultValue));
  useEffect(() => {
    lsSet(key, value);
  }, [key, value]);
  return [value, setValue];
}

/**
 * Like useState, but automatically persists the value to localStorage as JSON.
 * Reads the initial value from localStorage on mount.
 */
export function usePersistedJsonState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => lsGetJson<T>(key, defaultValue));
  useEffect(() => {
    lsSetJson(key, value);
  }, [key, value]);
  return [value, setValue];
}
