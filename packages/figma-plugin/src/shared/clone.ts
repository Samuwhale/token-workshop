// Use structuredClone as the single deep-clone path across the plugin.
// Legacy JSON cloning dropped undefined values and other non-JSON data.
export function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
