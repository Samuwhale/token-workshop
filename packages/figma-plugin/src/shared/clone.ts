export function cloneValue<T>(value: T): T {
  return typeof value === 'object' && value !== null
    ? structuredClone(value)
    : value;
}
