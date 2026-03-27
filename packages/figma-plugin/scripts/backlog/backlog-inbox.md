# Backlog Inbox

- [ ] TokenList delete has no user-facing error feedback — catch block only logs to console, user sees token disappear optimistically even if server rejects the delete
- [ ] SyncPanel "Delete orphan variables" has no retry mechanism — if plugin doesn't respond within timeout, user must manually re-run the full readiness check
