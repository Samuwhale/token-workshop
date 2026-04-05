/**
 * Promise-chain mutex for serializing async operations.
 *
 * Each call to `run` chains behind the previous one, so concurrent callers
 * are serialized in FIFO order. Errors from one caller propagate to that
 * caller but do NOT break the chain — subsequent callers still get their turn.
 *
 * @example
 * const lock = new PromiseChainLock();
 * return lock.run(() => this.doAsyncWork());
 */
export class PromiseChainLock {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(() => fn());
    this.chain = next.then(() => {}, () => {});
    return next;
  }
}
