import { Router } from 'express';
import { checkService } from '../services/healthCheckService.js';
import { getEvaluationMode } from '../services/overrideService.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/:name', async (req, res, next) => {
  const { name } = req.params;
  const requestHost =
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ??
    (req.headers['host'] as string | undefined) ?? '';
  logger.info({ service: name, from: req.ip }, 'Health check request received');

  const evalMode = getEvaluationMode(name);

  try {
    const result = await checkService(name, requestHost);
    if (evalMode === 'alwaysok') {
      logger.info({ service: name, actualSuccess: result.success }, 'Health check forced OK — eval mode: alwaysok');
      res.status(200).type('text/plain').send('OK');
    } else if (evalMode === 'alwayserror') {
      logger.warn({ service: name }, 'Health check forced fail — eval mode: alwayserror');
      res.status(500).type('text/plain').send(result.message || 'service evaluation mode: always error');
    } else if (result.success) {
      logger.info({ service: name }, 'Health check passed');
      res.status(200).type('text/plain').send('OK');
    } else if (result.timedOut) {
      logger.warn({ service: name, message: result.message }, 'Health check timed out');
      res.status(504).type('text/plain').send(result.message);
    } else {
      logger.warn({ service: name, message: result.message }, 'Health check failed');
      res.status(500).type('text/plain').send(result.message);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
