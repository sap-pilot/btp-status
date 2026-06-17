import { Router } from 'express';
import { getAllServices } from '../services/configService.js';
import { listResponseFiles, readResponseFile } from '../services/responseStore.js';
import { checkService } from '../services/healthCheckService.js';
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

export default router;
