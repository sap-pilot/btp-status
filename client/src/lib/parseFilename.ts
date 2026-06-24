import type { HistoryFile } from '@shared/types';

// New format (v0.5.0+): yyyyMMdd-HHmmss_{slug}_{city}_{ms}_{status}[.json]  (UTC timestamp)
const NEW_RE = /^(\d{8}-\d{6})_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)_(\d+)_(200|203|500|503|504)(?:\.json)?$/;
// Old format (pre-v0.5.0): yyyyMMdd-HHmmss_{idx}_{ms}ms_{status}[.json]  (local-timezone timestamp)
const OLD_RE = /^(\d{8}-\d{6})_(\d+)_(\d+)ms_(200|203|500|503|504)(?:\.json)?$/;

function parseUTC(s: string): number {
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
}

function parseLocal(s: string): number {
  return new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15)).getTime();
}

/** Parse a filename (with or without .json) into a HistoryFile. Returns null for unrecognised names. */
export function parseFilename(raw: string): HistoryFile | null {
  const newM = raw.match(NEW_RE);
  if (newM) {
    const [, dateStr, slug, city, msStr, statusStr] = newM;
    return {
      filename: raw.endsWith('.json') ? raw : raw + '.json',
      timestamp: parseUTC(dateStr),
      endpointSlug: slug,
      city,
      responseTime: parseInt(msStr, 10),
      overallStatus: parseInt(statusStr, 10) as HistoryFile['overallStatus'],
    };
  }
  const oldM = raw.match(OLD_RE);
  if (oldM) {
    const [, dateStr, idxStr, msStr, statusStr] = oldM;
    return {
      filename: raw.endsWith('.json') ? raw : raw + '.json',
      timestamp: parseLocal(dateStr),
      endpointIndex: parseInt(idxStr, 10),
      city: 'unknown',
      responseTime: parseInt(msStr, 10),
      overallStatus: parseInt(statusStr, 10) as HistoryFile['overallStatus'],
    };
  }
  return null;
}
