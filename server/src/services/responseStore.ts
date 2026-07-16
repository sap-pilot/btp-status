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
  consoleLogs?: string[],
  htmlContent?: string,
  isRetry = false,
): Promise<string> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  await mkdir(dir, { recursive: true });

  const ts = formatTimestamp(new Date());
  const epSlug = sanitizeEndpointName(record.endpointName);
  const city = record.city ?? getCity();
  const base = `${ts}_${epSlug}_${city}_${record.responseTime}_${record.overallStatus}`;
  const retrySuffix = isRetry ? '.retry' : '';

  let finalRecord = record;
  if (screenshot && screenshot.length > 0) {
    const pngFilename = `${base}${retrySuffix}.screenshot.png`;
    await writeFile(join(dir, pngFilename), screenshot);
    finalRecord = { ...finalRecord, screenshotFile: pngFilename };
  }
  if (consoleLogs && consoleLogs.length > 0) {
    const logFilename = `${base}${retrySuffix}.console.log`;
    await writeFile(join(dir, logFilename), consoleLogs.join('\n'), 'utf-8');
    finalRecord = { ...finalRecord, consoleLogFile: logFilename };
  }
  if (htmlContent && htmlContent.length > 0) {
    const htmlFilename = `${base}${retrySuffix}.content.html`;
    await writeFile(join(dir, htmlFilename), htmlContent, 'utf-8');
    finalRecord = { ...finalRecord, contentFile: htmlFilename };
  }

  const filename = `${base}${retrySuffix}.json`;
  await writeFile(join(dir, filename), JSON.stringify(finalRecord, null, 2), 'utf-8');
  return filename;
}

export async function listResponseFiles(
  serviceName: string,
  range: { hours: number } | { fromMs: number; untilMs: number },
): Promise<HistoryFile[]> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  try {
    const files = await readdir(dir);
    const fileSet = new Set(files);
    const fromMs = 'hours' in range ? Date.now() - range.hours * 3_600_000 : range.fromMs;
    const untilMs = 'hours' in range ? Infinity : range.untilMs;
    const results: HistoryFile[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      if (f.endsWith('.retry.json')) continue;  // exclude retry files from history
      const meta = parseFilename(f);
      if (meta && meta.timestamp >= fromMs && meta.timestamp <= untilMs) {
        // Support both old (*.png) and new (*.screenshot.png) screenshot naming
        const pngNew = f.replace(/\.json$/, '.screenshot.png');
        const pngOld = f.replace(/\.json$/, '.png');
        const pngFile = fileSet.has(pngNew) ? pngNew : fileSet.has(pngOld) ? pngOld : null;
        results.push(pngFile ? { ...meta, screenshotFile: pngFile } : meta);
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
  if (!/^[\w-]+(?:\.retry)?\.json$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  const raw = await readFile(filepath, 'utf-8');
  return JSON.parse(raw) as ResponseRecord;
}

export async function readScreenshotFile(
  serviceName: string,
  filename: string,
): Promise<Buffer> {
  // Accept new (*.screenshot.png / *.retry.screenshot.png) and legacy (*.png / *.retry.png) naming
  if (!/^[\w-]+(?:\.retry)?(?:\.screenshot)?\.png$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  return readFile(filepath);
}

export async function readConsoleLogFile(
  serviceName: string,
  filename: string,
): Promise<Buffer> {
  // Accept new (*[.retry].console.log) and legacy (*_console[.retry].log) naming
  if (!/^[\w-]+(?:(?:\.retry)?\.console\.log|_console(?:\.retry)?\.log)$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  return readFile(filepath);
}

export async function readContentFile(
  serviceName: string,
  filename: string,
): Promise<Buffer> {
  // Accept new (*[.retry].content.html) and legacy (*_content[.retry].html) naming
  if (!/^[\w-]+(?:(?:\.retry)?\.content\.html|_content(?:\.retry)?\.html)$/.test(filename)) throw new Error('Invalid filename');
  const filepath = join(config.RESPONSE_DIR, sanitizeName(serviceName), filename);
  return readFile(filepath);
}

export function parseFilename(filename: string): HistoryFile | null {
  // New format (v0.5.0+): yyyyMMdd-HHmmss_{slug}_{city}_{ms}_{status}[.retry].json  (UTC timestamp)
  const newM = filename.match(
    /^(\d{8}-\d{6})_([a-zA-Z0-9-]+)_([a-zA-Z0-9-]+)_(\d+)_(200|203|400|500|503|504)(?:\.retry)?\.json$/,
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
      overallStatus: parseInt(statusStr, 10) as 200 | 203 | 400 | 500 | 503 | 504,
    };
  }

  // Old format (pre-v0.5.0): yyyyMMdd-HHmmss_{idx}_{ms}ms_{status}.json  (local timestamp)
  const oldM = filename.match(
    /^(\d{8}-\d{6})_(\d+)_(\d+)ms_(200|203|400|500|503|504)\.json$/,
  );
  if (oldM) {
    const [, dateStr, idxStr, msStr, statusStr] = oldM;
    return {
      filename,
      timestamp: parseFileDateLocal(dateStr),
      endpointIndex: parseInt(idxStr, 10),
      responseTime: parseInt(msStr, 10),
      httpStatus: 0,
      overallStatus: parseInt(statusStr, 10) as 200 | 203 | 400 | 500 | 503 | 504,
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

/** Extract the UTC timestamp from a response filename prefix (yyyyMMdd-HHmmss_). Returns 0 if unparseable. */
function filenameTimestamp(filename: string): number {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_/);
  if (!m) return 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

export async function browseResponseFiles(since?: number): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  try {
    const entries = await readdir(config.RESPONSE_DIR, { withFileTypes: true });
    await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (dir) => {
          try {
            let files = await readdir(join(config.RESPONSE_DIR, dir.name));
            files = files.filter(f =>
              f.endsWith('.json') || f.endsWith('.png') ||
              f.endsWith('.log') || f.endsWith('.html'),
            );
            if (since && since > 0) {
              files = files.filter(f => {
                const ts = filenameTimestamp(f);
                return ts === 0 || ts >= since; // include unparseable files conservatively
              });
            }
            result[dir.name] = files.sort();
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

export async function readRawResponseFile(folder: string, filename: string): Promise<Buffer> {
  const filepath = join(config.RESPONSE_DIR, sanitizeName(folder), filename);
  return readFile(filepath);
}

export async function responseFileSize(folder: string, filename: string): Promise<number> {
  try {
    const info = await stat(join(config.RESPONSE_DIR, sanitizeName(folder), filename));
    return info.size;
  } catch {
    return 0;
  }
}
