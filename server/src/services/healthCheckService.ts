import { getService } from './configService.js';
import { evaluateCondition } from './conditionEvaluator.js';
import { saveResponse } from './responseStore.js';
import type { ConditionResult, ResponseRecord } from '../types/index.js';

export interface HealthCheckResult {
  success: boolean;
  message: string;
  details: EndpointResult[];
}

interface EndpointResult {
  index: number;
  name: string;
  conditions: ConditionResult[];
  passed: boolean;
}

export async function checkService(serviceName: string): Promise<HealthCheckResult> {
  const service = getService(serviceName);
  if (!service) {
    throw Object.assign(new Error(`Service '${serviceName}' not found`), { status: 404 });
  }

  const details: EndpointResult[] = [];

  for (let i = 0; i < service.endpoints.length; i++) {
    const ep = service.endpoints[i];
    const reqHeaders = normalizeHeaders(ep.headers);

    const start = Date.now();
    let respStatus = 0;
    let respHeaders: Record<string, string> = {};
    let respBody = '';
    let responseTime = 0;
    let fetchError: string | null = null;

    try {
      const resp = await fetch(ep.url, {
        method: ep.method ?? 'GET',
        headers: reqHeaders,
        body: ep.body ?? undefined,
        redirect: 'manual',
      });
      responseTime = Date.now() - start;
      respStatus = resp.status;
      resp.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });
      respBody = await resp.text();
    } catch (err) {
      responseTime = Date.now() - start;
      fetchError = String(err);
      respBody = fetchError;
    }

    const ctx = { status: respStatus, responseTime, body: respBody, headers: respHeaders };
    const conditions: ConditionResult[] = ep.conditions.map(c => evaluateCondition(c, ctx));
    const passed = fetchError === null && conditions.every(c => c.passed);

    const record: ResponseRecord = {
      request: { url: ep.url, method: ep.method ?? 'GET', headers: reqHeaders, body: ep.body },
      response: { status: respStatus, headers: respHeaders, body: respBody },
      timestamp: new Date().toISOString(),
      responseTime,
      endpointIndex: i,
      endpointName: ep.name ?? `Endpoint ${i}`,
      conditions,
      overallStatus: passed ? 200 : 500,
    };

    await saveResponse(serviceName, record);
    details.push({ index: i, name: ep.name ?? `Endpoint ${i}`, conditions, passed });
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
