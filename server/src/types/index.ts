export interface EndpointConfig {
  name?: string;
  url: string;
  method?: string;
  headers?: Record<string, string> | Array<{ name: string; value: string }>;
  body?: string | null;
  conditions?: string[];
  mode?: 'browser-ias-login';
  username?: string;
  password?: string;
  waitForSelector?: string;
  timeout?: number;
}

export interface ServiceConfig {
  group: string;
  name: string;
  enabled: boolean;
  interval?: number;
  homepage?: string;
  landscapes?: string[];
  endpoints: EndpointConfig[];
}

export interface LandscapeConfig {
  name: string;
  diagram: string;
}

export interface SiteConfig {
  name: string;
  url: string;
}

export interface AppConfig {
  services: ServiceConfig[];
  landscapes?: LandscapeConfig[];
  variables?: Record<string, string>;
  sites?: SiteConfig[];
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
  overallStatus: 200 | 203 | 500 | 503 | 504;
  city?: string;
  screenshotFile?: string;
}

export interface HistoryFile {
  filename: string;
  timestamp: number;
  /** -1 for new-format files (use endpointSlug instead) */
  endpointIndex: number;
  /** Sanitized endpoint name from filename; present in new-format files only */
  endpointSlug?: string;
  /** Geo-resolved city at time of check; present in new-format files only */
  city?: string;
  responseTime: number;
  httpStatus: number;
  overallStatus: 200 | 203 | 500 | 503 | 504;
  screenshotFile?: string;
}

export interface ServiceWithHistory {
  group: string;
  name: string;
  enabled: boolean;
  endpoints: EndpointConfig[];
  history: HistoryFile[];
}

export interface EndpointCheckResult {
  index: number;
  name: string;
  conditions: ConditionResult[];
  passed: boolean;
  request: { url: string; method: string; headers: Record<string, string>; body: string | null };
  response: { status: number; headers: Record<string, string>; body: string };
  responseTime: number;
  screenshotUrl?: string;
}

export interface CheckResult {
  success: boolean;
  timedOut: boolean;
  message: string;
  details: EndpointCheckResult[];
}

export type EvaluationMode = 'condition' | 'alwaysok' | 'alwayserror';
