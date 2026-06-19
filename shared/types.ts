export interface EndpointConfig {
  name?: string;
  url: string;
  // Standard HTTP fields (not required for browser-ias-login mode)
  method?: string;
  headers?: Record<string, string> | Array<{ name: string; value: string }>;
  body?: string | null;
  conditions?: string[];
  // Browser-based IAS login check
  mode?: 'browser-ias-login';
  username?: string;
  password?: string;
  waitForUrl?: string;
  timeout?: number;
}

export interface ServiceConfig {
  group: string;
  name: string;
  enabled: boolean;
  interval?: number;
  homepage?: string;
  endpoints: EndpointConfig[];
}

export interface AppConfig {
  services: ServiceConfig[];
}

export interface ConditionResult {
  condition: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export interface ResponseRecord {
  request: { url: string; method: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers: Record<string, string>; body: string };
  timestamp: string;
  responseTime: number;
  endpointIndex: number;
  endpointName: string;
  conditions: ConditionResult[];
  overallStatus: 200 | 203 | 500 | 503;
  screenshotFile?: string;
}

export interface HistoryFile {
  filename: string;
  timestamp: number;
  endpointIndex: number;
  responseTime: number;
  httpStatus: number;
  overallStatus: 200 | 203 | 500 | 503;
  screenshotFile?: string;
}

export interface ServiceWithHistory extends ServiceConfig {
  history: HistoryFile[];
}

/** Evaluation mode — controls what /health and Run Test return regardless of actual condition results */
export type EvaluationMode = 'condition' | 'alwaysok' | 'alwayserror';
