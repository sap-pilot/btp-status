import { readFileSync } from 'node:fs';
import type { AppConfig, ServiceConfig } from '../types/index.js';
import { config } from '../config.js';

let appConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  const raw = readFileSync(config.CONFIG_FILE, 'utf-8');
  appConfig = JSON.parse(raw) as AppConfig;
  return appConfig;
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
