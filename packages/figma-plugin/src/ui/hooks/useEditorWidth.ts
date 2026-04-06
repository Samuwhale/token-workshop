import { useState, useRef, useCallback, useEffect } from 'react';
import type React from 'react';
import { COMPOSITE_TOKEN_TYPES } from '@tokenmanager/core';
import { STORAGE_KEYS, lsGet, lsSet } from '../shared/storage';

const WIDTH_MIN = 240;
const WIDTH_MAX = 520;

/** Default width for simple token types */
const WIDTH_DEFAULT = 320;
/** Default width for composite types (typography, shadow, border, gradient, etc.) */
const WIDTH_COMPLEX = 420;

function clampWidth(n: number): number {
  return Math.max(WIDTH_MIN, Math.min(WIDTH_MAX, n));
}

function defaultWidthForType(tokenType: string | undefined): number {
  if (!tokenType) return WIDTH_DEFAULT;
  if (COMPOSITE_TOKEN_TYPES.has(tokenType) || tokenType === 'gradient' || tokenType === 'transition') {
    return WIDTH_COMPLEX;
  }
  return WIDTH_DEFAULT;
}

export function useEditorWidth(tokenType?: string) {
  const [width, setWidthState] = useState<number>(() => {
    const saved = lsGet(STORAGE_KEYS.EDITOR_WIDTH);
    if (saved) {
      const n = parseInt(saved, 10);
      if (!isNaN(n)) return clampWidth(n);
    }
    return defaultWidthForType(tokenType);
  });

  const widthRef = useRef(width);
  widthRef.current = width;

  // When the token type changes and the user hasn't manually resized (i.e. width is still a default),
  // adjust the width to match the new type's default.
  useEffect(() => {
    const nextDefault = defaultWidthForType(tokenType);
    // Only auto-adjust if the current width is exactly a default value (not user-resized)
    if (widthRef.current === WIDTH_DEFAULT || widthRef.current === WIDTH_COMPLEX) {
      if (widthRef.current !== nextDefault) {
        setWidthState(nextDefault);
      }
    }
  }, [tokenType]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const onMove = (me: MouseEvent) => {
      // Dragging left (negative delta) widens the panel
      const delta = startX - me.clientX;
      const next = clampWidth(startWidth + delta);
      widthRef.current = next;
      setWidthState(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      lsSet(STORAGE_KEYS.EDITOR_WIDTH, String(widthRef.current));
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  return { editorWidth: width, handleEditorWidthDragStart: handleDragStart };
}
