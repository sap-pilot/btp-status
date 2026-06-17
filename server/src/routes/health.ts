import { Router } from 'express';
import { checkService } from '../services/healthCheckService.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/:name', async (req, res, next) => {
  const { name } = req.params;
  logger.info({ service: name, from: req.ip }, 'Health check request received');
  try {
    const result = await checkService(name);
    if (result.success) {
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
