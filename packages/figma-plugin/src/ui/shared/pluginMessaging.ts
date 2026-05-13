import type { ControllerMessage, PluginMessage } from "../../shared/types";
import {
  getPluginMessageFromEvent,
  postPluginMessage,
} from "../../shared/utils";
import { createUiId } from "./ids";

type CorrelatedControllerMessage = ControllerMessage & {
  correlationId?: string;
};

interface RequestPluginMessageOptions<
  TResponse extends CorrelatedControllerMessage,
  TProgress extends CorrelatedControllerMessage,
> {
  idPrefix: string;
  responseType: TResponse["type"];
  timeoutMs: number;
  timeoutMessage: string;
  unavailableMessage: string;
  progressType?: TProgress["type"];
  onProgress?: (message: TProgress) => void;
}

export function requestPluginMessage<
  TRequest extends PluginMessage,
  TResponse extends CorrelatedControllerMessage,
  TProgress extends CorrelatedControllerMessage = never,
>(
  request: Omit<TRequest, "correlationId">,
  options: RequestPluginMessageOptions<TResponse, TProgress>,
): Promise<TResponse> {
  const correlationId = createUiId(options.idPrefix);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(options.timeoutMessage));
    }, options.timeoutMs);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleMessage);
    }

    function handleMessage(event: MessageEvent) {
      const pluginMessage =
        getPluginMessageFromEvent<TResponse | TProgress>(event);
      if (pluginMessage?.correlationId !== correlationId) {
        return;
      }

      if (
        options.progressType &&
        pluginMessage.type === options.progressType
      ) {
        options.onProgress?.(pluginMessage as TProgress);
        return;
      }

      if (pluginMessage.type !== options.responseType) {
        return;
      }

      cleanup();
      resolve(pluginMessage as TResponse);
    }

    window.addEventListener("message", handleMessage);
    const sent = postPluginMessage({
      ...request,
      correlationId,
    } as TRequest);
    if (!sent) {
      cleanup();
      reject(new Error(options.unavailableMessage));
    }
  });
}
