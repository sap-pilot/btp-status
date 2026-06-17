import { readFileSync } from 'node:fs';
import type { AppConfig, ServiceConfig } from '../types/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

let appConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (process.env.CONFIG_JSON) {
    logger.info('Loading config from CONFIG_JSON environment variable');
    appConfig = JSON.parse(process.env.CONFIG_JSON) as AppConfig;
    return appConfig;
  }
  try {
    logger.info({ path: config.CONFIG_FILE }, 'Loading config from file');
    const raw = readFileSync(config.CONFIG_FILE, 'utf-8');
    appConfig = JSON.parse(raw) as AppConfig;
    return appConfig;
  } catch (err: unknown) {
    const isNotFound =
      typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (isNotFound) {
      logger.warn(
        { path: config.CONFIG_FILE },
        'Config file not found — starting with no services. Set CONFIG_JSON env var or provide the config file and restart.',
      );
    } else {
      logger.warn({ err, path: config.CONFIG_FILE }, 'Failed to parse config — starting with no services');
    }
    appConfig = { services: [] };
    return appConfig;
  }
}

export function getConfig(): AppConfig {
  if (!appConfig) loadConfig();
  return appConfig!;
}

export function getService(name: string): ServiceConfig | undefined {
  return getConfig().services.find(s => s.name === name);
}

export function getAllServices(): ServiceConfig[] {
  return getConfig().services.filter(s => s.enabled !== false);
}
