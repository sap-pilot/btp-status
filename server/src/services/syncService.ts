import { get as httpGet } from 'node:http';
import { get as httpsGet } from 'node:https';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { browseResponseFiles } from './responseStore.js';

const gunzipAsync = promisify(gunzip);
const BATCH_SIZE = 10;

interface FetchResult {
  body: string;
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
          resolve({ body: buf.toString('utf-8'), transferred, decompressed: buf.length });
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
  const { body, transferred, decompressed } = await fetchRaw(url);

  const [folder, filename] = filePath.split('/');
  const dir = join(config.RESPONSE_DIR, folder);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), body, 'utf-8');
  logger.debug({ path: filePath, decompressed }, 'Downloaded file');

  return { transferred, decompressed };
}

export async function syncFromRemote(remoteBase: string): Promise<void> {
  logger.info({ remote: remoteBase }, 'Remote sync starting');
  const start = Date.now();

  try {
    const { body: browseBody } = await fetchRaw(`${remoteBase}/api/browse`);
    const { folders } = JSON.parse(browseBody) as { folders: Record<string, string[]> };

    const localFolders = await browseResponseFiles();

    const missing: string[] = [];
    for (const [folder, files] of Object.entries(folders)) {
      const localSet = new Set(localFolders[folder] ?? []);
      for (const f of files) {
        if (!localSet.has(f)) missing.push(`${folder}/${f}`);
      }
    }

    logger.info({ total: missing.length }, 'Files to sync from remote');

    if (missing.length === 0) {
      logger.info({ elapsedMs: Date.now() - start }, 'Remote sync complete — already up to date');
      return;
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

    const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
    logger.info(
      {
        files: missing.length,
        transferredMB: (totalTransferred / 1_048_576).toFixed(2),
        decompressedMB: (totalDecompressed / 1_048_576).toFixed(2),
        elapsedSec,
      },
      'Remote sync complete',
    );
  } catch (err) {
    logger.error({ err, remote: remoteBase }, 'Remote sync failed');
  }
}
