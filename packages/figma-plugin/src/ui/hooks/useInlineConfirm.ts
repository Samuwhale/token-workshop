import { useState, useRef, useCallback, useEffect } from "react";

const CONFIRM_TIMEOUT_MS = 3000;

export function useInlineConfirm() {
  const [pending, setPending] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const trigger = useCallback(
    (key: string, onConfirm: () => void) => {
      if (pending === key) {
        clearTimeout(timerRef.current);
        setPending(null);
        onConfirm();
      } else {
        clearTimeout(timerRef.current);
        setPending(key);
        timerRef.current = setTimeout(
          () => setPending(null),
          CONFIRM_TIMEOUT_MS,
        );
      }
    },
    [pending],
  );

  const isPending = useCallback(
    (key: string) => pending === key,
    [pending],
  );

  const reset = useCallback(() => {
    clearTimeout(timerRef.current);
    setPending(null);
  }, []);

  return { trigger, isPending, pending, reset };
}
