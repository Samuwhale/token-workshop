import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../services/event-bus.js';
import type { ChangeEvent } from '../services/token-store.js';

function makeEvent(type: ChangeEvent['type'] = 'set-updated', setName = 'test'): ChangeEvent {
  return { type, setName };
}

describe('EventBus', () => {
  it('assigns monotonically increasing sequence IDs', () => {
    const bus = new EventBus();
    expect(bus.currentSeq()).toBe(0);
    bus.push(makeEvent());
    expect(bus.currentSeq()).toBe(1);
    bus.push(makeEvent());
    expect(bus.currentSeq()).toBe(2);
  });

  it('notifies subscribers with sequenced events', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    bus.subscribe(listener);
    const event = makeEvent('set-added', 'colors');
    bus.push(event);
    expect(listener).toHaveBeenCalledWith({ id: 1, event });
  });

  it('unsubscribe stops notifications', () => {
    const bus = new EventBus();
    const listener = vi.fn();
    const unsub = bus.subscribe(listener);
    bus.push(makeEvent());
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    bus.push(makeEvent());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('eventsSince returns missed events', () => {
    const bus = new EventBus();
    bus.push(makeEvent('set-added', 'a'));
    bus.push(makeEvent('set-updated', 'b'));
    bus.push(makeEvent('set-removed', 'c'));
    const missed = bus.eventsSince(1);
    expect(missed).not.toBeNull();
    expect(missed!.length).toBe(2);
    expect(missed![0].id).toBe(2);
    expect(missed![1].id).toBe(3);
  });

  it('eventsSince returns empty array when up-to-date', () => {
    const bus = new EventBus();
    bus.push(makeEvent());
    const missed = bus.eventsSince(1);
    expect(missed).toEqual([]);
  });

  it('eventsSince returns null when events fell off the buffer', () => {
    const bus = new EventBus(3); // tiny buffer
    for (let i = 0; i < 5; i++) bus.push(makeEvent());
    // Buffer holds events 3, 4, 5. Asking for events since 1 is too stale.
    const missed = bus.eventsSince(1);
    expect(missed).toBeNull();
  });

  it('eventsSince works at buffer boundary', () => {
    const bus = new EventBus(3);
    for (let i = 0; i < 5; i++) bus.push(makeEvent());
    // Oldest in buffer is id=3, asking since 3 should return 4,5
    const missed = bus.eventsSince(3);
    expect(missed).not.toBeNull();
    expect(missed!.length).toBe(2);
    expect(missed![0].id).toBe(4);
    expect(missed![1].id).toBe(5);
  });

  it('eventsSince returns null when buffer is empty and lastId < seq', () => {
    const bus = new EventBus(0); // zero-size buffer
    bus.push(makeEvent());
    // seq is 1 but buffer is empty
    expect(bus.eventsSince(0)).toBeNull();
  });
});
