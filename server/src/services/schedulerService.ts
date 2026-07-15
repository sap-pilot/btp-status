import { getAllServices } from './configService.js';
import { checkService } from './healthCheckService.js';
import { logger } from '../logger.js';

const timers = new Map<string, ReturnType<typeof setInterval>>();
const running = new Set<string>();

export function startScheduler(): void {
  const all = getAllServices();
  const scheduled = all.filter(s => (s.interval ?? 0) > 0);
  const manual = all.filter(s => (s.interval ?? 0) === 0);
  for (const svc of scheduled) {
    register(svc.name, svc.interval!);
  }
  if (scheduled.length > 0) {
    logger.info(
      { count: scheduled.length, services: scheduled.map(s => `${s.name}(${s.interval}s)`) },
      'Scheduler started',
    );
  }
  if (manual.length > 0) {
    logger.info(
      { count: manual.length, services: manual.map(s => s.name) },
      'Services with no interval — manual trigger only (Run Test / /health/:name)',
    );
  }
}

function register(name: string, intervalSecs: number): void {
  const timer = setInterval(() => { void tick(name, intervalSecs); }, intervalSecs * 1000);
  timer.unref(); // don't block process exit
  timers.set(name, timer);
  logger.debug({ service: name, intervalSecs }, 'Auto-check registered');
}

async function tick(name: string, intervalSecs: number): Promise<void> {
  if (running.has(name)) {
    logger.warn({ service: name }, 'Auto-check skipped: previous run still in progress');
    return;
  }
  running.add(name);
  try {
    logger.debug({ service: name }, 'Auto-check triggered');
    await checkService(name);
  } catch (err) {
    logger.error({ service: name, err }, 'Auto-check error; will retry at next interval');
    // setInterval fires regardless of errors; re-register only if timer was somehow lost
    if (!timers.has(name)) {
      logger.warn({ service: name }, 'Timer missing after error, re-registering');
      register(name, intervalSecs);
    }
  } finally {
    running.delete(name);
  }
}

export function rescheduleService(name: string, intervalSecs: number): void {
  const existing = timers.get(name);
  if (existing) {
    clearInterval(existing);
    timers.delete(name);
  }
  if (intervalSecs > 0) {
    register(name, intervalSecs);
    logger.info({ service: name, intervalSecs }, 'Service rescheduled');
  } else {
    logger.info({ service: name }, 'Service auto-run disabled');
  }
}

export function stopScheduler(): void {
  for (const [name, timer] of timers) {
    clearInterval(timer);
    logger.debug({ service: name }, 'Auto-check timer cleared');
  }
  timers.clear();
  running.clear();
  logger.info('Scheduler stopped');
}
