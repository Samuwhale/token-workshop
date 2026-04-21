import { useEffect } from "react";
import type { NoticeSeverity } from "./noticeSystem";
import type {
  SecondarySurfaceId,
  SubTab,
  WorkspaceId,
} from "./navigationTypes";
/**
 * Maintenance surfaces that are safe to open from a notification click without
 * carrying extra payload. `compare` is excluded because it requires token paths.
 * Health and History are Library sections now — route via `workspace` instead.
 */
type NotificationMaintenanceSurface =
  | "color-analysis"
  | "import";

const EVENT_NAME = "tm-toast";

/** Toast variant — maps to the subset of `NoticeSeverity` that makes sense for
 *  ephemeral notifications (info, success, warning, error). */
export type ToastVariant = Extract<
  NoticeSeverity,
  "info" | "success" | "warning" | "error"
>;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Where the inbox should navigate when the user opens a notification entry.
 * Producers declare this explicitly; the inbox never infers destinations from
 * message text.
 */
export type NotificationDestination =
  | { kind: "token"; tokenPath: string; collectionId?: string }
  | { kind: "workspace"; topTab: WorkspaceId; subTab?: SubTab }
  | { kind: "surface"; surface: SecondarySurfaceId }
  | { kind: "contextual-surface"; surface: NotificationMaintenanceSurface };

interface ToastBusDetail {
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
  destination?: NotificationDestination;
}

/**
 * Dispatch an in-plugin toast notification from any component or hook,
 * without needing to receive toast callbacks via props.
 *
 * Replaces `parent.postMessage({ pluginMessage: { type: 'notify', message } }, '*')`,
 * which routes through the plugin sandbox and shows a Figma-native notification
 * outside the plugin window (invisible in standalone UI harness, no history).
 */
export function dispatchToast(
  message: string,
  variant: ToastVariant,
  options?: {
    action?: ToastAction;
    destination?: NotificationDestination;
  },
): void {
  window.dispatchEvent(
    new CustomEvent<ToastBusDetail>(EVENT_NAME, {
      detail: {
        message,
        variant,
        action: options?.action,
        destination: options?.destination,
      },
    }),
  );
}

/**
 * Called once in App.tsx to wire the toast bus into the in-plugin ToastStack.
 * Toast push handlers must be stable references (from useToastStack).
 */
export function useToastBusListener(
  pushSuccess: (message: string, destination?: NotificationDestination) => void,
  pushWarning: (message: string, destination?: NotificationDestination) => void,
  pushError: (message: string, destination?: NotificationDestination) => void,
  pushAction?: (
    message: string,
    action: ToastAction,
    variant?: ToastVariant,
    destination?: NotificationDestination,
  ) => void,
): void {
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, variant, action, destination } = (
        e as CustomEvent<ToastBusDetail>
      ).detail;
      if (action && pushAction) {
        pushAction(message, action, variant, destination);
        return;
      }
      if (variant === "error") {
        pushError(message, destination);
        return;
      }
      if (variant === "warning") {
        pushWarning(message, destination);
        return;
      }
      pushSuccess(message, destination);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, [pushAction, pushError, pushSuccess, pushWarning]);
}
