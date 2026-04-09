# Repo Handoff Decision

## Status

Decided on 2026-04-09.

## Decision summary

The Git-based handoff workflow stays inside the plugin, but it moves out of the primary UX.

`Sync > Figma Sync` remains the default delivery path. Git status, pull, commit, push, merge-resolution, and branch-oriented handoff work stay available only in the explicit `Sync > Repo / Handoff` surface for the smaller group of users who actually own downstream repository delivery.

## Product question

Should TokenManager keep repository handoff inside the plugin, or move it somewhere else because Git concepts compete with the main publish flow?

## Target user

The target user for repository handoff is not the average designer using TokenManager to publish variables into the current Figma file.

The target user is the design-system engineer, frontend engineer, or advanced token librarian who:

- owns generated files in a real repository
- understands branch, commit, pull, push, and conflict concepts
- needs to reconcile token edits against saved files before handoff
- benefits from seeing repository actions in the same context as token diffs and export output

## Rationale

Two things are true at the same time:

1. Git handoff is real product value.
   Teams shipping tokens to code need branch-aware delivery, saved files, and reconciliation. Removing that workflow entirely from the plugin would force a context switch at the exact moment the user is validating token changes for delivery.

2. Git handoff is not the primary job in the plugin.
   The default user journey is still author tokens, review them, and sync to Figma. Repository concepts are slower, higher-risk, and much more specialized than the main publish workflow. Putting them in the default path makes the delivery surface look more complex than the majority of users need.

The current shell direction already reflects this split: `Sync` is the delivery workspace, `Figma Sync` is primary, and `Repo / Handoff` is adjacent. That structure is the right product direction because it preserves end-to-end delivery for expert users without teaching Git to everyone up front.

## Chosen direction

Keep repository handoff in the plugin as an advanced downstream-delivery surface, not as part of the primary publish experience.

This means:

- the plugin continues to own repository-aware token diffing and handoff actions
- the default Sync story starts with Figma preflight, compare, and publish
- repository work is entered deliberately through `Repo / Handoff`, not mixed into the default publish review
- copy and navigation should keep signaling that repo work is for saved files, branch updates, and reconciliation after the user has decided they need downstream delivery

## Why this is the right tradeoff

Keeping the workflow in-plugin preserves the strongest advantage TokenManager has over a generic Git client: the repo actions can stay token-aware. The user can inspect token diffs, export outputs, and repository status from the same product context.

Moving the workflow out of the primary UX preserves the strongest advantage the redesign is aiming for: the main shell stays job-based and easy to read. Designers and everyday token editors do not have to learn branch operations before they can finish the common publish job.

## Product rules going forward

- Do not let Git concepts gate the normal Figma publish flow.
- Do not describe repository actions as the default next step after every sync.
- Keep repository language explicit and expert-oriented: handoff, saved files, branch updates, remote reconciliation.
- Keep repository actions adjacent to export and file handoff work, because they serve the same downstream-delivery user.
- If a future external CLI or desktop companion appears, it can share the same server operations, but the plugin should still treat repo handoff as an optional expert surface rather than a first-class default journey.
