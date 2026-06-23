import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { browseResponseFiles, parseFilename } from './responseStore.js';

const gunzipAsync = promisify(gunzip);
const BATCH_SIZE = 10;

let syncTimer: ReturnType<typeof setInterval> | null = null;
let syncInProgress = false;

export interface SyncStats {
  files: number;
  transferredMB: string;
  decompressedMB: string;
  elapsedSec: string;
  busy?: true;
  error?: string;
}

interface FetchResult {
  buf: Buffer;
  transferred: number;
  decompressed: number;
}

function fetchRaw(url: string): Promise<FetchResult> {
  const get = url.startsWith('https://') ? httpsGet : httpGet;
  return new Promise((resolve, reject) => {
    const req = get(url, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => {
        (async () => {
          const raw = Buffer.concat(chunks);
          const transferred = raw.length;
          const buf =
            res.headers['content-encoding'] === 'gzip' ? await gunzipAsync(raw) : raw;
          resolve({ buf, transferred, decompressed: buf.length });
        })().catch(reject);
      });
    });
    req.on('error', reject);
  });
}

async function downloadOne(
  remoteBase: string,
  filePath: string,
): Promise<{ transferred: number; decompressed: number }> {
  const url = `${remoteBase}/api/download?path=${encodeURIComponent(filePath)}`;
  const { buf, transferred, decompressed } = await fetchRaw(url);

  const [folder, filename] = filePath.split('/');
  const dir = join(config.RESPONSE_DIR, folder);
  await mkdir(dir, { recursive: true });
  // Write as raw Buffer — no encoding conversion so binary files (PNG) are preserved
  await writeFile(join(dir, filename), buf);
  logger.debug({ path: filePath }, 'Downloaded file');

  return { transferred, decompressed };
}

export async function syncFromRemote(remoteBase: string): Promise<SyncStats> {
  if (syncInProgress) {
    logger.warn({ remote: remoteBase }, 'Sync already in progress, skipping');
    return { files: 0, transferredMB: '0.00', decompressedMB: '0.00', elapsedSec: '0.0', busy: true };
  }

  syncInProgress = true;
  logger.info({ remote: remoteBase }, 'Remote sync starting');
  const start = Date.now();

  try {
    const { buf: browseBuf } = await fetchRaw(`${remoteBase}/api/browse`);
    const { folders } = JSON.parse(browseBuf.toString('utf-8')) as { folders: Record<string, string[]> };

    const localFolders = await browseResponseFiles();

    const maxDays = config.MAX_RESPONSE_STORAGE_DAYS;
    const cutoff = maxDays > 0 ? Date.now() - maxDays * 24 * 60 * 60 * 1000 : 0;

    const missing: string[] = [];
    for (const [folder, files] of Object.entries(folders)) {
      const localSet = new Set(localFolders[folder] ?? []);
      for (const f of files) {
        if (localSet.has(f)) continue;
        // Skip files older than MAX_RESPONSE_STORAGE_DAYS to avoid re-filling pruned history
        if (cutoff > 0) {
          const jsonName = f.endsWith('.png') ? f.replace(/\.png$/, '.json') : f;
          const meta = parseFilename(jsonName);
          if (meta && meta.timestamp < cutoff) continue;
        }
        missing.push(`${folder}/${f}`);
      }
    }

    logger.info({ total: missing.length }, 'Files to sync from remote');

    const elapsedSec = () => ((Date.now() - start) / 1000).toFixed(1);

    if (missing.length === 0) {
      logger.info({ elapsedMs: Date.now() - start }, 'Remote sync complete — already up to date');
      return { files: 0, transferredMB: '0.00', decompressedMB: '0.00', elapsedSec: elapsedSec() };
    }

    let totalTransferred = 0;
    let totalDecompressed = 0;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const batch = missing.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(f => downloadOne(remoteBase, f)));
      for (const r of results) {
        totalTransferred += r.transferred;
        totalDecompressed += r.decompressed;
      }
      logger.debug({ done: Math.min(i + BATCH_SIZE, missing.length), total: missing.length }, 'Sync batch complete');
    }

    const stats: SyncStats = {
      files: missing.length,
      transferredMB: (totalTransferred / 1_048_576).toFixed(2),
      decompressedMB: (totalDecompressed / 1_048_576).toFixed(2),
      elapsedSec: elapsedSec(),
    };

    logger.info(stats, 'Remote sync complete');
    return stats;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, remote: remoteBase }, 'Remote sync failed');
    return {
      files: 0,
      transferredMB: '0.00',
      decompressedMB: '0.00',
      elapsedSec: ((Date.now() - start) / 1000).toFixed(1),
      error: msg,
    };
  } finally {
    syncInProgress = false;
  }
}

export function startSyncScheduler(remoteBase: string): void {
  if (syncTimer) return;
  const intervalMs = config.SYNC_INTERVAL * 1000;
  logger.info({ remote: remoteBase, intervalSec: config.SYNC_INTERVAL }, 'Remote sync scheduler started');
  syncTimer = setInterval(() => {
    syncFromRemote(remoteBase).catch(err =>
      logger.error({ err }, 'Scheduled remote sync error'),
    );
  }, intervalMs);
  syncTimer.unref();
}

export function stopSyncScheduler(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
