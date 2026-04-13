import { ssGetJson, ssRemove, ssSetJson } from '../shared/storage';
import type { TokenEditorDraftData } from '../shared/tokenEditorTypes';

export const EDITOR_DRAFT_PREFIX = 'tm_editor_draft';
export type { TokenEditorDraftData as EditorDraftData } from '../shared/tokenEditorTypes';

export function editorDraftKey(setName: string, tokenPath: string): string {
  return `${EDITOR_DRAFT_PREFIX}:${setName}:${tokenPath}`;
}

export function saveEditorDraft(setName: string, tokenPath: string, data: Omit<TokenEditorDraftData, 'savedAt'>): void {
  ssSetJson(editorDraftKey(setName, tokenPath), { ...data, savedAt: Date.now() });
}

export function loadEditorDraft(setName: string, tokenPath: string): TokenEditorDraftData | null {
  return ssGetJson<TokenEditorDraftData | null>(editorDraftKey(setName, tokenPath), null);
}

export function clearEditorDraft(setName: string, tokenPath: string): void {
  ssRemove(editorDraftKey(setName, tokenPath));
}

export function formatDraftAge(savedAt: number): string {
  const seconds = Math.floor((Date.now() - savedAt) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
}
