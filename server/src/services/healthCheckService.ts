import { getService } from './configService.js';
import { evaluateCondition } from './conditionEvaluator.js';
import { saveResponse } from './responseStore.js';
import { getOverride } from './overrideService.js';
import { runBrowserIasLogin } from './browserCheckService.js';
import { logger } from '../logger.js';
import type { ConditionResult, ResponseRecord, CheckResult, EndpointCheckResult } from '../types/index.js';

export type { CheckResult, EndpointCheckResult };

export async function checkService(serviceName: string): Promise<CheckResult> {
  const service = getService(serviceName);
  if (!service) {
    throw Object.assign(new Error(`Service '${serviceName}' not found`), { status: 404 });
  }

  const overrideMode = getOverride(serviceName);
  const details: EndpointCheckResult[] = [];

  for (let i = 0; i < service.endpoints.length; i++) {
    const ep = service.endpoints[i];
    const epName = ep.name ?? `Endpoint ${i}`;

    // ── Browser-based IAS login check ──────────────────────────────────────
    if (ep.mode === 'browser-ias-login') {
      const result = await runBrowserIasLogin(ep, serviceName);

      const conditions: ConditionResult[] = [{
        condition: `[URL] matches ${ep.waitForUrl ?? '(waitForUrl not set)'}`,
        passed: result.passed,
        actual: result.message,
        expected: ep.waitForUrl ?? '(not set)',
      }];

      if (overrideMode !== 'enabled') {
        conditions.push({
          condition: '[SERVICE_MODE] == enabled',
          passed: false,
          actual: overrideMode,
          expected: 'enabled',
        });
      }

      const passed = conditions.every(c => c.passed);

      for (const c of conditions) {
        if (!c.passed) {
          logger.warn(
            { service: serviceName, endpoint: epName, condition: c.condition, actual: c.actual },
            'Condition failed',
          );
        }
      }

      const record: ResponseRecord = {
        request: { url: ep.url, method: 'BROWSER', headers: {}, body: null },
        response: { status: passed ? 200 : 500, headers: {}, body: result.message },
        timestamp: new Date().toISOString(),
        responseTime: result.responseTime,
        endpointIndex: i,
        endpointName: epName,
        conditions,
        overallStatus: passed ? 200 : 500,
      };

      const jsonFile = await saveResponse(serviceName, record, result.screenshot);
      const screenshotFile = jsonFile.replace(/\.json$/, '.png');
      const hasScreenshot = result.screenshot.length > 0;

      details.push({
        index: i,
        name: epName,
        conditions,
        passed,
        request: { url: ep.url, method: 'BROWSER', headers: {}, body: null },
        response: { status: passed ? 200 : 500, headers: {}, body: result.message },
        responseTime: result.responseTime,
        screenshotUrl: hasScreenshot
          ? `/api/download?path=${encodeURIComponent(serviceName)}/${encodeURIComponent(screenshotFile)}`
          : undefined,
      });
      continue;
    }

    // ── Standard HTTP check ─────────────────────────────────────────────────
    const reqHeaders = normalizeHeaders(ep.headers);
    const method = ep.method ?? 'GET';

    logger.debug(
      { service: serviceName, endpoint: epName, method, url: ep.url },
      'Sending request',
    );

    const start = Date.now();
    let respStatus = 0;
    let respHeaders: Record<string, string> = {};
    let respBody = '';
    let responseTime = 0;
    let fetchError: string | null = null;

    try {
      const resp = await fetch(ep.url, {
        method,
        headers: reqHeaders,
        body: ep.body ?? undefined,
        redirect: 'manual',
      });
      responseTime = Date.now() - start;
      respStatus = resp.status;
      resp.headers.forEach((v, k) => { respHeaders[k] = v; });
      respBody = await resp.text();

      logger.debug(
        {
          service: serviceName,
          endpoint: epName,
          status: respStatus,
          responseTime,
          bodyPreview: respBody.slice(0, 300),
        },
        'Response received',
      );
    } catch (err) {
      responseTime = Date.now() - start;
      fetchError = err instanceof Error ? err.message : String(err);
      respBody = fetchError;

      logger.error(
        { service: serviceName, endpoint: epName, url: ep.url, responseTime, err },
        'Request failed with network error',
      );
    }

    const ctx = { status: respStatus, responseTime, body: respBody, headers: respHeaders };
    const conditions: ConditionResult[] = (ep.conditions ?? []).map(c => evaluateCondition(c, ctx));

    // Inject a virtual failing condition so test results and saved records reflect the override
    if (overrideMode !== 'enabled') {
      conditions.push({
        condition: '[SERVICE_MODE] == enabled',
        passed: false,
        actual: overrideMode,
        expected: 'enabled',
      });
    }

    const passed = fetchError === null && conditions.every(c => c.passed);

    for (const c of conditions) {
      if (!c.passed) {
        logger.warn(
          {
            service: serviceName,
            endpoint: epName,
            condition: c.condition,
            actual: c.actual,
            expected: c.expected,
          },
          'Condition failed',
        );
      }
    }

    const record: ResponseRecord = {
      request: { url: ep.url, method, headers: reqHeaders, body: ep.body ?? null },
      response: { status: respStatus, headers: respHeaders, body: respBody },
      timestamp: new Date().toISOString(),
      responseTime,
      endpointIndex: i,
      endpointName: epName,
      conditions,
      overallStatus: passed ? 200 : 500,
    };

    await saveResponse(serviceName, record);
    details.push({
      index: i,
      name: epName,
      conditions,
      passed,
      request: { url: ep.url, method, headers: reqHeaders, body: ep.body ?? null },
      response: { status: respStatus, headers: respHeaders, body: respBody },
      responseTime,
    });
  }

  const allPassed = details.every(d => d.passed);
  const failMessages = details.flatMap(d =>
    d.conditions
      .filter(c => !c.passed)
      .map(c => `[${d.name}] ${c.condition}: expected ${c.expected}, got ${c.actual}`),
  );

  return {
    success: allPassed,
    message: allPassed ? 'OK' : failMessages.join('\n'),
    details,
  };
}

function normalizeHeaders(
  headers: Record<string, string> | Array<{ name: string; value: string }> | null | undefined,
): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(h => [h.name, h.value]));
  }
  return headers;
}
