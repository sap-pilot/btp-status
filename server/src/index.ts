import express from 'express';
import { config } from './config.js';
import { loadConfig } from './services/configService.js';
import healthRouter from './routes/health.js';
import apiRouter from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';
import { serveStatic } from './static.js';

const app = express();
app.use(express.json());

try {
  loadConfig();
  console.log(`Config loaded from ${config.CONFIG_FILE}`);
} catch (err) {
  console.error(`Failed to load config from ${config.CONFIG_FILE}:`, err);
  process.exit(1);
}

app.use('/health', healthRouter);
app.use('/api', apiRouter);

try {
  serveStatic(app);
} catch {
  // public dir not present in dev mode
}

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`BTP Status running on port ${config.PORT}`);
});
