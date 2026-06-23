import { get as httpGet, request as httpRequest } from 'node:http';
import { get as httpsGet, request as httpsRequest } from 'node:https';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { browseResponseFiles, parseFilename } from './responseStore.js';
import { extractZip } from './zipBuilder.js';

const gunzipAsync = promisify(gunzip);
const INDIVIDUAL_CONCURRENCY = 10;

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

function fetchPost(url: string, body: string): Promise<FetchResult> {
  const isHttps = url.startsWith('https://');
  const request = isHttps ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const bodyBytes = Buffer.from(body, 'utf-8');
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBytes.length,
          'Accept-Encoding': 'gzip',
        },
      },
      (res) => {
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
      },
    );
    req.on('error', reject);
    req.write(bodyBytes);
    req.end();
  });
}

async function downloadOne(
  remoteBase: string,
  filePath: string,
): Promise<{ transferred: number; decompressed: number }> {
  const url = `${remoteBase}/api/download?path=${encodeURIComponent(filePath)}`;
  const { buf, transferred, decompressed } = await fetchRaw(url);

  const [folder, filename] = filePath.split('/');
  const dir = join(config.RESPONSE_DIR, folder!);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename!), buf);
  logger.debug({ path: filePath }, 'Downloaded file');

  return { transferred, decompressed };
}

async function downloadBatch(
  remoteBase: string,
  filePaths: string[],
): Promise<{ transferred: number; decompressed: number }> {
  const url = `${remoteBase}/api/batch-download`;
  const { buf: zip, transferred } = await fetchPost(url, JSON.stringify({ paths: filePaths }));
  const entries = extractZip(zip);

  await Promise.all(
    entries.map(async ({ name, data }) => {
      const parts = name.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) return;
      const dir = join(config.RESPONSE_DIR, parts[0]);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, parts[1]), data);
    }),
  );

  const decompressed = entries.reduce((sum, e) => sum + e.data.length, 0);
  logger.debug({ files: entries.length }, 'Batch download chunk complete');
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

    const batchSize = config.SYNC_REMOTE_BATCH_SIZE;
    // null = untested, true = available, false = unavailable (fall back to individual)
    let batchAvailable: boolean | null = null;

    for (let i = 0; i < missing.length; i += batchSize) {
      const chunk = missing.slice(i, i + batchSize);

      if (batchAvailable !== false) {
        try {
          const result = await downloadBatch(remoteBase, chunk);
          totalTransferred += result.transferred;
          totalDecompressed += result.decompressed;
          batchAvailable = true;
          logger.debug({ done: Math.min(i + batchSize, missing.length), total: missing.length }, 'Sync batch complete');
          continue;
        } catch (err) {
          if (batchAvailable === null) {
            logger.info({ err }, 'Batch download not available, falling back to individual downloads');
            batchAvailable = false;
            // fall through to individual downloads for this chunk
          } else {
            throw err;
          }
        }
      }

      // Individual download mode
      for (let j = 0; j < chunk.length; j += INDIVIDUAL_CONCURRENCY) {
        const concurrentSlice = chunk.slice(j, j + INDIVIDUAL_CONCURRENCY);
        const results = await Promise.all(concurrentSlice.map(f => downloadOne(remoteBase, f)));
        for (const r of results) {
          totalTransferred += r.transferred;
          totalDecompressed += r.decompressed;
        }
      }
      logger.debug({ done: Math.min(i + batchSize, missing.length), total: missing.length }, 'Sync batch complete');
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
