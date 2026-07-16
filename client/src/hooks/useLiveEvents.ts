import { useEffect, useRef } from 'react';

export type LiveEventData = { service: string; ts: number };

/**
 * Subscribe to server-sent events for live updates.
 * Pass `service` to scope events to one service (history page), or `null` for global events (overview).
 * Pass `null` for `service` to disable the subscription (e.g., when viewing a fixed date range).
 */
export function useLiveEvents(
  service: string | null,
  onUpdate: (data: LiveEventData) => void,
): void {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    const url = service !== null
      ? `/api/events?service=${encodeURIComponent(service)}`
      : '/api/events';
    const es = new EventSource(url);
    es.addEventListener('update', (e: MessageEvent) => {
      try {
        cbRef.current(JSON.parse((e as MessageEvent<string>).data) as LiveEventData);
      } catch { /* ignore malformed events */ }
    });
    return () => es.close();
  }, [service]);
}
