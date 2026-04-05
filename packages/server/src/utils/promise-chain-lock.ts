/**
 * Promise-chain mutex for serializing async operations.
 *
 * Each call to `withLock` chains behind the previous one, so concurrent callers
 * are serialized in FIFO order. Errors from one caller propagate to that
 * caller but do NOT break the chain — subsequent callers still get their turn.
 *
 * The method is an arrow function so it can be safely destructured:
 *   `const { withLock } = fastify.tokenLock;`
 *
 * @example
 * const lock = new PromiseChainLock();
 * return lock.withLock(() => this.doAsyncWork());
 */
export class PromiseChainLock {
  private chain: Promise<void> = Promise.resolve();

  withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = this.chain.then(() => fn());
    this.chain = next.then(() => {}, () => {});
    return next;
  };
}
