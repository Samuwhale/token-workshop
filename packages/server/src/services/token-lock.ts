/**
 * Promise-chain mutex for serialising async token-store mutations.
 *
 * Every call to `withLock(fn)` chains behind the previous one, ensuring that
 * concurrent HTTP requests that read-modify-write token files cannot interleave
 * and silently lose writes.
 *
 * Errors inside `fn` propagate to the caller but do NOT block subsequent callers
 * (the chain always advances via `.catch(() => {})`).
 */
export class TokenLock {
  private chain: Promise<void> = Promise.resolve();

  /**
   * Execute `fn` while holding the lock.  Only one `fn` runs at a time.
   * Errors thrown from `fn` are re-thrown to the caller.
   * If the error has a `statusCode` property it will be preserved for Fastify.
   *
   * Arrow function so it can be safely destructured:
   *   `const { withLock } = fastify.tokenLock;`
   */
  withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = this.chain.then(() => fn());
    // Advance the chain regardless of success/failure to prevent deadlock.
    this.chain = next.then(() => {}, () => {});
    return next;
  };
}
