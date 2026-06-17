import { Router } from 'express';
import { checkService } from '../services/healthCheckService.js';

const router = Router();

router.get('/:name', async (req, res, next) => {
  try {
    const result = await checkService(req.params.name);
    if (result.success) {
      res.status(200).type('text/plain').send('OK');
    } else {
      res.status(500).type('text/plain').send(result.message);
    }
  } catch (err) {
    next(err);
  }
});

export default router;
