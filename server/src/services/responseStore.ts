import { mkdir, writeFile, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { getCity } from './geoService.js';
import type { ResponseRecord, HistoryFile } from '../types/index.js';

/** UTC timestamp string: yyyyMMdd-HHmmss */
function formatTimestamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`
  );
}

/** Replace non-alphanumeric runs with a single dash; trim leading/trailing dashes. */
function sanitizeEndpointName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'endpoint';
}

export async function saveResponse(
  serviceName: string,
  record: ResponseRecord,
  screenshot?: Buffer,
): Promise<string> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  await mkdir(dir, { recursive: true });

  const ts = formatTimestamp(new Date());
  const epSlug = sanitizeEndpointName(record.endpointName);
  const city = record.city ?? getCity();
  const base = `${ts}_${epSlug}_${city}_${record.responseTime}_${record.overallStatus}`;

  let finalRecord = record;
  if (screenshot && screenshot.length > 0) {
    const pngFilename = `${base}.png`;
    await writeFile(join(dir, pngFilename), screenshot);
    finalRecord = { ...record, screenshotFile: pngFilename };
  }

  const filename = `${base}.json`;
  await writeFile(join(dir, filename), JSON.stringify(finalRecord, null, 2), 'utf-8');
  return filename;
}

export async function listResponseFiles(
  serviceName: string,
  hours: number,
): Promise<HistoryFile[]> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  try {
    const files = await readdir(dir);
    const fileSet = new Set(files);
    const cutoff = Date.now() - hours * 3_600_000;
    const results: HistoryFile[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const meta = parseFilename(f);
      if (meta && meta.timestamp >= cutoff) {
        const pngName = f.replace(/\.json$/, '.png');
        results.push(fileSet.has(pngName) ? { ...meta, screenshotFile: pngName } : meta);
      }
    }
    return results.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function readResponseFile(
  serviceName: string,
  filename: string,
): Promise<ResponseRecord> {
  if (!/^[\w-]+\.json$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  const raw = await readFile(filepath, 'utf-8');
  return JSON.parse(raw) as ResponseRecord;
}

export async function readScreenshotFile(
  serviceName: string,
  filename: string,
): Promise<Buffer> {
  if (!/^[\w-]+\.png$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  return readFile(filepath);
}

function parseFilename(filename: string): HistoryFile | null {
  // New format (v0.5.0+): yyyyMMdd-HHmmss_{slug}_{city}_{ms}_{status}.json  (UTC timestamp)
  const newM = filename.match(
    /^(\d{8}-\d{6})_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)_(\d+)_(200|203|500|503)\.json$/,
  );
  if (newM) {
    const [, dateStr, slug, city, msStr, statusStr] = newM;
    return {
      filename,
      timestamp: parseFileDateUTC(dateStr),
      endpointIndex: -1,
      endpointSlug: slug,
      city,
      responseTime: parseInt(msStr, 10),
      httpStatus: 0,
      overallStatus: parseInt(statusStr, 10) as 200 | 203 | 500 | 503,
    };
  }

  // Old format (pre-v0.5.0): yyyyMMdd-HHmmss_{idx}_{ms}ms_{status}.json  (local timestamp)
  const oldM = filename.match(
    /^(\d{8}-\d{6})_(\d+)_(\d+)ms_(200|203|500|503)\.json$/,
  );
  if (oldM) {
    const [, dateStr, idxStr, msStr, statusStr] = oldM;
    return {
      filename,
      timestamp: parseFileDateLocal(dateStr),
      endpointIndex: parseInt(idxStr, 10),
      responseTime: parseInt(msStr, 10),
      httpStatus: 0,
      overallStatus: parseInt(statusStr, 10) as 200 | 203 | 500 | 503,
    };
  }

  return null;
}

/** Parse a yyyyMMdd-HHmmss string as UTC milliseconds. */
function parseFileDateUTC(s: string): number {
  return Date.UTC(
    +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
    +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15),
  );
}

/** Parse a yyyyMMdd-HHmmss string as local-timezone milliseconds (legacy files). */
function parseFileDateLocal(s: string): number {
  return new Date(
    +s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
    +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15),
  ).getTime();
}

export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_');
}

export async function browseResponseFiles(): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  try {
    const entries = await readdir(config.RESPONSE_DIR, { withFileTypes: true });
    await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (dir) => {
          try {
            const files = await readdir(join(config.RESPONSE_DIR, dir.name));
            result[dir.name] = files.filter(f => f.endsWith('.json') || f.endsWith('.png')).sort();
          } catch {
            result[dir.name] = [];
          }
        }),
    );
  } catch {
    // response dir doesn't exist yet
  }
  return result;
}

export async function responseFileSize(folder: string, filename: string): Promise<number> {
  try {
    const info = await stat(join(config.RESPONSE_DIR, sanitizeName(folder), filename));
    return info.size;
  } catch {
    return 0;
  }
}
