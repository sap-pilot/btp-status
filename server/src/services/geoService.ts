import { logger } from '../logger.js';

let _city = 'unknown';

export async function initGeo(): Promise<void> {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=city', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Geo lookup returned non-OK; city stays "unknown"');
      return;
    }
    const data = await res.json() as { city?: string };
    if (data.city) {
      _city = data.city.replace(/ /g, '-');
      logger.info({ city: _city, raw: data.city }, 'Geo location resolved');
    }
  } catch (err) {
    logger.warn({ err }, 'Geo lookup failed; city stays "unknown"');
  }
}

export function getCity(): string {
  return _city;
}
