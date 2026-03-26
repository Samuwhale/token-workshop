import { useState, useRef, useCallback } from 'react';
import type { TokenGenerator } from '../hooks/useGenerators';
import { TokenGeneratorDialog } from './TokenGeneratorDialog';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
const SRC_X = 16;
const SRC_W = 110;
const SRC_H = 56;

const GEN_X = 148;
const GEN_W = 148;
const GEN_H = 68;

const OUT_X = 320;
const OUT_W = 120;
const OUT_H = 56;

const DEL_X = OUT_X + OUT_W + 6;

const ROW_H = 106;
const TOP_PAD = 40;
const CANVAS_W = DEL_X + 24;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, string> = {
  colorRamp: 'Color Ramp',
  typeScale: 'Type Scale',
  spacingScale: 'Spacing Scale',
  opacityScale: 'Opacity Scale',
  borderRadiusScale: 'Border Radius',
  zIndexScale: 'Z-Index',
  customScale: 'Custom Scale',
};

function getStepCount(gen: TokenGenerator): number {
  const config = gen.config as any;
  if (Array.isArray(config.steps)) return config.steps.length;
  return 0;
}

/** Cubic bezier path from (x1,y1) to (x2,y2) with horizontal control handles */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface TokenGraphProps {
  generators: TokenGenerator[];
  serverUrl: string;
  sets: string[];
  activeSet: string;
  onRefresh: () => void;
  onRefreshGenerators: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function TokenGraph({
  generators,
  serverUrl,
  sets,
  activeSet,
  onRefresh,
  onRefreshGenerators,
}: TokenGraphProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [editingGen, setEditingGen] = useState<TokenGenerator | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canvasH = Math.max(360, generators.length * ROW_H + TOP_PAD + 60);

  // -------------------------------------------------------------------------
  // Pan interaction
  // -------------------------------------------------------------------------
  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return;
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    setIsPanning(true);
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPan({
      x: dragRef.current.px + (e.clientX - dragRef.current.mx),
      y: dragRef.current.py + (e.clientY - dragRef.current.my),
    });
  }, []);

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    setIsPanning(false);
  }, []);

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`${serverUrl}/api/generators/${id}`, { method: 'DELETE' });
      onRefreshGenerators();
      onRefresh();
    } finally {
      setDeletingId(null);
    }
  }, [serverUrl, onRefreshGenerators, onRefresh]);

  // -------------------------------------------------------------------------
  // Save callback
  // -------------------------------------------------------------------------
  const handleSaved = useCallback(() => {
    setEditingGen(null);
    setShowNewDialog(false);
    onRefreshGenerators();
    onRefresh();
  }, [onRefreshGenerators, onRefresh]);

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
  if (generators.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-[var(--color-figma-text-secondary)]">
        {/* Node graph icon */}
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-40" aria-hidden="true">
          <rect x="2" y="18" width="14" height="12" rx="2"/>
          <rect x="32" y="18" width="14" height="12" rx="2"/>
          <rect x="17" y="14" width="14" height="20" rx="2"/>
          <path d="M16 24h1M31 24h1" strokeWidth="1"/>
        </svg>
        <div className="text-center space-y-1">
          <p className="text-[12px] font-medium text-[var(--color-figma-text)]">No generators yet</p>
          <p className="text-[10px]">Generators compose token scales — color ramps, type scales, spacing, and more</p>
        </div>
        <button
          onClick={() => setShowNewDialog(true)}
          className="px-3 py-1.5 rounded text-[11px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          + New Generator
        </button>

        {showNewDialog && (
          <TokenGeneratorDialog
            serverUrl={serverUrl}
            allSets={sets}
            activeSet={activeSet}
            onClose={() => setShowNewDialog(false)}
            onSaved={handleSaved}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Graph canvas
  // -------------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)]">
        <span className="text-[10px] text-[var(--color-figma-text-secondary)] flex-1">
          {generators.length} generator{generators.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => setShowNewDialog(true)}
          className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--color-figma-accent)] text-white hover:opacity-90 transition-opacity"
        >
          + New
        </button>
      </div>

      {/* Canvas area */}
      <div
        className={`flex-1 overflow-hidden relative ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{ userSelect: 'none' }}
      >
        {/* Dot-grid background (stationary pattern moves with pan offsets) */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          aria-hidden="true"
          style={{ zIndex: 0 }}
        >
          <defs>
            <pattern
              id="tg-grid"
              x={((pan.x % 24) + 24) % 24}
              y={((pan.y % 24) + 24) % 24}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="var(--color-figma-text-tertiary)" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tg-grid)" />
        </svg>

        {/* Pan layer */}
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            width: CANVAS_W,
            height: canvasH,
            zIndex: 1,
          }}
        >
          {/* Edge SVG — rendered below nodes */}
          <svg
            className="absolute inset-0 pointer-events-none overflow-visible"
            width={CANVAS_W}
            height={canvasH}
            style={{ zIndex: 0 }}
            aria-hidden="true"
          >
            {generators.map((gen, i) => {
              const rowY = TOP_PAD + i * ROW_H;
              const srcMidY = rowY + SRC_H / 2;
              const genMidY = rowY + GEN_H / 2;
              const outMidY = rowY + OUT_H / 2;
              const hasSource = Boolean(gen.sourceToken);
              return (
                <g key={gen.id}>
                  {hasSource && (
                    <>
                      <path
                        d={edgePath(SRC_X + SRC_W, srcMidY, GEN_X, genMidY)}
                        fill="none"
                        stroke="var(--color-figma-accent)"
                        strokeWidth="1.5"
                        strokeOpacity="0.45"
                      />
                      <circle cx={SRC_X + SRC_W} cy={srcMidY} r={3} fill="var(--color-figma-accent)" opacity={0.55} />
                      <circle cx={GEN_X} cy={genMidY} r={3} fill="var(--color-figma-accent)" opacity={0.55} />
                    </>
                  )}
                  <path
                    d={edgePath(GEN_X + GEN_W, genMidY, OUT_X, outMidY)}
                    fill="none"
                    stroke="var(--color-figma-accent)"
                    strokeWidth="1.5"
                    strokeOpacity="0.45"
                  />
                  <circle cx={GEN_X + GEN_W} cy={genMidY} r={3} fill="var(--color-figma-accent)" opacity={0.55} />
                  <circle cx={OUT_X} cy={outMidY} r={3} fill="var(--color-figma-accent)" opacity={0.55} />
                </g>
              );
            })}
          </svg>

          {/* Node layer */}
          {generators.map((gen, i) => {
            const rowY = TOP_PAD + i * ROW_H;
            const stepCount = getStepCount(gen);
            const isDeleting = deletingId === gen.id;

            return (
              <div
                key={gen.id}
                style={{ position: 'absolute', top: 0, left: 0, width: CANVAS_W, zIndex: 1 }}
              >
                {/* ── Source node ── */}
                <div
                  data-node
                  style={{
                    position: 'absolute',
                    left: SRC_X,
                    top: rowY,
                    width: SRC_W,
                    height: SRC_H,
                  }}
                  className={`rounded border bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col justify-center gap-0.5 overflow-hidden ${gen.sourceToken ? 'border-[var(--color-figma-border)]' : 'border-dashed border-[var(--color-figma-border)] opacity-50'}`}
                >
                  <div className="text-[7px] font-semibold text-[var(--color-figma-text-tertiary)] uppercase tracking-widest">
                    {gen.sourceToken ? 'Source' : 'Standalone'}
                  </div>
                  {gen.sourceToken ? (
                    <>
                      <div
                        className="text-[10px] font-medium text-[var(--color-figma-text)] truncate leading-tight"
                        title={gen.sourceToken}
                      >
                        {gen.sourceToken.split('.').pop()}
                      </div>
                      <div
                        className="text-[8px] text-[var(--color-figma-text-secondary)] truncate leading-tight"
                        title={gen.sourceToken}
                      >
                        {gen.sourceToken}
                      </div>
                    </>
                  ) : (
                    <div className="text-[9px] text-[var(--color-figma-text-secondary)] leading-tight">
                      No source token
                    </div>
                  )}
                </div>

                {/* ── Generator node (clickable) ── */}
                <button
                  data-node
                  onClick={() => setEditingGen(gen)}
                  disabled={isDeleting}
                  style={{
                    position: 'absolute',
                    left: GEN_X,
                    top: rowY,
                    width: GEN_W,
                    height: GEN_H,
                  }}
                  className="rounded border border-[var(--color-figma-accent)]/40 bg-[var(--color-figma-accent)]/5 hover:bg-[var(--color-figma-accent)]/10 hover:border-[var(--color-figma-accent)]/65 px-2 py-1.5 flex flex-col justify-center gap-0.5 overflow-hidden transition-colors text-left group disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Edit generator"
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[7px] font-semibold text-[var(--color-figma-accent)] uppercase tracking-widest truncate">
                      {TYPE_LABELS[gen.type] ?? gen.type}
                    </div>
                    {/* Edit icon on hover */}
                    <svg
                      width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="shrink-0 text-[var(--color-figma-accent)] opacity-0 group-hover:opacity-80 transition-opacity"
                      aria-hidden="true"
                    >
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </div>
                  <div className="text-[11px] font-semibold text-[var(--color-figma-text)] truncate leading-tight">
                    {gen.name}
                  </div>
                  <div className="text-[9px] text-[var(--color-figma-text-secondary)] leading-tight">
                    {stepCount} step{stepCount !== 1 ? 's' : ''}
                  </div>
                </button>

                {/* ── Output node ── */}
                <div
                  data-node
                  style={{
                    position: 'absolute',
                    left: OUT_X,
                    top: rowY,
                    width: OUT_W,
                    height: OUT_H,
                  }}
                  className="rounded border border-[var(--color-figma-border)] bg-[var(--color-figma-bg-secondary)] px-2 py-1.5 flex flex-col justify-center gap-0.5 overflow-hidden"
                >
                  <div className="text-[7px] font-semibold text-[var(--color-figma-text-tertiary)] uppercase tracking-widest">
                    Output
                  </div>
                  <div
                    className="text-[10px] font-medium text-[var(--color-figma-text)] truncate leading-tight"
                    title={gen.targetGroup}
                  >
                    {gen.targetGroup}
                  </div>
                  <div className="text-[8px] text-[var(--color-figma-text-secondary)] truncate leading-tight">
                    → {gen.targetSet}
                  </div>
                </div>

                {/* ── Delete button ── */}
                <button
                  data-node
                  onClick={() => handleDelete(gen.id)}
                  disabled={isDeleting}
                  style={{
                    position: 'absolute',
                    left: DEL_X,
                    top: rowY + SRC_H / 2 - 8,
                    width: 16,
                    height: 16,
                  }}
                  className="flex items-center justify-center rounded text-[var(--color-figma-text-tertiary)] hover:text-[var(--color-figma-error,#f87171)] hover:bg-[var(--color-figma-error,#f87171)]/10 opacity-35 hover:opacity-100 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                  title="Delete generator"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        {/* Column header labels — fixed, outside pan layer */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center pointer-events-none"
          style={{ zIndex: 2, paddingTop: 8 }}
        >
          <span
            className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-widest"
            style={{ position: 'absolute', left: SRC_X + pan.x + SRC_W / 2 - 20 }}
          >
            Input
          </span>
          <span
            className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-widest"
            style={{ position: 'absolute', left: GEN_X + pan.x + GEN_W / 2 - 24 }}
          >
            Generator
          </span>
          <span
            className="text-[8px] font-medium text-[var(--color-figma-text-tertiary)] uppercase tracking-widest"
            style={{ position: 'absolute', left: OUT_X + pan.x + OUT_W / 2 - 16 }}
          >
            Output
          </span>
        </div>
      </div>

      {/* Dialogs */}
      {editingGen && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={sets}
          activeSet={activeSet}
          existingGenerator={editingGen}
          onClose={() => setEditingGen(null)}
          onSaved={handleSaved}
        />
      )}
      {showNewDialog && (
        <TokenGeneratorDialog
          serverUrl={serverUrl}
          allSets={sets}
          activeSet={activeSet}
          onClose={() => setShowNewDialog(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
