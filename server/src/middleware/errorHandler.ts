import type { ErrorRequestHandler } from 'express';
import { logger } from '../logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : 'Internal server error';
  if (status >= 500) {
    logger.error({ err, method: req.method, url: req.url }, 'Unhandled server error');
  }
  res.status(status).json({ error: message });
};
