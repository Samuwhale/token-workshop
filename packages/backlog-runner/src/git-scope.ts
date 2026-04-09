import path from 'node:path';
import { isPathWithinTouchPaths } from './task-specs.js';

export function normalizePathForGit(value: string): string {
  return value.split(path.sep).join('/');
}

export function isWorktreeBootstrapArtifact(file: string): boolean {
  const normalized = normalizePathForGit(file).replace(/\/+$/, '');
  return normalized === 'node_modules' || /^packages\/[^/]+\/node_modules$/.test(normalized);
}

export function scopedFiles(files: string[], allowedPaths: string[]): string[] {
  return files.filter(file => !isWorktreeBootstrapArtifact(file) && isPathWithinTouchPaths(file, allowedPaths));
}

export function unexpectedFiles(files: string[], allowedPaths: string[]): string[] {
  return files.filter(file => !isWorktreeBootstrapArtifact(file) && !isPathWithinTouchPaths(file, allowedPaths));
}
