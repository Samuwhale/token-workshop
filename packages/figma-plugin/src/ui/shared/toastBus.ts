import { useEffect } from 'react';

const EVENT_NAME = 'tm-toast';

interface ToastBusDetail {
  message: string;
  variant: 'success' | 'error';
}

/**
 * Dispatch an in-plugin toast notification from any component or hook,
 * without needing to receive toast callbacks via props.
 *
 * Replaces `parent.postMessage({ pluginMessage: { type: 'notify', message } }, '*')`,
 * which routes through the plugin sandbox and shows a Figma-native notification
 * outside the plugin window (invisible in standalone UI harness, no history).
 */
export function dispatchToast(message: string, variant: 'success' | 'error'): void {
  window.dispatchEvent(new CustomEvent<ToastBusDetail>(EVENT_NAME, { detail: { message, variant } }));
}

/**
 * Called once in App.tsx to wire the toast bus into the in-plugin ToastStack.
 * pushSuccess and pushError must be stable references (from useToastStack).
 */
export function useToastBusListener(
  pushSuccess: (message: string) => void,
  pushError: (message: string) => void
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, variant } = (e as CustomEvent<ToastBusDetail>).detail;
      if (variant === 'error') pushError(message);
      else pushSuccess(message);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  // pushSuccess and pushError are stable useCallback refs from useToastStack
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
