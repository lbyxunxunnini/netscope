import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import type { CliConfig, WebSocketMessage } from '@netscope/shared';
import { EventAssembler } from './assembler.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};

export function startServer(port: number, config: CliConfig) {
  const assembler = new EventAssembler(config.maxMessages);
  const webClients = new Set<WebSocket>();

  const broadcast = (msg: WebSocketMessage) => {
    const text = JSON.stringify(msg);
    for (const ws of webClients) {
      if (ws.readyState === ws.OPEN) ws.send(text);
    }
  };

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/status') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(assembler.getStatus()));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/requests') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(assembler.list()));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/config') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(config));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/requests/clear') {
      assembler.clear();
      broadcast({ type: 'requests_cleared' });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const filePath = url.pathname === '/'
      ? join(__dirname, '..', 'public', 'index.html')
      : join(__dirname, '..', 'public', url.pathname);

    try {
      const content = await readFile(filePath);
      res.setHeader('content-type', MIME[extname(filePath)] || 'application/octet-stream');
      res.end(content);
    } catch {
      const indexHtml = await readFile(join(__dirname, '..', 'public', 'index.html'));
      res.setHeader('content-type', 'text/html');
      res.end(indexHtml);
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws) => {
    webClients.add(ws);
    ws.send(JSON.stringify({ type: 'connection_state', payload: assembler.getStatus() }));
    ws.on('close', () => webClients.delete(ws));
  });

  httpServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
    if (pathname !== '/ws') return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  setInterval(() => {
    const errors = assembler.cleanupTimeouts();
    if (errors.length > 0) {
      const status = assembler.getStatus();
      status.lastError = errors.join('; ');
      broadcast({ type: 'connection_state', payload: status });
    }
  }, 5000);

  httpServer.listen(port, '127.0.0.1');

  return { assembler, broadcast, close: () => httpServer.close() };
}
