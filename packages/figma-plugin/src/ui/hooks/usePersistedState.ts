import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { lsGet, lsSet, lsGetJson, lsSetJson } from '../shared/storage';

function readPersistedString(key: string, defaultValue: string): string {
  return lsGet(key, defaultValue);
}

function writePersistedString(key: string, value: string): void {
  lsSet(key, value);
}

function readPersistedJson<T>(key: string, defaultValue: T): T {
  return lsGetJson<T>(key, defaultValue);
}

function writePersistedJson<T>(key: string, value: T): void {
  lsSetJson(key, value);
}

function usePersistedState<T>(
  key: string,
  defaultValue: T,
  read: (storageKey: string, fallback: T) => T,
  write: (storageKey: string, value: T) => void,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, defaultValue));
  const previousKeyRef = useRef(key);

  useEffect(() => {
    if (previousKeyRef.current !== key) {
      previousKeyRef.current = key;
      setValue(read(key, defaultValue));
      return;
    }
    write(key, value);
  }, [defaultValue, key, read, value, write]);

  return [value, setValue];
}

/**
 * Like useState, but automatically persists the value to localStorage as a string.
 * Reads the initial value from localStorage on mount.
 */
export function usePersistedStringState(
  key: string,
  defaultValue: string,
): [string, Dispatch<SetStateAction<string>>] {
  return usePersistedState(key, defaultValue, readPersistedString, writePersistedString);
}

/**
 * Like useState, but automatically persists the value to localStorage as JSON.
 * Reads the initial value from localStorage on mount.
 */
export function usePersistedJsonState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  return usePersistedState(key, defaultValue, readPersistedJson<T>, writePersistedJson<T>);
}
