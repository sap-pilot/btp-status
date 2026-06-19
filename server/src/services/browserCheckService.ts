import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '../logger.js';
import type { EndpointConfig } from '../types/index.js';

const SYSTEM_CHROME = '/usr/bin/google-chrome-stable';

export interface BrowserCheckResult {
  passed: boolean;
  message: string;
  responseTime: number;
  screenshot: Buffer;
}

export async function runBrowserIasLogin(
  ep: EndpointConfig,
  serviceName: string,
): Promise<BrowserCheckResult> {
  const timeout = ep.timeout ?? 30_000;
  const start = Date.now();
  let passed = false;
  let message = '';
  let browser: Browser | undefined;
  let page: Page | undefined;

  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    logger.debug({ service: serviceName, endpoint: ep.name, url: ep.url }, 'Browser: navigating');
    await page.goto(ep.url, { timeout });

    await page.waitForSelector('#j_username', { timeout });
    await page.fill('#j_username', ep.username ?? '');
    logger.debug({ service: serviceName, endpoint: ep.name }, 'Browser: filled username');

    await page.click('#logOnFormSubmit');

    await page.waitForSelector('#j_password', { timeout });
    await page.fill('#j_password', ep.password ?? '');
    logger.debug({ service: serviceName, endpoint: ep.name }, 'Browser: filled password');

    await page.click('#logOnFormSubmit');

    const selector = ep.waitForSelector ?? '';
    await page.waitForSelector(selector, { timeout });

    passed = true;
    message = `Login succeeded — element "${selector}" found`;
    logger.info({ service: serviceName, endpoint: ep.name, finalUrl: page.url() }, 'Browser check passed');
  } catch (err) {
    message = err instanceof Error ? err.message : String(err);
    logger.warn({ service: serviceName, endpoint: ep.name, err }, 'Browser check failed');
  }

  let screenshot: Buffer = Buffer.alloc(0);
  if (page) {
    try {
      screenshot = await page.screenshot({ fullPage: false });
    } catch (err) {
      logger.debug({ service: serviceName, err }, 'Browser screenshot failed');
    }
  }

  try { await browser?.close(); } catch { /* ignore */ }

  return { passed, message, responseTime: Date.now() - start, screenshot };
}
