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

- `invertLightness` — `{ chromaBoost?: number }` — color → color (mirrors L* around 50%, optional chroma scaling). `chromaBoost` defaults to `1.0` (no chroma scaling) when omitted.

The "Modify…" dialog surfaces it as a one-click preset alongside `alpha 0.5`, `lighten 20`, etc. for color sources. This trims the generator surface to the genuine 1→N cases.

This trades the generator's batch workflow (mirror an entire color ramp at once) for per-token application. Designers who need a full-ramp mirror author it per token or directly in a dark-mode collection mode — consistent with Figma's per-collection-modes mental model. Re-enabling batch application across a token group is tracked in *Out of scope*.

## Modifier kinds (MVP)

| Op | Params | Source kind | Output kind |
|---|---|---|---|
| `alpha` | `amount: 0..1` | color | color |
| `lighten` | `amount: 0..100` (L*) | color | color |
| `darken` | `amount: 0..100` (L*) | color | color |
| `mix` | `with: TokenRef \| ColorLiteral, ratio: 0..1` | color | color |
| `invertLightness` | `chromaBoost?: number` | color | color |
| `scaleBy` | `factor: number` | dimension / number / duration | same kind |
| `add` | `delta: DimensionValue \| number` (same kind, same unit) | dimension / number / duration | same kind |

All ops are pure and deterministic: each applies identically to every mode value of the source.

**`mix.with` as TokenRef.** When `mix.with` is a token reference, the param participates in the dependency graph and renders as a secondary input edge on the DerivationNode. For multi-mode params, resolution looks up the same mode name on the param token; if absent, falls back to the param's primary mode value. Cross-token math beyond `mix.with` (e.g. `scaleBy.factor` as a token ref) is deferred.

**`add` unit handling.** `delta` must match the source's unit; mismatches surface as a typed validation error using the existing pattern at `dtcg-resolver.ts:269–360`. Cross-unit conversion (e.g. `1rem + 8px`) is deferred.

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
        "ops": [
          { "kind": "alpha", "amount": 0.5 }
        ]
      }
    }
  }
}
```

- `$value` is the alias to the source and the **single source of truth** for that path. Standard DTCG resolution finds the source value; ops apply on top. Tools that ignore `$extensions` get a graceful unmodified fallback. Consumers that need the source dot-path call `parseReference($value)` (`dtcg-types.ts:87`) — no separate `source` field.
- A derivation **requires `$value` to be an alias** (`{path}`). Tokens with literal values cannot carry a derivation; this is validated at write time.
- `ops` is an ordered array; this shape **replaces** the existing `colorModifier` field entirely.
- Multi-mode entries under `$extensions.tokenmanager.modes` may themselves be aliases or literals; ops apply uniformly. Modes do not override `derivation`.

## Resolver behavior

Extend `TokenResolver` (`core/src/resolver.ts`), reusing the slot where `colorModifier` is applied today (~line 365). Actual pipeline order at `resolver.ts:299–371`:

1. Resolve `$value` (alias chain → concrete value).
2. Resolve `$type`.
3. Normalize bare-number dimension/duration values into the `{value, unit}` shape (so dimension/number ops operate on the wrapped object, not a bare number).
4. Composite-type validation (shadow/typography/etc.).
5. Apply `$extends` composite inheritance.
6. **Apply `derivation.ops` in order**, dispatched by `(op.kind, current $type)` — replacing the current `colorModifier` slot.

Derivation ops run on the post-`$extends`, normalized value.

**Cycle detection.** The primary source (`$value: "{source}"`) participates in the existing dep graph via `extractReferencePaths` (`core/src/dtcg-types.ts:99`). With `mix.with: TokenRef` in scope, dep-graph extraction must additionally walk `$extensions.tokenmanager.derivation.ops[*]` for any token-ref-typed op param (today: `mix.with`, more in future). Once extraction covers param refs, the existing cycle detector picks them up automatically — `a = mix({b}, …)`, `b = mix({a}, …)` reports as a standard cycle.

**Unresolvable source:** alias resolution already produces a ghost; ops are skipped and the token surfaces as broken in the graph (existing handling).

**Type mismatch:** if an op cannot apply to the resolved kind (e.g., `scaleBy` on a color), surface a typed validation error using the existing pattern from `dtcg-resolver.ts:269–360`.

**Op registry:** new file `packages/core/src/derivation-ops.ts`, mapping `(opKind, tokenType) → (value, params) => value`. Each op is pure and total, mirroring `generator-engine.ts` style.

## Authoring surface

**Primary — graph context menu + drag-out** (`FocusCanvas.tsx:558` for context menu; `:403` for connect-end):

- Right-click a token node → **Modify…** → dialog with: output path (default `<source>.<op-summary>`, e.g. `brand.blue.alpha-50`), op picker (filtered by source `$type`), params, live preview swatch/value.
- Drag from a node handle to the empty pane → small picker: "Create alias / Modify… / Generate from…". This extends the existing `CreateAliasConfirm` interaction (`graph/interactions/`).

**Secondary — token editor** (`TokenDetails.tsx`):

- A "Modifier" section replacing today's `ColorModifiersEditor`. Generalized: op rows with kind dropdown (filtered by source kind), params, drag-to-reorder, live preview. Same visual treatment as today's color section — pattern is already familiar.
- The `mix.with` param accepts both a color literal and a token reference: a single input field detects `{path}` vs `#hex/rgb()` (matches alias-detection used elsewhere in the editor).

**Tertiary — token list:**

- A small derivation glyph (no text badge — CLAUDE.md prohibits informational pills) on rows where `derivation` is present, parallel to `GeneratedGlyph` at `tokenTreeNodeShared.tsx:84–111`. Tooltip: "modified from `<source>`." A derivation row reads as a derivation, **not** as an alias — the alias `$value` is an implementation detail and is not separately surfaced on derivation rows.

## Graph visualization

A new **DerivationNode** sits between source and derived: one **primary** input edge from the `$value` source, plus one **secondary** input edge per token-ref op param (today: `mix.with`), and a single output edge to the derived token. Renders the op chain as a compact stack of operation summaries (`α 0.5`, `×0.5`, `+8px`) plus a swatch/value preview of the resolved output. **One node per derivation regardless of op count** — keeps the graph readable.

Two new edge types parallel the generator edges (`graph/edges/`):

- `DerivationSourceEdge` (source → derivation), dashed. Reused for secondary token-ref param inputs (e.g. `mix.with`); the param-input variant carries a small label near the handle (e.g. "with") to disambiguate. Final visual treatment for the param-input label is decided during implementation.
- `DerivationProducesEdge` (derivation → derived), **solid**. The solid/dashed contrast vs. `GeneratorProducesEdge` (which is dashed) is intentional: generators are batch/computed outputs, derivations are live transforms whose output reads "as if directly aliased."

Hover impact preview (`FocusCanvas.tsx:193`) already BFS-traverses any edge — no change needed. `graphLayout.ts` already places upstream/downstream by hop distance; a derivation node sits one hop downstream of its primary source and one upstream of its derived token. Secondary token-ref param sources sit one hop upstream of the derivation node, in the same column class as the primary source. No new layout rules.

## Out of scope this session

- Ops: `hueShift`, `saturate`, `contrastAgainst`, formula/expression.
- Cross-token math beyond `mix.with` (e.g. `scaleBy.factor` as a token ref).
- Cross-unit `add` (e.g. `1rem + 8px`).
- Composite-kind derivations (typography, shadow, border, transition, composition).
- Per-mode op parameters.
- Applying a derivation across a token group as a single batch operation (replaces today's batch `darkModeInversion` workflow at the cost of per-token application).
- Performance / resolution caching for deep derivation chains — single-resolve per read is acceptable for MVP.
- Generator-output → derivation as a special graph affordance — works transparently via aliasing.
- Migration: existing `colorModifier` is deleted, not migrated (CLAUDE.md, no shipped users).

## Critical files

- `packages/core/src/types.ts` — add `Derivation`, `DerivationOp` types under `TokenManagerExtensions`; remove `colorModifier`; remove `darkModeInversion` from `GeneratorType`.
- `packages/core/src/resolver.ts` — replace color-modifier application (~line 365) with the derivation pipeline.
- `packages/core/src/derivation-ops.ts` *(new)* — op registry and pure implementations. Type/spacing scale generators import `scaleBy`/`add` from here.
- `packages/core/src/color-modifier.ts` — delete; logic absorbed into derivation-ops. Five existing consumers must be updated: `resolver.ts`, `ColorModifiersEditor.tsx`, `useTokenEditorLoad.ts`, `core/index.ts` re-exports, and `__tests__/color-modifier.test.ts`.
- The dependency-graph build site that consumes `extractReferencePaths` (locate via `grep -r extractReferencePaths packages/core/src`) — extend extraction to also walk `$extensions.tokenmanager.derivation.ops[*]` for token-ref params, so cycle detection and rename refactors cover them.
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

Manual verification — no new test suite per CLAUDE.md guidance.

1. Author `brand.blue.alpha-50` via graph context menu → confirm on-disk shape matches spec (no `source` field; `ops` only).
2. `TokenResolver.resolveAll()` → derived token resolves to source color with α=0.5.
3. Multi-mode source (light/dark) → derived token resolves per-mode through the same op chain.
4. Rename source → derived surfaces as ghost in graph; resolver reports broken without crashing.
5. Cycle (`a` derives from `b`, `b` derives from `a`) → existing cycle detector reports the cycle.
6. Cross-token `mix`: `brand.tint = mix({neutral.white}, 0.4)` on top of `brand.blue` → both source and `mix.with` participate in the dep graph; renaming either updates the derivation; cycle (`a = mix({b}, …)`, `b = mix({a}, …)`) is reported by the existing detector.
7. Graph: derivation node renders with op summary + preview; primary source edge plus secondary param edge for `mix.with` connect; hover impact preview dims correctly.
8. Token list: glyph appears on rows with `derivation`; tooltip shows source path; the row does not also display the alias indicator.
9. Validation: attempting to set a `derivation` on a literal-valued token (no alias `$value`) is rejected at write time. `add` with mismatched units surfaces as a typed validation error.
