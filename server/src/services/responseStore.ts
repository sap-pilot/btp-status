import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import type { ResponseRecord, HistoryFile } from '../types/index.js';

function formatTimestamp(d: Date): string {
  const p = (n: number, l = 2): string => String(n).padStart(l, '0');
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

export async function saveResponse(
  serviceName: string,
  record: ResponseRecord,
): Promise<string> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  await mkdir(dir, { recursive: true });

  const ts = formatTimestamp(new Date());
  const filename = `${ts}_${record.endpointIndex}_${record.responseTime}ms_${record.overallStatus}.json`;
  await writeFile(join(dir, filename), JSON.stringify(record, null, 2), 'utf-8');
  return filename;
}

export async function listResponseFiles(
  serviceName: string,
  hours: number,
): Promise<HistoryFile[]> {
  const dir = join(config.RESPONSE_DIR, sanitizeName(serviceName));
  try {
    const files = await readdir(dir);
    const cutoff = Date.now() - hours * 3_600_000;
    const results: HistoryFile[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const meta = parseFilename(f);
      if (meta && meta.timestamp >= cutoff) results.push(meta);
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

function parseFilename(filename: string): HistoryFile | null {
  // yyyyMMdd-HHmmss_{idx}_{ms}ms_{200|500}.json
  const m = filename.match(/^(\d{8}-\d{6})_(\d+)_(\d+)ms_(200|500)\.json$/);
  if (!m) return null;
  const [, dateStr, idxStr, msStr, statusStr] = m;
  return {
    filename,
    timestamp: parseFileDate(dateStr),
    endpointIndex: parseInt(idxStr, 10),
    responseTime: parseInt(msStr, 10),
    httpStatus: 0,
    overallStatus: parseInt(statusStr, 10) as 200 | 500,
  };
}

function parseFileDate(s: string): number {
  const yr = +s.slice(0, 4);
  const mo = +s.slice(4, 6) - 1;
  const dy = +s.slice(6, 8);
  const hr = +s.slice(9, 11);
  const mn = +s.slice(11, 13);
  const sc = +s.slice(13, 15);
  return new Date(yr, mo, dy, hr, mn, sc).getTime();
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, '_');
}
