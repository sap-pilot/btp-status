import { getService } from './configService.js';
import { evaluateCondition } from './conditionEvaluator.js';
import { saveResponse } from './responseStore.js';
import { getEvaluationMode } from './overrideService.js';
import { runBrowserIasLogin } from './browserCheckService.js';
import { getCity } from './geoService.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import type { ConditionResult, ResponseRecord, CheckResult, EndpointCheckResult } from '../types/index.js';

export type { CheckResult, EndpointCheckResult };

export async function checkService(serviceName: string): Promise<CheckResult> {
  const service = getService(serviceName);
  if (!service) {
    throw Object.assign(new Error(`Service '${serviceName}' not found`), { status: 404 });
  }

  const evalMode = getEvaluationMode(serviceName);
  const details: EndpointCheckResult[] = [];

  for (let i = 0; i < service.endpoints.length; i++) {
    const ep = service.endpoints[i];
    const epName = ep.name ?? `Endpoint ${i}`;

    // ── Dummy endpoint — skip actual check ─────────────────────────────────
    if (ep.url === '/dummy') {
      const conditions: ConditionResult[] = [
        { condition: '[DUMMY] endpoint skipped', passed: true, actual: 'dummy', expected: 'dummy' },
      ];
      if (evalMode === 'alwayserror') {
        conditions.push({ condition: '[EVAL_MODE] == condition', passed: false, actual: 'alwayserror', expected: 'condition' });
      }
      const overallStatus: 200 | 203 | 500 | 503 =
        evalMode === 'alwaysok' ? 203 : evalMode === 'alwayserror' ? 503 : 200;
      const method = ep.mode === 'browser-ias-login' ? 'BROWSER' : (ep.method ?? 'GET');
      const record: ResponseRecord = {
        request: { url: '/dummy', method, headers: {}, body: null },
        response: { status: 200, headers: {}, body: 'Dummy endpoint — check skipped' },
        timestamp: new Date().toISOString(),
        responseTime: 0,
        endpointIndex: i,
        endpointName: epName,
        conditions,
        overallStatus,
        city: getCity(),
      };
      await saveResponse(serviceName, record);
      details.push({
        index: i, name: epName, conditions,
        passed: evalMode !== 'alwayserror',
        request: record.request,
        response: record.response,
        responseTime: 0,
      });
      continue;
    }

    // ── Browser-based IAS login check ──────────────────────────────────────
    if (ep.mode === 'browser-ias-login') {
      const result = await runBrowserIasLogin(ep, serviceName);

      const conditions: ConditionResult[] = [{
        condition: `[SELECTOR] found ${ep.waitForSelector ?? '(waitForSelector not set)'}`,
        passed: result.passed,
        actual: result.message,
        expected: ep.waitForSelector ?? '(not set)',
      }];

      if (evalMode === 'alwayserror') {
        conditions.push({
          condition: '[EVAL_MODE] == condition',
          passed: false,
          actual: 'alwayserror',
          expected: 'condition',
        });
      }

      const conditionsPassed = conditions.every(c => c.passed);
      const overallStatus: 200 | 203 | 500 | 503 =
        evalMode === 'alwaysok' ? 203 :
        evalMode === 'alwayserror' ? 503 :
        (conditionsPassed ? 200 : 500);

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
        response: { status: overallStatus, headers: {}, body: result.message },
        timestamp: new Date().toISOString(),
        responseTime: result.responseTime,
        endpointIndex: i,
        endpointName: epName,
        conditions,
        overallStatus,
        city: getCity(),
      };

      const jsonFile = await saveResponse(serviceName, record, result.screenshot);
      const screenshotFile = jsonFile.replace(/\.json$/, '.png');
      const hasScreenshot = result.screenshot.length > 0;

      details.push({
        index: i,
        name: epName,
        conditions,
        passed: conditionsPassed,
        request: { url: ep.url, method: 'BROWSER', headers: {}, body: null },
        response: { status: overallStatus, headers: {}, body: result.message },
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
    const timeoutMs = ep.timeout ?? config.REQUEST_TIMEOUT_MS;

    logger.debug(
      { service: serviceName, endpoint: epName, method, url: ep.url, timeoutMs },
      'Sending request',
    );

    const start = Date.now();
    let respStatus = 0;
    let respHeaders: Record<string, string> = {};
    let respBody = '';
    let responseTime = 0;
    let fetchError: string | null = null;
    let didTimeout = false;

    try {
      const resp = await fetch(ep.url, {
        method,
        headers: reqHeaders,
        body: ep.body ?? undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
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
      didTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
      fetchError = err instanceof Error ? err.message : String(err);
      respBody = didTimeout ? `Request timed out after ${timeoutMs}ms` : fetchError;

      if (didTimeout) {
        logger.warn(
          { service: serviceName, endpoint: epName, url: ep.url, timeoutMs, responseTime },
          'Request timed out',
        );
      } else {
        logger.error(
          { service: serviceName, endpoint: epName, url: ep.url, responseTime, err },
          'Request failed with network error',
        );
      }
    }

    const ctx = { status: respStatus, responseTime, body: respBody, headers: respHeaders };
    const conditions: ConditionResult[] = (ep.conditions ?? []).map(c => evaluateCondition(c, ctx));

    if (didTimeout) {
      conditions.push({
        condition: `[TIMEOUT] response within ${timeoutMs}ms`,
        passed: false,
        actual: `${responseTime}ms`,
        expected: `< ${timeoutMs}ms`,
      });
    }

    if (evalMode === 'alwayserror') {
      conditions.push({
        condition: '[EVAL_MODE] == condition',
        passed: false,
        actual: 'alwayserror',
        expected: 'condition',
      });
    }

    const conditionsPassed = fetchError === null && conditions.every(c => c.passed);
    const overallStatus: 200 | 203 | 500 | 503 | 504 =
      evalMode === 'alwaysok' ? 203 :
      evalMode === 'alwayserror' ? 503 :
      conditionsPassed ? 200 :
      didTimeout ? 504 : 500;

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
      overallStatus,
      city: getCity(),
    };

    await saveResponse(serviceName, record);
    details.push({
      index: i,
      name: epName,
      conditions,
      passed: conditionsPassed,
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
    timedOut: !allPassed && details.some(d =>
      d.conditions.some(c => c.condition.startsWith('[TIMEOUT]')),
    ),
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
