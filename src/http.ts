import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { guardRequest } from './httpGuard.ts';
import { FixedWindowLimiter } from './lib/rateLimiter.ts';
import { createMcpServer } from './server.ts';

const MAX_BODY_BYTES = 1_000_000;

const token = process.env.TRAVEL_MCP_TOKEN;
if (!token || token.length < 16) {
  console.error('TRAVEL_MCP_TOKEN must be set to at least 16 characters. Generate one with: openssl rand -hex 32');
  process.exit(1);
}

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const limiter = new FixedWindowLimiter(Number(process.env.RATE_LIMIT_PER_MINUTE ?? 60), 60_000);

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  const rejection = guardRequest(
    {
      method: req.method ?? 'GET',
      path: url.pathname,
      authorization: req.headers.authorization,
      clientKey: req.socket.remoteAddress ?? 'unknown',
    },
    { token: token as string, limiter },
  );
  if (rejection) {
    sendJson(res, rejection.status, rejection.body, rejection.headers);
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    throw error;
  }

  // Stateless mode: a fresh server and transport per request, nothing is shared between clients.
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}

const httpServer = createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error('[travel-mcp] request failed:', error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
    else res.end();
  });
});

httpServer.listen(port, host, () => {
  console.error(`[travel-mcp] HTTP mode listening on http://${host}:${port}/mcp`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    httpServer.close(() => process.exit(0));
  });
}
