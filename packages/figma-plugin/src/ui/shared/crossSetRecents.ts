import { STORAGE_KEYS, lsGetJson, lsSetJson } from './storage';

const MAX_CROSS_SET_RECENTS = 50;

export interface CrossSetRecentEntry {
  path: string;
  setName: string;
  ts: number;
}

/** Return cross-set recent tokens, most recent first. */
export function getCrossSetRecents(): CrossSetRecentEntry[] {
  return lsGetJson<CrossSetRecentEntry[]>(STORAGE_KEYS.CROSS_SET_RECENTS, []);
}

/** Record a token touch with its set name. */
export function addCrossSetRecent(path: string, setName: string): void {
  const current = getCrossSetRecents();
  const deduped = [
    { path, setName, ts: Date.now() },
    ...current.filter(e => !(e.path === path && e.setName === setName)),
  ].slice(0, MAX_CROSS_SET_RECENTS);
  lsSetJson(STORAGE_KEYS.CROSS_SET_RECENTS, deduped);
}

/** Remove entries for a deleted token. */
export function removeCrossSetRecent(path: string, setName: string): void {
  const current = getCrossSetRecents();
  const filtered = current.filter(e => !(e.path === path && e.setName === setName));
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.CROSS_SET_RECENTS, filtered);
  }
}

/** Update path when a token is renamed. */
export function renameCrossSetRecent(oldPath: string, newPath: string, setName: string): void {
  const current = getCrossSetRecents();
  const updated = current.map(e =>
    e.path === oldPath && e.setName === setName ? { ...e, path: newPath } : e,
  );
  lsSetJson(STORAGE_KEYS.CROSS_SET_RECENTS, updated);
}

/** Remove all entries for a deleted/renamed set. */
export function removeCrossSetRecentsForSet(setName: string): void {
  const current = getCrossSetRecents();
  const filtered = current.filter(e => e.setName !== setName);
  if (filtered.length !== current.length) {
    lsSetJson(STORAGE_KEYS.CROSS_SET_RECENTS, filtered);
  }
}

/** Rename all entries when a set is renamed. */
export function renameCrossSetRecentsForSet(oldName: string, newName: string): void {
  const current = getCrossSetRecents();
  const updated = current.map(e => e.setName === oldName ? { ...e, setName: newName } : e);
  lsSetJson(STORAGE_KEYS.CROSS_SET_RECENTS, updated);
}
