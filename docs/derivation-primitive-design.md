# Per-Token Derivation Primitive — Design Brief

## Context

TokenManager has two transformation primitives today:

1. **Generators** — 1→N parametric outputs (color ramps, type/spacing scales). Stored on collections, write outputs to disk on trigger.
2. **Color modifiers** — a per-token, color-only ordered chain of ops (`lighten/darken/alpha/mix`) stored at `$extensions.tokenmanager.colorModifier`, applied during resolve.

There is no general 1→1 transformation. A designer who wants "brand.blue at 50% alpha" must either hand-type the resolved value (relationship lost) or use the color-only `colorModifier` — which works, but is invisible in the graph and doesn't extend to dimension/number/duration.

The graph view recently became an authoring surface (drag-to-rewire-alias, hover impact preview). The next gap is making 1→1 derivations first-class in the graph: one primitive across token kinds, with a clear authoring surface and a node + live preview in the dependency graph.

## Naming and the legacy type

The brief assumed `Modifier`/`ModifierContext` exist in `core/src/types.ts`. Exploration shows they don't. What exists:

- `ResolverModifier` (`core/src/types.ts:298`) — the active DTCG v2025.10 resolver-file primitive for set/theme contexts. It lives at the *resolver-file layer*, not the canonical token model. CLAUDE.md forbids set/theme *in the canonical model*; this is a different layer. **Keep as-is.**
- `ColorModifierOp[]` at `$extensions.tokenmanager.colorModifier` — the per-token color chain we're generalizing. **Delete and replace** (no backcompat required per CLAUDE.md).

**Decision:** internal name **`Derivation`** (the token is *derived from* a source); storage key **`derivation`**; user-facing label **"Modifier"** (designer-friendly, no internal collision).

## Relationship to generators

Modifiers and generators are **sibling primitives**, not unified.

- **Modifiers**: 1→1, source-required, **lazy** (resolve on read), op-list-driven.
- **Generators**: 1→N, often curve-driven (color ramp's OKLCh + chromaBoost won't reduce to `lighten(N)`), several have **no source** (opacity, z-index, shadow), and are **eager** (write outputs to disk).

The two share **op math** via `core/src/derivation-ops.ts`. Type/spacing/border-radius scale generators call `scaleBy`/`add` internally to compute their step values, so the math lives in one place. Color ramp keeps its OKLCh curve as today.

**`darkModeInversion` is removed as a generator and reframed as a modifier preset.** It is already 1→1 (single source → single mirrored token), so it fits the modifier shape exactly. New op:

- `invertLightness` — `{ chromaBoost?: number }` — color → color (mirrors L* around 50%, optional chroma scaling).

The "Modify…" dialog surfaces it as a one-click preset alongside `alpha 0.5`, `lighten 20`, etc. for color sources. This trims the generator surface to the genuine 1→N cases.

## Modifier kinds (MVP)

| Op | Params | Source kind | Output kind |
|---|---|---|---|
| `alpha` | `amount: 0..1` | color | color |
| `lighten` | `amount: 0..100` (L*) | color | color |
| `darken` | `amount: 0..100` (L*) | color | color |
| `mix` | `with: TokenRef \| ColorLiteral, ratio: 0..1` | color | color |
| `invertLightness` | `chromaBoost?: number` | color | color |
| `scaleBy` | `factor: number` | dimension / number / duration | same kind |
| `add` | `delta: DimensionValue \| number` (same kind) | dimension / number / duration | same kind |

All ops are pure and deterministic: each applies identically to every mode value of the source.

**Deferred:** `hueShift`, `saturate`, `contrastAgainst` (want OKLCh polish first); formula/expression ops; composite-kind derivations (typography, shadow, border, transition, composition — designer mental model unclear); per-mode op parameters; expressing scale generators as derivation-shaped outputs (revisit once modifiers are battle-tested).

## Composition

Derivations carry an **ordered list** of ops. Order matters: `mix(white, 0.4) → alpha(0.5)` ≠ `alpha(0.5) → mix(white, 0.4)`.

Single-kind chains only in MVP: every op in the list must accept the previous op's output kind. Validated at write time and at resolve time.

**Multi-mode behavior:** the op list is shared across modes; each mode's source value flows through the same pipeline independently. If `brand.blue` has light/dark mode values, the derived token resolves to two distinct alpha-50 values — same ops, different inputs. Per-mode op params are deferred; designers who need different params per mode author two tokens. This is a deliberate departure from generators (which run only against the primary mode).

## Storage shape

DTCG-conformant **alias-plus-transform**. The derived token is a normal alias to its source; ops live in extensions:

```json
{
  "$type": "color",
  "$value": "{brand.blue}",
  "$extensions": {
    "tokenmanager": {
      "derivation": {
        "source": "brand.blue",
        "ops": [
          { "kind": "alpha", "amount": 0.5 }
        ]
      }
    }
  }
}
```

- `$value` is the alias to the source. Standard DTCG resolution finds the source value; ops apply on top. Tools that ignore `$extensions` get a graceful unmodified fallback.
- `source` is a dot-path (mirrors `$value` reference); kept explicit so tooling doesn't need to re-parse the alias.
- `ops` is an ordered array; this shape **replaces** the existing `colorModifier` field entirely.
- Multi-mode entries under `$extensions.tokenmanager.modes` may themselves be aliases or literals; ops apply uniformly. Modes do not override `derivation`.

## Resolver behavior

Extend `TokenResolver` (`core/src/resolver.ts`), reusing the slot where `colorModifier` is applied today (~line 365). Pipeline at a single token:

1. Resolve `$value` (alias chain → concrete value), existing logic.
2. Apply `$extends` composite inheritance (existing).
3. **Apply `derivation.ops` in order**, dispatched by `(op.kind, current $type)`.
4. Return the resolved token.

**Cycle detection** comes free: `$value: "{source}"` participates in the existing dependency graph via `extractReferencePaths` (`core/src/dtcg-types.ts:78`). Self-referential derivations raise the standard cycle error.

**Unresolvable source:** alias resolution already produces a ghost; ops are skipped and the token surfaces as broken in the graph (existing handling).

**Type mismatch:** if an op cannot apply to the resolved kind (e.g., `scaleBy` on a color), surface a typed validation error using the existing pattern from `dtcg-resolver.ts:269–360`.

**Op registry:** new file `packages/core/src/derivation-ops.ts`, mapping `(opKind, tokenType) → (value, params) => value`. Each op is pure and total, mirroring `generator-engine.ts` style.

## Authoring surface

**Primary — graph context menu + drag-out** (`FocusCanvas.tsx:558` for context menu; `:403` for connect-end):

- Right-click a token node → **Modify…** → dialog with: output path (default `<source>.<op-summary>`, e.g. `brand.blue.alpha-50`), op picker (filtered by source `$type`), params, live preview swatch/value.
- Drag from a node handle to the empty pane → small picker: "Create alias / Modify… / Generate from…". This extends the existing `CreateAliasConfirm` interaction (`graph/interactions/`).

**Secondary — token editor** (`TokenDetails.tsx`):

- A "Modifier" section replacing today's `ColorModifiersEditor`. Generalized: op rows with kind dropdown (filtered by source kind), params, drag-to-reorder, live preview. Same visual treatment as today's color section — pattern is already familiar.

**Tertiary — token list:**

- A small derivation glyph (no text badge — CLAUDE.md prohibits informational pills) on rows where `derivation` is present. Tooltip: "modified from `<source>`."

## Graph visualization

A new **DerivationNode** sits between source and derived: single-input edge in, single-output edge out. Renders the op chain as a compact stack of operation summaries (`α 0.5`, `×0.5`, `+8px`) plus a swatch/value preview of the resolved output. **One node per derivation regardless of op count** — keeps the graph readable.

Two new edge types parallel the generator edges (`graph/edges/`):

- `DerivationSourceEdge` (source → derivation), dashed.
- `DerivationProducesEdge` (derivation → derived), solid.

Hover impact preview (`FocusCanvas.tsx:193`) already BFS-traverses any edge — no change needed. `graphLayout.ts` already places upstream/downstream by hop distance; a derivation node naturally sits one hop downstream of its source and one upstream of its derived token. No new layout rules.

## Out of scope this session

- Ops: `hueShift`, `saturate`, `contrastAgainst`, formula/expression, cross-token math (beyond `mix.with`).
- Composite-kind derivations (typography, shadow, border, transition, composition).
- Per-mode op parameters.
- Generator-output → derivation as a special graph affordance — works transparently via aliasing.
- Migration: existing `colorModifier` is deleted, not migrated (CLAUDE.md, no shipped users).

## Critical files

- `packages/core/src/types.ts` — add `Derivation`, `DerivationOp` types under `TokenManagerExtensions`; remove `colorModifier`; remove `darkModeInversion` from `GeneratorType`.
- `packages/core/src/resolver.ts` — replace color-modifier application (~line 365) with the derivation pipeline.
- `packages/core/src/derivation-ops.ts` *(new)* — op registry and pure implementations. Type/spacing scale generators import `scaleBy`/`add` from here.
- `packages/core/src/color-modifier.ts` — delete; logic absorbed into derivation-ops.
- `packages/core/src/generator-types.ts` — remove `DarkModeInversionConfig` and `"darkModeInversion"` from `GeneratorType`.
- `packages/core/src/generator-engine.ts` — remove `runDarkModeInversionGenerator` (line ~457); the L*-mirror logic moves to `derivation-ops.ts` as `invertLightness`.
- `packages/server/src/services/generator-service.ts` — remove `"darkModeInversion"` from `VALID_GENERATOR_TYPES` and its dispatch case.
- `packages/core/src/graph.ts` — add derivation node/edge types to the graph model.
- `packages/figma-plugin/src/ui/components/graph/nodes/DerivationNode.tsx` *(new)*.
- `packages/figma-plugin/src/ui/components/graph/edges/DerivationSourceEdge.tsx`, `DerivationProducesEdge.tsx` *(new)*.
- `packages/figma-plugin/src/ui/components/graph/FocusCanvas.tsx` — context-menu entry, drag-end picker.
- `packages/figma-plugin/src/ui/components/graph/interactions/CreateDerivationConfirm.tsx` *(new)* — parallel to `CreateAliasConfirm`.
- `packages/figma-plugin/src/ui/components/TokenDetails.tsx` — swap `ColorModifiersEditor` for `DerivationEditor`.
- `packages/figma-plugin/src/ui/components/ColorModifiersEditor.tsx` — delete; replaced.

## Verification

1. Author `brand.blue.alpha-50` via graph context menu → confirm on-disk shape matches spec.
2. `TokenResolver.resolveAll()` → derived token resolves to source color with α=0.5.
3. Multi-mode source (light/dark) → derived token resolves per-mode through the same op chain.
4. Rename source → derived surfaces as ghost in graph; resolver reports broken without crashing.
5. Cycle (`a` derives from `b`, `b` derives from `a`) → existing cycle detector reports the cycle.
6. Graph: derivation node renders with op summary + preview; source/produces edges connect; hover impact preview dims correctly.
7. Token list: glyph appears on rows with `derivation`; tooltip shows source path.
