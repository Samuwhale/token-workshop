import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 760;
const WIDE_WIDTH = 1440;
const WIDE_HEIGHT = 1000;

function readPersistedSize(): { width: number; height: number } | null {
  const w = lsGet(STORAGE_KEYS.WINDOW_WIDTH);
  const h = lsGet(STORAGE_KEYS.WINDOW_HEIGHT);
  if (!w || !h) return null;
  const width = parseInt(w, 10);
  const height = parseInt(h, 10);
  if (Number.isNaN(width) || Number.isNaN(height)) return null;
  return { width, height };
}

function persistSize(width: number, height: number): void {
  lsSet(STORAGE_KEYS.WINDOW_WIDTH, String(Math.round(width)));
  lsSet(STORAGE_KEYS.WINDOW_HEIGHT, String(Math.round(height)));
}

function sendResize(width: number, height: number): void {
  parent.postMessage({ pluginMessage: { type: 'resize', width: Math.round(width), height: Math.round(height) } }, '*');
}

export function useWindowExpand() {
  const [isExpanded, setIsExpanded] = useState(() => lsGet(STORAGE_KEYS.EXPANDED) === '1');

  const toggleExpand = useCallback(() => {
    const next = !isExpanded;
    setIsExpanded(next);
    lsSet(STORAGE_KEYS.EXPANDED, next ? '1' : '0');
    const w = next ? WIDE_WIDTH : DEFAULT_WIDTH;
    const h = next ? WIDE_HEIGHT : DEFAULT_HEIGHT;
    persistSize(w, h);
    sendResize(w, h);
  }, [isExpanded]);

  // On mount, restore persisted size or apply the default
  useEffect(() => {
    const persisted = readPersistedSize();
    if (persisted) {
      sendResize(persisted.width, persisted.height);
    } else {
      persistSize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
      sendResize(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    }
  }, []);

  // Persist actual size whenever the window resizes (covers drag-resize too)
  useEffect(() => {
    const handler = () => {
      persistSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return { isExpanded, toggleExpand };
}
