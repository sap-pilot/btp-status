export interface EndpointConfig {
  name?: string;
  url: string;
  method: string;
  headers: Record<string, string> | Array<{ name: string; value: string }>;
  body: string | null;
  conditions: string[];
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
  overallStatus: 200 | 500;
}

export interface HistoryFile {
  filename: string;
  timestamp: number;
  endpointIndex: number;
  responseTime: number;
  httpStatus: number;
  overallStatus: 200 | 500;
}

export interface ServiceWithHistory extends ServiceConfig {
  history: HistoryFile[];
}

export type ServiceMode = 'enabled' | 'unavailable' | 'disabled';
