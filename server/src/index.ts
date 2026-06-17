import express from 'express';
import { config } from './config.js';
import { loadConfig } from './services/configService.js';
import { logger } from './logger.js';
import { startScheduler, stopScheduler } from './services/schedulerService.js';
import { syncFromRemote } from './services/syncService.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';
import { compress } from './middleware/compress.js';
import { serveStatic } from './static.js';

const app = express();
app.use(compress);
app.use(express.json());

try {
  const cfg = loadConfig();
  logger.info({ configFile: config.CONFIG_FILE, services: cfg.services.length }, 'Config loaded');
} catch (err) {
  logger.error({ err, configFile: config.CONFIG_FILE }, 'Failed to load config');
  process.exit(1);
}

app.use('/health', healthRouter);
app.use('/api', apiRouter);

try {
  serveStatic(app);
} catch {
  // public dir not present before first client build
}

app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'BTP Status server started');
  startScheduler();
  if (config.SYNC_REMOTE) {
    syncFromRemote(config.SYNC_REMOTE).catch(err =>
      logger.error({ err }, 'Remote sync error'),
    );
  }
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  stopScheduler();
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
