import { Router } from 'express';
import { getAllServices, getLandscapes, getSites } from '../services/configService.js';
import { listResponseFiles, readResponseFile, readRawResponseFile, readScreenshotFile, readConsoleLogFile, readContentFile, browseResponseFiles } from '../services/responseStore.js';
import { buildZip } from '../services/zipBuilder.js';
import { checkService } from '../services/healthCheckService.js';
import { syncFromRemote } from '../services/syncService.js';
import { getEvaluationMode, setEvaluationMode, getIntervalOverride, setIntervalOverride } from '../services/overrideService.js';
import { rescheduleService } from '../services/schedulerService.js';
import { getService } from '../services/configService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getCity } from '../services/geoService.js';
import { getXsuaaConfig, readSessionFromRequest, userLabel } from '../services/authService.js';
import { requireAuth, requireAdmin, requireSyncAuth } from '../middleware/requireAuth.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import type { EvaluationMode, ServiceWithHistory, ServiceSummary } from '../types/index.js';

const VALID_EVAL_MODES = new Set<string>(['condition', 'alwaysok', 'alwayserror']);

/** Parse ?hours=N or ?fromMs=N&untilMs=N into a listResponseFiles range. */
function parseTimeRangeQuery(
  query: Record<string, unknown>,
): { hours: number } | { fromMs: number; untilMs: number } {
  const rawFrom = query['fromMs'];
  const rawUntil = query['untilMs'];
  if (typeof rawFrom === 'string' && typeof rawUntil === 'string') {
    const fromMs = parseInt(rawFrom, 10);
    const untilMs = parseInt(rawUntil, 10);
    if (!isNaN(fromMs) && !isNaN(untilMs) && fromMs <= untilMs) {
      return { fromMs, untilMs };
    }
  }
  const raw = query['hours'];
  const hours = Math.min(168, Math.max(1, parseInt(typeof raw === 'string' ? raw : '24', 10)));
  return { hours };
}

const router = Router();

router.get('/services', (_req, res) => {
  const services = getAllServices().map(s => ({
    ...s,
    endpoints: s.endpoints.map(ep => {
      const { username, password, ...safe } = ep;
      void username; void password;
      return safe;
    }),
  }));
  res.json(services);
});

router.get('/check/:name', requireAuth, async (req, res, next) => {
  const name = req.params['name'] as string;
  const user = (req as AuthRequest).authSession ? userLabel((req as AuthRequest).authSession!) : 'anon';
  logger.info({ service: name, from: req.ip, user }, 'Manual test triggered');
  try {
    // Pass no requestHost so checkService skips region filtering — manual tests always
    // check all endpoints regardless of which region the browser request came from.
    const result = await checkService(name);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/history/:name', async (req, res, next) => {
  try {
    const range = parseTimeRangeQuery(req.query);
    const files = await listResponseFiles(req.params.name, range);
    res.json(files.map(f => f.filename.replace(/\.json$/, '')));
  } catch (err) {
    next(err);
  }
});

router.get('/history/:name/:filename', requireAuth, async (req, res, next) => {
  try {
    const data = await readResponseFile(req.params['name'] as string, req.params['filename'] as string);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/overview', async (req, res, next) => {
  try {
    const range = parseTimeRangeQuery(req.query);
    const services = getAllServices();
    const result = await Promise.all(
      services.map(async s => {
        const history = await listResponseFiles(s.name, range);
        // Strip credentials and browser-check config from endpoints
        const safeEndpoints = s.endpoints.map(ep => {
          const { username, password, waitForSelector, timeout, ...safe } = ep;
          void username; void password; void waitForSelector; void timeout;
          return safe;
        });
        // Filenames without .json — all fields (timestamp, status, city, responseTime) are parsed client-side
        const safeHistory = history.map(f => f.filename.replace(/\.json$/, ''));
        return { ...s, endpoints: safeEndpoints, history: safeHistory };
      }),
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/service-summary', async (req, res, next) => {
  try {
    const range = parseTimeRangeQuery(req.query);
    const services = getAllServices();
    const summaries: ServiceSummary[] = await Promise.all(
      services.map(async s => {
        const files = await listResponseFiles(s.name, range);
        // Group by 1-second timestamp bucket (same-second files = same check run)
        const byBucket = new Map<number, typeof files>();
        for (const f of files) {
          const bucket = Math.floor(f.timestamp / 1000);
          if (!byBucket.has(bucket)) byBucket.set(bucket, []);
          byBucket.get(bucket)!.push(f);
        }
        // Compute combined status for every run, track latest and whether any failed
        let latestBucket = -Infinity;
        let latestPassed = false;
        let anyFailed = false;
        let hasRuns = false;
        for (const [bucket, runFiles] of byBucket) {
          const override = runFiles.find(f => f.overallStatus === 203 || f.overallStatus === 503);
          const runPassed = override
            ? override.overallStatus === 203
            : runFiles.every(f => f.overallStatus === 200);
          hasRuns = true;
          if (!runPassed) anyFailed = true;
          if (bucket > latestBucket) { latestBucket = bucket; latestPassed = runPassed; }
        }
        const rangeStatus: ServiceSummary['rangeStatus'] = !hasRuns
          ? null
          : !latestPassed
            ? 'error'
            : anyFailed
              ? 'warning'
              : 'ok';
        return { name: s.name, group: s.group, rangeStatus };
      }),
    );
    res.json(summaries);
  } catch (err) {
    next(err);
  }
});

router.get('/landscapes', (_req, res) => {
  res.json(getLandscapes());
});

router.get('/info', (_req, res) => {
  res.json({ syncRemote: !!config.SYNC_REMOTE, city: getCity(), sites: getSites(), maxStorageDays: config.MAX_RESPONSE_STORAGE_DAYS });
});

router.get('/me', (req, res) => {
  const x = getXsuaaConfig();
  if (!x) { res.json({ enabled: false }); return; }
  const session = readSessionFromRequest(req.headers.cookie ?? '', x.clientsecret);
  if (!session) { res.json({ enabled: true, loggedIn: false }); return; }
  res.json({ enabled: true, loggedIn: true, firstName: session.firstName, initials: session.initials, isAdmin: session.isAdmin });
});

router.get('/eval-mode/:name', (req, res) => {
  res.json({ mode: getEvaluationMode(req.params.name) });
});

router.post('/eval-mode/:name', requireAdmin, (req, res) => {
  const svcName = req.params['name'] as string;
  const user = (req as AuthRequest).authSession ? userLabel((req as AuthRequest).authSession!) : 'anon';
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
  const firstEp = svc?.endpoints[0];
  res.json({ intervalSeconds: firstEp?.interval ?? svc?.interval ?? 0 });
});

router.post('/schedule/:name', requireAdmin, (req, res) => {
  const name = req.params['name'] as string;
  const user = (req as AuthRequest).authSession ? userLabel((req as AuthRequest).authSession!) : 'anon';
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
    const user = (req as AuthRequest).authSession ? userLabel((req as AuthRequest).authSession!) : 'anon';
    logger.info({ from: req.ip, user }, 'On-demand sync triggered');
    const stats = await syncFromRemote(config.SYNC_REMOTE);
    res.json({ ok: !stats.error, ...stats });
  } catch (err) {
    next(err);
  }
});

router.post('/batch-download', requireSyncAuth, async (req, res, next) => {
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

router.get('/download', requireSyncAuth, async (req, res, next) => {
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
    } else if (filename.endsWith('_console.log')) {
      const buf = await readConsoleLogFile(folder, filename);
      res.type('text/plain').send(buf);
    } else if (filename.endsWith('_content.html')) {
      const buf = await readContentFile(folder, filename);
      res.type('text/plain').send(buf);
    } else {
      const data = await readResponseFile(folder, filename);
      res.json(data);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
