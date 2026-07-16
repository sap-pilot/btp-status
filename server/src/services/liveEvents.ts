import type { Response } from 'express';

interface Subscriber {
  res: Response;
  topics: Set<string>;
}

const subscribers = new Set<Subscriber>();

export function subscribe(res: Response, topics: string[]): () => void {
  const sub: Subscriber = { res, topics: new Set(topics) };
  subscribers.add(sub);
  return () => { subscribers.delete(sub); };
}

export function emit(topic: string, data: Record<string, unknown>): void {
  if (subscribers.size === 0) return;
  const payload = `event: update\ndata: ${JSON.stringify(data)}\n\n`;
  for (const sub of subscribers) {
    if (!sub.topics.has(topic)) continue;
    try {
      sub.res.write(payload);
    } catch {
      subscribers.delete(sub);
    }
  }
}
