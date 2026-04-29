import type { NetScopeEnvelope } from './types.js';

export function isNetScopeEnvelope(data: unknown): data is NetScopeEnvelope {
  if (!data || typeof data !== 'object') return false;
  const item = data as Record<string, unknown>;
  return (
    item.protocolVersion === '1.0' &&
    typeof item.sdkVersion === 'string' &&
    typeof item.eventType === 'string' &&
    typeof item.timestamp === 'number' &&
    typeof item.payload === 'object' &&
    item.payload !== null
  );
}
