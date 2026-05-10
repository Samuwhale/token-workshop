import { useCallback, useEffect, useRef, useState } from "react";

export function useTransientValue<T>(
  initialValue: T,
  durationMs: number,
): [value: T, showValue: (value: T) => void, resetValue: () => void] {
  const [value, setValue] = useState<T>(initialValue);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const resetValue = useCallback(() => {
    clearTimer();
    setValue(initialValue);
  }, [clearTimer, initialValue]);

  const showValue = useCallback(
    (nextValue: T) => {
      clearTimer();
      setValue(nextValue);
      timerRef.current = window.setTimeout(() => {
        setValue(initialValue);
        timerRef.current = null;
      }, durationMs);
    },
    [clearTimer, durationMs, initialValue],
  );

  useEffect(() => clearTimer, [clearTimer]);

  return [value, showValue, resetValue];
}
