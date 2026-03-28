import { useState, useCallback, useMemo } from 'react';

const MAX_ENTRIES = 500;

export interface RecentlyTouchedState {
  /** Map from token path to timestamp (Date.now()) */
  timestamps: Map<string, number>;
  /** Set of paths for fast filtering */
  paths: Set<string>;
  /** Number of tracked entries */
  count: number;
  /** Record a single token touch */
  recordTouch: (path: string) => void;
  /** Record multiple token touches */
  recordTouches: (paths: string[]) => void;
  /** Remove a path (on delete) */
  removePath: (path: string) => void;
  /** Rename a path (preserves timestamp) */
  renamePath: (oldPath: string, newPath: string) => void;
  /** Clear all tracking */
  clear: () => void;
}

export function useRecentlyTouched(): RecentlyTouchedState {
  const [timestamps, setTimestamps] = useState<Map<string, number>>(() => new Map());

  const recordTouch = useCallback((path: string) => {
    setTimestamps(prev => {
      const next = new Map(prev);
      next.set(path, Date.now());
      // Evict oldest if over limit
      if (next.size > MAX_ENTRIES) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, t] of next) {
          if (t < oldestTime) { oldestTime = t; oldestKey = k; }
        }
        if (oldestKey) next.delete(oldestKey);
      }
      return next;
    });
  }, []);

  const recordTouches = useCallback((paths: string[]) => {
    if (paths.length === 0) return;
    setTimestamps(prev => {
      const next = new Map(prev);
      const now = Date.now();
      for (const p of paths) next.set(p, now);
      // Evict oldest entries over limit
      while (next.size > MAX_ENTRIES) {
        let oldestKey = '';
        let oldestTime = Infinity;
        for (const [k, t] of next) {
          if (t < oldestTime) { oldestTime = t; oldestKey = k; }
        }
        if (oldestKey) next.delete(oldestKey); else break;
      }
      return next;
    });
  }, []);

  const removePath = useCallback((path: string) => {
    setTimestamps(prev => {
      if (!prev.has(path)) return prev;
      const next = new Map(prev);
      next.delete(path);
      return next;
    });
  }, []);

  const renamePath = useCallback((oldPath: string, newPath: string) => {
    setTimestamps(prev => {
      const ts = prev.get(oldPath);
      if (ts == null) return prev;
      const next = new Map(prev);
      next.delete(oldPath);
      next.set(newPath, ts);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setTimestamps(new Map());
  }, []);

  const paths = useMemo(() => new Set(timestamps.keys()), [timestamps]);

  return {
    timestamps,
    paths,
    count: timestamps.size,
    recordTouch,
    recordTouches,
    removePath,
    renamePath,
    clear,
  };
}
