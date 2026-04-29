import WebSocket from 'ws';
import { isNetScopeEnvelope, type NetScopeEnvelope } from '@netscope/shared';

let rpcId = 1;

function toWsUri(input: string): string {
  const uri = input.trim();
  if (uri.startsWith('ws://') || uri.startsWith('wss://')) return uri;
  if (uri.startsWith('http://')) return `${uri.replace('http://', 'ws://').replace(/\/$/, '')}/ws`;
  if (uri.startsWith('https://')) return `${uri.replace('https://', 'wss://').replace(/\/$/, '')}/ws`;
  return uri;
}

export function attachVmService(uri: string, onEvent: (event: NetScopeEnvelope) => void, onState: (attached: boolean, err?: string) => void): void {
  const wsUri = toWsUri(uri);
  const ws = new WebSocket(wsUri);
  const pending = new Map<string, (result: any) => void>();

  const sendRpc = (method: string, params?: Record<string, unknown>) => {
    const id = String(rpcId++);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    return id;
  };

  ws.on('open', () => {
    onState(true);
    sendRpc('streamListen', { streamId: 'Logging' });
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)?.(msg.result);
        pending.delete(msg.id);
        return;
      }

      if (msg.method !== 'streamNotify' || msg.params?.streamId !== 'Logging') return;
      const logRecord = msg.params.event?.logRecord;
      const loggerName = logRecord?.loggerName?.valueAsString ?? '';
      if (loggerName !== 'NetScope') return;

      const text = String(logRecord?.message?.valueAsString ?? '');
      const truncated = Boolean(logRecord?.message?.valueAsStringIsTruncated);

      if (!truncated) {
        parseAndEmit(text, onEvent);
        return;
      }

      const objId = logRecord?.message?.id;
      if (!objId) return;
      const isolateId =
        msg.params?.event?.isolate?.id ??
        msg.params?.isolate?.id;
      if (!isolateId) {
        onState(true, 'missing isolateId for getObject');
        return;
      }
      const id = sendRpc('getObject', { isolateId, objectId: objId });
      pending.set(id, (result) => parseAndEmit(String(result?.valueAsString || ''), onEvent));
    } catch (err) {
      onState(true, `parse error: ${String(err)}`);
    }
  });

  ws.on('close', () => onState(false, 'VM service disconnected'));
  ws.on('error', (err) => onState(false, err.message));
}

function parseAndEmit(raw: string, onEvent: (event: NetScopeEnvelope) => void): void {
  const data = JSON.parse(raw) as unknown;
  if (isNetScopeEnvelope(data)) onEvent(data);
}
