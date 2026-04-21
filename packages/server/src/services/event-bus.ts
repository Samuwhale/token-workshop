import type { ChangeEvent } from "./token-store.js";

export interface SequencedEvent {
  id: number;
  event: ChangeEvent;
}

const DEFAULT_BUFFER_SIZE = 256;

/**
 * Wraps workspace change events with monotonic sequence IDs and maintains
 * a ring buffer of recent events for replay on SSE reconnect.
 */
export class EventBus {
  private seq = 0;
  private buffer: SequencedEvent[] = [];
  private bufferSize: number;
  private listeners: Set<(entry: SequencedEvent) => void> = new Set();

  constructor(bufferSize = DEFAULT_BUFFER_SIZE) {
    this.bufferSize = Number.isInteger(bufferSize) && bufferSize > 0
      ? bufferSize
      : DEFAULT_BUFFER_SIZE;
  }

  /** Push a new workspace event into the bus. */
  push(event: ChangeEvent): void {
    const entry: SequencedEvent = { id: ++this.seq, event };
    this.buffer.push(entry);
    if (this.buffer.length > this.bufferSize) {
      this.buffer.shift();
    }
    for (const listener of this.listeners) {
      listener(entry);
    }
  }

  /** Subscribe to new events. Returns unsubscribe function. */
  subscribe(listener: (entry: SequencedEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Current sequence number (0 if no events yet). */
  currentSeq(): number {
    return this.seq;
  }

  /**
   * Get events after the given sequence ID.
   * Returns null if the requested ID is too old (fallen off the buffer).
   * Returns empty array if the client is already up-to-date.
   */
  eventsSince(lastId: number): SequencedEvent[] | null {
    if (lastId >= this.seq) return [];
    if (this.buffer.length === 0) return [];
    const oldest = this.buffer[0].id;
    if (lastId < oldest - 1) return null; // gap — client is too stale
    // Find events after lastId
    const startIdx = this.buffer.findIndex((e) => e.id > lastId);
    if (startIdx === -1) return [];
    return this.buffer.slice(startIdx);
  }
}
