# UX Review: Token Library, Token Editor, Generator Editor

> Critical implementation-grounded review of the current token authoring surfaces.
> Validated against current code on 2026-04-19.
> Scope: `packages/figma-plugin/src/ui/**` plus supporting navigation and command surfaces.
>
> **Constraint context:** The Figma plugin panel is ~300–340px wide. Many surfaces that appear "overloaded" exist because there is no room for the separate views that a full-width application could afford. Recommendations must work within this constraint, not ignore it.

---

## Executive Summary

The UI has three categories of problem, listed in order of severity:

1. **Bugs** — a mislabeled toggle, a hidden required field, and a destructive segment switch. These are interaction contract violations.
2. **Design debt** — bulk-edit scope is hidden, token rows carry too many responsibilities in their default state, and the typography scale is too small. These need focused design work.
3. **Architecture questions** — editor panel structure and terminology. These are real but less urgent.

The most serious problems are the ones where the UI contradicts itself: blocking save on a hidden field, labeling a mode toggle as "Resolved," and silently destroying state on a segment click.

### Overall Assessment

| Surface | Assessment | Severity |
| --- | --- | --- |
| Token Library | Has real issues: a mislabeled toggle and hidden scope during bulk edit. Two publish actions in the Actions menu are misplaced. | Mixed |
| Token Editor | Large but uses progressive disclosure. The dependents duplication is mild (summary vs. detail). | Moderate |
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

### 1. Two Publish Actions Sit In The Tokens Actions Menu

> **Severity:** Low | **Effort:** Small | **Type:** Menu cleanup

The app shell has a dedicated Publish workspace (`TopTab = "publish"`, label `Publish`, with Publish/Export sub-tabs in `navigationTypes.ts:98-104`). Health and History are sub-tabs under the Tokens workspace (`navigationTypes.ts:84-88`).

The Tokens surface includes two publish actions in the **Actions menu** (the three-dots overflow menu):

- "Push variables" (`TokenListToolbar.tsx:490`)
- "Push styles" (`TokenListToolbar.tsx:500`)

Both sit after a separator in the Actions menu (`TokenListToolbar.tsx:482`), alongside authoring actions like "Token table," "Select tokens," "Bulk edit," and "Find and replace." One command palette entry ("Validate") navigates to Tokens/Health (`useCommandPaletteCommands.ts:234`), which is correctly under the Tokens workspace.

There are no visual sync-status indicators, readiness badges, or publish-state summaries in the Tokens surface itself. The overlap is functional only — two menu items in the wrong overflow menu.

#### Assessment

This is not an architectural conflict. The Publish workspace is clearly separated at the routing level. The actual problem is two publish actions mixed in with token authoring actions in the Actions menu.

#### Recommendation

Move "Push variables" and "Push styles" out of the Tokens Actions menu. They belong in the Publish workspace. The command palette already provides shortcut access for power users who want to skip navigation.

---

### 2. Multi-Token Workflows Hide Scope Behind Mode Switches

> **Severity:** Medium | **Effort:** Medium | **Type:** Design debt

**Verified in code:** When `selectMode` is true, the entire `TokenListToolbar` is unmounted (`TokenList.tsx:2470` — `{!selectMode && (`). The replacement `SelectModeToolbar` (`TokenList.tsx:2401`) contains only basic selection controls (select all, batch editor toggle, delete, exit) — no search, no filter context, no zoom breadcrumb.

`openBulkEditorForPaths` (`TokenList.tsx:1307`) converts `displayedLeafNodes` (the current query/filter/zoom results) into a `selectedPaths` Set. Once that conversion happens and selectMode activates, the original query context is gone from the UI.

This is a real clarity problem: the user enters bulk edit from a filtered view but loses visibility of that filter during the operation.

#### Constraint

The plugin panel is ~300px wide. Showing both the selection toolbar and the search/filter context simultaneously is a real layout challenge, not a simple oversight.

#### Recommendation

The `SelectModeToolbar` already shows a selection count ("X/Y selected"). The missing context is *what produced* that selection — the user filtered moments ago but loses sight of the filter text.

The simplest fix: keep the search query visible as read-only text in the `SelectModeToolbar` alongside the existing count (e.g., "12/48 matching 'color.primary'"). No new controls, no new interactions — just preserve context the user already provided.

---

### 3. The Mode Toggle Is Mislabeled As "Resolved"

> **Severity:** High | **Effort:** Small | **Type:** Bug

**Verified in code:** This is a concrete semantic error, not a judgment call.

Two separate concepts exist:

- `modeLensEnabled` (`useTokenListViewState.ts:164-175`) — shows mode-selected values from `allTokensFlat` instead of base values from `unresolvedAllTokensFlat`. This is about which **mode** the value comes from.
- `showResolvedValues` (`useTokenListViewState.ts:69-70`) — resolves alias references (`{alias}` syntax) to their target values. This is about **alias resolution**.

But the UI labels `modeLensEnabled` as "Resolved" in two places:

- `useToolbarStateChips.ts:196` — chip label (`label: "Resolved"`)
- `TokenListOverflowMenu.tsx:205` — menu item label (`label="Resolved"`)

The View menu section header also reads "View: Resolved" (`TokenListOverflowMenu.tsx:184`).

This is wrong. Mode viewing and alias resolution are different operations. A user toggling "Resolved" expects to see aliases expanded, not mode-specific overrides.

The "active-mode" preset (`TokenListToolbar.tsx:210-213`) sets both `modeLensEnabled` and `showResolvedValues` simultaneously. This coupling makes sense for the common case — designers want to see final values in the active mode — but the mislabel makes it impossible to understand what the toggle actually controls.

#### Recommendation

Rename the `modeLensEnabled` label to "Mode values" or "Active mode" in both `useToolbarStateChips.ts:196` and `TokenListOverflowMenu.tsx:205`. Two-line fix.

---

### 4. Token Rows Carry Many Responsibilities, But Most Are Progressive

> **Severity:** Medium | **Effort:** Large | **Type:** Design debt + Maintainability

**Verified in code:** `TokenLeafNode.tsx` is 2,521 lines and handles at least 15 distinct concerns:

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

#### Important nuance

Many of these concerns are **not simultaneously visible**. Context menus, popovers, resolution chains, and save-choice modals appear on interaction. The drag ghost only appears during drag. Inline rename replaces the label.

The real question is: **what appears in the default, non-hovered, non-expanded state?** That's the row contract that matters to a user scanning a list.

#### Recommendation

Audit what appears in the default row state specifically. If the default shows identity + value + one status indicator, the progressive disclosure model is working. If metadata segments are visible by default and competing for attention, tighten the default and move more to hover/detail.

The component itself could benefit from decomposition for maintainability, but that's a code concern, not a UX concern.

---

### 5. The Token Editor Is Large But Uses Progressive Disclosure; Dependents Appear Twice

> **Severity:** Low-Medium | **Effort:** Medium | **Type:** Architecture question

**Verified in code:** The panel sections in render order include:

1. Create mode header — type selector + path input
2. Value section — type-specific value editors
3. Mode values editor — per-mode overrides
4. Reference section — alias picker + extends picker
5. Generator status — warning if token is generated
6. **Dependents list** — collapsible, shows direct dependents (defined at `TokenEditor.tsx:1361`, rendered at line 1786)
7. Details collapsible (`TokenEditor.tsx:1788`), containing:
   - Color modifiers, contrast checker, description, lifecycle, metadata/scopes
   - Derived groups, raw JSON
   - **TokenEditorInfoSection** (`TokenEditor.tsx:1894-1924`), which contains:
     - **TokenStateSummary** (alias/extends/scopes/lifecycle/origin/generated-by)
     - **Dependencies tab** (outgoing references AND incoming dependents)
     - Usage tab, History tab

#### The actual duplication

Dependents appear in two places:

- The top-level `Dependents` section (`TokenEditor.tsx:1786`) — a quick summary limited to 20 items
- The `Dependencies` tab inside `TokenEditorInfoSection` — a comprehensive view with both outgoing and incoming references

This is a summary-vs-detail pattern, which is common, but the two views show overlapping data. A user scrolling through the editor sees incoming dependents twice. The problem is mild.

#### Context

- The create flow putting path before value is standard in token tooling — you need to know where a token lives before authoring its value.
- The editor has many sections, but most are inside a collapsed `Details` section. The default view is not as overwhelming as listing every possible section makes it sound.

#### Recommendation

Consolidate the two dependents views into one. Either remove the top-level summary and let users find it in Details, or remove it from the Details tab and keep only the summary. Pick one location.

The "Details" catch-all bucket is worth splitting eventually, but it's not urgent given that it's collapsed by default.

---

### 6. The Generator Editor Blocks Save On A Hidden Required Field

> **Severity:** High | **Effort:** Small | **Type:** Bug

**Verified in code:** This is a clear interaction contract violation.

Save is disabled when either `targetGroup` or `name` is empty (`GeneratedGroupEditor.tsx:237-240`):

```
canSave = dialog.targetGroup.trim().length > 0 && dialog.name.trim().length > 0 && (...)
```

But the two fields have different visibility:

- `Group` (`targetGroup`) — always visible in `StepWhere.tsx:96-108`
- `Group label` (`name`) — hidden behind "Advanced settings" toggle (`StepWhere.tsx:129-137` toggle button, `StepWhere.tsx:139-160` conditional content)

The `Group label` field shows error styling for empty state (`StepWhere.tsx:155-157`), but the user can't see it unless they've expanded Advanced settings. The save button also shows a "Group label is required" message (`GeneratedGroupEditor.tsx:301-302`), but only when the button is hovered — and the field is still hidden.

A user who fills in `Group` and tries to save will see a disabled button with no visible explanation, because the missing required field is hidden.

#### Recommendation

**Auto-derive `name` from `targetGroup`** — humanize the last path segment (e.g., `color.brand` → "Brand palette"). This eliminates the hidden-required-field problem entirely by removing the requirement. The user can still override in Advanced settings if needed.

The existing placeholder text ("Brand palette" at `StepWhere.tsx:153`) already demonstrates this derivation pattern — the intent was clearly there. Make it the default behavior.

Fallback alternatives if auto-derive is rejected:

- **Move `Group label` out of "Advanced settings"** — a required field must never be hidden behind a disclosure.
- **Collapse to a single field** — if the two-name model (`Group` as token path vs `Group label` as display name) doesn't provide enough value to justify the confusion, merge them.

---

### 7. Generator Source Switching Silently Destroys State

> **Severity:** High | **Effort:** Small | **Type:** Bug

**Verified in code:** `UnifiedSourceInput.tsx:106-114`:

```tsx
onClick={() => {
  setMode('value');
  // Clear the source token binding so inline value drives the preview
  if (sourceTokenPath) onSourcePathChange('');  // line 109 — CLEARS PATH
  // Seed a default value so the generator registers a value immediately
  if (inlineValue === undefined || inlineValue === '') {
    if (expectedType === 'color') onInlineValueChange('#ffffff');
    else if (expectedType === 'dimension') onInlineValueChange({ value: 16, unit: 'px' });
  }
```

Clicking the "Enter value" segment:
1. Clears `sourceTokenPath` immediately and irreversibly (line 109)
2. Seeds a default inline value if empty (lines 111-114)
3. Offers no confirmation, no undo, no way to recover the previous token path

The code comment acknowledges this is intentional ("Clear the source token binding"), but the UX contract is wrong: segmented controls imply reversible mode switching, not destructive data mutation.

A user who carefully selected a source token and clicks "Enter value" to experiment loses that binding permanently.

#### Recommendation

Stop clearing `sourceTokenPath` when switching segments. Let the active segment determine which source drives the preview — the path stays in state, the inline value stays in state, switching between them is non-destructive. On save, commit whichever mode is active.

This makes the segmented control behave the way segmented controls are supposed to: as a reversible mode switch, not a destructive action.

---

### 8. The Typography Scale Is Too Small For The Target User

> **Severity:** Medium | **Effort:** Large | **Type:** Design debt

**Verified in code — source-level counts:**

- `text-[10px]`: **~1,871** occurrences across `packages/figma-plugin/src/ui/`
- `text-[11px]`: **~412** occurrences
- `text-[8px]`: **~153** occurrences

#### Caveat on raw counts

These are source-level grep counts, not distinct UI surfaces. A single `text-[10px]` in `TokenLeafNode.tsx` renders once per token in the list — the count is inflated by components that appear in many files or contain many styled elements. The actual number of distinct visual surfaces using 10px is smaller than 1,871.

A meaningful assessment requires distinguishing where 10px appears in **primary reading flows** (token names, value labels, editor field labels) versus **genuinely secondary metadata** (timestamps, status codes, auxiliary indicators). If 10px is the dominant size for content the user actively reads and edits, it's a readability problem. If it's mostly on peripheral elements, the concern is less urgent.

The target user is a designer authoring a design system, not an engineer reading a debug log. 10px as the dominant text size in a ~300px panel is below the readability bar for primary content.

#### Recommendation

1. **Audit first:** Identify which components use `text-[10px]` for primary reading content (token names, values, field labels, editor headers) vs. secondary metadata. This determines the actual scope.
2. **Define a type scale:** e.g., 11px base, 13px labels/headers, 10px secondary, 8px only for decorative/non-critical indicators.
3. **Apply systematically** to primary-content surfaces first, then secondary. This is a product-level change that should be done once and consistently, not raised ad-hoc per component.

The effort estimate is closer to **3-5 days** given the audit step and the number of surfaces involved.

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

- **Bug:** `modeLensEnabled` is mislabeled "Resolved" (Finding 3) — fix immediately
- **Minor:** Two publish actions are misplaced in the Tokens Actions menu (Finding 1) — move when convenient

### Verdict

The library's foundations are solid. The urgent fix is the mislabeled toggle (two lines).

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

## Action Plan

### Fix now (bugs — each fix removes a problem, adds nothing)

| # | Finding | What to do | Effort |
| --- | --- | --- | --- |
| 3 | Mislabeled toggle | Rename "Resolved" to "Mode values" in two locations | ~30 min |
| 6 | Hidden required field | Auto-derive `name` from `targetGroup` | ~1-2 hrs |
| 7 | Destructive source switch | Stop clearing `sourceTokenPath` on segment switch | ~1-2 hrs |

### Simplify when convenient (remove duplication)

| # | Finding | What to do | Effort |
| --- | --- | --- | --- |
| 5 | Duplicated dependents | Remove one of the two dependents views in `TokenEditor.tsx` | ~2 hrs |
| 1 | Misplaced publish actions | Move to Publish workspace | ~1 hr |

### Not actioned (noted for context, not recommended as work items)

Findings 2 (bulk-edit scope), 4 (row decomposition), 8 (typography scale), and 9 (terminology) are observations, not action items. Finding 2 describes a theoretical problem — the user just performed the filter and knows the context. Finding 4 is a code maintainability concern, not UX. Findings 8 and 9 need real design work and user testing, not grep-driven changes.

---

## Final Assessment

The product's foundations are solid. The three bugs (findings 3, 6, 7) are the only things worth fixing now — each one removes a contradiction where the UI promises one thing and does another. The two simplification items (findings 1, 5) remove duplication. Everything else is either theoretical, a code concern, or needs design work that this review can't substitute for.
