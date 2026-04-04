import type { ColorModifierOp } from '@tokenmanager/core';

export const EDITOR_DRAFT_PREFIX = 'tm_editor_draft';

export interface EditorDraftData {
  tokenType: string;
  value: any;
  description: string;
  reference: string;
  scopes: string[];
  colorModifiers: ColorModifierOp[];
  modeValues: Record<string, any>;
  extensionsJsonText: string;
  lifecycle: 'draft' | 'published' | 'deprecated';
  extendsPath: string;
  savedAt: number;
}

export function editorDraftKey(setName: string, tokenPath: string): string {
  return `${EDITOR_DRAFT_PREFIX}:${setName}:${tokenPath}`;
}

export function saveEditorDraft(setName: string, tokenPath: string, data: Omit<EditorDraftData, 'savedAt'>): void {
  try {
    sessionStorage.setItem(editorDraftKey(setName, tokenPath), JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch { /* quota exceeded – best-effort */ }
}

export function loadEditorDraft(setName: string, tokenPath: string): EditorDraftData | null {
  try {
    const raw = sessionStorage.getItem(editorDraftKey(setName, tokenPath));
    if (!raw) return null;
    return JSON.parse(raw) as EditorDraftData;
  } catch { return null; }
}

export function clearEditorDraft(setName: string, tokenPath: string): void {
  try { sessionStorage.removeItem(editorDraftKey(setName, tokenPath)); } catch { /* ignore */ }
}

export function formatDraftAge(savedAt: number): string {
  const seconds = Math.floor((Date.now() - savedAt) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}
