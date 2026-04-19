# UX Review: Token Library, Token Editor, Generator Editor

> Critical implementation-grounded review of the current token authoring surfaces.
> Validated against current code on 2026-04-19.
> Scope: `packages/figma-plugin/src/ui/**` plus supporting navigation and command surfaces.
>
> **Constraint context:** The Figma plugin panel is ~300–340px wide. Many surfaces that appear “overloaded” exist because there is no room for the separate views that a full-width application could afford. Recommendations must work within this constraint, not ignore it.

---

## Executive Summary

The UI has three categories of problem, listed in order of severity:

1. **Bugs** — a mislabeled toggle, a hidden required field, and a destructive segment switch. These are clear interaction contract violations that can be fixed immediately.
2. **Design debt** — bulk-edit scope is hidden, token rows carry too many responsibilities in their default state, and the typography scale is too small. These need focused design work.
3. **Architecture questions** — workspace ownership, editor panel structure, and terminology. These are real but less urgent, and some are overstated in earlier drafts of this review.

The most serious problems are the ones where the UI contradicts itself: blocking save on a hidden field, labeling a mode toggle as “Resolved values,” and silently destroying state on a segment click.

### Overall Assessment

| Surface | Assessment | Severity |
| --- | --- | --- |
| Token Library | Has real issues: a mislabeled toggle and hidden scope during bulk edit. The “structural conflict” with Publish is overstated — it's two misplaced menu items, not an architectural crisis. | Mixed |
| Token Editor | Large but uses progressive disclosure. The dependents duplication is mild (summary vs. detail). The bigger issue is section ordering in create mode. | Moderate |
| Generator Editor | Contains the two clearest bugs: hidden required field and destructive source switching. Fixable without redesign. | High (fixable) |

### Core Conclusion

The current product is strongest when it narrows the user to one explicit authoring decision.

It is weakest when the UI's promises contradict its behavior — blocking save on invisible fields, mislabeling toggles, and destroying state without confirmation.

---

## What This Review Is Based On

This review is based on the current implementation, not on intent, screenshots, or older critique.

Primary files reviewed:

- `packages/figma-plugin/src/ui/components/TokenList.tsx`
- `packages/figma-plugin/src/ui/components/TokenListToolbar.tsx`
- `packages/figma-plugin/src/ui/components/TokenListOverflowMenu.tsx`
- `packages/figma-plugin/src/ui/components/SelectModeToolbar.tsx`
- `packages/figma-plugin/src/ui/components/token-list/useToolbarStateChips.ts`
- `packages/figma-plugin/src/ui/hooks/useTokenListViewState.ts`
- `packages/figma-plugin/src/ui/components/token-tree/TokenLeafNode.tsx`
- `packages/figma-plugin/src/ui/components/TokenEditor.tsx`
- `packages/figma-plugin/src/ui/components/token-editor/TokenEditorInfoSection.tsx`
- `packages/figma-plugin/src/ui/components/token-editor/TokenStateSummary.tsx`
- `packages/figma-plugin/src/ui/components/GeneratedGroupEditor.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepSource.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepWhere.tsx`
- `packages/figma-plugin/src/ui/components/generated-group-editor/StepSave.tsx`
- `packages/figma-plugin/src/ui/components/UnifiedSourceInput.tsx`
- `packages/figma-plugin/src/ui/hooks/useCommandPaletteCommands.ts`
- `packages/figma-plugin/src/ui/shared/navigationTypes.ts`

---

## Critical Findings

### 1. Tokens And Publish Have A Minor Placement Overlap

> **Severity:** Low | **Effort:** Small | **Type:** Menu cleanup

The app shell has a dedicated Publish workspace (`TopTab = “sync”`, label `Publish`, with Publish/Export/History/Health sub-tabs in `navigationTypes.ts:94-103`).

The Tokens surface leaks two publish actions into the `+` menu:

- “Push variables” (`TokenListToolbar.tsx:422`)
- “Push styles” (`TokenListToolbar.tsx:432`)

Both sit under a “Sync” separator in the toolbar's add menu. One command palette entry (“Validate”) also navigates to the Publish/Health workspace (`useCommandPaletteCommands.ts:234`).

There are no visual sync-status indicators, readiness badges, or publish-state summaries in the Tokens surface itself. The leak is functional only — two menu items and one command shortcut.

#### Assessment

This is not a fundamental architectural conflict. The Publish workspace is clearly separated at the routing level. The actual problem is two misplaced menu items that belong in the Publish workspace rather than the Tokens `+` menu.

#### Recommendation

Move “Push variables” and “Push styles” out of the Tokens `+` menu. Keep the command palette shortcut for power users who want fast access to validation.

---

### 2. Multi-Token Workflows Hide Scope Behind Mode Switches

> **Severity:** Medium | **Effort:** Medium | **Type:** Design debt

**Verified in code:** When `selectMode` is true, the entire `TokenListToolbar` is unmounted (`TokenList.tsx:2455` — `{!selectMode && (`). The replacement `SelectModeToolbar` contains only basic selection controls (select all, batch editor toggle, delete, exit) — no search, no filter context, no zoom breadcrumb.

`openBulkEditorForPaths` (`TokenList.tsx:1295-1307`) converts `displayedLeafNodes` (the current query/filter/zoom results) into a `selectedPaths` Set. Once that conversion happens and selectMode activates, the original query context is gone from the UI.

This is a real clarity problem: the user enters bulk edit from a filtered view but loses visibility of that filter during the operation.

#### Constraint

The plugin panel is ~300px wide. Showing both the selection toolbar and the search/filter context simultaneously is a real layout challenge, not a simple oversight.

#### Recommendation

At minimum, keep a read-only summary of the originating scope visible in the `SelectModeToolbar` (e.g., "12 tokens matching 'color.primary'"). This doesn't require keeping the full search bar, just a label describing what produced the current selection.

---

### 3. The Mode Toggle Is Mislabeled As “Resolved Values”

> **Severity:** High | **Effort:** Small (label fix) | **Type:** Bug

**Verified in code:** This is a concrete semantic error, not a judgment call.

Two separate concepts exist:

- `modeLensEnabled` (`useTokenListViewState.ts:173-188`) — shows mode-selected values from `allTokensFlat` instead of base values from `unresolvedAllTokensFlat`. This is about which **mode** the value comes from.
- `showResolvedValues` (`useTokenListViewState.ts:69-88`) — resolves alias references (`{alias}` syntax) to their target values. This is about **alias resolution**.

But the UI labels `modeLensEnabled` as “Resolved values” in two places:

- `useToolbarStateChips.ts:195` — chip label
- `TokenListOverflowMenu.tsx:307` — menu item label

This is wrong. Mode viewing and alias resolution are different operations. A user toggling “Resolved values” expects to see aliases expanded, not mode-specific overrides.

#### Recommendation

Rename the `modeLensEnabled` label to “Mode values” or “Active mode” in both locations. This is a two-line fix.

#### Broader view-model question

The library does support multiple value interpretations (authored, alias-resolved, mode-selected, multi-mode columns, JSON). Whether these should be mutually exclusive presets or independent toggles is a design decision worth revisiting, but the immediate fix is the mislabel.

---

### 4. Token Rows Carry Many Responsibilities, But Most Are Progressive

> **Severity:** Medium | **Effort:** Large | **Type:** Design debt

**Verified in code:** `TokenLeafNode.tsx` is 2,522 lines and handles at least 15 distinct concerns:

- inline value editing (lines 629-659, 1458-1589)
- alias navigation (lines 412-414, 1594-1626)
- metadata segment assembly (lines 776-863)
- status icon rendering (lines 1674-1750)
- selection checkbox behavior (lines 1189-1205)
- context menus with ~20 items (lines 1817-2089)
- reverse-reference popovers (lines 2141-2207)
- generated-token save choices (lines 2209-2303)
- resolution-chain debugging (lines 2411-2506)
- drag-and-drop reordering (lines 1112-1165)
- inline rename (lines 1308-1356)
- color picker integration (lines 1208-1245)
- multi-mode value columns (lines 2346-2385)
- nearby-token nudge (lines 2388-2409)
- keyboard tab navigation (lines 662-685)

The metadata strip can include: generated-by, alias-of, extends, scopes, incoming references, origin, missing mode count, and lifecycle.

#### Nuance the earlier draft missed

Many of these concerns are **not simultaneously visible**. Context menus, popovers, resolution chains, and save-choice modals appear on interaction. The drag ghost only appears during drag. Inline rename replaces the label.

The real question is: **what appears in the default, non-hovered, non-expanded state?** That's the row contract that matters to a user scanning a list. The component's code complexity is a maintainability concern, not necessarily a UX concern.

#### Recommendation

Audit what appears in the default row state specifically. If the default row shows identity + value + one status indicator, the progressive disclosure model may be working. If metadata segments are visible by default and competing for attention, tighten the default and move more to hover/detail.

The component itself could benefit from decomposition regardless, for maintainability.

---

### 5. The Token Editor Is Large But Uses Progressive Disclosure; Dependents Appear Twice

> **Severity:** Low-Medium | **Effort:** Medium | **Type:** Architecture question

**Verified in code:** `TokenEditor.tsx` is 2,037 lines. The panel sections in render order (`TokenEditor.tsx:1570-1915`):

1. Create mode header — type selector + path input (lines 1570-1671)
2. Value section — type-specific value editors (line 1673)
3. Mode values editor — per-mode overrides (lines 1706-1719)
4. Reference section — alias picker + extends picker (lines 1721, 1239-1344)
5. Generator status — warning if token is generated (lines 1723-1770)
6. **Dependents list** — collapsible, shows direct dependents (lines 1772, 1347-1421)
7. Details collapsible (lines 1774-1915), containing:
   - Color modifiers, contrast checker, description, lifecycle, metadata/scopes
   - Derived groups, raw JSON
   - **TokenEditorInfoSection** (lines 1880-1913), which contains:
     - **TokenStateSummary** (alias/extends/scopes/lifecycle/origin/generated-by)
     - **Dependencies tab** (outgoing references AND incoming dependents)
     - Usage tab, History tab

#### The actual duplication

Dependents appear in two places:

- The top-level `Dependents` section (line 1772) — a quick summary limited to 20 items
- The `Dependencies` tab inside `TokenEditorInfoSection` (lines 127-369) — a comprehensive view with both outgoing and incoming references

This is intentional progressive disclosure (summary at top level, detail inside Details), but the two views show overlapping data. A user scrolling through the editor sees incoming dependents twice.

#### What the earlier draft overstated

- Calling this "duplicated understanding" is too strong. It's a summary-vs-detail pattern, which is common. The problem is mild.
- The create flow putting path before value (`TokenEditor.tsx:1596` before `:1673`) is standard in token tooling — you need to know where a token lives before authoring its value. This is not "bureaucracy."
- The editor has many sections, but most are inside a collapsed `Details` section. The default view is not as overwhelming as listing all 16 concerns makes it sound.

#### Recommendation

Consolidate the two dependents views into one. Either remove the top-level summary and let users find it in Details, or remove it from the Details tab and keep only the summary. Pick one location.

The "Details" catch-all bucket is worth splitting eventually, but it's not urgent given that it's collapsed by default.

---

### 6. The Generator Editor Blocks Save On A Hidden Required Field

> **Severity:** High | **Effort:** Small | **Type:** Bug

**Verified in code:** This is a clear interaction contract violation.

Save is disabled when either `targetGroup` or `name` is empty (`GeneratedGroupEditor.tsx:237-240`):

```
!canSave = dialog.targetGroup.trim().length === 0 || dialog.name.trim().length === 0
```

But the two fields have different visibility:

- `Group` (`targetGroup`) — always visible in `StepWhere.tsx:96-108`
- `Group label` (`name`) — hidden behind “Advanced settings” toggle (`StepWhere.tsx:139-160`, inside `{advancedOpen && (...)}` at line 139)

The `Group label` field even shows error styling for empty state (lines 155-157), but the user can't see it unless they've expanded Advanced settings.

A user who fills in `Group` and tries to save will see a disabled button with no visible explanation, because the missing required field is hidden.

#### Recommendation

Move `Group label` out of “Advanced settings” and make it always visible. A required field must never be hidden behind a disclosure.

If the two-name model (`Group` vs `Group label`) is confusing, either clarify the distinction inline or collapse to a single field.

---

### 7. Generator Source Switching Silently Destroys State

> **Severity:** High | **Effort:** Small | **Type:** Bug

**Verified in code:** `UnifiedSourceInput.tsx:104-114`:

```tsx
onClick={() => {
  setMode('value');
  // Clear the source token binding so inline value drives the preview
  if (sourceTokenPath) onSourcePathChange('');  // line 109 — CLEARS PATH
  // Seed a sensible default when switching to inline
  if (!inlineValue) {
    // seeds #ffffff for color, { value: 16, unit: 'px' } for dimension
  }
```

Clicking the “Enter value” segment:
1. Clears `sourceTokenPath` immediately and irreversibly
2. Seeds a default inline value if empty
3. Offers no confirmation, no undo, no way to recover the previous token path

The code comment acknowledges this is intentional (“Clear the source token binding”), but the UX contract is wrong: segmented controls imply reversible mode switching, not destructive data mutation.

A user who carefully selected a source token and clicks “Enter value” to experiment loses that binding permanently.

#### Recommendation

Preserve `sourceTokenPath` when switching to “Enter value” mode. Let the active segment determine which source drives the preview, but don't clear the other. On save, commit whichever mode is active.

Alternatively, show a brief confirmation (“Replace token source with direct value?”) before clearing.

---

### 8. The Typography Scale Is Too Small For The Target User

> **Severity:** Medium | **Effort:** Medium-Large | **Type:** Design debt

**Verified in code — counts are exact:**

- `text-[10px]`: **1,884** occurrences across `packages/figma-plugin/src/ui/`
- `text-[11px]`: **416** occurrences
- `text-[8px]`: **153** occurrences

Concentration in authoring surfaces: generator editors (~55 instances), token editors (~41), value editors (~33), generators (~180). But this is a project-wide scale problem, not specific to these surfaces — ~77% of all small-text usage is 10px.

The target user is a designer authoring a design system, not an engineer reading a debug log. 10px as the dominant text size in a ~300px panel is below the readability bar.

#### Recommendation

Define a proper type scale (e.g., 11px base, 13px labels, 10px secondary, 8px only for decorative/non-critical indicators). Apply it systematically rather than raising sizes ad-hoc. This is a product-level change that affects every surface, so it should be done once and consistently.

---

### 9. Some Terminology Is Implementation-Heavy

> **Severity:** Low | **Effort:** Small per label | **Type:** Polish

Terms flagged as potentially confusing:

- `Extract to alias`
- `Edit Figma scopes`
- `Group label`
- `Keep updated`
- `Make manual exception`
- `Detach from generator`

#### Assessment

This is the most subjective finding. Several of these terms ("Detach from generator", "Extract to alias") map directly to the DTCG mental model that the target audience works with. Whether "Detach from generator" is clearer than an alternative depends on what the alternative is — and this review doesn't propose specific replacements.

"Group label" is the one that genuinely confuses (see Finding 6). "Edit Figma scopes" is accurate but could benefit from a brief tooltip explaining what scopes affect.

#### Recommendation

Evaluate labels case-by-case. For each one, propose a specific alternative and test whether it's actually clearer. Don't rename purely for the sake of sounding less technical — the target user works with design tokens professionally.

---

## Surface-By-Surface Assessment

## 1. Token Library

### What Is Strong

- Collection-first structure aligns with the canonical domain model
- Virtualization is the correct technical choice for large token sets
- Structured search is powerful
- The dedicated Publish workspace already exists and is clearly separated at the routing level

### Actual Issues

- **Bug:** `modeLensEnabled` is mislabeled "Resolved values" (Finding 3) — fix immediately
- **Design debt:** Bulk-edit scope is hidden when selectMode activates (Finding 2)
- **Minor:** Two sync menu items are misplaced in the Tokens `+` menu (Finding 1)
- **Maintainability:** `TokenLeafNode.tsx` at 2,522 lines handles 15+ concerns and should be decomposed

### Verdict

The library's foundations are solid. The urgent fix is the mislabeled toggle (two lines). The design debt items (scope visibility, row audit) need focused work but aren't structural crises.

---

## 2. Token Editor

### What Is Strong

- Value editors are generally capable
- Draft recovery is useful
- Generated-token conflict handling is thoughtful
- Progressive disclosure via collapsed `Details` keeps the default view manageable

### Actual Issues

- **Mild duplication:** Dependents appear at top level (summary) and inside Details > Dependencies tab (Finding 5) — consolidate to one location
- **Section count:** The editor has many sections, but most are collapsed by default. The problem is less severe than it appears when listing every possible section.

### Verdict

Not structurally overgrown — uses progressive disclosure effectively. The dependents duplication is worth cleaning up. The create-flow ordering (path before value) is standard for token tooling.

---

## 3. Generator Editor

### What Is Strong

- Live preview model is useful
- Explicit review before save is the right pattern
- Config editors are capable once the user reaches them

### Actual Issues

- **Bug:** Required `Group label` field is hidden behind "Advanced settings" while blocking save (Finding 6) — fix immediately
- **Bug:** Source switching silently clears `sourceTokenPath` (Finding 7) — fix immediately
- Config editors work well once reached

### Verdict

Contains the two most actionable bugs in the product. Both are small fixes with immediate UX improvement. The rest of the generator flow is in reasonable shape.

---

## Prioritized Action Plan

### Tier 1 — Fix immediately (bugs, small effort, high impact)

| # | Finding | What to do | Effort |
| --- | --- | --- | --- |
| 3 | Mislabeled toggle | Rename "Resolved values" to "Mode values" in `useToolbarStateChips.ts:195` and `TokenListOverflowMenu.tsx:307` | ~30 min |
| 6 | Hidden required field | Move `Group label` out of Advanced settings in `StepWhere.tsx` | ~1 hr |
| 7 | Destructive source switch | Preserve `sourceTokenPath` when switching segments in `UnifiedSourceInput.tsx` | ~1 hr |

### Tier 2 — Address next (design debt, medium effort)

| # | Finding | What to do | Effort |
| --- | --- | --- | --- |
| 2 | Hidden bulk-edit scope | Add a scope-summary label to `SelectModeToolbar` | ~2-4 hrs |
| 5 | Duplicated dependents | Consolidate to one location in `TokenEditor.tsx` | ~2 hrs |
| 8 | Typography scale | Define and apply a proper type scale across all surfaces | ~1-2 days |
| 1 | Misplaced sync menu items | Move "Push variables" / "Push styles" from Tokens `+` menu to Publish | ~1 hr |

### Tier 3 — Consider when doing broader work (architecture, large effort)

| # | Finding | What to do | Effort |
| --- | --- | --- | --- |
| 4 | Row responsibilities | Audit default row state; decompose `TokenLeafNode.tsx` for maintainability | ~1-2 weeks |
| 9 | Terminology | Evaluate labels case-by-case with specific alternatives | Ongoing |
| — | View presets | Replace independent toggles with named mutually exclusive presets | ~1 week |

---

## Final Assessment

The product is technically capable with solid foundations:

- A good canonical domain model
- Strong core value editing
- Useful preview infrastructure
- Effective progressive disclosure in most surfaces

The most urgent problems are interaction contract violations — places where the UI contradicts itself. These are all small fixes:

- A toggle that says one thing and does another
- A required field that's hidden from the user
- A segment switch that silently destroys state

Fix these three and the product's trustworthiness improves immediately. The design debt items (scope visibility, typography, dependents duplication) are real but less urgent. The architecture questions (row decomposition, view presets, editor restructuring) are worth considering during broader redesign work, not as immediate priorities.
