import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getService } from '../services/configService.js';
import { listResponseFiles } from '../services/responseStore.js';
import { getEvaluationMode } from '../services/overrideService.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

function extractRegion(host: string): string | null {
  return host.match(/cfapps\.([^.]+)\.hana/)?.[1] ?? null;
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'endpoint';
}

/**
 * Returns the latest saved check result for region-matching endpoints.
 * Does NOT run a live probe — reads the most recent response file per endpoint.
 * Designed for Traffic Manager probes (called every 3-5 s, must respond in < 10 s).
 *
 * Responses:
 *   200 "OK"            — all recent checks passed (status 200/203)
 *   200 "Partially OK"  — at least one endpoint had status 400 (initial fail, retry succeeded)
 *   500 "service down"  — at least one endpoint has status 500/503/504 as its latest result
 */
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  const name = req.params['name'] as string;
  const requestHost =
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ??
    (req.headers['host'] as string | undefined) ?? '';

  logger.info({ service: name, from: req.ip ?? 'unknown' }, 'Health check request received');

  const evalMode = getEvaluationMode(name);

  if (evalMode === 'alwaysok') {
    logger.info({ service: name }, 'Health check forced OK — eval mode: alwaysok');
    res.status(200).type('text/plain').send('OK');
    return;
  }
  if (evalMode === 'alwayserror') {
    logger.warn({ service: name }, 'Health check forced fail — eval mode: alwayserror');
    res.status(500).type('text/plain').send('service evaluation mode: always error');
    return;
  }

  try {
    const service = getService(name);
    if (!service) {
      res.status(404).type('text/plain').send(`Service '${name}' not found`);
      return;
    }

    const hostRegion = extractRegion(requestHost);

    // Endpoints relevant to this region: include if endpoint has no region, request has no
    // region (non-CF hostname), or regions match.
    const relevantSlugs = new Set(
      service.endpoints
        .filter(ep => !ep.region || !hostRegion || ep.region === hostRegion)
        .map(ep => (ep.name ? slugify(ep.name) : null))
        .filter((s): s is string => s !== null),
    );

    if (relevantSlugs.size === 0) {
      logger.info({ service: name, hostRegion }, 'Health check: no endpoints match region — returning OK');
      res.status(200).type('text/plain').send('OK');
      return;
    }

    // Load files for the full retention window; files are returned newest-first.
    const lookbackHours = Math.max(24, config.MAX_RESPONSE_STORAGE_DAYS * 24);
    const files = await listResponseFiles(name, { hours: lookbackHours });

    // Pick the most recent file for each relevant endpoint slug.
    const latestBySlug = new Map<string, (typeof files)[0]>();
    for (const f of files) {
      if (!f.endpointSlug || !relevantSlugs.has(f.endpointSlug)) continue;
      if (!latestBySlug.has(f.endpointSlug)) latestBySlug.set(f.endpointSlug, f);
      if (latestBySlug.size === relevantSlugs.size) break; // found latest for every endpoint
    }

    if (latestBySlug.size === 0) {
      logger.info({ service: name }, 'Health check: no recent data — returning OK');
      res.status(200).type('text/plain').send('OK (no recent data)');
      return;
    }

    const failedSlugs = [...latestBySlug.entries()]
      .filter(([, f]) => f.overallStatus === 500 || f.overallStatus === 503 || f.overallStatus === 504)
      .map(([slug]) => slug);

    const statuses = [...latestBySlug.values()].map(f => f.overallStatus);
    const anyPartial = statuses.some(s => s === 400);

    if (failedSlugs.length > 0) {
      logger.warn({ service: name, failedSlugs }, 'Health check failed (latest file)');
      res.status(500).type('text/plain').send(`service down: ${failedSlugs.join(', ')}`);
    } else if (anyPartial) {
      logger.info({ service: name }, 'Health check: partial failures, retry succeeded (latest file)');
      res.status(200).type('text/plain').send('Partially OK');
    } else {
      logger.info({ service: name }, 'Health check passed (latest file)');
      res.status(200).type('text/plain').send('OK');
    }
  } catch (err) {
    next(err);
  }
});

export default router;
