# Backlog Inbox

Items spotted during UX passes but out of scope for that session.

- [ ] SelectionInspector "No tokens applied" state — add a small icon and a "Go to Tokens tab" button so users know exactly where to act (currently just two lines of text with no visual anchor or escape hatch)
- [ ] TokenCanvas empty state is very bare ("No tokens to display") — add an icon and a hint about why (e.g. canvas view renders token relationships)
- [ ] Silent failure in SelectionInspector binding operations — `remove-binding` and `apply-binding` messages have no error callback, so failures are invisible to the user
- [ ] Grid view: when a type filter is active and no color tokens match, distinguish between "no color tokens exist" vs "none match current filter" — the current message conflates both
