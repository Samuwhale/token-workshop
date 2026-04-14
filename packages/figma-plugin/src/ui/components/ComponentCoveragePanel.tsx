import { useState, useEffect, useCallback, useRef } from 'react';
import { Spinner } from './Spinner';

interface CoverageResult {
  totalComponents: number;
  tokenizedComponents: number;
  untokenized: { id: string; name: string; hardcodedCount: number }[];
  totalUntokenized: number;
}

export function ComponentCoveragePanel() {
  const [coverageResult, setCoverageResult] = useState<CoverageResult | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [showUntokenized, setShowUntokenized] = useState(false);
  const coveragePendingRef = useRef<Map<string, (data: unknown) => void>>(new Map());
  const coverageCancelRef = useRef<(() => void) | null>(null);

  // Listen for component-coverage-result / component-coverage-error from controller
  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      const msg = ev.data?.pluginMessage;
      if (msg?.type === 'component-coverage-result' && msg.correlationId) {
        const resolve = coveragePendingRef.current.get(msg.correlationId);
        if (resolve) {
          coveragePendingRef.current.delete(msg.correlationId);
          resolve(msg);
        }
      } else if (msg?.type === 'component-coverage-error' && msg.correlationId) {
        const resolve = coveragePendingRef.current.get(msg.correlationId);
        if (resolve) {
          coveragePendingRef.current.delete(msg.correlationId);
          resolve({ __error: msg.error });
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runCoverageScan = useCallback(async () => {
    coverageCancelRef.current?.();
    setCoverageLoading(true);
    setCoverageResult(null);
    setCoverageError(null);
    try {
      const result = await new Promise<unknown>((resolve, reject) => {
        const cid = `coverage-${Date.now()}-${Math.random()}`;
        let done = false;
        const finish = (data: unknown) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          resolve(data);
        };
        const timeout = setTimeout(() => {
          if (done) return;
          done = true;
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
          reject(new Error('Scan timed out'));
        }, 30000);
        coveragePendingRef.current.set(cid, finish);
        coverageCancelRef.current = () => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          coveragePendingRef.current.delete(cid);
          coverageCancelRef.current = null;
          parent.postMessage({ pluginMessage: { type: 'cancel-scan' } }, '*');
          reject(new Error('Cancelled'));
        };
        parent.postMessage({ pluginMessage: { type: 'scan-component-coverage', correlationId: cid } }, '*');
      });
      const r = result as Record<string, unknown>;
      if (r?.__error) {
        setCoverageError(`Scan failed: ${r.__error}`);
      } else {
        setCoverageResult(result as CoverageResult);
        setShowUntokenized(true);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'Cancelled') return;
      setCoverageError(
        err instanceof Error && err.message === 'Scan timed out'
          ? 'Scan timed out. Try fewer components.'
          : 'Scan failed. Ensure the plugin is active.'
      );
    } finally {
      setCoverageLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 gap-3" style={{ scrollbarWidth: 'thin' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--color-figma-text-secondary)]">Coverage</span>
        {coverageLoading ? (
          <button
            onClick={() => coverageCancelRef.current?.()}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-error)]/40 text-[var(--color-figma-error)] hover:bg-[var(--color-figma-error)]/10 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={runCoverageScan}
            className="text-[10px] px-2 py-0.5 rounded border border-[var(--color-figma-border)] text-[var(--color-figma-text)] hover:bg-[var(--color-figma-bg-hover)] transition-colors"
          >
            Scan
          </button>
        )}
      </div>

      {/* Stats */}
      {coverageResult && (
        <div className="rounded border border-[var(--color-figma-border)] overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-[var(--color-figma-border)]">
            <div className="px-2 py-2 text-center">
              <div className="text-[14px] font-bold text-[var(--color-figma-text)]">{coverageResult.totalComponents}</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Total</div>
            </div>
            <div className="px-2 py-2 text-center">
              <div className="text-[14px] font-bold text-[var(--color-figma-success)]">{coverageResult.tokenizedComponents}</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Tokenized</div>
            </div>
            <div className="px-2 py-2 text-center">
              <div className="text-[14px] font-bold text-[var(--color-figma-warning)]">{coverageResult.totalUntokenized}</div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Untokenized</div>
            </div>
            <div className="px-2 py-2 text-center">
              <div className="text-[14px] font-bold text-[var(--color-figma-text)]">
                {coverageResult.totalComponents > 0
                  ? Math.round((coverageResult.tokenizedComponents / coverageResult.totalComponents) * 100)
                  : 0}%
              </div>
              <div className="text-[10px] text-[var(--color-figma-text-secondary)]">Coverage</div>
            </div>
          </div>
          {coverageResult.totalUntokenized > 0 && (
            <>
              <button
                onClick={() => setShowUntokenized(v => !v)}
                className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-[var(--color-figma-text-secondary)] hover:bg-[var(--color-figma-bg-hover)] border-t border-[var(--color-figma-border)]"
              >
                <span>Untokenized ({coverageResult.totalUntokenized})</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className={`transition-transform ${showUntokenized ? 'rotate-90' : ''}`} aria-hidden="true"><path d="M2 1l4 3-4 3V1z" /></svg>
              </button>
              {showUntokenized && (
                <div className="divide-y divide-[var(--color-figma-border)] max-h-64 overflow-y-auto">
                  {coverageResult.totalUntokenized > coverageResult.untokenized.length && (
                    <div className="px-3 py-1.5 text-[10px] text-[var(--color-figma-text-tertiary)] bg-[var(--color-figma-bg-secondary)]">
                      {coverageResult.untokenized.length} of {coverageResult.totalUntokenized} shown
                    </div>
                  )}
                  {coverageResult.untokenized.map(comp => (
                    <button
                      key={comp.id}
                      onClick={() => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: comp.id } }, '*')}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-[var(--color-figma-bg-hover)] transition-colors"
                    >
                      <span className="text-[10px] text-[var(--color-figma-text)] truncate flex-1">{comp.name}</span>
                      <span className="text-[10px] text-[var(--color-figma-text-secondary)] shrink-0 ml-2">{comp.hardcodedCount} hardcoded</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {coverageLoading && (
        <div className="flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-[10px] text-[var(--color-figma-text-secondary)]">Scanning components…</span>
        </div>
      )}

      {!coverageLoading && coverageError && (
        <div className="text-[10px] text-[var(--color-figma-error)]">{coverageError}</div>
      )}

      {!coverageLoading && !coverageResult && !coverageError && (
        <p className="text-[10px] text-[var(--color-figma-text-secondary)]">
          Scan to check coverage.
        </p>
      )}
    </div>
  );
}
