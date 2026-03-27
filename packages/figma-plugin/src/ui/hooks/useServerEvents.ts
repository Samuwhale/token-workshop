import { useEffect } from 'react';

export interface GeneratorErrorEvent {
  generatorId?: string;
  message: string;
}

/**
 * Subscribe to the server's SSE event stream and call callbacks for specific
 * event types. Automatically reconnects when the server URL changes or the
 * connection is restored.
 */
export function useServerEvents(
  serverUrl: string,
  connected: boolean,
  onGeneratorError: (event: GeneratorErrorEvent) => void,
) {
  useEffect(() => {
    if (!connected) return;

    const es = new EventSource(`${serverUrl}/api/events`);

    es.onmessage = (e) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data as string);
      } catch {
        return;
      }
      if (data.type === 'generator-error') {
        onGeneratorError({
          generatorId: typeof data.generatorId === 'string' ? data.generatorId : undefined,
          message: typeof data.message === 'string' ? data.message : 'Unknown error',
        });
      }
    };

    return () => {
      es.close();
    };
  }, [serverUrl, connected, onGeneratorError]);
}
