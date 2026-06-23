import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { parseFilename } from './responseStore.js';

let timer: ReturnType<typeof setInterval> | null = null;

export async function runHousekeeping(): Promise<void> {
  const maxDays = config.MAX_RESPONSE_STORAGE_DAYS;
  if (maxDays <= 0) return;

  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
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
        // Use the shared parser which correctly handles UTC (new format) and local (old format)
        const meta = parseFilename(file.endsWith('.png') ? file.replace(/\.png$/, '.json') : file);
        if (meta === null || meta.timestamp >= cutoff) continue;
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

export function startHousekeepingScheduler(): void {
  if (config.MAX_RESPONSE_STORAGE_DAYS <= 0) {
    logger.info('Housekeeping disabled (MAX_RESPONSE_STORAGE_DAYS=0)');
    return;
  }
  logger.info({ maxDays: config.MAX_RESPONSE_STORAGE_DAYS }, 'Housekeeping scheduler started');
  void runHousekeeping();
  // Run once a day
  timer = setInterval(() => void runHousekeeping(), 24 * 60 * 60 * 1000);
  timer.unref();
}

export function stopHousekeepingScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
}
