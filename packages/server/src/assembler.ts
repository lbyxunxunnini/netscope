import type {
  CaptureRecord,
  NetScopeEnvelope,
  RequestFailedPayload,
  RequestFinishedPayload,
  RequestStartedPayload,
  SessionStatus,
} from '@netscope/shared';

export class EventAssembler {
  private records: CaptureRecord[] = [];
  private pendingStarted = new Map<string, RequestStartedPayload>();
  private waitingFinal = new Map<string, NetScopeEnvelope>();
  private chunkBuffers = new Map<string, { total: number; parts: string[]; updatedAt: number }>();
  private status: SessionStatus = {
    serviceStarted: true,
    vmAttached: false,
    sdkDetected: false,
    lastError: null,
  };

  constructor(private readonly maxMessages: number) {}

  getStatus(): SessionStatus {
    return { ...this.status };
  }

  setVmAttached(attached: boolean): void {
    this.status.vmAttached = attached;
  }

  clear(): void {
    this.records = [];
    this.pendingStarted.clear();
    this.waitingFinal.clear();
    this.chunkBuffers.clear();
  }

  list(): CaptureRecord[] {
    return this.records;
  }

  handleEvent(raw: NetScopeEnvelope): CaptureRecord | null {
    const event = this.tryAssembleChunks(raw);
    if (!event) return null;

    this.status.sdkDetected = true;

    if (event.eventType === 'device_ready') return null;
    if (!event.requestId) return null;

    if (event.eventType === 'request_started') {
      const payload = event.payload as unknown as RequestStartedPayload;
      this.pendingStarted.set(event.requestId, payload);
      const record = this.toStartedRecord(event.requestId, event.timestamp, payload, event.chunk?.total);
      this.upsertRecord(record);

      const waiting = this.waitingFinal.get(event.requestId);
      if (waiting) {
        this.waitingFinal.delete(event.requestId);
        return this.handleEvent(waiting);
      }
      return record;
    }

    if (event.eventType === 'request_finished') {
      return this.applyFinal(event, false);
    }

    if (event.eventType === 'request_failed') {
      return this.applyFinal(event, true);
    }

    return null;
  }

  cleanupTimeouts(now = Date.now()): string[] {
    const errors: string[] = [];
    for (const [k, v] of this.chunkBuffers) {
      if (now - v.updatedAt > 15000) {
        this.chunkBuffers.delete(k);
        errors.push(`chunk timeout: ${k}`);
      }
    }
    for (const [requestId] of this.waitingFinal) {
      if (!this.pendingStarted.has(requestId)) {
        this.waitingFinal.delete(requestId);
        errors.push(`out-of-order timeout: ${requestId}`);
      }
    }
    return errors;
  }

  private applyFinal(event: NetScopeEnvelope, failed: boolean): CaptureRecord | null {
    const requestId = event.requestId!;
    const started = this.pendingStarted.get(requestId);
    if (!started) {
      this.waitingFinal.set(requestId, event);
      return null;
    }

    const existing = this.records.find((r) => r.requestId === requestId);
    if (!existing) return null;

    if (failed) {
      const payload = event.payload as unknown as RequestFailedPayload;
      existing.state = 'failed';
      existing.statusCode = payload.statusCode ?? null;
      existing.durationMs = payload.durationMs;
      existing.responseHeaders = payload.responseHeaders || {};
      existing.responseBody = payload.responseBody ?? null;
      existing.responseBodySize = payload.responseBodySize ?? 0;
      existing.diagnostics.responseBodyTruncated = payload.responseBodyTruncated;
      existing.diagnostics.responseBodyBinary = payload.responseBodyBinary;
      existing.diagnostics.errors.push(payload.errorMessage);
      return existing;
    }

    const payload = event.payload as unknown as RequestFinishedPayload;
    existing.state = 'completed';
    existing.statusCode = payload.statusCode;
    existing.durationMs = payload.durationMs;
    existing.responseHeaders = payload.responseHeaders;
    existing.responseBody = payload.responseBody;
    existing.responseBodySize = payload.responseBodySize;
    existing.diagnostics.responseBodyTruncated = payload.responseBodyTruncated;
    existing.diagnostics.responseBodyBinary = payload.responseBodyBinary;
    return existing;
  }

  private toStartedRecord(
    requestId: string,
    timestamp: number,
    payload: RequestStartedPayload,
    chunkCount?: number,
  ): CaptureRecord {
    return {
      requestId,
      startedAt: timestamp,
      method: payload.method,
      url: payload.url,
      requestHeaders: payload.requestHeaders,
      requestBody: payload.requestBody,
      requestBodySize: payload.requestBodySize,
      statusCode: null,
      durationMs: null,
      responseHeaders: {},
      responseBody: null,
      responseBodySize: 0,
      state: 'pending',
      diagnostics: {
        requestId,
        chunked: Boolean(chunkCount && chunkCount > 1),
        chunkCount,
        requestBodyTruncated: payload.requestBodyTruncated,
        requestBodyBinary: payload.requestBodyBinary,
        errors: [],
      },
    };
  }

  private upsertRecord(record: CaptureRecord): void {
    const idx = this.records.findIndex((r) => r.requestId === record.requestId);
    if (idx >= 0) {
      this.records[idx] = record;
      return;
    }
    this.records.unshift(record);
    if (this.records.length > this.maxMessages) {
      this.records = this.records.slice(0, this.maxMessages);
    }
  }

  private tryAssembleChunks(event: NetScopeEnvelope): NetScopeEnvelope | null {
    if (!event.chunk) return event;
    const key = `${event.eventType}:${event.requestId ?? 'no-id'}:${event.chunk.chunkId}`;
    const existed = this.chunkBuffers.get(key) ?? {
      total: event.chunk.total,
      parts: Array.from({ length: event.chunk.total }, () => ''),
      updatedAt: Date.now(),
    };
    existed.parts[event.chunk.index] = JSON.stringify(event.payload);
    existed.updatedAt = Date.now();
    this.chunkBuffers.set(key, existed);

    if (existed.parts.some((p) => p === '')) return null;

    this.chunkBuffers.delete(key);
    const merged = existed.parts.map((p) => JSON.parse(p) as Record<string, unknown>).reduce(
      (acc, cur) => ({ ...acc, ...cur }),
      {},
    );
    return { ...event, payload: merged, chunk: undefined };
  }
}
