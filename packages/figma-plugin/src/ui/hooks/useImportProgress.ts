import { useState } from 'react';
import type React from 'react';

/** Setters for shared import progress state, passed into per-workflow sub-hooks. */
export type ProgressSetters = {
  setImporting: React.Dispatch<React.SetStateAction<boolean>>;
  setImportProgress: React.Dispatch<React.SetStateAction<{ done: number; total: number } | null>>;
  setSuccessMessage: React.Dispatch<React.SetStateAction<string | null>>;
};

/** Base hook that owns the shared import progress / status state. */
export function useImportProgress() {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return {
    importing,
    importProgress,
    successMessage,
    setImporting,
    setImportProgress,
    setSuccessMessage,
  };
}
