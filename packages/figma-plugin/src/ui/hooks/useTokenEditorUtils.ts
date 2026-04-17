import { STORAGE_KEY_BUILDERS, ssGetJson, ssRemove, ssSetJson } from '../shared/storage';
import type { TokenEditorDraftData } from '../shared/tokenEditorTypes';

export type { TokenEditorDraftData as EditorDraftData } from '../shared/tokenEditorTypes';

export function editorDraftKey(collectionId: string, tokenPath: string): string {
  return STORAGE_KEY_BUILDERS.editorDraft(collectionId, tokenPath);
}

export function saveEditorDraft(collectionId: string, tokenPath: string, data: Omit<TokenEditorDraftData, 'savedAt'>): void {
  ssSetJson(editorDraftKey(collectionId, tokenPath), { ...data, savedAt: Date.now() });
}

export function loadEditorDraft(collectionId: string, tokenPath: string): TokenEditorDraftData | null {
  return ssGetJson<TokenEditorDraftData | null>(editorDraftKey(collectionId, tokenPath), null);
}

export function clearEditorDraft(collectionId: string, tokenPath: string): void {
  ssRemove(editorDraftKey(collectionId, tokenPath));
}

export function formatDraftAge(savedAt: number): string {
  const seconds = Math.floor((Date.now() - savedAt) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}
