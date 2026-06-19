import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';

let timer: ReturnType<typeof setInterval> | null = null;

export async function runHousekeeping(): Promise<void> {
  const maxDays = config.MAX_RESPONSE_STORAGE_DAYS;
  const cutoffMs = maxDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let deleted = 0;
  let errors = 0;

  try {
    const entries = await readdir(config.RESPONSE_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const serviceDir = join(config.RESPONSE_DIR, entry.name);

      let files: string[];
      try {
        files = await readdir(serviceDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.json') && !file.endsWith('.png')) continue;
        const ts = parseDateFromFilename(file);
        if (ts === null || now - ts <= cutoffMs) continue;
        try {
          await unlink(join(serviceDir, file));
          deleted++;
        } catch {
          errors++;
        }
      }
    }

    logger.info({ deleted, errors, maxDays }, 'Housekeeping completed');
  } catch (err) {
    logger.warn({ err }, 'Housekeeping error');
  }
}

// Parse the leading yyyyMMdd-HHmmss from response filenames
function parseDateFromFilename(filename: string): number | null {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_/);
  if (!m) return null;
  const [, yr, mo, dy, hr, mn, sc] = m;
  return new Date(+yr, +mo - 1, +dy, +hr, +mn, +sc).getTime();
}

export function startHousekeepingScheduler(): void {
  if (config.MAX_RESPONSE_STORAGE_DAYS <= 0) {
    logger.info('Housekeeping disabled (MAX_RESPONSE_STORAGE_DAYS=0)');
    return;
  }
  logger.info({ maxDays: config.MAX_RESPONSE_STORAGE_DAYS }, 'Housekeeping scheduler started');
  void runHousekeeping();
  timer = setInterval(() => void runHousekeeping(), 24 * 60 * 60 * 1000);
  timer.unref();
}

export function stopHousekeepingScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
