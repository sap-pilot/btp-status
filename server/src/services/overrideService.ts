import type { ServiceMode } from '../types/index.js';

const overrides = new Map<string, ServiceMode>();

export function getOverride(name: string): ServiceMode {
  return overrides.get(name) ?? 'enabled';
}

export function setOverride(name: string, mode: ServiceMode): void {
  if (mode === 'enabled') {
    overrides.delete(name);
  } else {
    overrides.set(name, mode);
  }
}
