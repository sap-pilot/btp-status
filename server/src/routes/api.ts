import { Router } from 'express';
import { getAllServices, getLandscapes, getSites } from '../services/configService.js';
import { listResponseFiles, readResponseFile, readRawResponseFile, readScreenshotFile, browseResponseFiles } from '../services/responseStore.js';
import { buildZip } from '../services/zipBuilder.js';
import { checkService } from '../services/healthCheckService.js';
import { syncFromRemote } from '../services/syncService.js';
import { getEvaluationMode, setEvaluationMode, getIntervalOverride, setIntervalOverride } from '../services/overrideService.js';
import { rescheduleService } from '../services/schedulerService.js';
import { getService } from '../services/configService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getCity } from '../services/geoService.js';
import { getXsuaaConfig, readSessionFromRequest } from '../services/authService.js';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import type { EvaluationMode, ServiceWithHistory } from '../types/index.js';

const VALID_EVAL_MODES = new Set<string>(['condition', 'alwaysok', 'alwayserror']);

const router = Router();

router.get('/services', (_req, res) => {
  res.json(getAllServices());
});

router.get('/check/:name', requireAuth, async (req, res, next) => {
  const name = req.params['name'] as string;
  const user = (req as AuthRequest).authSession?.sub ?? 'anon';
  logger.info({ service: name, from: req.ip, user }, 'Manual test triggered');
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

router.get('/landscapes', (_req, res) => {
  res.json(getLandscapes());
});

router.get('/info', (_req, res) => {
  res.json({ syncRemote: !!config.SYNC_REMOTE, city: getCity(), sites: getSites() });
});

router.get('/me', (req, res) => {
  const x = getXsuaaConfig();
  if (!x) { res.json({ enabled: false }); return; }
  const session = readSessionFromRequest(req.headers.cookie ?? '', x.clientsecret);
  if (!session) { res.json({ enabled: true, loggedIn: false }); return; }
  res.json({ enabled: true, loggedIn: true, firstName: session.firstName, isAdmin: session.isAdmin });
});

router.get('/eval-mode/:name', (req, res) => {
  res.json({ mode: getEvaluationMode(req.params.name) });
});

router.post('/eval-mode/:name', requireAdmin, (req, res) => {
  const svcName = req.params['name'] as string;
  const user = (req as AuthRequest).authSession?.sub ?? 'anon';
  const mode = (req.body as { mode?: string })?.mode;
  if (!mode || !VALID_EVAL_MODES.has(mode)) {
    res.status(400).json({ error: 'mode must be condition, alwaysok, or alwayserror' });
    return;
  }
  setEvaluationMode(svcName, mode as EvaluationMode);
  logger.info({ service: svcName, mode, user }, 'Evaluation mode updated');
  res.json({ ok: true, mode });
});

router.get('/schedule/:name', (req, res) => {
  const name = req.params.name;
  const override = getIntervalOverride(name);
  if (override !== null) {
    res.json({ intervalSeconds: override });
    return;
  }
  const svc = getService(name);
  res.json({ intervalSeconds: svc?.interval ?? 0 });
});

router.post('/schedule/:name', requireAdmin, (req, res) => {
  const name = req.params['name'] as string;
  const user = (req as AuthRequest).authSession?.sub ?? 'anon';
  const { intervalSeconds } = req.body as { intervalSeconds?: unknown };
  if (typeof intervalSeconds !== 'number' || !Number.isInteger(intervalSeconds) || intervalSeconds < 0) {
    res.status(400).json({ error: 'intervalSeconds must be a non-negative integer' });
    return;
  }
  setIntervalOverride(name, intervalSeconds);
  rescheduleService(name, intervalSeconds);
  logger.info({ service: name, intervalSeconds, user }, 'Schedule updated');
  res.json({ ok: true, intervalSeconds });
});

router.post('/sync', requireAuth, async (req, res, next) => {
  if (!config.SYNC_REMOTE) {
    res.status(400).json({ ok: false, reason: 'SYNC_REMOTE not configured' });
    return;
  }
  try {
    const user = (req as AuthRequest).authSession?.sub ?? 'anon';
    logger.info({ from: req.ip, user }, 'On-demand sync triggered');
    const stats = await syncFromRemote(config.SYNC_REMOTE);
    res.json({ ok: !stats.error, ...stats });
  } catch (err) {
    next(err);
  }
});

router.post('/batch-download', async (req, res, next) => {
  try {
    const { paths } = req.body as { paths?: unknown };
    if (!Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({ error: 'paths must be a non-empty array' });
      return;
    }
    if (paths.length > 500) {
      res.status(400).json({ error: 'paths exceeds maximum of 500' });
      return;
    }
    for (const p of paths) {
      if (typeof p !== 'string' || p.includes('..') || p.startsWith('/') || p.startsWith('\\')) {
        res.status(400).json({ error: `invalid path: ${String(p)}` });
        return;
      }
      const parts = p.split('/');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        res.status(400).json({ error: `path must be folder/filename: ${p}` });
        return;
      }
    }

    const entries: { name: string; data: Buffer }[] = [];
    for (const p of paths as string[]) {
      const [folder, filename] = p.split('/') as [string, string];
      try {
        const data = await readRawResponseFile(folder, filename);
        entries.push({ name: p, data });
      } catch {
        // skip files that have been pruned since browse was called
      }
    }

    const zip = buildZip(entries);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="batch.zip"');
    res.send(zip);
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
    if (filename.endsWith('.png')) {
      const buf = await readScreenshotFile(folder, filename);
      res.type('image/png').send(buf);
    } else {
      const data = await readResponseFile(folder, filename);
      res.json(data);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
