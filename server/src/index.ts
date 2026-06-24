import express from 'express';
import { config } from './config.js';
import { loadConfig } from './services/configService.js';
import { logger } from './logger.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';
import { syncFromRemote, startSyncScheduler, stopSyncScheduler } from './services/syncService.js';
import { startHousekeepingScheduler, stopHousekeepingScheduler } from './services/housekeepingService.js';
import { initGeo } from './services/geoService.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/api.js';
import authRouter from './routes/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { compress } from './middleware/compress.js';
import { serveStatic } from './static.js';

const app = express();
app.use(compress);
app.use(express.json());

const cfg = loadConfig();
logger.info({ configFile: config.CONFIG_FILE, services: cfg.services.length }, 'Config initialized');

app.use('/health', healthRouter);
app.use(authRouter);
// API responses must never be cached — prevents 304s on repeated /api/download requests
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', apiRouter);

try {
  serveStatic(app);
} catch {
  // public dir not present before first client build
}

app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'BTP Status server started');
  void initGeo();
  startScheduler();
  startHousekeepingScheduler();
  if (config.SYNC_REMOTE) {
    syncFromRemote(config.SYNC_REMOTE).catch(err =>
      logger.error({ err }, 'Remote sync error'),
    );
    startSyncScheduler(config.SYNC_REMOTE);
  }
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  stopScheduler();
  stopSyncScheduler();
  stopHousekeepingScheduler();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
