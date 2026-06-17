import { Router } from 'express';
import { getAllServices } from '../services/configService.js';
import { listResponseFiles, readResponseFile, browseResponseFiles } from '../services/responseStore.js';
import { checkService } from '../services/healthCheckService.js';
import { syncFromRemote } from '../services/syncService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { ServiceWithHistory } from '../types/index.js';

const router = Router();

router.get('/services', (_req, res) => {
  res.json(getAllServices());
});

router.get('/check/:name', async (req, res, next) => {
  const { name } = req.params;
  logger.info({ service: name, from: req.ip }, 'Manual test triggered');
  try {
    const result = await checkService(name);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/history/:name', async (req, res, next) => {
  try {
    const raw = req.query['hours'];
    const hours = Math.min(72, Math.max(1, parseInt(typeof raw === 'string' ? raw : '24', 10)));
    const files = await listResponseFiles(req.params.name, hours);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

router.get('/history/:name/:filename', async (req, res, next) => {
  try {
    const data = await readResponseFile(req.params.name, req.params.filename);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const raw = req.query['hours'];
    const hours = Math.min(72, Math.max(1, parseInt(typeof raw === 'string' ? raw : '24', 10)));
    const services = getAllServices();
    const result: ServiceWithHistory[] = await Promise.all(
      services.map(async s => ({
        ...s,
        history: await listResponseFiles(s.name, hours),
      })),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/info', (_req, res) => {
  res.json({ syncRemote: !!config.SYNC_REMOTE });
});

router.post('/sync', async (_req, res, next) => {
  if (!config.SYNC_REMOTE) {
    res.status(400).json({ ok: false, reason: 'SYNC_REMOTE not configured' });
    return;
  }
  try {
    logger.info({ from: _req.ip }, 'On-demand sync triggered');
    const stats = await syncFromRemote(config.SYNC_REMOTE);
    res.json({ ok: !stats.error, ...stats });
  } catch (err) {
    next(err);
  }
});

router.get('/browse', async (_req, res, next) => {
  try {
    const folders = await browseResponseFiles();
    res.json({ folders });
  } catch (err) {
    next(err);
  }
});

router.get('/download', async (req, res, next) => {
  try {
    const rawPath = typeof req.query['path'] === 'string' ? req.query['path'] : '';
    if (!rawPath || rawPath.includes('..') || rawPath.startsWith('/') || rawPath.startsWith('\\')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    const parts = rawPath.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      res.status(400).json({ error: 'Path must be folder/filename' });
      return;
    }
    const [folder, filename] = parts;
    const data = await readResponseFile(folder, filename);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
