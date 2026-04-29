export type NetScopeEventType =
  | 'device_ready'
  | 'request_started'
  | 'request_finished'
  | 'request_failed';

export interface ChunkMeta {
  chunkId: string;
  index: number;
  total: number;
}

export interface NetScopeEnvelope {
  protocolVersion: '1.0';
  sdkVersion: string;
  eventType: NetScopeEventType;
  requestId?: string;
  timestamp: number;
  chunk?: ChunkMeta;
  payload: Record<string, unknown>;
}

export interface RequestStartedPayload {
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBodySize: number;
  requestBodyTruncated: boolean;
  requestBodyBinary: boolean;
}

export interface RequestFinishedPayload {
  statusCode: number;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseBodySize: number;
  responseBodyTruncated: boolean;
  responseBodyBinary: boolean;
  durationMs: number;
}

export interface RequestFailedPayload {
  errorMessage: string;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  responseBodySize?: number;
  responseBodyTruncated?: boolean;
  responseBodyBinary?: boolean;
  durationMs: number;
}

export interface DeviceReadyPayload {
  platform?: string;
  appName?: string;
  appVersion?: string;
}

export type RequestState = 'pending' | 'completed' | 'failed' | 'incomplete';

export interface CaptureDiagnostics {
  requestId: string;
  chunked: boolean;
  chunkCount?: number;
  requestBodyTruncated?: boolean;
  responseBodyTruncated?: boolean;
  requestBodyBinary?: boolean;
  responseBodyBinary?: boolean;
  errors: string[];
}

export interface CaptureRecord {
  requestId: string;
  startedAt: number;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestBodySize: number;
  statusCode: number | null;
  durationMs: number | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseBodySize: number;
  state: RequestState;
  diagnostics: CaptureDiagnostics;
}

export interface SessionStatus {
  serviceStarted: boolean;
  vmAttached: boolean;
  sdkDetected: boolean;
  lastError: string | null;
}

export interface CliConfig {
  maxMessages: number;
  bodyLimit: number;
}

export type WebSocketMessage =
  | { type: 'connection_state'; payload: SessionStatus }
  | { type: 'request_started'; payload: CaptureRecord }
  | { type: 'request_updated'; payload: CaptureRecord }
  | { type: 'requests_cleared' };
