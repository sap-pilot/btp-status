import { Router } from 'express';
import { checkService } from '../services/healthCheckService.js';
import { getOverride } from '../services/overrideService.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/:name', async (req, res, next) => {
  const { name } = req.params;
  logger.info({ service: name, from: req.ip }, 'Health check request received');

  const mode = getOverride(name);

  if (mode === 'disabled') {
    logger.info({ service: name, mode }, 'Health check skipped — service disabled');
    res.status(500).type('text/plain').send('service is marked as disabled');
    return;
  }

  try {
    const result = await checkService(name);
    if (mode === 'unavailable') {
      logger.warn({ service: name }, 'Health check forced fail — marked as unavailable');
      res.status(500).type('text/plain').send('service has been marked as unavailable');
    } else if (mode === 'alwaysok') {
      logger.info({ service: name, actualSuccess: result.success }, 'Health check forced OK — marked as alwaysok');
      res.status(200).type('text/plain').send('OK');
    } else if (result.success) {
      logger.info({ service: name }, 'Health check passed');
      res.status(200).type('text/plain').send('OK');
    } else {
      logger.warn({ service: name, message: result.message }, 'Health check failed');
      res.status(500).type('text/plain').send(result.message);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
